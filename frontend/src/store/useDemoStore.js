import { create } from 'zustand';

const STEP_TEMPLATE = [
  { step: 1, name: '评论入栈',    status: 'idle', detail: null },
  { step: 2, name: 'AI 意图识别', status: 'idle', detail: null },
  { step: 3, name: '匹配用户历史', status: 'idle', detail: null },
  { step: 4, name: '写入数据库',   status: 'idle', detail: null },
  { step: 5, name: '触发卡片生成', status: 'idle', detail: null },
];

const initialState = {
  // 连接
  connected: false,

  // 展示数据（从 /api/bootstrap 拉回）
  user: null,
  feed: [],
  presets: [],
  history: [],

  // 卡片
  cards: [],            // 已生成卡片（按时间倒序）
  spotlightCardId: null,

  // Agent 工作流
  running: false,
  steps: STEP_TEMPLATE.map((s) => ({ ...s })),
  lastCompleted: null,  // 最近一次 ok 的结论 {cardId, scriptId}
  lastReason: null,
};

export const useDemoStore = create((set) => ({
  ...initialState,

  setConnected: (connected) => set({ connected }),

  hydrate: ({ user, feed, presets, history, cards }) =>
    set({
      user,
      feed: feed ?? [],
      presets: presets ?? [],
      history: history ?? [],
      cards: cards ?? [],
      spotlightCardId: (cards && cards[0]?.id) ?? null,
    }),

  beginWorkflow: () =>
    set({
      running: true,
      steps: STEP_TEMPLATE.map((s) => ({ ...s, status: 'idle' })),
      lastCompleted: null,
      lastReason: null,
    }),

  applyStep: (frame) =>
    set((state) => {
      const steps = state.steps.map((s) => {
        if (s.step < frame.step) return { ...s, status: 'done' };
        if (s.step === frame.step) return { ...s, status: 'active', detail: frame.detail, name: frame.name };
        return s;
      });
      return { steps };
    }),

  endWorkflow: ({ ok, cardId, scriptId, reason }) =>
    set((state) => {
      const steps = state.steps.map((s, idx, arr) => {
        if (ok) return { ...s, status: 'done' };
        if (s.status === 'active') return { ...s, status: 'fail' };
        return s;
      });
      return {
        running: false,
        steps,
        lastCompleted: ok ? { cardId, scriptId } : null,
        lastReason: ok ? null : reason,
      };
    }),

  onCardGenerated: (card) =>
    set((state) => ({
      cards: [card, ...state.cards.filter((c) => c.id !== card.id)],
      spotlightCardId: card.id,
    })),

  clearSpotlight: () => set({ spotlightCardId: null }),

  reset: () =>
    set({
      ...initialState,
      // 保留 connected，其它重置
    }),
}));
