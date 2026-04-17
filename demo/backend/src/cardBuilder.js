// 卡片构造器：把 (signal, action, creator) 组装成 P1/P2/P3 多页结构
// 严格对齐 principle.json 的 card_structure

const ACTION_VERB_BY_SIGNAL = {
  comment_intent:    '评论了',
  watch_later:       '按了稍后再看',
  unfinished_save:   '收藏过',
  unsatisfied_search:'搜过',
  passive_interest:  '反复刷到过',
};

import { relativeTimeCn as RELATIVE_TIME_CN } from '../../shared/contracts.js';

const SCRIPT_TO_PAGES = { A: ['P1', 'P2'], B: ['P1', 'P3'], C: ['P1', 'P2', 'P3'] };

function buildContextLine({ signal, creator }) {
  const relative = RELATIVE_TIME_CN(signal.occurred_at);
  const verb = ACTION_VERB_BY_SIGNAL[signal.signal_type] ?? '关注过';
  const topicDesc = signal.raw_text
    ? `「${creator.display}」里${verb}「${signal.raw_text}」`
    : `「${creator.display}」里的《${signal.video_title}》${verb}`;
  return `你 ${relative} 在 ${topicDesc}`;
}

function buildAnswer({ scriptId, action }) {
  const payload = action.payload ?? {};
  if (scriptId === 'A') {
    return {
      type: 'product_card',
      video: { id: payload.video_id, title: payload.title, cover: payload.cover },
      product: payload.product ?? null,
      summary: payload.summary ?? '',
    };
  }
  if (scriptId === 'B') {
    return {
      type: 'series_grid',
      video: { id: payload.video_id, title: payload.title, cover: payload.cover },
      thumbnails: payload.series_thumbnails ?? [],
      summary: payload.summary ?? '',
    };
  }
  return {
    type: 'inline_video',
    video: {
      id: payload.video_id,
      title: payload.title,
      cover: payload.cover,
      preview_seconds: payload.preview_seconds ?? 10,
    },
    summary: payload.summary ?? '',
  };
}

function buildActionsStrip(scriptId) {
  const shared = {
    secondary: [
      { id: 'save',       label: '收藏到「我蹲过的」' },
      { id: 'not_now',    label: '不感兴趣' },
    ],
  };
  if (scriptId === 'A') return { ...shared, primary: [{ id: 'add_wish', label: '加到清单' }, { id: 'view', label: '看' }] };
  if (scriptId === 'B') return { ...shared, primary: [{ id: 'resume',   label: '续看' }, { id: 'recap', label: '看 AI 摘要' }] };
  return { ...shared, primary: [{ id: 'play', label: '看' }, { id: 'share', label: '分享给爷爷' }] };
}

function buildP2({ intentResult, signal, creator, action }) {
  const triggerSignal = signal.raw_text
    ? `你在《${signal.video_title}》下评论「${signal.raw_text}」`
    : `你${ACTION_VERB_BY_SIGNAL[signal.signal_type] ?? '关注过'}《${signal.video_title}》`;
  const matchedBasis = {
    post_link:        '博主把你蹲的款式放出了平替链接',
    post_sequel:      '博主更新了你蹲的那集的后续',
    series_completed: '博主把你收藏过的系列更完了',
    reply_tutorial:   '博主回复里带上了你求的教程',
  }[action.action_type] ?? '博主有了新的动作';

  return {
    id: 'P2',
    name: 'AI 解释',
    trigger_signal: triggerSignal,
    ai_intent: `${intentResult.label} · 置信度 ${(intentResult.confidence * 100).toFixed(0)}%`,
    rationale: intentResult.rationale,
    matched_basis: matchedBasis,
    warm_summary: `AI 看到你蹲过「${creator.display}」，现在博主${matchedBasis.slice(2)}`,
  };
}

function buildP3({ footprints, signal, creator }) {
  const items = footprints.map((f) => ({
    relative_time: RELATIVE_TIME_CN(f.occurred_at),
    video_title: f.video_title,
    signal_label: ACTION_VERB_BY_SIGNAL[f.signal_type] ?? '关注',
  }));
  return {
    id: 'P3',
    name: '行为足迹',
    topic: signal.topic,
    creator_display: creator.display,
    summary: `你这段时间一直在关注「${creator.display}」的内容`,
    items,
    next_seed: '同主题还有 1 个未履约的念头——「她提过的那本书还没放链接」',
  };
}

/**
 * 组装多页卡片
 * @returns {{id, user_id, script_id, pages, intent_signal_id, creator_action_id}}
 */
export function buildCard({ match, intentResult, userId }) {
  if (!match?.signal || !match?.action) {
    throw new Error('buildCard: match.signal 和 match.action 必填');
  }
  const { signal, action, creator, footprints, scriptId } = match;
  const pagesOrder = SCRIPT_TO_PAGES[scriptId] ?? ['P1'];

  const p1 = {
    id: 'P1',
    name: '情景 + 答案',
    context_line: buildContextLine({ signal, creator }),
    emotional_close: {
      A: '当时蹲的终于放出来了',
      B: '她已经更完了，AI 帮你摘了前情',
      C: '爷爷的老战友联系到他了',
    }[scriptId] ?? '你念念不忘的，接回来',
    answer: buildAnswer({ scriptId, action }),
    actions: buildActionsStrip(scriptId),
    creator,
  };

  const pages = [p1];
  if (pagesOrder.includes('P2')) pages.push(buildP2({ intentResult, signal, creator, action }));
  if (pagesOrder.includes('P3')) pages.push(buildP3({ footprints, signal, creator }));

  return {
    id: `card_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    user_id: userId,
    script_id: scriptId,
    intent_signal_id: signal.id,
    creator_action_id: action.id,
    pages,
  };
}

