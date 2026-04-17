// 历史匹配：拿意图分类结果 + 用户历史信号 + 博主新动作 → 找到 (signal, action) 配对
import { getDb } from './db.js';

const INTENT_TO_ACTION = {
  link_request:    ['post_link'],
  sequel_request:  ['post_sequel'],
  series_catchup:  ['series_completed'],
  tutorial_request:['reply_tutorial'],
  plus_one:        ['post_link', 'post_sequel', 'series_completed'],
  passive_interest:['post_link', 'post_sequel', 'series_completed'],
};

const INTENT_TO_SCRIPT = {
  link_request:     'A',
  sequel_request:   'C',
  series_catchup:   'B',
  tutorial_request: 'A',
  plus_one:         'A',
  passive_interest: 'A',
};

/**
 * @param {{intent, topic_hint}} intentResult
 * @param {string} userId
 * @returns {null | { signal, action, creator, scriptId }}
 */
export function matchHistory(intentResult, userId) {
  if (!intentResult?.intent) {
    throw new TypeError('matchHistory: intentResult.intent is required');
  }
  const db = getDb();
  const { topic_hint, intent } = intentResult;
  const actionTypes = INTENT_TO_ACTION[intent] ?? [];
  if (actionTypes.length === 0) return null;

  const actionTypeClause = actionTypes.map(() => '?').join(',');

  // Step 1. 先找到与意图类型匹配、最新的博主新动作（可选按 topic 过滤）
  const actionQuery = topic_hint
    ? `SELECT ca.*, c.handle, c.display, c.avatar AS creator_avatar, c.bio
         FROM creator_actions ca
         JOIN creators c ON c.id = ca.creator_id
         WHERE ca.action_type IN (${actionTypeClause})
           AND ca.topic = ?
         ORDER BY ca.occurred_at DESC
         LIMIT 1`
    : `SELECT ca.*, c.handle, c.display, c.avatar AS creator_avatar, c.bio
         FROM creator_actions ca
         JOIN creators c ON c.id = ca.creator_id
         WHERE ca.action_type IN (${actionTypeClause})
         ORDER BY ca.occurred_at DESC
         LIMIT 1`;

  const actionArgs = topic_hint ? [...actionTypes, topic_hint] : actionTypes;
  const action = db.prepare(actionQuery).get(...actionArgs);
  if (!action) return null;

  // Step 2. 再找到用户在该 topic / creator 下的未履约信号（优先最早那条，情感加权）
  const signal = db
    .prepare(
      `SELECT * FROM intent_signals
        WHERE user_id = ?
          AND topic = ?
          AND fulfilled = 0
        ORDER BY occurred_at ASC
        LIMIT 1`,
    )
    .get(userId, action.topic);

  if (!signal) return null;

  // Step 3. 附带同 topic 最近 30 天内其它互动，用于 P3 行为足迹
  const footprints = db
    .prepare(
      `SELECT * FROM intent_signals
        WHERE user_id = ? AND topic = ?
        ORDER BY occurred_at DESC
        LIMIT 6`,
    )
    .all(userId, action.topic);

  return {
    signal,
    action: {
      ...action,
      payload: JSON.parse(action.payload_json),
    },
    creator: {
      id: action.creator_id,
      handle: action.handle,
      display: action.display,
      avatar: action.creator_avatar,
      bio: action.bio,
    },
    footprints,
    scriptId: INTENT_TO_SCRIPT[intent] ?? 'A',
  };
}
