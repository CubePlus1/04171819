import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import AgentWorkflow from '../components/AgentWorkflow.jsx';
import AgentMind from '../components/AgentMind.jsx';
import TriggerPicker from '../components/TriggerPicker.jsx';
import AmbientPulse from '../components/AmbientPulse.jsx';
import { useDemoStore } from '../store/useDemoStore.js';
import { ambientTick } from '../api/client.js';
import { relativeTimeCn } from '../utils/time.js';

const AUTO_TICK_MS = 9000;   // 约 9 秒一条 —— 给评委留出看左边卡片的时间
const KICKOFF_DELAY_MS = 1200; // 页面到手到第一条履约之间的呼吸

export default function AgentPanel({ onToast }) {
  const running = useDemoStore((s) => s.running);
  const connected = useDemoStore((s) => s.connected);
  const history = useDemoStore((s) => s.history);
  const pending = useDemoStore((s) => s.pending);
  const setPending = useDemoStore((s) => s.setPending);
  const lastCompleted = useDemoStore((s) => s.lastCompleted);
  const lastReason = useDemoStore((s) => s.lastReason);

  const [autoOn, setAutoOn] = useState(true);
  const submittingRef = useRef(false);
  const autoTimerRef = useRef(null);

  const trigger = useCallback(async ({ topic, signalId } = {}) => {
    if (submittingRef.current || running || !pending) return;
    submittingRef.current = true;
    try {
      const res = await ambientTick({ topic, signalId });
      if (typeof res?.pending === 'boolean') setPending(res.pending);
    } catch (e) {
      onToast?.(e.message || '刚刚没接住');
    } finally {
      setTimeout(() => { submittingRef.current = false; }, 300);
    }
  }, [running, pending, onToast, setPending]);

  // 运行结束后自动释放
  useEffect(() => {
    if (!running) submittingRef.current = false;
  }, [running]);

  // 自动 tick 引擎：开启时按节奏让后台接下一条
  useEffect(() => {
    if (!autoOn || !connected || !pending) return;
    // 当前正在跑就等跑完；下次 render 会重新调度
    if (running || submittingRef.current) return;

    autoTimerRef.current = setTimeout(() => {
      trigger();
    }, AUTO_TICK_MS);
    return () => clearTimeout(autoTimerRef.current);
  }, [autoOn, connected, pending, running, trigger]);

  // 连接建立后先等一拍，再踢第一条（避免"页面一加载就立刻弹卡"的突兀感）
  const firstKickoffRef = useRef(false);
  useEffect(() => {
    if (firstKickoffRef.current) return;
    if (!autoOn || !connected || !pending) return;
    firstKickoffRef.current = true;
    const t = setTimeout(() => trigger(), KICKOFF_DELAY_MS);
    return () => clearTimeout(t);
  }, [autoOn, connected, pending, trigger]);

  // 成功落卡 → 柔和 toast
  useEffect(() => {
    if (lastCompleted?.cardId) {
      onToast?.('她念念不忘的，替她接回来了');
    }
  }, [lastCompleted, onToast]);

  const disabled = running || !connected;

  return (
    <div className="flex h-full flex-col gap-3">
      {/* AI 记忆引擎 · douyin-style header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg border border-[color:var(--color-kiss)]/40 bg-[color:var(--color-kiss)]/10 text-xl text-[color:var(--color-kiss)]">
            🧠
          </div>
          <div className="leading-tight">
            <div className="text-[16px] font-black italic tracking-tight text-[color:var(--color-ink)]">
              AI 为你记得
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[color:var(--color-kiss)]/80">
              Memory Retrieval Engine //&nbsp;
              <span className="text-[color:var(--color-warmth)]">
                {connected ? 'Ready' : 'Offline'}
              </span>
            </div>
          </div>
        </div>
        <span className="rounded-full border border-black/10 bg-white/60 px-3 py-1 font-mono text-[10px] text-[color:var(--color-text)] backdrop-blur">
          BETA v0.1
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden rounded-3xl border border-white/5 bg-[color:var(--color-panel)] p-4">
        <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pr-1 scrollbar-none">

          <section>
            <AmbientPulse
              running={running}
              autoOn={autoOn}
              pending={pending}
              nextTickMs={AUTO_TICK_MS}
              disabled={disabled}
              onToggleAuto={() => setAutoOn((v) => !v)}
              onTickNow={() => trigger()}
            />
          </section>

          {/* Mind · 主视觉：念头图谱 · 夹在 AmbientPulse 和 AgentWorkflow 之间 */}
          <motion.section layout>
            <AgentMind />
          </motion.section>

          <section className="glass rounded-2xl p-4">
            <TriggerPicker onPick={(t) => trigger({ topic: t.topic })} disabled={disabled || !pending} />
          </section>

          {/* 原 5 步工作流折成 "查看细节" · 保留给想看调试信息的评委 */}
          <motion.section layout className="glass rounded-2xl p-4">
            <details>
              <summary className="cursor-pointer list-none text-[12px] uppercase tracking-[0.18em] text-stone-200 hover:text-stone-200 focus-ring">
                查看 AI 背后的 5 步 · 默认折起
              </summary>
              <div className="mt-4">
                <AgentWorkflow />
              </div>
            </details>
            {!pending && !running && (
              <div className="mt-3 rounded-xl border border-warmth/20 bg-warmth/5 px-3 py-2 text-[12px] text-warmth">
                这一轮她的念头都替她接回来了 · 顶部「重置演示」可以再来一次
              </div>
            )}
          </motion.section>

          {history.length > 0 && (
            <section className="glass rounded-2xl p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[11px] tracking-[0.18em] text-stone-200">
                  她曾经放不下的这些事
                </div>
                <span className="text-[10px] text-stone-200">共 {history.length} 条</span>
              </div>
              <ul className="divide-y divide-white/5">
                {history.slice(0, 6).map((h) => (
                  <li key={h.id} className="flex items-start gap-2 py-2 text-[12px]">
                    <span
                      className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                        h.fulfilled === 1 ? 'bg-warmth/50' : 'bg-warmth'
                      }`}
                    />
                    <div className="flex-1">
                      <div className="text-stone-200">
                        {h.raw_text ? `「${h.raw_text}」` : h.video_title}
                      </div>
                      <div className="text-stone-200">
                        {relativeTimeCn(h.occurred_at)} · {h.creator_display} · {h.signal_type}
                        {h.fulfilled === 1 && (
                          <span className="ml-1 rounded bg-warmth/15 px-1.5 py-0.5 text-[10px] text-warmth">
                            已接回来
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
