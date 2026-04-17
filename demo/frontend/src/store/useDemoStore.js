import { create } from 'zustand';

const STEP_TEMPLATE = [
  { step: 1, name: '评论入栈',    status: 'idle', detail: null },
  { step: 2, name: 'AI 意图识别', status: 'idle', detail: null },
  { step: 3, name: '匹配用户历史', status: 'idle', detail: null },
  { step: 4, name: '写入数据库',   status: 'idle', detail: null },
  { step: 5, name: '触发卡片生成', status: 'idle', detail: null },
];

const initialState = {
  connected: false,

  user: null,
  feed: [],
  presets: [],
  history: [],

  cards: [],
  spotlightCardId: null,

  // Agent 工作流
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
  return out;
}

function shouldApplyFrame(state, frameRunId) {
  if (!state.activeRunId || !frameRunId) return true;
  return state.activeRunId === frameRunId;
}

export const useDemoStore = create((set) => ({
  ...initialState,

  setConnected: (connected) => set({ connected }),

  /**
   * hydrate 合并策略：
   * - 引导数据作为基线（server 视图），覆盖 user / feed / presets / history
   * - cards 做去重合并（引导在前，本地已有新卡在后），保留 WS 到达但尚未入库的卡片
   * - 不重置 workflow 状态；清理靠显式 reset()
   */
  hydrate: ({ user, feed, presets, history, cards }) =>
    set((state) => {
      const mergedCards = dedupeMergeCards(cards ?? [], state.cards);
      return {
        user,
        feed: feed ?? state.feed,
        presets: presets ?? state.presets,
        history: history ?? state.history,
        cards: mergedCards,
        spotlightCardId: state.spotlightCardId ?? mergedCards[0]?.id ?? null,
      };
    }),

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
      if (!shouldApplyFrame(state, frame?.run_id)) return state;
      const steps = state.steps.map((s) => {
        if (s.step < frame.step) return { ...s, status: 'done' };
        if (s.step === frame.step)
          return { ...s, status: 'active', detail: frame.detail, name: frame.name };
        return s;
      });
      return { steps };
    }),

  endWorkflow: ({ ok, cardId, scriptId, reason, runId }) =>
    set((state) => {
      if (!shouldApplyFrame(state, runId)) return state;
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

  onCardGenerated: (card, runId) =>
    set((state) => {
      // run_id 不匹配时仍然接受卡片（其它标签页生成），但不抢当前 run 的 spotlight
      const accepted = !state.activeRunId || !runId || state.activeRunId === runId;
      return {
        cards: [card, ...state.cards.filter((c) => c.id !== card.id)],
        spotlightCardId: accepted ? card.id : state.spotlightCardId,
      };
    }),

  clearSpotlight: () => set({ spotlightCardId: null }),

  /** 硬复位：用于 /api/reset 或重连后清理 workflow UI */
  reset: () =>
    set((state) => ({
      ...initialState,
      connected: state.connected,
    })),
}));
