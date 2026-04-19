// 浏览器端 mock 的内存状态层
// 把 backend/data/fixtures.json 直接 bundle 进来，起站时一次性算出相对时间戳
// 后续所有 mock pipeline 都只读写这份内存结构，不再 new Date().now()
import fixtures from '../../../backend/data/fixtures.json';

function daysAgoIso(days) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}
function hoursAgoIso(hours) {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

let signalAutoId = 1;
let actionAutoId = 1;

function seedSignals() {
  return fixtures.intent_signals.map((s) => ({
    id: signalAutoId++,
    user_id: s.user_id,
    creator_id: s.creator_id,
    video_id: s.video_id,
    video_title: s.video_title,
    signal_type: s.signal_type,
    raw_text: s.raw_text,
    topic: s.topic,
    occurred_at: daysAgoIso(s.days_ago),
    fulfilled: 0,
  }));
}

function seedActions() {
  return fixtures.creator_actions.map((a) => ({
    id: actionAutoId++,
    creator_id: a.creator_id,
    action_type: a.action_type,
    payload_json: JSON.stringify(a.payload),
    topic: a.topic,
    occurred_at: hoursAgoIso(a.hours_ago),
  }));
}

// 每次 seed 重新编号，避免软 reset 后 id 冲
function resetIds() {
  signalAutoId = 1;
  actionAutoId = 1;
}

function freshEpoch() {
  return Date.now().toString(36);
}

const state = {
  users: structuredClone(fixtures.users),
  creators: structuredClone(fixtures.creators),
  feed: structuredClone(fixtures.feed),
  signals: [],
  actions: [],
  cards: [],
  epoch: freshEpoch(),
};

export function resetAll() {
  resetIds();
  state.signals = seedSignals();
  state.actions = seedActions();
  state.cards = [];
  state.epoch = freshEpoch();
}

// 软 reset（对齐 backend/src/ambient.js 的 softResetForLoop）：
// 只清 cards + 把 signals.fulfilled 归零，其他不动，epoch 也不变
// 这样前端不会把它当成 "后端重启" 丢掉本地历史卡
export function softReset() {
  state.cards = [];
  for (const s of state.signals) s.fulfilled = 0;
}

resetAll();

export { state };

export function getUser(userId) {
  return state.users.find((u) => u.id === userId) ?? null;
}

export function getCreatorById(id) {
  return state.creators.find((c) => c.id === id) ?? null;
}

export function getHistoryForUser(userId) {
  return state.signals
    .filter((s) => s.user_id === userId)
    .map((s) => {
      const creator = getCreatorById(s.creator_id);
      return {
        ...s,
        creator_display: creator?.display ?? '',
        creator_avatar: creator?.avatar ?? '',
      };
    })
    .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
}

export function getCardsForUser(userId, limit) {
  return state.cards
    .filter((c) => c.user_id === userId)
    .slice()
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, limit);
}

export function persistCard(card) {
  state.cards.push({
    id: card.id,
    user_id: card.user_id,
    script_id: card.script_id,
    intent_signal_id: card.intent_signal_id,
    creator_action_id: card.creator_action_id,
    pages_json: JSON.stringify(card.pages),
    pages: card.pages,
    created_at: new Date().toISOString(),
  });
}

export function claimSignal(signalId) {
  const s = state.signals.find((x) => x.id === signalId);
  if (!s || s.fulfilled === 1) return false;
  s.fulfilled = 1;
  return true;
}
