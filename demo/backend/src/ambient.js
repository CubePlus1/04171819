// Ambient 履约管线：不要求用户输入，AI 后台自己从未履约信号 × 博主新动作里挑一条推出来
//
// 这是主 demo 的核心产品定位 —— "被动刷到即成立"。runWorkflow (评论触发) 保留给遗留
// 路径，但未来真实产品只会走这条 ambient 通道。
import { getDb } from './db.js';
import { buildCard } from './cardBuilder.js';
import { createLogger } from './logger.js';
import { REASON_CODES, MIND_PHASES } from '../../shared/contracts.js';
import { newRunId } from './workflow.js';

const log = createLogger('ambient');
const DEFAULT_STEP_DELAY_MS = 400;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// 剧本反推：从博主动作类型 → 脚本 id
const ACTION_TO_SCRIPT = {
  post_link:        'A',
  post_sequel:      'C',
  series_completed: 'B',
  reply_tutorial:   'A',
};

const SIGNAL_VERB_CN = {
  comment_intent:    '评论过',
  watch_later:       '按了稍后再看',
  unfinished_save:   '收藏过',
  unsatisfied_search:'搜过',
  passive_interest:  '反复刷到过',
};

/**
 * 挑一个可履约的 (signal, action) 对。
 * - 指定 signalId / topic 时按精确条件；
 * - 否则取「最旧未履约 × 有匹配动作 × 该主题尚未生成过卡片」那条；
 *   这个排除条件重要——履约是按"主题"聚合的，同一个念头被 AI 记住一次就够了，
 *   不会把 5 条同主题信号接回来 5 张卡片。
 */
function pickNextCandidate(db, { userId, topic = null, signalId = null }) {
  const NOT_FULFILLED_TOPIC = `
    AND NOT EXISTS (
      SELECT 1 FROM cards cd
        JOIN intent_signals si ON si.id = cd.intent_signal_id
       WHERE cd.user_id = s.user_id AND si.topic = s.topic
    )
  `;
  if (signalId) {
    return db.prepare(`
      SELECT s.*, ca.id AS action_id, ca.action_type, ca.payload_json,
             ca.occurred_at AS action_occurred, c.handle, c.display AS creator_display,
             c.avatar AS creator_avatar, c.bio AS creator_bio
        FROM intent_signals s
        JOIN creator_actions ca ON ca.topic = s.topic
        JOIN creators c ON c.id = s.creator_id
       WHERE s.id = ? AND s.user_id = ? AND s.fulfilled = 0
         ${NOT_FULFILLED_TOPIC}
       ORDER BY ca.occurred_at DESC
       LIMIT 1
    `).get(signalId, userId);
  }
  if (topic) {
    return db.prepare(`
      SELECT s.*, ca.id AS action_id, ca.action_type, ca.payload_json,
             ca.occurred_at AS action_occurred, c.handle, c.display AS creator_display,
             c.avatar AS creator_avatar, c.bio AS creator_bio
        FROM intent_signals s
        JOIN creator_actions ca ON ca.topic = s.topic
        JOIN creators c ON c.id = s.creator_id
       WHERE s.topic = ? AND s.user_id = ? AND s.fulfilled = 0
         ${NOT_FULFILLED_TOPIC}
       ORDER BY s.occurred_at ASC, ca.occurred_at DESC
       LIMIT 1
    `).get(topic, userId);
  }
  return db.prepare(`
    SELECT s.*, ca.id AS action_id, ca.action_type, ca.payload_json,
           ca.occurred_at AS action_occurred, c.handle, c.display AS creator_display,
           c.avatar AS creator_avatar, c.bio AS creator_bio
      FROM intent_signals s
      JOIN creator_actions ca ON ca.topic = s.topic
      JOIN creators c ON c.id = s.creator_id
     WHERE s.user_id = ? AND s.fulfilled = 0
       ${NOT_FULFILLED_TOPIC}
     ORDER BY s.occurred_at ASC, ca.occurred_at DESC
     LIMIT 1
  `).get(userId);
}

