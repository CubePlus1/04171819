// 5 步工作流管线：每步都通过 WS 广播，让评委可见
import { getDb } from './db.js';
import { classifyIntent } from './intent.js';
import { matchHistory } from './matcher.js';
import { buildCard } from './cardBuilder.js';
import { createLogger } from './logger.js';

const log = createLogger('workflow');

const DEFAULT_STEP_DELAY_MS = 400;

const SCRIPT_LABEL = {
  A: '链接型蹲',
  B: '系列型蹲',
  C: '蹲后续',
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stepFrame(step, name, detail) {
  return { step, name, detail };
}

/**
 * @param {object} params
 * @param {string} params.comment 评论原文
 * @param {string} params.userId 用户 id
 * @param {(frame:any)=>void} params.onStep 每步回调（供 WS 广播）
 * @param {number} [params.stepDelayMs] 每步间隔
 * @returns {Promise<{ok:boolean, card?:any, reason?:string, intent, match}>}
 */
export async function runWorkflow({ comment, userId, onStep, stepDelayMs = DEFAULT_STEP_DELAY_MS }) {
  if (!comment || typeof comment !== 'string') {
    throw new TypeError('runWorkflow: comment is required');
  }
  if (!userId) throw new TypeError('runWorkflow: userId is required');

  const db = getDb();

  // Step 1 评论入栈
  onStep?.(stepFrame(1, '评论入栈', {
    text: comment,
    user_id: userId,
    length: comment.length,
    enqueued_at: new Date().toISOString(),
  }));
  await sleep(stepDelayMs);

  // Step 2 AI 意图识别
  const intent = classifyIntent(comment);
  onStep?.(stepFrame(2, 'AI 意图识别', {
    intent: intent.intent,
    label: intent.label,
    confidence: intent.confidence,
    rationale: intent.rationale,
  }));
  await sleep(stepDelayMs);

  // Step 3 匹配用户历史
  const match = matchHistory(intent, userId);
  if (!match) {
    onStep?.(stepFrame(3, '匹配用户历史', {
      hit: false,
      reason: '未找到与该意图配对的历史信号 × 博主新动作',
    }));
    return { ok: false, reason: 'no-match', intent, match: null };
  }
  onStep?.(stepFrame(3, '匹配用户历史', {
    hit: true,
    signal: {
      id: match.signal.id,
      text: match.signal.raw_text,
      video_title: match.signal.video_title,
      occurred_at: match.signal.occurred_at,
    },
    creator: match.creator.display,
    action_type: match.action.action_type,
    script: `${match.scriptId} · ${SCRIPT_LABEL[match.scriptId] ?? ''}`.trim(),
  }));
  await sleep(stepDelayMs);

  // Step 4 写入数据库 + 构建卡片
  const card = buildCard({ match, intentResult: intent, userId });
  const persistTx = db.transaction(() => {
    db.prepare(
      `INSERT INTO cards
         (id, user_id, script_id, intent_signal_id, creator_action_id, pages_json)
       VALUES
         (@id, @user_id, @script_id, @intent_signal_id, @creator_action_id, @pages_json)`,
    ).run({
      id: card.id,
      user_id: card.user_id,
      script_id: card.script_id,
      intent_signal_id: card.intent_signal_id,
      creator_action_id: card.creator_action_id,
      pages_json: JSON.stringify(card.pages),
    });
    db.prepare(
      'UPDATE intent_signals SET fulfilled = 1 WHERE id = ?',
    ).run(card.intent_signal_id);
  });
  persistTx();

  onStep?.(stepFrame(4, '写入数据库', {
    card_id: card.id,
    script: card.script_id,
    fulfilled_signal_id: card.intent_signal_id,
  }));
  await sleep(stepDelayMs);

  // Step 5 触发卡片生成（广播完整 card payload）
  onStep?.(stepFrame(5, '触发卡片生成', {
    card_id: card.id,
    pages: card.pages.map((p) => p.id),
    preview_context: card.pages[0]?.context_line,
    card,
  }));
  log.info('workflow finished', { card_id: card.id, script: card.script_id });

  return { ok: true, card, intent, match: { scriptId: match.scriptId } };
}
