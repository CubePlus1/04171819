import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useDemoStore } from '../store/useDemoStore.js';
import { MIND_PHASES } from '@shared/contracts.js';

/**
 * AgentMind · "她的念头在后台"可视化
 *
 * 订阅 store.steps，把每个 step 附带的 mind 字段按 phase 驱动动画：
 *   scan   · 全部节点柔和呼吸，未履约节点高亮
 *   recall · focus_signal 放大靠近中心
 *   match  · signal ↔ action 连线点亮
 *   seal   · 金印在 signal 上落下
 *   emit   · focus 向右上方"飞出"（指向左边信息流）
 *
 * 约束：
 *   - 只用 framer-motion（无新依赖）
 *   - 整套动画在 9s 节奏内演完（每阶段 ~400ms · 跟 stepDelayMs 对齐）
 *   - prefers-reduced-motion 下只显示静态布局 + focus 高亮（无 pulse / spring）
 */

const VIEW_W = 320;
const VIEW_H = 200;
const PAD_X = 24;
const PAD_Y = 20;

const TOPIC_COLOR = {
  'dashan-knit-top': 'var(--color-kiss)',
  '30days-series':   'var(--color-hintB)',
  'grandpa-archive': 'var(--color-warmth)',
};
const UNKNOWN_COLOR = 'var(--color-text-muted)';
function colorOf(topic) {
  return TOPIC_COLOR[topic] ?? UNKNOWN_COLOR;
}

// 稳定 hash · 同 id 永远在同一位置
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
  // signals 落在左半区、actions 落在右半区
  const isSignal = node.kind === 'signal';
  const bandX0 = isSignal ? PAD_X : VIEW_W * 0.58;
  const bandX1 = isSignal ? VIEW_W * 0.42 : VIEW_W - PAD_X;
  const xNoise = ((h & 0xffff) / 0xffff);
  const yNoise = (((h >> 16) & 0xffff) / 0xffff);
  const x = bandX0 + xNoise * (bandX1 - bandX0);
  const y = PAD_Y + yNoise * (VIEW_H - 2 * PAD_Y);
  return { x, y };
}

// 取当前最活跃的那一步（active > done > idle），拿它的 mind
function pickActiveMindStep(steps) {
  // 倒序扫：active 最优先，否则最后一个 done（说明刚走完）
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    if (steps[i].status === 'active' && steps[i].mind) return steps[i];
  }
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    if (steps[i].status === 'done' && steps[i].mind) return steps[i];
  }
  return null;
}

