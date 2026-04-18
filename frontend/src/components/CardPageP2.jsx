import { motion } from 'framer-motion';

function Row({ label, value }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[10px] uppercase tracking-[0.2em] text-white/50">{label}</div>
      <div className="whitespace-pre-line text-[14px] font-medium leading-[1.625] text-white/90">{value}</div>
    </div>
  );
}

export default function CardPageP2({ page }) {
  return (
    <div className="flex h-full flex-col justify-center px-5">
      <motion.article
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="fig-card relative w-[342px] max-w-full self-center"
      >
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold tracking-[0.15em] text-white">它怎么记起我的</span>
          <span className="text-[10px] text-white/50">P2</span>
        </div>

        <div className="text-[16px] font-medium leading-[1.5] text-white">{page.warm_summary}</div>

        <div className="flex flex-col gap-4 border-t border-white/10 pt-4">
          <Row label="我当时留下的"  value={page.trigger_signal} />
          <Row label="AI 读懂的意思" value={page.ai_intent} />
          <Row label="为什么这么判"  value={page.rationale} />
          <Row label="这次的回音"    value={page.matched_basis} />
        </div>
      </motion.article>
    </div>
  );
}
