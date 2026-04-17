import { AnimatePresence, motion } from 'framer-motion';

const STATUS_COLORS = {
  idle:   'bg-white/5  text-stone-400 border-white/5',
  active: 'bg-ember/15 text-kiss       border-ember/30 shadow-card animate-pulse-soft',
  done:   'bg-warmth/10 text-warmth    border-warmth/30',
  fail:   'bg-red-900/30 text-red-300  border-red-500/40',
};

function Detail({ step, detail }) {
  if (!detail) return null;

  if (step === 1) {
    return (
      <div className="mt-2 text-[12px] leading-relaxed text-stone-300">
        <span className="text-stone-400">评论：</span>「{detail.text}」
        <span className="ml-2 text-stone-400">字符数 {detail.length}</span>
      </div>
    );
  }
  if (step === 2) {
    return (
      <div className="mt-2 space-y-1 text-[12px] text-stone-300">
        <div>
          <span className="text-stone-400">分类：</span>
          <span className="text-kiss">{detail.label}</span>
          <span className="ml-2 rounded-full bg-warmth/15 px-2 py-0.5 text-[10px] text-warmth">
            置信度 {(detail.confidence * 100).toFixed(0)}%
          </span>
        </div>
        <div className="text-stone-400">{detail.rationale}</div>
      </div>
    );
  }
  if (step === 3) {
    if (!detail.hit) {
      return <div className="mt-2 text-[12px] text-red-300">未命中 · {detail.reason}</div>;
    }
    return (
      <div className="mt-2 space-y-1 text-[12px] text-stone-300">
        <div>
          <span className="text-stone-400">历史信号：</span>
          {detail.signal?.text ? `「${detail.signal.text}」` : `《${detail.signal?.video_title}》`}
        </div>
        <div>
          <span className="text-stone-400">博主：</span>{detail.creator}
          <span className="mx-2 text-stone-600">·</span>
          <span className="text-stone-400">博主动作：</span>{detail.action_type}
        </div>
        <div>
          <span className="text-stone-400">落在剧本：</span>
          <span className="text-warmth">{detail.script}</span>
        </div>
      </div>
    );
  }
  if (step === 4) {
    return (
      <div className="mt-2 text-[12px] text-stone-300">
        <span className="text-stone-400">入库 ID：</span>{' '}
        <code className="rounded bg-black/40 px-1.5 py-0.5 text-[11px] text-warmth">{detail.card_id}</code>
        <span className="ml-2 text-stone-400">剧本：</span>
        <span className="text-warmth">{detail.script}</span>
      </div>
    );
  }
  if (step === 5) {
    return (
      <div className="mt-2 space-y-1 text-[12px] text-stone-300">
        <div>
          <span className="text-stone-400">页面：</span>
          {detail.pages?.join(' / ')}
        </div>
        <div className="text-stone-400">{detail.preview_context}</div>
      </div>
    );
  }
  return null;
}

export default function AgentStep({ step, index, isLast }) {
  const color = STATUS_COLORS[step.status] ?? STATUS_COLORS.idle;
  const running = step.status === 'active';

  return (
    <div className="relative flex gap-3">
      <div className="flex flex-col items-center">
        <div
          className={`relative flex h-7 w-7 items-center justify-center rounded-full border text-[12px] font-semibold ${color}`}
        >
          {running ? (
            <motion.span
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1.4, ease: 'linear' }}
              className="inline-block h-2.5 w-2.5 rounded-full border-2 border-warmth border-t-transparent"
            />
          ) : (
            index + 1
          )}
        </div>
        {!isLast && <div className="step-line mt-1 w-px flex-1" />}
      </div>

      <motion.div
        layout
        className={`mb-3 flex-1 rounded-xl border px-3 py-2 transition ${color} bg-opacity-60`}
      >
        <div className="flex items-center justify-between">
          <div className="text-[13px] font-medium">{step.name}</div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-stone-400">
            {step.status === 'active' ? 'RUNNING' : step.status === 'done' ? 'DONE' : step.status === 'fail' ? 'FAIL' : 'IDLE'}
          </div>
        </div>
        <AnimatePresence>
          {step.detail && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Detail step={step.step} detail={step.detail} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
