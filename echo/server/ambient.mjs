// Ambient echo · 被动回响：不要求用户输入，AI 自己从未履约信号里挑一条接回来
//
// 与 echo.mjs (runEcho, 评论触发) 互补。产品上这是主路径：
//   页面一加载就有 SSE 流入；用户只需要看，不需要打字。
import { getState, claimFulfillment, creator, relativeTimeCn } from './store.mjs';
import { SSE_EVENTS, REASONS, ACTION_VERB_CN } from '../shared/contracts.mjs';

const STEP_DELAY_MS = 420;

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AbortError());
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => { clearTimeout(t); reject(new AbortError()); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

class AbortError extends Error {
  constructor() { super('aborted'); this.name = 'AbortError'; }
}

const ACTION_TO_SCRIPT = {
  post_link:        'A',
  post_sequel:      'C',
  series_completed: 'B',
  reply_tutorial:   'A',
};

/**
 * 挑一个主题还未接回来的 (signal, action) 对。
 * 过滤条件：信号 fulfilled=0 且该 topic 下还没有任何其它已履约信号。
 *   → 保证同一 topic 只接一次，不会同类信号重复生成明信片。
 */
function pickNext(state, { topic } = {}) {
  const topicsAlreadyDone = new Set(
    state.signals.filter((s) => s.fulfilled).map((s) => s.topic),
  );
  const candidates = state.signals.filter(
    (s) => !s.fulfilled && !topicsAlreadyDone.has(s.topic),
  );
  const pool = topic ? candidates.filter((s) => s.topic === topic) : candidates;
  // 最旧的那条（她惦记最久的那件事）
  pool.sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at));
  const signal = pool[0];
  if (!signal) return null;
  const action = state.actions.find((a) => a.topic === signal.topic);
  if (!action) return null;
  return { signal, action };
}

function postcardFor({ signal, action, scriptId }) {
  const c = creator(signal.creator);
  const rel = relativeTimeCn(signal.occurred_at);
  const payload = action.payload;
  if (scriptId === 'A') {
    return {
      kind: 'product',
      heading: `你 ${rel} 在 ${c.display} 那儿蹲过`,
      body: payload.summary,
      highlight: payload.product,
      closing: '当时蹲的，这次替你接住了',
      creator: c.display,
    };
  }
  if (scriptId === 'B') {
    return {
      kind: 'series',
      heading: `你 ${rel} 按了「稍后再看」`,
      body: payload.summary,
      highlight: { note: payload.series },
      closing: '你没来得及追完的，这次替你接上了',
      creator: c.display,
    };
  }
  return {
    kind: 'sequel',
    heading: `你 ${rel} 在 ${c.display} 下评论过`,
    body: payload.summary,
    highlight: { note: payload.title },
    closing: '你当时惦记的那句后续 · 我替你等到了',
    creator: c.display,
  };
}

function newRunId() {
  return `amb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
}

/**
 * 一次 ambient 回响生成器：yield 5 步气泡 + postcard。
 */
export async function* runAmbientEcho({ signal: abortSignal, topic = null } = {}) {
  const doSleep = (ms) => sleep(ms, abortSignal);
  const rid = newRunId();
  yield { type: SSE_EVENTS.BEGIN, payload: { run_id: rid, ambient: true } };

  // 1 · 想起
  await doSleep(380);
  yield { type: SSE_EVENTS.BUBBLE, payload: { run_id: rid, id: 1, voice: '让我看看她还惦记着什么…' } };

  // 2 · 挑中一条
  await doSleep(520);
  const state = getState();
  const picked = pickNext(state, { topic });
  if (!picked) {
    yield { type: SSE_EVENTS.BUBBLE, payload: { run_id: rid, id: 2, voice: '她惦记的，都替她接回来了。' } };
    yield { type: SSE_EVENTS.END, payload: { run_id: rid, ok: false, reason: REASONS.NO_MATCH } };
    return;
  }
  const { signal, action } = picked;
  const c = creator(signal.creator);
  yield {
    type: SSE_EVENTS.BUBBLE,
    payload: {
      run_id: rid, id: 2,
      voice: `哦，这件事——她 ${relativeTimeCn(signal.occurred_at)}在 ${c.display} 那儿${signal.text ? `说过「${signal.text}」` : '停留过'}`,
      tag: signal.text ? '她当时这么说的' : '她当时看着的',
    },
  };

  // 3 · 博主新动作
  await doSleep(520);
  yield {
    type: SSE_EVENTS.BUBBLE,
    payload: {
      run_id: rid, id: 3,
      voice: `${c.display} ${ACTION_VERB_CN[action.kind] ?? '有了新动作'} · 这条刚好能接回来`,
    },
  };

  // 4 · 原子声明
  await doSleep(520);
  const claimed = claimFulfillment(signal.id);
  if (!claimed) {
    yield { type: SSE_EVENTS.BUBBLE, payload: { run_id: rid, id: 4, voice: '啊，这条刚刚被别的念头接走了。' } };
    yield { type: SSE_EVENTS.END, payload: { run_id: rid, ok: false, reason: REASONS.ALREADY_FULFILLED } };
    return;
  }

  // 5 · 明信片
  await doSleep(620);
  const scriptId = ACTION_TO_SCRIPT[action.kind] ?? 'A';
  const postcard = postcardFor({ signal, action, scriptId });
  yield { type: SSE_EVENTS.POSTCARD, payload: { run_id: rid, postcard } };
  yield { type: SSE_EVENTS.END, payload: { run_id: rid, ok: true, script: scriptId } };
}

/**
 * 当前 state 里是否还有可接回来的主题？
 */
export function hasPending() {
  const state = getState();
  const done = new Set(state.signals.filter((s) => s.fulfilled).map((s) => s.topic));
  return state.signals.some((s) => !s.fulfilled && !done.has(s.topic));
}
