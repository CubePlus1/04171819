// 单一契约源 · 后端与前端共用
// 修改这里 = 明确破坏 wire contract；跨层 grep 不再是唯一保护
//
// 后端：import from '../../shared/contracts.js'
// 前端：import from '@shared/contracts'   （vite alias）

export const WS_EVENTS = Object.freeze({
  HELLO:             'ws.hello',
  WORKFLOW_BEGIN:    'workflow.begin',
  WORKFLOW_STEP:     'step',
  WORKFLOW_STEP_LEGACY: 'workflow.step',
  WORKFLOW_END:      'workflow.end',
  CARD_GENERATED:    'card.generated',
  DEMO_RESET:        'demo.reset',
  SERVER_SHUTDOWN:   'server.shutdown',
});

export const BACKFILL_EVENTS = Object.freeze({
  PROGRESS: 'backfill.progress',
  DONE: 'backfill.done',
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
 * Mind 可视化阶段 · 与 workflow step 一一对应，但独立演化
 * 前后端都引用这个常量，避免字面量 drift
 */
export const MIND_PHASES = Object.freeze({
  IDLE:   'idle',     // 无 step 运行 · 静态星座
  SCAN:   'scan',     // step 1 · 全部未履约节点柔和呼吸
  RECALL: 'recall',   // step 2 · focus_signal 浮起
  MATCH:  'match',    // step 3 · signal ↔ action 连线点亮
  SEAL:   'seal',     // step 4 · 原子声明 · 金印落下
  EMIT:   'emit',     // step 5 · 从 mind 射向信息流
});

export const STEP_TO_MIND_PHASE = Object.freeze({
  1: MIND_PHASES.SCAN,
  2: MIND_PHASES.RECALL,
  3: MIND_PHASES.MATCH,
  4: MIND_PHASES.SEAL,
  5: MIND_PHASES.EMIT,
});

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
