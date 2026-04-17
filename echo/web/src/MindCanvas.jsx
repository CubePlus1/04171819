import { useEffect, useMemo, useState } from 'react';
import { MIND_PHASES } from '@shared/contracts.mjs';

/**
 * MindCanvas · 回响版的"念头图谱"
 *
 * 输入：events（useAmbient 返回的流）+ reducedMotion
 * 每次 bubble/postcard 带 mind 字段，这里按 phase 播放：
 *   scan   · 呼吸
 *   recall · focus signal 浮起
 *   match  · signal ↔ action 连线
 *   seal   · 金印落下
 *   emit   · focus 飘向页面下方（把回响送到对话里）
 *
 * 只用原生 CSS + SVG（echo 整个 web 没有 framer-motion，保持不引新依赖）。
 * prefers-reduced-motion 下只保留静态高亮 / 连线，不动。
 */

const VIEW_W = 320;
const VIEW_H = 180;
const PAD_X = 22;
const PAD_Y = 18;

const TOPIC_COLOR = {
  'knit-top':        '#b84a5a',
  'series-30days':   '#8b6f4e',
  'grandpa':         '#b38f54',
};
const UNKNOWN_COLOR = '#8a7f72';
function colorOf(topic) {
  return TOPIC_COLOR[topic] ?? UNKNOWN_COLOR;
}

function hashNumber(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}
function positionOf(node) {
  const h = hashNumber(node.id);
  const isSignal = node.kind === 'signal';
  const bandX0 = isSignal ? PAD_X : VIEW_W * 0.58;
  const bandX1 = isSignal ? VIEW_W * 0.42 : VIEW_W - PAD_X;
  const xN = (h & 0xffff) / 0xffff;
  const yN = ((h >> 16) & 0xffff) / 0xffff;
  return {
    x: bandX0 + xN * (bandX1 - bandX0),
    y: PAD_Y + yN * (VIEW_H - 2 * PAD_Y),
  };
}

export default function MindCanvas({ events, reducedMotion = false, idle = false }) {
  // 从最新的含 mind 事件里取当前相位
  const currentMind = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const e = events[i];
      if (e?.mind) return e.mind;
    }
    return null;
  }, [events]);

  // 节点快照：上一次 scan 的结果
  const [nodes, setNodes] = useState([]);
  useEffect(() => {
    if (currentMind?.phase === MIND_PHASES.SCAN && Array.isArray(currentMind.nodes)) {
      setNodes(currentMind.nodes);
    }
  }, [currentMind]);

  const phase = idle ? MIND_PHASES.IDLE : (currentMind?.phase ?? MIND_PHASES.IDLE);
  const focusSignalId = currentMind?.focus_signal_id ?? null;
  const focusActionId = currentMind?.focus_action_id ?? null;
  const focusTopic = currentMind?.topic ?? null;

  const positioned = useMemo(
    () => nodes.map((n) => ({ ...n, ...positionOf(n) })),
    [nodes],
  );
  const sFocus = positioned.find((n) => n.id === focusSignalId);
  const aFocus = positioned.find((n) => n.id === focusActionId);

  const phaseLabel = {
    [MIND_PHASES.IDLE]:   '后台陪着她',
    [MIND_PHASES.SCAN]:   '扫描她还惦记着的',
    [MIND_PHASES.RECALL]: '想起了这一条',
    [MIND_PHASES.MATCH]:  '对上她等的那个回音',
    [MIND_PHASES.SEAL]:   '替她把这件事接住了',
    [MIND_PHASES.EMIT]:   '送到她面前',
  }[phase];

  const showConnection = sFocus && aFocus && (
    phase === MIND_PHASES.MATCH || phase === MIND_PHASES.SEAL || phase === MIND_PHASES.EMIT
  );

  return (
    <div
      className={`mind-canvas mind-canvas-phase-${phase}`}
      data-reduced={reducedMotion ? 'true' : 'false'}
      role="img"
      aria-label={`念头图谱 · ${phaseLabel}`}
    >
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          <radialGradient id="mind-glow-echo" cx="50%" cy="110%" r="70%">
            <stop offset="0%" stopColor={colorOf(focusTopic)} stopOpacity="0.12" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="url(#mind-glow-echo)" />

        <text x={PAD_X} y={11} fill="var(--muted)" fontSize="8" letterSpacing="2">
          她念念不忘的
        </text>
        <text x={VIEW_W - PAD_X} y={11} fill="var(--muted)" fontSize="8" letterSpacing="2" textAnchor="end">
          博主这阵子的动作
        </text>

        {showConnection && (
          <line
            className="mind-conn"
            x1={sFocus.x}
            y1={sFocus.y}
            x2={aFocus.x}
            y2={aFocus.y}
            stroke={colorOf(focusTopic)}
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeDasharray="3 3"
          />
        )}

        {positioned.map((node) => {
          const isSignal = node.kind === 'signal';
          const isFocus =
            (isSignal && node.id === focusSignalId) ||
            (!isSignal && node.id === focusActionId);
          const topicMatched = focusTopic && node.topic === focusTopic;
          const baseR = isSignal ? 4 : 3.5;
          const r = isFocus ? (isSignal ? 7.5 : 6.5) : baseR;
          const dimmed = phase !== MIND_PHASES.IDLE && phase !== MIND_PHASES.SCAN && !topicMatched;
          const baseOpacity = node.fulfilled ? 0.35 : 0.9;
          const opacity = dimmed ? 0.2 : baseOpacity;
          const color = colorOf(node.topic);
          return (
            <g
              key={node.id}
              className={[
                'mind-node',
                isSignal ? 'mind-signal' : 'mind-action',
                isFocus ? 'mind-focus' : '',
                (!node.fulfilled && phase === MIND_PHASES.SCAN && !isFocus) ? 'mind-breathe' : '',
              ].join(' ').trim()}
              style={{ '--mind-color': color, '--mind-op': opacity }}
            >
              <circle cx={node.x} cy={node.y} r={r} fill={color} opacity={opacity} />
              {isFocus && (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={r + 3}
                  fill="none"
                  stroke={color}
                  strokeWidth="1.2"
                  opacity="0.7"
                />
              )}
            </g>
          );
        })}

        {sFocus && phase === MIND_PHASES.SEAL && (
          <circle
            className="mind-seal"
            cx={sFocus.x}
            cy={sFocus.y}
            r="10"
            fill="none"
            stroke="var(--gold)"
            strokeWidth="1.2"
          />
        )}

        {sFocus && phase === MIND_PHASES.EMIT && (
          <circle
            className="mind-emit"
            cx={sFocus.x}
            cy={sFocus.y}
            r="5"
            fill={colorOf(focusTopic)}
          />
        )}
      </svg>

      <div className="mind-caption">
        <span
          className="mind-caption-dot"
          style={{ background: phase === MIND_PHASES.IDLE ? 'var(--muted)' : colorOf(focusTopic) }}
        />
        <span>{phaseLabel}</span>
      </div>

      {positioned.length === 0 && (
        <div className="mind-empty">等她那边的新动作过来…</div>
      )}
    </div>
  );
}