function stepFrame(runId, step, name, detail, mind) {
  return { run_id: runId, step, name, detail, mind };
}

/**
 * 为一次 runAmbient 快照 mind 的完整节点集合。
 * - signals：该用户未/已履约信号
 * - actions：所有博主新动作
 * 只在 step 1 下发完整 nodes，后续 step 下发 focus_* / phase 减小 wire 体积
 */
function snapshotMindNodes(db, userId) {
  const signals = db
    .prepare(
      `SELECT id, topic, raw_text, video_title, signal_type, occurred_at, fulfilled
         FROM intent_signals WHERE user_id = ?`,
    )
    .all(userId);
  const actions = db
    .prepare(
      `SELECT id, topic, action_type, occurred_at FROM creator_actions`,
    )
    .all();

  return [
    ...signals.map((s) => ({
      id: `signal:${s.id}`,
      kind: 'signal',
      topic: s.topic,
      label: s.raw_text || s.video_title,
      signal_type: s.signal_type,
      fulfilled: Boolean(s.fulfilled),
      occurred_at: s.occurred_at,
    })),
    ...actions.map((a) => ({
      id: `action:${a.id}`,
      kind: 'action',
      topic: a.topic,
      action_type: a.action_type,
      occurred_at: a.occurred_at,
    })),
  ];
}

/**
 * 展台循环模式的"软 reset"：
 *   - 清空 cards（前端 MAX_CARDS_IN_UI 自然淘汰旧卡 · 不会看到面板被抹空）
 *   - 把所有 intent_signals 的 fulfilled 重置为 0
 *   - creator_actions 保持不动
 * 只在展台循环模式下由 runAmbient 内部兜底调用 · 不暴露 HTTP 入口
 */
function softResetForLoop(db) {
  db.transaction(() => {
    db.prepare('DELETE FROM cards').run();
    db.prepare('UPDATE intent_signals SET fulfilled = 0').run();
  })();
}

/**
 * @param {object} params
 * @param {string}  params.userId
 * @param {string}  [params.runId]
 * @param {string}  [params.topic]         - 手动指定剧本主题（预设按钮用）
 * @param {number}  [params.signalId]      - 手动指定信号 id
 * @param {function} [params.onStep]       - 每步广播回调
 * @param {number}  [params.stepDelayMs]
 * @param {boolean} [params.loopMode]      - 展台循环：所有剧本接完后自动软 reset 重演
 */
