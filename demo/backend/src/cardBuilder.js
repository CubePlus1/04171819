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

function getSignalRawText(signal) {
  const text = typeof signal.raw_text === 'string' ? signal.raw_text.trim() : '';
  if (!text || text === '(待补)') return '';
  return text;
}

function buildContextLine({ signal, creator }) {
  const relative = RELATIVE_TIME_CN(signal.occurred_at);
  const verb = ACTION_VERB_BY_SIGNAL[signal.signal_type] ?? '关注过';
  // 从 "log 行" 重构成 "想起来了" 的句式：主语前置 + 创作者收束
  const rawText = getSignalRawText(signal);
  const tail = rawText
    ? `「${rawText}」`
    : `《${signal.video_title}》`;
  return `你 ${relative} 在「${creator.display}」那儿${verb} ${tail}`;
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

// 按情景给按钮：优先用 action.payload.cta.primary（每条剧本自己写的）
// 没有时回退到通用的 A/B/C 默认。"分享给爷爷"这种只属于特定剧本 · 不再共享。
function buildActionsStrip(scriptId, action) {
  const secondary = [
    { id: 'save',    label: '收藏到「我蹲过的」' },
    { id: 'not_now', label: '不感兴趣' },
  ];
  const customPrimary = action?.payload?.cta?.primary;
  if (Array.isArray(customPrimary) && customPrimary.length > 0) {
    return { primary: customPrimary, secondary };
  }
  if (scriptId === 'A') return { primary: [{ id: 'add_wish', label: '加到清单' }, { id: 'view', label: '看' }], secondary };
  if (scriptId === 'B') return { primary: [{ id: 'resume',   label: '续看' },     { id: 'recap', label: '看前情摘要' }], secondary };
  // 默认 C：仅看 · 不带"分享给爷爷"
  return { primary: [{ id: 'play', label: '立即观看' }, { id: 'save_later', label: '下次再看' }], secondary };
}

function buildP2({ intentResult, signal, creator, action }) {
  const rawText = getSignalRawText(signal);
  const triggerSignal = rawText
    ? `你在《${signal.video_title}》下评论「${rawText}」`
    : `你${ACTION_VERB_BY_SIGNAL[signal.signal_type] ?? '关注过'}《${signal.video_title}》`;
  const matchedBasis = {
    post_link:        '她把你蹲的款式放出了平替链接',
    post_sequel:      '她更新了你蹲的那集的后续',
    series_completed: '她把你收藏过的系列更完了',
    reply_tutorial:   '她在回复里带上了你求的教程',
  }[action.action_type] ?? '她有了新的动作';

  return {
    id: 'P2',
    name: '为什么这次会记得你',
    trigger_signal: triggerSignal,
    ai_intent: `${intentResult.label} · 把握度 ${(intentResult.confidence * 100).toFixed(0)}%`,
    rationale: intentResult.rationale,
    matched_basis: matchedBasis,
    warm_summary: `你惦记过的这件事，这次终于有回音了`,
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

  // 情感收束：优先 action.payload.emotional_close · 否则按 scriptId 走通用
  // （原来 C = "爷爷的老战友联系到他了" 被跨剧本污染 · 现在必须按剧本贴情景）
  const defaultClose = {
    A: '当时蹲的，这次替你接住了',
    B: '你没来得及追完的，这次替你接上了',
    C: '你蹲过的那条 · 她替你接回来了',
  }[scriptId] ?? '你念念不忘的 · 接回来了';

  const occurredRelative = RELATIVE_TIME_CN(signal.occurred_at);
  const rawText = getSignalRawText(signal);
  // Figma 顶端大标题：action.payload.headline 里的 {time} 用相对时间替换
  const headlineTpl = action?.payload?.headline
    ?? `我 {time} 蹲的那件事 · 它来了`;
  const headline = headlineTpl.replace('{time}', occurredRelative);

  const p1 = {
    id: 'P1',
    name: '情景 + 答案',
    // Figma 轻卡：我原评论 + 相对时间 + 原视频行 + 作者标签
    my_comment: rawText || signal.video_title,
    occurred_relative: occurredRelative,
    headline,
    context_line: buildContextLine({ signal, creator }),
    emotional_close: action?.payload?.emotional_close ?? defaultClose,
    answer: buildAnswer({ scriptId, action }),
    actions: buildActionsStrip(scriptId, action),
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
