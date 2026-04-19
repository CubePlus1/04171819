// 浏览器端 mock 的对外门面 · 形状与 api/client.js + api/ws.js 对齐
// 一次 ambientTick() 会先返回 HTTP-shape response，同时通过 bus 把 WS 事件一条条 emit 出去
// App 层的事件处理代码完全不用改

import { WS_EVENTS, REASON_CODES } from '@shared/contracts.js';
import { state, resetAll } from './state.js';
import { runAmbient, newRunId, hasPendingAmbient } from './pipeline.js';

const DEMO_USER_ID = 'demo-user';
const BOOTSTRAP_CARDS_LIMIT = 30;

// 单例 WS bus · 每个 connectMockWs 调用只是挂钩一个 onMessage listener
const listeners = new Set();
function emit(type, payload) {
  const msg = { type, payload };
  for (const fn of listeners) {
    try { fn(msg); } catch (e) { console.warn('mock ws listener err', e); }
  }
}

const triggers = [
  { id: 'trigger-A', label: '收纳好物 · 求链接', script: 'A', topic: 'storage-haul',       hint: '把我 7 天前蹲的那个露营收纳箱链接接回来' },
  { id: 'trigger-B', label: '男友失联 · 蹲后续', script: 'B', topic: 'missing-bf',         hint: '把我 5 天前蹲的那条后续接回来' },
  { id: 'trigger-C', label: '剪辑教程 · 求教学', script: 'C', topic: 'editing-transition', hint: '把我 9 天前求的那份转场教学接回来' },
];

export async function mockBootstrap() {
  const user = state.users.find((u) => u.id === DEMO_USER_ID) ?? null;
  const history = state.signals
    .filter((s) => s.user_id === DEMO_USER_ID)
    .map((s) => {
      const creator = state.creators.find((c) => c.id === s.creator_id);
      return {
        ...s,
        creator_display: creator?.display ?? '',
        creator_avatar: creator?.avatar ?? '',
      };
    })
    .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
  const cards = state.cards
    .filter((c) => c.user_id === DEMO_USER_ID)
    .slice()
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, BOOTSTRAP_CARDS_LIMIT)
    .map((row) => ({ ...row, pages: row.pages ?? JSON.parse(row.pages_json) }));

  return {
    server_epoch: state.epoch,
    user,
    feed: state.feed,
    triggers,
    pending: hasPendingAmbient(DEMO_USER_ID, { loopMode: true }),
    loop_mode: true,
    history,
    cards,
  };
}

// 并发保护 · 同一时刻只有一条 pipeline 在跑（和 backend/server.js 的 state.inFlight 等价）
let inFlight = false;

export async function mockAmbientTick({ topic, signalId, clientId } = {}) {
  if (inFlight) {
    return { ok: false, runId: null, reason: REASON_CODES.IN_FLIGHT_WORKFLOW, pending: true };
  }
  inFlight = true;

  const runId = newRunId();
  emit(WS_EVENTS.WORKFLOW_BEGIN, { run_id: runId, client_id: clientId, ambient: true, userId: DEMO_USER_ID });

  try {
    const result = await runAmbient({
      userId: DEMO_USER_ID,
      runId,
      topic: topic ?? null,
      signalId: signalId ?? null,
      loopMode: true,
      onStep: (frame) => emit(WS_EVENTS.WORKFLOW_STEP, { ...frame, ambient: true, client_id: clientId }),
    });
    if (result.ok) {
      emit(WS_EVENTS.CARD_GENERATED, { run_id: runId, client_id: clientId, card: result.card });
      emit(WS_EVENTS.WORKFLOW_END, { run_id: runId, client_id: clientId, ambient: true, ok: true, cardId: result.card.id });
    } else {
      emit(WS_EVENTS.WORKFLOW_END, { run_id: runId, client_id: clientId, ambient: true, ok: false, reason: result.reason });
    }
    return {
      ok: result.ok,
      runId,
      pending: hasPendingAmbient(DEMO_USER_ID, { loopMode: true }),
      ...(result.ok ? { cardId: result.card.id } : { reason: result.reason }),
    };
  } finally {
    inFlight = false;
  }
}

export async function mockResetDemo() {
  resetAll();
  emit(WS_EVENTS.DEMO_RESET, { epoch: state.epoch });
  return { ok: true, epoch: state.epoch };
}

// 对齐 api/ws.js 的 connectWs 返回形状
export function connectMockWs({ onMessage, onOpen, onClose } = {}) {
  const handler = (msg) => onMessage?.(msg);
  listeners.add(handler);

  // 下一拍触发 onOpen · 模拟 WS 握手节奏，给 UI 一个 loading 呼吸
  const t = setTimeout(() => onOpen?.(), 30);

  return {
    close() {
      clearTimeout(t);
      listeners.delete(handler);
      onClose?.();
    },
  };
}