export async function runAmbient({
  userId,
  runId = newRunId(),
  topic = null,
  signalId = null,
  onStep,
  stepDelayMs = DEFAULT_STEP_DELAY_MS,
  loopMode = false,
}) {
  if (typeof userId !== 'string' || !userId) {
    throw new TypeError('runAmbient: userId must be a non-empty string');
  }
  const db = getDb();

  // Step 1 · 后台扫描她还惦记着的 · mind.phase=scan，下发完整 nodes 快照
  const scan = db.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN fulfilled = 0 THEN 1 ELSE 0 END) AS open
       FROM intent_signals WHERE user_id = ?`,
  ).get(userId);
  const mindNodes = snapshotMindNodes(db, userId);
  onStep?.(stepFrame(runId, 1, '她还惦记着的', {
    total: scan.total,
    open: scan.open,
    note: scan.open > 0
      ? `${scan.open} 件事还没接回来`
      : '都已经替她接回来了',
  }, {
    phase: MIND_PHASES.SCAN,
    nodes: mindNodes,
    open_count: scan.open,
  }));
  await sleep(stepDelayMs);

  // Step 2 · 挑中这一条（未履约 × 刚好有匹配动作）· mind.phase=recall
  let pick = pickNextCandidate(db, { userId, topic, signalId });

  // 展台循环：若一轮剧本接完（含手动指定 topic/signalId 的情况），软 reset 重演
  // 这样前端永远看不到 pending=false，卡片持续浮入，重复剧本对观众是"下一波履约"
  let didLoopReset = false;
  if (!pick && loopMode) {
    softResetForLoop(db);
    didLoopReset = true;
    pick = pickNextCandidate(db, { userId, topic, signalId });
  }

  if (!pick) {
    onStep?.(stepFrame(runId, 2, '挑中这一条', {
      hit: false,
      reason: '这一次还没找到能接回来的',
    }, {
      phase: MIND_PHASES.RECALL,
      focus_signal_id: null,
      reason: REASON_CODES.NO_MATCH,
    }));
    return { ok: false, runId, reason: REASON_CODES.NO_MATCH };
  }

  const creator = {
    id: pick.creator_id,
    handle: pick.handle,
    display: pick.creator_display,
    avatar: pick.creator_avatar,
    bio: pick.creator_bio,
  };
  const signal = {
    id: pick.id,
    user_id: pick.user_id,
    creator_id: pick.creator_id,
    video_id: pick.video_id,
    video_title: pick.video_title,
    signal_type: pick.signal_type,
    raw_text: pick.raw_text,
    topic: pick.topic,
    occurred_at: pick.occurred_at,
    fulfilled: 0,
  };
  const focusSignalId = `signal:${signal.id}`;
  const focusActionId = `action:${pick.action_id}`;
  onStep?.(stepFrame(runId, 2, '挑中这一条', {
    hit: true,
    signal: { id: signal.id, text: signal.raw_text, video_title: signal.video_title, occurred_at: signal.occurred_at },
    creator: creator.display,
    recall: signal.raw_text
      ? `她在「${creator.display}」下${SIGNAL_VERB_CN[signal.signal_type] ?? '留下过一条'}「${signal.raw_text}」`
      : `她${SIGNAL_VERB_CN[signal.signal_type] ?? '看过'}《${signal.video_title}》`,
  }, {
    phase: MIND_PHASES.RECALL,
    focus_signal_id: focusSignalId,
    topic: signal.topic,
  }));
  await sleep(stepDelayMs);

  // Step 3 · 博主今天的新动作 · mind.phase=match
  const actionPayload = JSON.parse(pick.payload_json);
  const scriptId = ACTION_TO_SCRIPT[pick.action_type] ?? 'A';
  onStep?.(stepFrame(runId, 3, '博主今天的新动作', {
    creator: creator.display,
    action_type: pick.action_type,
    action_summary: actionPayload.summary ?? actionPayload.title ?? '博主有了新动作',
    script: scriptId,
  }, {
    phase: MIND_PHASES.MATCH,
    focus_signal_id: focusSignalId,
    focus_action_id: focusActionId,
    topic: signal.topic,
    script: scriptId,
  }));
  await sleep(stepDelayMs);

  // Step 4 · 原子声明 + 入库。同并发保护：同一条只能被接回来一次
  const footprints = db
    .prepare(
      `SELECT * FROM intent_signals
        WHERE user_id = ? AND topic = ?
        ORDER BY occurred_at DESC LIMIT 6`,
    )
    .all(userId, signal.topic);

  const match = {
    signal,
    action: {
      id: pick.action_id,
      action_type: pick.action_type,
      payload: actionPayload,
      topic: pick.topic,
      occurred_at: pick.action_occurred,
    },
    creator,
    footprints,
    scriptId,
  };

  // ambient 下没有"意图识别"，但 P2 的展示仍然需要一份 intentResult。给一份克制的陈述即可
  const intentResultForPages = {
    intent: 'ambient',
    label: '后台为你认出来',
    confidence: 1.0,
    rationale: '她当时留下的那条信号，后台一直替她记着',
    topic_hint: signal.topic,
    matched_rule: null,
  };
  const card = buildCard({ match, intentResult: intentResultForPages, userId });

  const claimStmt = db.prepare(
    'UPDATE intent_signals SET fulfilled = 1 WHERE id = ? AND fulfilled = 0',
  );
  const insertCardStmt = db.prepare(
    `INSERT INTO cards
       (id, user_id, script_id, intent_signal_id, creator_action_id, pages_json)
     VALUES
       (@id, @user_id, @script_id, @intent_signal_id, @creator_action_id, @pages_json)`,
  );

  const persistTx = db.transaction(() => {
    const r = claimStmt.run(card.intent_signal_id);
    if (r.changes !== 1) {
      const err = new Error('signal-already-fulfilled');
      err.code = 'SIGNAL_ALREADY_FULFILLED';
      throw err;
    }
    insertCardStmt.run({
      id: card.id,
      user_id: card.user_id,
      script_id: card.script_id,
      intent_signal_id: card.intent_signal_id,
      creator_action_id: card.creator_action_id,
      pages_json: JSON.stringify(card.pages),
    });
  });

  try {
    persistTx();
  } catch (err) {
    if (err.code === 'SIGNAL_ALREADY_FULFILLED') {
      onStep?.(stepFrame(runId, 4, '记到她的履约里', {
        ok: false,
        reason: '这条刚刚被抢先接走了',
      }, {
        phase: MIND_PHASES.SEAL,
        focus_signal_id: focusSignalId,
        focus_action_id: focusActionId,
        topic: signal.topic,
        ok: false,
        reason: REASON_CODES.SIGNAL_ALREADY_FULFILLED,
      }));
      return { ok: false, runId, reason: REASON_CODES.SIGNAL_ALREADY_FULFILLED };
    }
    throw err;
  }

  onStep?.(stepFrame(runId, 4, '记到她的履约里', {
    card_id: card.id,
    script: card.script_id,
    fulfilled_signal_id: card.intent_signal_id,
  }, {
    phase: MIND_PHASES.SEAL,
    focus_signal_id: focusSignalId,
    focus_action_id: focusActionId,
    topic: signal.topic,
    card_id: card.id,
  }));
  await sleep(stepDelayMs);

  // Step 5 · 浮到信息流 · mind.phase=emit
  onStep?.(stepFrame(runId, 5, '浮到她的信息流', {
    card_id: card.id,
    pages: card.pages.map((p) => p.id),
    preview_context: card.pages[0]?.context_line,
  }, {
    phase: MIND_PHASES.EMIT,
    focus_signal_id: focusSignalId,
    focus_action_id: focusActionId,
    topic: signal.topic,
    card_id: card.id,
  }));
  log.info('ambient finished', { run_id: runId, card_id: card.id, script: card.script_id });

  return { ok: true, runId, card, match: { scriptId } };
}

/**
 * 是否还有主题未被接回来？主题级聚合，避免同一 topic 重复生成卡片。
 *
 * loopMode 下只要 fixtures 里还有可匹配的 (signal × action) 对就视为 pending：
 * 真正跑 runAmbient 时若取不到会软 reset 再取，前端观感是永远有得接。
 */
export function hasPendingAmbient(userId, { loopMode = false } = {}) {
  const db = getDb();
  if (loopMode) {
    const row = db.prepare(`
      SELECT COUNT(*) AS c
        FROM intent_signals s
        JOIN creator_actions ca ON ca.topic = s.topic
       WHERE s.user_id = ?
    `).get(userId);
    return row.c > 0;
  }
  const row = db.prepare(`
    SELECT COUNT(DISTINCT s.topic) AS c
      FROM intent_signals s
      JOIN creator_actions ca ON ca.topic = s.topic
     WHERE s.user_id = ?
       AND s.fulfilled = 0
       AND NOT EXISTS (
         SELECT 1 FROM cards cd
           JOIN intent_signals si ON si.id = cd.intent_signal_id
          WHERE cd.user_id = s.user_id AND si.topic = s.topic
       )
  `).get(userId);
  return row.c > 0;
}