export default function AgentMind() {
  const steps = useDemoStore((s) => s.steps);
  const reduce = useReducedMotion();

  // 保留最后一次收到的 scan 节点快照（后续 step 不再下发 nodes）
  const [nodes, setNodes] = useState([]);
  const lastRunRef = useRef(null);

  const activeStep = useMemo(() => pickActiveMindStep(steps), [steps]);
  const mind = activeStep?.mind;
  const phase = mind?.phase ?? MIND_PHASES.IDLE;

  // 一次新的 run 开始（收到 phase=scan 且带 nodes） → 更新节点快照
  useEffect(() => {
    if (!mind) return;
    if (phase === MIND_PHASES.SCAN && Array.isArray(mind.nodes) && mind.nodes.length > 0) {
      lastRunRef.current = activeStep?.step;
      setNodes(mind.nodes);
    }
  }, [mind, phase, activeStep?.step]);

  const focusSignalId = mind?.focus_signal_id ?? null;
  const focusActionId = mind?.focus_action_id ?? null;
  const focusTopic = mind?.topic ?? null;

  const positioned = useMemo(
    () => nodes.map((n) => ({ ...n, ...positionOf(n) })),
    [nodes],
  );
  const signalFocusNode = positioned.find((n) => n.id === focusSignalId);
  const actionFocusNode = positioned.find((n) => n.id === focusActionId);

  const phaseLabel = {
    [MIND_PHASES.IDLE]:   '后台陪着她',
    [MIND_PHASES.SCAN]:   '扫描她还惦记着的',
    [MIND_PHASES.RECALL]: '想起了这一条',
    [MIND_PHASES.MATCH]:  '对上她等的那个回音',
    [MIND_PHASES.SEAL]:   '替她把这件事接住了',
    [MIND_PHASES.EMIT]:   '送到她的信息流里',
  }[phase];

  // reduced-motion：全部使用 0 duration；否则用柔和 spring
  const durBase   = reduce ? 0 : 0.35;
  const durFocus  = reduce ? 0 : 0.45;
  const durConn   = reduce ? 0 : 0.5;
  const durEmit   = reduce ? 0 : 0.6;

  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl border border-white/5 bg-stage"
      role="img"
      aria-label={`念头图谱 · ${phaseLabel}`}
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="block h-auto w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* 柔和的光晕背景 */}
        <defs>
          <radialGradient id="mind-glow" cx="50%" cy="120%" r="70%">
            <stop offset="0%" stopColor="var(--color-ember)" stopOpacity="0.12" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <filter id="node-blur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" />
          </filter>
        </defs>
        <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="url(#mind-glow)" />

        {/* 左右泾渭：signals / actions 分区说明文字 */}
        <text x={PAD_X} y={12} fill="var(--color-text-muted)" fontSize="9" letterSpacing="2">
          她念念不忘的
        </text>
        <text x={VIEW_W - PAD_X} y={12} fill="var(--color-text-muted)" fontSize="9" letterSpacing="2" textAnchor="end">
          博主这阵子的动作
        </text>

        {/* 连线：match / seal / emit 阶段点亮 */}
        {signalFocusNode && actionFocusNode && (phase === MIND_PHASES.MATCH || phase === MIND_PHASES.SEAL || phase === MIND_PHASES.EMIT) && (
          <motion.line
            x1={signalFocusNode.x}
            y1={signalFocusNode.y}
            x2={actionFocusNode.x}
            y2={actionFocusNode.y}
            stroke={colorOf(focusTopic)}
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeDasharray="3 3"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.85 }}
            transition={{ duration: durConn }}
          />
        )}

        {/* 节点 · 同 topic 浅色柔圈 */}
        {positioned.map((node) => {
          const isSignal = node.kind === 'signal';
          const isFocus =
            (isSignal && node.id === focusSignalId) ||
            (!isSignal && node.id === focusActionId);
          const topicMatched = focusTopic && node.topic === focusTopic;
          const baseR = isSignal ? 4 : 3.5;
          const targetR = isFocus ? (isSignal ? 7.5 : 6.5) : baseR;
          const dimmed = phase !== MIND_PHASES.IDLE && phase !== MIND_PHASES.SCAN && !topicMatched;
          const baseOpacity = node.fulfilled ? 0.35 : 0.9;
          const opacity = dimmed ? 0.2 : baseOpacity;

          return (
            <Node
              key={node.id}
              node={node}
              targetR={targetR}
              opacity={opacity}
              isFocus={isFocus}
              color={colorOf(node.topic)}
              reduce={reduce}
              phase={phase}
              durBase={durBase}
              durFocus={durFocus}
              durEmit={durEmit}
            />
          );
        })}

        {/* SEAL · focus signal 上方的金印 */}
        {signalFocusNode && phase === MIND_PHASES.SEAL && (
          <motion.circle
            cx={signalFocusNode.x}
            cy={signalFocusNode.y}
            r={14}
            fill="none"
            stroke="var(--color-warmth)"
            strokeWidth="1.2"
            initial={{ r: 0, opacity: 0 }}
            animate={{ r: 14, opacity: [0, 1, 0] }}
            transition={{ duration: 0.7 }}
          />
        )}

        {/* EMIT · focus signal 向右上飞出（去往左边信息流的隐喻） */}
        <AnimatePresence>
          {signalFocusNode && phase === MIND_PHASES.EMIT && (
            <motion.circle
              key={`emit-${focusSignalId}`}
              cx={signalFocusNode.x}
              cy={signalFocusNode.y}
              r={6}
              fill={colorOf(focusTopic)}
              initial={{ cx: signalFocusNode.x, cy: signalFocusNode.y, opacity: 0.95, r: 6 }}
              animate={{
                cx: -18,
                cy: signalFocusNode.y - 30,
                opacity: 0,
                r: 3,
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: durEmit, ease: 'easeOut' }}
              style={{ filter: 'url(#node-blur)' }}
            />
          )}
        </AnimatePresence>
      </svg>

      {/* 相位标签 · 左下 */}
      <div className="pointer-events-none absolute bottom-2 left-3 flex items-center gap-2">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{
            background: phase === MIND_PHASES.IDLE ? 'var(--color-text-muted)' : colorOf(focusTopic),
          }}
        />
        <span className="text-[11px] font-medium tracking-[0.2em] text-stone-100">{phaseLabel}</span>
      </div>

      {/* 无节点时的占位（initial mount） */}
      {positioned.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-center">
          <div className="text-[13px] font-medium tracking-[0.2em] text-stone-100">
            后台正在扫描她的念头
          </div>
          <div className="text-[11px] text-stone-200">
            下一条履约卡片即将浮到左边的信息流…
          </div>
        </div>
      )}
    </div>
  );
}

function Node({ node, targetR, opacity, isFocus, color, reduce, phase, durBase, durFocus, durEmit }) {
  const { x, y } = node;
  const shouldPulse =
    !reduce && !node.fulfilled && phase === MIND_PHASES.SCAN && !isFocus;

  return (
    <>
      <motion.circle
        cx={x}
        cy={y}
        fill={color}
        initial={{ r: targetR, opacity }}
        animate={{ r: targetR, opacity }}
        transition={{ duration: isFocus ? durFocus : durBase }}
      />
      {shouldPulse && (
        <motion.circle
          cx={x}
          cy={y}
          fill="none"
          stroke={color}
          strokeWidth="0.8"
          initial={{ r: targetR, opacity: 0.6 }}
          animate={{ r: targetR + 6, opacity: 0 }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
        />
      )}
      {isFocus && (
        <motion.circle
          cx={x}
          cy={y}
          fill="none"
          stroke={color}
          strokeWidth="1.4"
          initial={{ r: targetR + 2, opacity: 0 }}
          animate={{ r: targetR + 4, opacity: 0.7 }}
          transition={{ duration: durFocus }}
        />
      )}
    </>
  );
}
