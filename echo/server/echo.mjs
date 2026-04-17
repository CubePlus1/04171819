// 对话式 5 步生成器：把主 demo 的 "workflow step" 改写成"她在自言自语"的气泡
import { getState, claimFulfillment, creator, relativeTimeCn } from './store.mjs';
import { SSE_EVENTS, REASONS, ACTION_VERB_CN } from '../shared/contracts.mjs';

const SLEEP = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AbortError());
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new AbortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

class AbortError extends Error {
  constructor() { super('aborted'); this.name = 'AbortError'; }
}

const INTENT_RULES = [
  { intent: 'link_request',   label: '蹲链接', topic: 'knit-top',      patterns: [/蹲.*链接/, /链接.*求/, /求.*链接/, /同款/] },
  { intent: 'sequel_request', label: '蹲后续', topic: 'grandpa',       patterns: [/蹲.*后续/, /蹲.*下集/, /后续呢/] },
  { intent: 'series_catchup', label: '还没来得及追完', topic: 'series-30days', patterns: [/稍后再看/, /忘了看/, /没追完/] },
];

function classify(text) {
  for (const r of INTENT_RULES) {
    for (const p of r.patterns) if (p.test(text)) return r;
  }
  return null;
}

function pickScript(intent) {
  if (intent === 'link_request')   return 'A';
  if (intent === 'sequel_request') return 'C';
  if (intent === 'series_catchup') return 'B';
  return 'A';
}

function postcardFor({ match, signal, script }) {
  const c = creator(signal.creator);
  const rel = relativeTimeCn(signal.occurred_at);
  if (script === 'A') {
    return {
      kind: 'product',
      heading: `你 ${rel} 在 ${c.display} 那儿蹲过`,
      body: match.payload.summary,
      highlight: match.payload.product,
      closing: '当时蹲的，这次替你接住了',
      creator: c.display,
    };
  }
  if (script === 'B') {
    return {
      kind: 'series',
      heading: `你 ${rel} 按了「稍后再看」`,
      body: match.payload.summary,
      highlight: { note: match.payload.series },
      closing: '你没来得及追完的，这次替你接上了',
      creator: c.display,
    };
  }
  return {
    kind: 'sequel',
    heading: `你 ${rel} 在 ${c.display} 下评论过`,
    body: match.payload.summary,
    highlight: { note: match.payload.title },
    closing: '你当时惦记的那句后续 · 我替你等到了',
    creator: c.display,
  };
}

/**
 * 一次 echo 生成器：yield 一系列事件对象
 * @param {object} params
 * @param {string} params.text 用户输入
 * @param {AbortSignal} [params.signal] 取消信号：断连 / shutdown 时由调用方 abort
 * @param {(ms:number, sig?:AbortSignal)=>Promise<void>} [params.sleep] 可注入的等待
 * @returns {AsyncIterable<{type:string, payload:any}>}
 */
export async function* runEcho({ text, signal: abortSignal, sleep = SLEEP }) {
  const doSleep = (ms) => sleep(ms, abortSignal);
  const rid = `echo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  yield { type: SSE_EVENTS.BEGIN, payload: { run_id: rid, text } };

  // 1 · 听到
  await doSleep(380);
  yield { type: SSE_EVENTS.BUBBLE, payload: { run_id: rid, id: 1, voice: '听到了…' } };

  // 2 · 认识
  await doSleep(520);
  const m = classify(text);
  const intent = m?.intent ?? 'passive_interest';
  const label  = m?.label  ?? '淡淡的念头';
  yield {
    type: SSE_EVENTS.BUBBLE,
    payload: {
      run_id: rid, id: 2,
      voice: `这句话的样子我记得 · 像是一句${label}`,
      tag: label,
    },
  };

  // 3 · 翻出老物件
  await doSleep(520);
  if (!m) {
    yield { type: SSE_EVENTS.BUBBLE, payload: { run_id: rid, id: 3, voice: '等等，我在你的记忆里翻一翻… 好像没有能接住的那条。' } };
    yield { type: SSE_EVENTS.END, payload: { run_id: rid, ok: false, reason: REASONS.NO_MATCH } };
    return;
  }
  const state = getState();
  const signal = state.signals.find((s) => s.topic === m.topic && !s.fulfilled);
  if (!signal) {
    yield { type: SSE_EVENTS.BUBBLE, payload: { run_id: rid, id: 3, voice: '这件事我之前替你接过一次了 · 这次先让它停在这里。' } };
    yield { type: SSE_EVENTS.END, payload: { run_id: rid, ok: false, reason: REASONS.ALREADY_FULFILLED } };
    return;
  }
  const c = creator(signal.creator);
  yield {
    type: SSE_EVENTS.BUBBLE,
    payload: {
      run_id: rid, id: 3,
      voice: `你之前在 ${c.display} 那儿 ${signal.text ? `说过「${signal.text}」` : '停留过一会儿'}`,
      relative: relativeTimeCn(signal.occurred_at),
    },
  };

  // 4 · 发现博主有了新动作
  await doSleep(520);
  const action = state.actions.find((a) => a.topic === m.topic);
  if (!action) {
    yield { type: SSE_EVENTS.BUBBLE, payload: { run_id: rid, id: 4, voice: `${c.display} 那边暂时还没新动作 · 先把这件事记下了` } };
    yield { type: SSE_EVENTS.END, payload: { run_id: rid, ok: false, reason: REASONS.NO_ACTION } };
    return;
  }
  yield {
    type: SSE_EVENTS.BUBBLE,
    payload: {
      run_id: rid, id: 4,
      voice: `${c.display} ${ACTION_VERB_CN[action.kind] ?? '有了新动作'} · 我记得这件事`,
    },
  };

  // 5 · 明信片
  await doSleep(620);
  const claimed = claimFulfillment(signal.id);
  if (!claimed) {
    yield { type: SSE_EVENTS.BUBBLE, payload: { run_id: rid, id: 5, voice: '啊，这条刚刚被另一股念头接走了。' } };
    yield { type: SSE_EVENTS.END, payload: { run_id: rid, ok: false, reason: REASONS.ALREADY_FULFILLED } };
    return;
  }
  const postcard = postcardFor({ match: action, signal, script: pickScript(intent) });
  yield { type: SSE_EVENTS.POSTCARD, payload: { run_id: rid, postcard } };
  yield { type: SSE_EVENTS.END, payload: { run_id: rid, ok: true, script: pickScript(intent) } };
}
