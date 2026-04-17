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
        <span className="pill bg-hintB/15 text-hintB">它怎么记起你的</span>
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
          { label: '你当时留下的',   value: page.trigger_signal },
          { label: 'AI 读懂的意思', value: page.ai_intent },
          { label: '为什么这么判',   value: page.rationale },
          { label: '这次的回音',     value: page.matched_basis },
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
        — 它为什么会在这一刻回来找你 —
      </div>
    </div>
  );
}
