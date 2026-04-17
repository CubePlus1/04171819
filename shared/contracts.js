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
