import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import AgentWorkflow from '../components/AgentWorkflow.jsx';
import CommentInput from '../components/CommentInput.jsx';
import PresetPicker from '../components/PresetPicker.jsx';
import { useDemoStore } from '../store/useDemoStore.js';
import { submitComment } from '../api/client.js';
import { relativeTimeCn } from '../utils/time.js';

export default function AgentPanel({ onToast }) {
  const running = useDemoStore((s) => s.running);
  const connected = useDemoStore((s) => s.connected);
  const history = useDemoStore((s) => s.history);
  const lastCompleted = useDemoStore((s) => s.lastCompleted);
  const [err, setErr] = useState(null);
  // 本地瞬时锁：从点击到 workflow.begin 到达之间也阻止第二次点击
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  // 后端 workflow.end 到达时解锁
  useEffect(() => {
    if (!running) {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [running]);

  // 成功落卡时抛一条轻 toast，让评委感觉到「发生了什么」
  useEffect(() => {
    if (lastCompleted?.cardId) {
      onToast?.('你刚刚那句惦记，已经回来了');
    }
  }, [lastCompleted, onToast]);

  const registerOwnRun = useDemoStore((s) => s.registerOwnRun);

  async function trigger(text) {
    if (submittingRef.current || running) return;
    submittingRef.current = true;
    setSubmitting(true);
    setErr(null);
    try {
      const res = await submitComment(text);
      if (res?.runId) registerOwnRun(res.runId);
    } catch (e) {
      submittingRef.current = false;
      setSubmitting(false);
      setErr(e.message || '提交失败');
    }
  }

  const disabled = submitting || running || !connected;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="pill bg-hintB/15 text-hintB">念头后台</span>
          <span className="text-[12px] text-stone-400">它怎么把你记起来 · 你来起个头</span>
        </div>
        <div className="text-[11px] text-stone-400">
          {connected ? '正陪着你' : '等这句话过来…'}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden rounded-3xl border border-white/5 bg-ink p-4">
        <div className="grid h-full min-h-0 grid-cols-1 gap-3">
          <div className="flex flex-col gap-4 overflow-y-auto pr-1 scrollbar-none">
            <section className="glass rounded-2xl p-4">
              <CommentInput onSubmit={trigger} disabled={disabled} />
              {err && <div className="mt-2 text-[12px] text-red-300">{err}</div>}
            </section>

            <section className="glass rounded-2xl p-4">
              <PresetPicker onPick={trigger} disabled={disabled} />
            </section>

            <motion.section layout className="glass rounded-2xl p-4">
              <AgentWorkflow />
            </motion.section>

            {history.length > 0 && (
              <section className="glass rounded-2xl p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-[11px] tracking-[0.18em] text-stone-400">
                    她曾经放不下的这些事
                  </div>
                  <span className="text-[10px] text-stone-400">共 {history.length} 条</span>
                </div>
                <ul className="divide-y divide-white/5">
                  {history.slice(0, 4).map((h) => (
                    <li key={h.id} className="flex items-start gap-2 py-2 text-[12px]">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-warmth" />
                      <div className="flex-1">
                        <div className="text-stone-200">
                          {h.raw_text ? `「${h.raw_text}」` : h.video_title}
                        </div>
                        <div className="text-stone-500">
                          {relativeTimeCn(h.occurred_at)} · {h.creator_display} · {h.signal_type}
                          {h.fulfilled === 1 && (
                            <span className="ml-1 rounded bg-warmth/15 px-1.5 py-0.5 text-[10px] text-warmth">
                              已履约
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
    </div>
  );
}
