// 前后端共享契约：SSE event 类型 + reason code + 剧本/动作词汇表
// 消费方式：
//   后端 server / echo.mjs：import from '../shared/contracts.mjs'
//   前端 useEcho.js：       import from '@shared/contracts.mjs'（vite alias）

export const SSE_EVENTS = Object.freeze({
  BEGIN:    'begin',
  BUBBLE:   'bubble',
  POSTCARD: 'postcard',
  END:      'end',
});

export const REASONS = Object.freeze({
  NO_MATCH:           'no-match',
  NO_ACTION:          'no-action',
  ALREADY_FULFILLED:  'already-fulfilled',
  SERVER_ERROR:       'server-error',
  RATE_LIMITED:       'rate-limited',
  TOO_MANY_STREAMS:   'too-many-streams',
});

export const REASON_TEXT_CN = Object.freeze({
  [REASONS.NO_MATCH]:          '这一次我没找到能接住的那条，下次再说。',
  [REASONS.NO_ACTION]:         '那条线索还没动静 · 我先记下了。',
  [REASONS.ALREADY_FULFILLED]: '这件事我之前替你接过一次了 · 这次让它停在这儿。',
  [REASONS.SERVER_ERROR]:      '路上摔了一下 · 再说一次？',
  [REASONS.RATE_LIMITED]:      '说得太快了 · 稍等一拍。',
  [REASONS.TOO_MANY_STREAMS]:  '我一下子接住了太多念头 · 让我缓一口气。',
});

export const ACTION_VERB_CN = Object.freeze({
  post_link:        '刚刚放出了那个链接',
  post_sequel:      '发了那集的后续',
  series_completed: '把那个系列更完了',
  reply_tutorial:   '在回复里带上了你求的教程',
});

export const SCRIPT_IDS = Object.freeze(['A', 'B', 'C']);
