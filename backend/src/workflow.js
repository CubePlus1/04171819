// 5 步工作流管线：每步都通过 WS 广播，让评委可见
import { randomUUID } from 'node:crypto';
import { getDb } from './db.js';
import { classifyIntent } from './intent.js';
import { matchHistory } from './matcher.js';
import { buildCard } from './cardBuilder.js';
import { createLogger } from './logger.js';

const log = createLogger('workflow');

const DEFAULT_STEP_DELAY_MS = 400;

export function newRunId() {
  return `run_${randomUUID()}`;
}

const SCRIPT_LABEL = {
  A: '链接型蹲',
  B: '系列型蹲',
  C: '蹲后续',
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stepFrame(runId, step, name, detail) {
  return { run_id: runId, step, name, detail };
}

/**
 * @param {object} params
 * @param {string} params.comment 评论原文
 * @param {string} params.userId 用户 id
 * @param {string} [params.runId] 请求级唯一 id，供并发跑的事件关联
 * @param {(frame:any)=>void} params.onStep 每步回调（供 WS 广播）
 * @param {number} [params.stepDelayMs] 每步间隔
 * @returns {Promise<{ok:boolean, runId, card?:any, reason?:string, intent, match}>}
 */
export async function runWorkflow({
  comment,
  userId,
  runId = newRunId(),
  onStep,
  stepDelayMs = DEFAULT_STEP_DELAY_MS,
}) {
  if (!comment || typeof comment !== 'string') {
    throw new TypeError('runWorkflow: comment is required');
  }
  if (typeof userId !== 'string' || !userId) {
    throw new TypeError('runWorkflow: userId must be a non-empty string');
  }

  const db = getDb();

  // Step 1 评论入栈
  onStep?.(stepFrame(runId, 1, '评论入栈', {
    text: comment,
    user_id: userId,
    length: comment.length,
    enqueued_at: new Date().toISOString(),
  }));
  await sleep(stepDelayMs);

  // Step 2 AI 意图识别
  const intent = classifyIntent(comment);
  onStep?.(stepFrame(runId, 2, 'AI 意图识别', {
    intent: intent.intent,
    label: intent.label,
    confidence: intent.confidence,
    rationale: intent.rationale,
  }));
  await sleep(stepDelayMs);

  // Step 3 匹配用户历史
  const match = matchHistory(intent, userId);
  if (!match) {
    onStep?.(stepFrame(runId, 3, '匹配用户历史', {
      hit: false,
      reason: '未找到与该意图配对的历史信号 × 博主新动作',
    }));
    return { ok: false, runId, reason: 'no-match', intent, match: null };
  }
  onStep?.(stepFrame(runId, 3, '匹配用户历史', {
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

  // Step 4 写入数据库 + 构建卡片（原子声明信号，防并发重复履约）
  const card = buildCard({ match, intentResult: intent, userId });
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
    const { changes } = claimStmt.run(card.intent_signal_id);
    if (changes !== 1) {
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
      onStep?.(stepFrame(runId, 4, '写入数据库', {
        ok: false,
        reason: '该历史信号已被更快的请求抢先履约（防并发重复卡片）',
        intent_signal_id: card.intent_signal_id,
      }));
      return { ok: false, runId, reason: 'signal-already-fulfilled', intent, match: { scriptId: match.scriptId } };
    }
    throw err;
  }

  onStep?.(stepFrame(runId, 4, '写入数据库', {
    card_id: card.id,
    script: card.script_id,
    fulfilled_signal_id: card.intent_signal_id,
  }));
  await sleep(stepDelayMs);

  // Step 5 触发卡片生成（仅 metadata；完整 card 在 card.generated 单独下发，避免重复传输）
  onStep?.(stepFrame(runId, 5, '触发卡片生成', {
    card_id: card.id,
    pages: card.pages.map((p) => p.id),
    preview_context: card.pages[0]?.context_line,
  }));
  log.info('workflow finished', { run_id: runId, card_id: card.id, script: card.script_id });

  return { ok: true, runId, card, intent, match: { scriptId: match.scriptId } };
}
