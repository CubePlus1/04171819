import { create } from 'zustand';

const STEP_TEMPLATE = [
  { step: 1, name: '评论入栈',    status: 'idle', detail: null },
  { step: 2, name: 'AI 意图识别', status: 'idle', detail: null },
  { step: 3, name: '匹配用户历史', status: 'idle', detail: null },
  { step: 4, name: '写入数据库',   status: 'idle', detail: null },
  { step: 5, name: '触发卡片生成', status: 'idle', detail: null },
];

// 展台循环模式下刷过的卡需要腾走 · 只保留最近 6 张
// （MAX_CARDS_IN_UI 既约束渲染又约束内存 · 超过会从末尾自然淘汰）
const MAX_CARDS_IN_UI = 6;

const initialState = {
  connected: false,
  serverEpoch: null,

  user: null,
  feed: [],
  triggers: [],
  history: [],
  pending: true,            // 是否还有未履约 × 有匹配动作的信号

  cards: [],
  spotlightCardId: null,

  // Workflow UI 只跟踪 App 层已判定为「本标签页发起」的事件
  running: false,
  activeRunId: null,
  steps: STEP_TEMPLATE.map((s) => ({ ...s })),
  lastCompleted: null,
  lastReason: null,
};

function dedupeMergeCards(primary, existing) {
  const seen = new Set();
  const out = [];
  for (const c of primary) {
    if (c?.id && !seen.has(c.id)) { seen.add(c.id); out.push(c); }
  }
  for (const c of existing) {
    if (c?.id && !seen.has(c.id)) { seen.add(c.id); out.push(c); }
  }
  return out.slice(0, MAX_CARDS_IN_UI);
}

export const useDemoStore = create((set) => ({
  ...initialState,

  setConnected: (connected) => set({ connected }),

  /**
   * 合并策略：
   * - server_epoch 变化 → 后端重启/reset → 本地 cards 视为 phantom → 丢弃
   * - 否则按去重合并（保留 WS 早到、bootstrap 稍晚到的新卡片）
   */
  hydrate: ({ server_epoch, user, feed, triggers, history, cards, pending }) =>
    set((state) => {
      const epochChanged = state.serverEpoch && server_epoch && state.serverEpoch !== server_epoch;
      const nextCards = epochChanged
        ? (cards ?? []).slice(0, MAX_CARDS_IN_UI)
        : dedupeMergeCards(cards ?? [], state.cards);
      return {
        serverEpoch: server_epoch ?? state.serverEpoch,
        user,
        feed: feed ?? state.feed,
        triggers: triggers ?? state.triggers,
        history: history ?? state.history,
        pending: typeof pending === 'boolean' ? pending : state.pending,
        cards: nextCards,
        spotlightCardId: epochChanged ? null : (state.spotlightCardId ?? nextCards[0]?.id ?? null),
      };
    }),

  setPending: (pending) => set({ pending }),

  beginWorkflow: (runId) =>
    set({
      running: true,
      activeRunId: runId ?? null,
      steps: STEP_TEMPLATE.map((s) => ({ ...s, status: 'idle' })),
      lastCompleted: null,
      lastReason: null,
    }),

  applyStep: (frame) =>
    set((state) => {
      // 若已有 activeRunId 但不匹配，忽略（并发 / 重入防护）
      if (state.activeRunId && frame?.run_id && state.activeRunId !== frame.run_id) return state;
      const steps = state.steps.map((s) => {
        if (s.step < frame.step) return { ...s, status: 'done' };
        if (s.step === frame.step) {
          return {
            ...s,
            status: 'active',
            detail: frame.detail,
            name: frame.name,
            mind: frame.mind ?? s.mind,
          };
        }
        return s;
      });
      return { steps };
    }),

  endWorkflow: ({ ok, cardId, scriptId, reason, runId }) =>
    set((state) => {
      if (state.activeRunId && runId && state.activeRunId !== runId) return state;
      const steps = state.steps.map((s) => {
        if (ok) return { ...s, status: 'done' };
        if (s.status === 'active') return { ...s, status: 'fail' };
        return s;
      });
      return {
        running: false,
        activeRunId: null,
        steps,
        lastCompleted: ok ? { cardId, scriptId } : null,
        lastReason: ok ? null : reason,
      };
    }),

  /**
   * @param {object} card
   * @param {boolean} isLocal 由 App 层根据 client_id 判定
   */
  onCardGenerated: (card, isLocal) =>
    set((state) => {
      const deduped = [card, ...state.cards.filter((c) => c.id !== card.id)].slice(0, MAX_CARDS_IN_UI);
      return {
        cards: deduped,
        spotlightCardId: isLocal ? card.id : state.spotlightCardId,
      };
    }),

  clearSpotlight: () => set({ spotlightCardId: null }),

  reset: () =>
    set((state) => ({
      ...initialState,
      connected: state.connected,
    })),
}));
