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

  // 单卡轮播视图状态
  // - currentItem: 当前视口里展示的唯一一条（卡片或 filler 视频）
  // - queue:       待展示的列队（新卡到会 enqueue，用户滑一下 / 按一下从 queue shift）
  // - fillerCursor: filler 轮播指针，当 queue 空时拿 filler 填
  currentItem: null,
  queue: [],
  fillerCursor: 0,

  // Workflow UI 只跟踪 App 层已判定为「本标签页发起」的事件
  running: false,
  activeRunId: null,
  steps: STEP_TEMPLATE.map((s) => ({ ...s })),
  lastCompleted: null,
  lastReason: null,
};

// 把 card / filler 包成统一的 item shape
function cardItem(card) {
  return { kind: 'card', id: card.id, data: card };
}
function fillerItem(filler, cursor) {
  const loop = Math.floor(cursor / 1000);
  return { kind: 'feed', id: `${filler.id}-turn-${cursor}-l${loop}`, data: filler };
}

// cards 数组语义：**从旧到新（ASC）**，最新的卡永远在末尾。
// 这样 Feed 往下追加、视口自动滚到底 = 抖音"下一条"的方向感。
function dedupeMergeCards(primary, existing) {
  // primary = WS 先到的（可能乱序），existing = 已有的。
  // 合并后按 card.id 去重，按原始顺序稳定（不再依赖 created_at）。
  const seen = new Set();
  const ordered = [];
  for (const c of [...existing, ...primary]) {
    if (c?.id && !seen.has(c.id)) { seen.add(c.id); ordered.push(c); }
  }
  // 只保留最后 N 张 · 刷过的自动滑出
  return ordered.slice(-MAX_CARDS_IN_UI);
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
      const incoming = [...(cards ?? [])].reverse();
      const nextCards = epochChanged
        ? incoming.slice(-MAX_CARDS_IN_UI)
        : dedupeMergeCards(incoming, state.cards);

      // 初次进站 · 视口先放第一条 filler 热场（没卡也能看）
      const feedList = feed ?? state.feed;
      let nextCurrent = state.currentItem;
      let nextCursor = state.fillerCursor;
      if (!nextCurrent && feedList.length > 0) {
        nextCurrent = fillerItem(feedList[0], nextCursor);
        nextCursor += 1;
      }

      return {
        serverEpoch: server_epoch ?? state.serverEpoch,
        user,
        feed: feedList,
        triggers: triggers ?? state.triggers,
        history: history ?? state.history,
        pending: typeof pending === 'boolean' ? pending : state.pending,
        cards: nextCards,
        spotlightCardId: epochChanged ? null : (state.spotlightCardId ?? nextCards[nextCards.length - 1]?.id ?? null),
        currentItem: nextCurrent,
        fillerCursor: nextCursor,
        queue: epochChanged ? [] : state.queue,
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
   * 新卡到来 · 入队等展示 · 不抢当前视口。
   * 视口空（还没播过任何一条）时立即占位 · 否则放进 queue 等用户"滑下一条"。
   */
  onCardGenerated: (card, isLocal) =>
    set((state) => {
      const cardsBase = state.cards.filter((c) => c.id !== card.id);
      const nextCards = [...cardsBase, card].slice(-MAX_CARDS_IN_UI);
      const item = cardItem(card);
      // 没 current → 直接展示（比如页面刚打开还没滑过任何一下）
      if (!state.currentItem) {
        return {
          cards: nextCards,
          spotlightCardId: card.id,
          currentItem: item,
        };
      }
      // 当前视口已有内容 · 排队（queue 去重防重入）
      const queueFiltered = state.queue.filter((q) => q.kind !== 'card' || q.id !== card.id);
      return {
        cards: nextCards,
        spotlightCardId: isLocal ? card.id : state.spotlightCardId,
        queue: [...queueFiltered, item],
      };
    }),

  /**
   * 前进一条 · 用户手动触发（↑/↓/Space/点击）。
   * - 优先从 queue 取下一条（通常是履约卡）
   * - queue 空则从 feed filler 轮播取一条
   */
  advance: () =>
    set((state) => {
      if (state.queue.length > 0) {
        const [next, ...rest] = state.queue;
        return {
          currentItem: next,
          queue: rest,
          spotlightCardId: next.kind === 'card' ? next.id : state.spotlightCardId,
        };
      }
      if (state.feed.length === 0) return state;
      const idx = state.fillerCursor % state.feed.length;
      const filler = state.feed[idx];
      return {
        currentItem: fillerItem(filler, state.fillerCursor),
        fillerCursor: state.fillerCursor + 1,
      };
    }),

  clearSpotlight: () => set({ spotlightCardId: null }),

  reset: () =>
    set((state) => ({
      ...initialState,
      connected: state.connected,
    })),
}));
