import { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import CardPageP1 from './CardPageP1.jsx';
import CardPageP2 from './CardPageP2.jsx';
import CardPageP3 from './CardPageP3.jsx';

const PAGE_RENDERERS = { P1: CardPageP1, P2: CardPageP2, P3: CardPageP3 };

export default function DunCard({ card, spotlight, onAction }) {
  const [index, setIndex] = useState(0);
  const pages = card.pages ?? [];
  const active = pages[index] ?? pages[0];
  const Renderer = PAGE_RENDERERS[active?.id] ?? CardPageP1;

  const clamp = useCallback((n) => Math.max(0, Math.min(pages.length - 1, n)), [pages.length]);
  const goto = useCallback((n) => setIndex(clamp(n)), [clamp]);

  const onKey = useCallback(
    (e) => {
      if (e.key === 'ArrowLeft')  { goto(index - 1); e.preventDefault(); }
      if (e.key === 'ArrowRight') { goto(index + 1); e.preventDefault(); }
      if (e.key === 'Home')       { goto(0); e.preventDefault(); }
      if (e.key === 'End')        { goto(pages.length - 1); e.preventDefault(); }
    },
    [index, pages.length, goto],
  );

  return (
    <motion.article
      layout
      role="group"
      aria-roledescription="履约型内容卡片"
      aria-label={`${card.script_id} 剧本 · ${active?.name ?? ''}`}
      tabIndex={0}
      onKeyDown={onKey}
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
      className="lg-card feed-snap focus-ring relative h-full w-full overflow-hidden"
    >
      {/* 顶部反光高光 · 玻璃厚度感 */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-24 rounded-t-[26px] opacity-70"
        style={{
          background: 'linear-gradient(to bottom, rgba(255,255,255,0.35), transparent)',
        }}
      />

      <div className="absolute right-2 top-2 z-10 flex gap-0.5" role="tablist" aria-label="卡片分页">
        {pages.map((p, i) => (
          <button
            key={p.id}
            onClick={() => goto(i)}
            role="tab"
            aria-current={i === index ? 'page' : undefined}
            aria-selected={i === index}
            aria-label={`跳到 ${p.id} · ${p.name}`}
            className="focus-ring flex h-8 w-8 items-center justify-center"
          >
            <span
              className={`block h-1.5 rounded-full transition-all ${
                i === index ? 'w-6 bg-warmth' : 'w-2 bg-white/20'
              }`}
            />
          </button>
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
            <Renderer page={active} scriptId={card.script_id} onAction={onAction} />
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {pages.length > 1 && (
        <div className="absolute inset-x-0 bottom-1 flex items-center justify-center gap-2 text-[10px] text-stone-200 no-select">
          ← 左右滑或 ← → 键 · P1 / P2 / P3 →
        </div>
      )}
    </motion.article>
  );
}
