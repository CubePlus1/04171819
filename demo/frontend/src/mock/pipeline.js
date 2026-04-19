// 浏览器端 5 步 Ambient pipeline · 对齐 backend/src/ambient.js
// 所有数据库读写都换成 state.signals / state.actions / state.cards 的数组操作
// loopMode 默认开（mock 就是展台循环用的），pending 永远为 true

import { REASON_CODES, MIND_PHASES } from '@shared/contracts.js';
import { state, softReset, persistCard, claimSignal, getCreatorById } from './state.js';
import { buildCard } from './cardBuilder.js';

const ACTION_TO_SCRIPT = {
  post_link:        'A',
  post_sequel:      'C',
  series_completed: 'B',
  reply_tutorial:   'A',
};

const SIGNAL_VERB_CN = {
  comment_intent:    '评论过',
  watch_later:       '按了稍后再看',
  unfinished_save:   '收藏过',
  unsatisfied_search:'搜过',
  passive_interest:  '反复刷到过',
};

const DEFAULT_STEP_DELAY_MS = 400;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function newRunId() {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// 从已有 cards 里算出"该 user + 该 topic 是否已经接过一次"—— 对齐后端 NOT EXISTS 子查询
function topicAlreadyFulfilled(userId, topic) {
  for (const card of state.cards) {
    if (card.user_id !== userId) continue;
    const sig = state.signals.find((s) => s.id === card.intent_signal_id);
    if (sig?.topic === topic) return true;
  }
  return false;
}

function pickNextCandidate({ userId, topic = null, signalId = null }) {
  // 候选池：未履约 × topic 尚未接过 × 有匹配 action
  const pool = state.signals.filter((s) => {
    if (s.user_id !== userId) return false;
    if (s.fulfilled !== 0) return false;
    if (topicAlreadyFulfilled(userId, s.topic)) return false;
    if (signalId != null && s.id !== signalId) return false;
    if (topic != null && s.topic !== topic) return false;
    return state.actions.some((a) => a.topic === s.topic);
  });

  if (pool.length === 0) return null;

  // signalId / topic 指定：按 action occurred_at DESC 取最新那条 action
  // 默认：signal occurred_at ASC（最旧那条）× action occurred_at DESC
  pool.sort((a, b) => (a.occurred_at < b.occurred_at ? -1 : 1));
  const pickSignal = pool[0];
  const matchedActions = state.actions
    .filter((a) => a.topic === pickSignal.topic)
    .sort((a, b) => (a.occurred_at > b.occurred_at ? -1 : 1));
  const pickAction = matchedActions[0];
  const creator = getCreatorById(pickSignal.creator_id);

  return {
    ...pickSignal,
    action_id: pickAction.id,
    action_type: pickAction.action_type,
    payload_json: pickAction.payload_json,
    action_occurred: pickAction.occurred_at,
    handle: creator?.handle,
    creator_display: creator?.display,
    creator_avatar: creator?.avatar,
    creator_bio: creator?.bio,
  };
}

function snapshotMindNodes(userId) {
  const sigs = state.signals.filter((s) => s.user_id === userId);
  return [
    ...sigs.map((s) => ({
      id: `signal:${s.id}`,
      kind: 'signal',
      topic: s.topic,
      label: s.raw_text || s.video_title,
      signal_type: s.signal_type,
      fulfilled: Boolean(s.fulfilled),
      occurred_at: s.occurred_at,
    })),
    ...state.actions.map((a) => ({
      id: `action:${a.id}`,
      kind: 'action',
      topic: a.topic,
      action_type: a.action_type,
      occurred_at: a.occurred_at,
    })),
  ];
}

function stepFrame(runId, step, name, detail, mind) {
  return { run_id: runId, step, name, detail, mind };
}

/**
 * @returns {Promise<{ok: boolean, runId: string, card?: object, reason?: string, scriptId?: string}>}
 */
export async function runAmbient({
  userId,
  runId = newRunId(),
  topic = null,
  signalId = null,
  onStep,
  stepDelayMs = DEFAULT_STEP_DELAY_MS,
  loopMode = true,
}) {
  if (typeof userId !== 'string' || !userId) {
    throw new TypeError('runAmbient: userId must be a non-empty string');
  }

  // Step 1 · scan
  const userSignals = state.signals.filter((s) => s.user_id === userId);
  const scanTotal = userSignals.length;
  const scanOpen = userSignals.filter((s) => s.fulfilled === 0).length;
  onStep?.(stepFrame(runId, 1, '她还惦记着的', {
    total: scanTotal,
    open: scanOpen,
    note: scanOpen > 0
      ? `${scanOpen} 件事还没接回来`
      : '都已经替她接回来了',
  }, {
    phase: MIND_PHASES.SCAN,
    nodes: snapshotMindNodes(userId),
    open_count: scanOpen,
  }));
  await sleep(stepDelayMs);

  // Step 2 · recall（loopMode 下拿不到就软 reset 重拿）
  let pick = pickNextCandidate({ userId, topic, signalId });
  if (!pick && loopMode) {
    softReset();
    pick = pickNextCandidate({ userId, topic, signalId });
  }
  if (!pick) {
    onStep?.(stepFrame(runId, 2, '挑中这一条', {
      hit: false,
      reason: '这一次还没找到能接回来的',
    }, {
      phase: MIND_PHASES.RECALL,
      focus_signal_id: null,
      reason: REASON_CODES.NO_MATCH,
    }));
    return { ok: false, runId, reason: REASON_CODES.NO_MATCH };
  }

  const creator = {
    id: pick.creator_id,
    handle: pick.handle,
    display: pick.creator_display,
    avatar: pick.creator_avatar,
    bio: pick.creator_bio,
  };
  const signal = {
    id: pick.id,
    user_id: pick.user_id,
    creator_id: pick.creator_id,
    video_id: pick.video_id,
    video_title: pick.video_title,
    signal_type: pick.signal_type,
    raw_text: pick.raw_text,
    topic: pick.topic,
    occurred_at: pick.occurred_at,
    fulfilled: 0,
  };
  const focusSignalId = `signal:${signal.id}`;
  const focusActionId = `action:${pick.action_id}`;
  onStep?.(stepFrame(runId, 2, '挑中这一条', {
    hit: true,
    signal: { id: signal.id, text: signal.raw_text, video_title: signal.video_title, occurred_at: signal.occurred_at },
    creator: creator.display,
    recall: signal.raw_text
      ? `她在「${creator.display}」下${SIGNAL_VERB_CN[signal.signal_type] ?? '留下过一条'}「${signal.raw_text}」`
      : `她${SIGNAL_VERB_CN[signal.signal_type] ?? '看过'}《${signal.video_title}》`,
  }, {
    phase: MIND_PHASES.RECALL,
    focus_signal_id: focusSignalId,
    topic: signal.topic,
  }));
  await sleep(stepDelayMs);

  // Step 3 · match
  const actionPayload = JSON.parse(pick.payload_json);
  const scriptId = ACTION_TO_SCRIPT[pick.action_type] ?? 'A';
  onStep?.(stepFrame(runId, 3, '博主今天的新动作', {
    creator: creator.display,
    action_type: pick.action_type,
    action_summary: actionPayload.summary ?? actionPayload.title ?? '博主有了新动作',
    script: scriptId,
  }, {
    phase: MIND_PHASES.MATCH,
    focus_signal_id: focusSignalId,
    focus_action_id: focusActionId,
    topic: signal.topic,
    script: scriptId,
  }));
  await sleep(stepDelayMs);

  // Step 4 · seal
  const footprints = state.signals
    .filter((s) => s.user_id === userId && s.topic === signal.topic)
    .sort((a, b) => (a.occurred_at > b.occurred_at ? -1 : 1))
    .slice(0, 6);

  const match = {
    signal,
    action: {
      id: pick.action_id,
      action_type: pick.action_type,
      payload: actionPayload,
      topic: pick.topic,
      occurred_at: pick.action_occurred,
    },
    creator,
    footprints,
    scriptId,
  };

  const intentResultForPages = {
    intent: 'ambient',
    label: '后台为你认出来',
    confidence: 1.0,
    rationale: '她当时留下的那条信号，后台一直替她记着',
    topic_hint: signal.topic,
    matched_rule: null,
  };
  const card = buildCard({ match, intentResult: intentResultForPages, userId });

  if (!claimSignal(card.intent_signal_id)) {
    onStep?.(stepFrame(runId, 4, '记到她的履约里', {
      ok: false,
      reason: '这条刚刚被抢先接走了',
    }, {
      phase: MIND_PHASES.SEAL,
      focus_signal_id: focusSignalId,
      focus_action_id: focusActionId,
      topic: signal.topic,
      ok: false,
      reason: REASON_CODES.SIGNAL_ALREADY_FULFILLED,
    }));
    return { ok: false, runId, reason: REASON_CODES.SIGNAL_ALREADY_FULFILLED };
  }
  persistCard(card);

  onStep?.(stepFrame(runId, 4, '记到她的履约里', {
    card_id: card.id,
    script: card.script_id,
    fulfilled_signal_id: card.intent_signal_id,
  }, {
    phase: MIND_PHASES.SEAL,
    focus_signal_id: focusSignalId,
    focus_action_id: focusActionId,
    topic: signal.topic,
    card_id: card.id,
  }));
  await sleep(stepDelayMs);

  // Step 5 · emit
  onStep?.(stepFrame(runId, 5, '浮到她的信息流', {
    card_id: card.id,
    pages: card.pages.map((p) => p.id),
    preview_context: card.pages[0]?.context_line,
  }, {
    phase: MIND_PHASES.EMIT,
    focus_signal_id: focusSignalId,
    focus_action_id: focusActionId,
    topic: signal.topic,
    card_id: card.id,
  }));

  return { ok: true, runId, card, scriptId };
}

// mock 下主体是 loop 模式，总有得接
export function hasPendingAmbient(userId, { loopMode = true } = {}) {
  if (loopMode) {
    return state.signals.some((s) =>
      s.user_id === userId && state.actions.some((a) => a.topic === s.topic),
    );
  }
  return state.signals.some((s) =>
    s.user_id === userId &&
    s.fulfilled === 0 &&
    !topicAlreadyFulfilled(userId, s.topic) &&
    state.actions.some((a) => a.topic === s.topic),
  );
}
