import { motion } from 'framer-motion';

function Row({ label, value }) {
  return (
    <div className="flex flex-col gap-1 py-2">
      <div className="text-[11px] uppercase tracking-[0.2em] text-stone-500">{label}</div>
      <div className="text-[13px] leading-relaxed text-stone-100">{value}</div>
    </div>
  );
}

export default function CardPageP2({ page }) {
  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <span className="pill bg-hintB/15 text-hintB">AI 解释</span>
        <span className="pill">P2</span>
      </div>

      <div className="text-[14px] font-medium text-stone-100">{page.warm_summary}</div>

      <motion.div
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.08 } },
        }}
        className="glass divide-y divide-white/5 rounded-2xl px-4"
      >
        {[
          { label: '原始触发信号', value: page.trigger_signal },
          { label: 'AI 意图识别',  value: page.ai_intent },
          { label: '识别理由',     value: page.rationale },
          { label: '匹配依据',     value: page.matched_basis },
        ].map((row) => (
          <motion.div
            key={row.label}
            variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
          >
            <Row {...row} />
          </motion.div>
        ))}
      </motion.div>

      <div className="mt-auto text-center text-[11px] text-stone-400">
        — 前台化的 AI 推理 · 为什么是这张卡 —
      </div>
    </div>
  );
}
