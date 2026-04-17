import { useEffect, useRef, useState } from 'react';

/**
 * AmbientPulse · "AI 在后台扫描"的呼吸指示器
 * - running=true 时显示扫描脉冲
 * - 非 running + autoOn 时显示下一次 tick 倒计时
 * - 不是进度条，不是加载 spinner，是一种"她一直陪着你"的节奏
 */
export default function AmbientPulse({ running, autoOn, nextTickMs, onToggleAuto, onTickNow, disabled, pending }) {
  const [tickProgress, setTickProgress] = useState(0);
  const rafRef = useRef(null);
  const startRef = useRef(0);

  useEffect(() => {
    if (!autoOn || running) {
      setTickProgress(running ? 1 : 0);
      return;
    }
    startRef.current = performance.now();
    const step = (t) => {
      const elapsed = t - startRef.current;
      const ratio = Math.min(1, elapsed / Math.max(1, nextTickMs));
      setTickProgress(ratio);
      if (ratio < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [autoOn, running, nextTickMs]);

  const barWidth = `${Math.round(tickProgress * 100)}%`;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.03] px-3 py-2">
      <span
        className={`relative inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${
          running ? 'bg-ember' : autoOn && pending ? 'bg-warmth animate-pulse-soft' : 'bg-stone-500'
        }`}
        aria-hidden="true"
      >
        {running && (
          <span className="absolute inset-0 rounded-full bg-ember/40 animate-ping" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="text-[12px] text-stone-200">
          {!pending
            ? '她惦记的都替她接回来了'
            : running
              ? '正在把这一条接回来…'
              : autoOn
                ? '后台一直在看着她念念不忘的'
                : '后台待命 · 没开自动接'}
        </div>
        {autoOn && pending && !running && (
          <div className="mt-1 h-[2px] w-full overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-warmth transition-none"
              style={{ width: barWidth }}
            />
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={onTickNow}
          disabled={disabled || !pending}
          className="focus-ring rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-stone-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="立刻接下一条"
        >
          接下一条
        </button>
        <button
          onClick={onToggleAuto}
          disabled={disabled}
          aria-pressed={autoOn}
          className={`focus-ring rounded-full border px-3 py-1 text-[11px] transition ${
            autoOn
              ? 'border-warmth/40 bg-warmth/15 text-warmth'
              : 'border-white/10 bg-white/5 text-stone-300 hover:bg-white/10'
          }`}
        >
          {autoOn ? '自动接 · 开' : '自动接 · 关'}
        </button>
      </div>
    </div>
  );
}
