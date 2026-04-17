import { create } from 'zustand';

const STEP_TEMPLATE = [
  { step: 1, name: '评论入栈',    status: 'idle', detail: null },
  { step: 2, name: 'AI 意图识别', status: 'idle', detail: null },
  { step: 3, name: '匹配用户历史', status: 'idle', detail: null },
  { step: 4, name: '写入数据库',   status: 'idle', detail: null },
  { step: 5, name: '触发卡片生成', status: 'idle', detail: null },
];

const MAX_CARDS_IN_UI = 40;

const initialState = {
  connected: false,
  serverEpoch: null,

  user: null,
  feed: [],
  presets: [],
  history: [],

  cards: [],
  spotlightCardId: null,

  running: false,
  activeRunId: null,
  ownedRunIds: [],
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

function shouldApplyFrame(state, frameRunId) {
  // 只接本标签页主动发起过的 run_id
  if (!frameRunId) return false;
  return state.ownedRunIds.includes(frameRunId);
}

export const useDemoStore = create((set) => ({
  ...initialState,

  setConnected: (connected) => set({ connected }),

  registerOwnRun: (runId) =>
    set((state) => {
      if (!runId || state.ownedRunIds.includes(runId)) return state;
      // 最多保留最近 5 个，避免无限累积
      const next = [runId, ...state.ownedRunIds].slice(0, 5);
      return { ownedRunIds: next };
    }),

  /**
   * 合并策略：
   * - 若服务端 epoch 变化 → 后端重启过，本地 cards 视为全部 phantom → 丢弃
   * - 否则按去重合并（保留 WS 早到、bootstrap 稍晚的新卡片）
   */
  hydrate: ({ server_epoch, user, feed, presets, history, cards }) =>
    set((state) => {
      const epochChanged = state.serverEpoch && server_epoch && state.serverEpoch !== server_epoch;
      const nextCards = epochChanged
        ? (cards ?? []).slice(0, MAX_CARDS_IN_UI)
        : dedupeMergeCards(cards ?? [], state.cards);
      return {
        serverEpoch: server_epoch ?? state.serverEpoch,
        user,
        feed: feed ?? state.feed,
        presets: presets ?? state.presets,
        history: history ?? state.history,
        cards: nextCards,
        spotlightCardId: epochChanged ? null : (state.spotlightCardId ?? nextCards[0]?.id ?? null),
        // epoch 变化也重置 run 归属，避免把已死进程的 runId 当成本地的
        ownedRunIds: epochChanged ? [] : state.ownedRunIds,
      };
    }),

  beginWorkflow: (runId) =>
    set((state) => {
      // 只有本地登记过的 run 才会真正接管 workflow UI
      if (!runId || !state.ownedRunIds.includes(runId)) return state;
      return {
        running: true,
        activeRunId: runId,
        steps: STEP_TEMPLATE.map((s) => ({ ...s, status: 'idle' })),
        lastCompleted: null,
        lastReason: null,
      };
    }),

  applyStep: (frame) =>
    set((state) => {
      if (!shouldApplyFrame(state, frame?.run_id)) return state;
      if (!state.activeRunId || state.activeRunId !== frame.run_id) return state;
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
      if (!state.activeRunId || state.activeRunId !== runId) return state;
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
      const isLocalRun = runId && state.ownedRunIds.includes(runId);
      const deduped = [card, ...state.cards.filter((c) => c.id !== card.id)].slice(0, MAX_CARDS_IN_UI);
      return {
        cards: deduped,
        spotlightCardId: isLocalRun ? card.id : state.spotlightCardId,
      };
    }),

  clearSpotlight: () => set({ spotlightCardId: null }),

  reset: () =>
    set((state) => ({
      ...initialState,
      connected: state.connected,
    })),
}));
