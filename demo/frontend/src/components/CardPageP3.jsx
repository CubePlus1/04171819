import { motion } from 'framer-motion';

export default function CardPageP3({ page }) {
  return (
    <div className="flex h-full flex-col justify-center px-5">
      <motion.article
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="fig-card relative w-[342px] max-w-full self-center"
      >
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold tracking-[0.15em] text-white">我的足迹</span>
          <span className="text-[10px] text-white/50">P3</span>
        </div>

        <div className="text-[16px] font-medium leading-[1.5] text-white">{page.summary}</div>

        <ul className="relative max-h-48 overflow-y-auto border-l border-white/15 pl-4 scrollbar-none">
          {page.items?.map((it, idx) => (
            <motion.li
              key={idx}
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.08 * idx }}
              className="relative pb-3"
            >
              <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-white" />
              <div className="text-[11px] text-white/55">
                {it.relative_time} · {it.signal_label}
              </div>
              <div className="text-[14px] text-white/90">{it.video_title}</div>
            </motion.li>
          ))}
        </ul>

        {page.next_seed && (
          <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.04] px-3 py-2 text-[12px] text-white/70">
            下一颗种子 · <span className="text-white">{page.next_seed}</span>
          </div>
        )}
      </motion.article>
    </div>
  );
}
