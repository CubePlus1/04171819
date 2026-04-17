// 单一契约源 · 后端与前端共用
// 修改这里 = 明确破坏 wire contract；跨层 grep 不再是唯一保护
//
// 后端：import from '../../shared/contracts.js'
// 前端：import from '@shared/contracts'   （vite alias）

export const WS_EVENTS = Object.freeze({
  HELLO:             'ws.hello',
  WORKFLOW_BEGIN:    'workflow.begin',
  WORKFLOW_STEP:     'workflow.step',
  WORKFLOW_END:      'workflow.end',
  CARD_GENERATED:    'card.generated',
  DEMO_RESET:        'demo.reset',
  SERVER_SHUTDOWN:   'server.shutdown',
});

export const REASON_CODES = Object.freeze({
  NO_MATCH:                  'no-match',
  SIGNAL_ALREADY_FULFILLED:  'signal-already-fulfilled',
  SERVER_ERROR:              'server-error',
  RATE_LIMITED:              'rate-limited',
  IN_FLIGHT_WORKFLOW:        'in-flight-workflow',
});

export const SCRIPT_IDS  = Object.freeze(['A', 'B', 'C']);
export const PAGE_IDS    = Object.freeze(['P1', 'P2', 'P3']);
export const ANSWER_TYPES = Object.freeze({
  PRODUCT_CARD: 'product_card',
  SERIES_GRID:  'series_grid',
  INLINE_VIDEO: 'inline_video',
});

export const SCRIPT_TO_PAGES = Object.freeze({
  A: ['P1', 'P2'],
  B: ['P1', 'P3'],
  C: ['P1', 'P2', 'P3'],
});

export const INTENTS = Object.freeze({
  LINK_REQUEST:     'link_request',
  SEQUEL_REQUEST:   'sequel_request',
  SERIES_CATCHUP:   'series_catchup',
  TUTORIAL_REQUEST: 'tutorial_request',
  PLUS_ONE:         'plus_one',
  PASSIVE_INTEREST: 'passive_interest',
});

export const MAX_COMMENT_GRAPHEMES = 140;

/**
 * 情景锚点统一用 floor-based 阈值，让后端 P1 文案和前端历史列表的相对时间保持一致
 */
export function relativeTimeCn(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - then;
  if (!Number.isFinite(diffMs) || diffMs < 0) return '刚刚';
  const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
  if (diffMs < MIN) return '刚刚';
  if (diffMs < HOUR) return `${Math.floor(diffMs / MIN)} 分钟前`;
  if (diffMs < DAY)  return `${Math.floor(diffMs / HOUR)} 小时前`;
  const days = Math.floor(diffMs / DAY);
  if (days === 1) return '昨天';
  if (days < 7)   return `${days} 天前`;
  if (days < 31)  return `${Math.floor(days / 7)} 周前`;
  if (days < 365) return `${Math.floor(days / 30)} 个月前`;
  return `${Math.floor(days / 365)} 年前`;
}

/**
 * 用书写字符数而非 UTF-16 code unit 数计算长度，兼容 emoji 与 CJK
 */
export function graphemeLength(text) {
  if (typeof text !== 'string') return 0;
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    try {
      const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
      let count = 0;
      for (const _ of seg.segment(text)) count += 1;
      return count;
    } catch {/* fallthrough */}
  }
  return Array.from(text).length;
}
