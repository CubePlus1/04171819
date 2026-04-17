import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import CardPageP1 from './CardPageP1.jsx';
import CardPageP2 from './CardPageP2.jsx';
import CardPageP3 from './CardPageP3.jsx';

const PAGE_RENDERERS = { P1: CardPageP1, P2: CardPageP2, P3: CardPageP3 };

export default function DunCard({ card, spotlight }) {
  const [index, setIndex] = useState(0);
  const pages = card.pages ?? [];
  const active = pages[index] ?? pages[0];
  const Renderer = PAGE_RENDERERS[active?.id] ?? CardPageP1;

  const clamp = (n) => Math.max(0, Math.min(pages.length - 1, n));
  const goto = (n) => setIndex(clamp(n));

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 40, scale: 0.96 }}
      animate={{
        opacity: 1,
        y: 0,
        scale: 1,
        boxShadow: spotlight
          ? '0 22px 60px -12px rgba(255, 91, 95, 0.55)'
          : '0 18px 48px -16px rgba(255, 91, 95, 0.35)',
      }}
      transition={{ type: 'spring', stiffness: 180, damping: 22 }}
      className="feed-snap relative h-full w-full overflow-hidden rounded-2xl border border-white/10 bg-panel"
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-ember/10 via-kiss/5 to-transparent" />

      <div className="absolute right-3 top-3 z-10 flex gap-1">
        {pages.map((p, i) => (
          <button
            key={p.id}
            onClick={() => goto(i)}
            className={`h-1.5 rounded-full transition-all ${
              i === index ? 'w-6 bg-warmth' : 'w-2 bg-white/20'
            }`}
            aria-label={`跳到 ${p.id}`}
          />
        ))}
      </div>

      <div className="absolute left-3 top-3 z-10 pill bg-black/40">
        履约型内容 · {active?.id}
      </div>

      <motion.div
        className="relative flex h-full"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.2}
        onDragEnd={(_, info) => {
          const threshold = 60;
          if (info.offset.x < -threshold) goto(index + 1);
          else if (info.offset.x > threshold) goto(index - 1);
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={active?.id}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.25 }}
            className="h-full w-full"
          >
            <Renderer page={active} scriptId={card.script_id} />
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {pages.length > 1 && (
        <div className="absolute inset-x-0 bottom-1 flex items-center justify-center gap-2 text-[10px] text-stone-400 no-select">
          ← 左右滑 · P1 / P2 / P3 →
        </div>
      )}
    </motion.article>
  );
}
