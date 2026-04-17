import { motion } from 'framer-motion';

export default function CardPageP3({ page }) {
  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <span className="pill bg-hintC/15 text-hintC">行为足迹</span>
        <span className="pill">P3</span>
      </div>

      <div className="text-[14px] font-medium text-stone-100">{page.summary}</div>

      <div className="glass flex-1 overflow-y-auto rounded-2xl p-3 scrollbar-none">
        <ul className="relative ml-2 border-l border-white/10 pl-4">
          {page.items?.map((it, idx) => (
            <motion.li
              key={idx}
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.08 * idx }}
              className="relative pb-3"
            >
              <span className="absolute -left-[9px] top-1 h-2 w-2 rounded-full bg-warmth" />
              <div className="text-[11px] text-stone-400">
                {it.relative_time} · {it.signal_label}
              </div>
              <div className="text-[13px] text-stone-100">{it.video_title}</div>
            </motion.li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-3 text-[12px] text-stone-300">
        下一颗种子 · <span className="text-warmth">{page.next_seed}</span>
      </div>
    </div>
  );
}
