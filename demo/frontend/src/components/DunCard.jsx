import { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import CardPageP1 from './CardPageP1.jsx';
import CardPageP2 from './CardPageP2.jsx';
import CardPageP3 from './CardPageP3.jsx';
import { asset } from '../utils/asset.js';

const PAGE_RENDERERS = { P1: CardPageP1, P2: CardPageP2, P3: CardPageP3 };

const SCENE_BG = {
  A: '/scenes/bg-a-storage.jpg',
  B: '/scenes/bg-b-missing.jpg',
  C: '/scenes/bg-c-editing.jpg',
};

function DouyinTab({ label, active, badge }) {
  return (
    <span className={`relative flex flex-col items-center gap-0.5 ${active ? 'text-white font-bold' : 'opacity-55'}`}>
      <span className="text-[11px] leading-none">{label}</span>
      {badge && (
        <span className="absolute -right-2 -top-1 grid h-3.5 min-w-[14px] place-items-center rounded-full bg-[color:var(--color-warmth)] px-1 text-[9px] leading-none text-white">
          {badge}
        </span>
      )}
    </span>
  );
}

export default function DunCard({ card, spotlight, onAction }) {
  const [index, setIndex] = useState(0);
  const pages = card.pages ?? [];
  const active = pages[index] ?? pages[0];
  const Renderer = PAGE_RENDERERS[active?.id] ?? CardPageP1;
  const bgImg = asset(SCENE_BG[card.script_id] ?? SCENE_BG.A);

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
      className="feed-snap focus-ring relative h-full w-full overflow-hidden rounded-[26px] text-white"
      style={{ isolation: 'isolate' }}
    >
      {/* 场景沉浸式背景图 · 铺满 iPhone 框架 · 底部深色渐变（Figma Home page fill） */}
      <div
        className="fig-scene-bg"
        style={{ backgroundImage: `url(${bgImg})` }}
        aria-hidden="true"
      />

      {/* 顶部 tab 条深色底 · 让抖音顶栏可读 */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-14"
        style={{
          background:
            'linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.12) 70%, transparent 100%)',
        }}
      />

      {/* 抖音顶栏 · 关注 · 推荐 · 搜索 · 复刻 Figma 液态玻璃稿 */}
      <div className="absolute inset-x-0 top-2 z-10 flex items-center justify-center gap-5 text-white no-select">
        <span className="text-[13px] font-medium opacity-65">关注</span>
        <span className="h-1 w-1 rounded-full bg-[color:var(--color-warmth)]" />
        <div className="flex flex-col items-center">
          <span className="text-[15px] font-bold">推荐</span>
          <span className="mt-0.5 h-[2px] w-4 rounded-full bg-white" />
        </div>
      </div>
      <button
        type="button"
        aria-label="搜索"
        className="absolute right-3 top-2 z-10 text-white opacity-75 no-select"
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="9" cy="9" r="6" />
          <path d="m14 14 3.5 3.5" strokeLinecap="round" />
        </svg>
      </button>

      {/* 页签 P1/P2/P3 · 挪到顶栏下方 · 不与抖音顶栏争位 */}
      <div
        className="absolute inset-x-0 top-10 z-10 flex items-center justify-center gap-1.5"
        role="tablist"
        aria-label="卡片分页"
      >
        {pages.map((p, i) => (
          <button
            key={p.id}
            onClick={() => goto(i)}
            role="tab"
            aria-current={i === index ? 'page' : undefined}
            aria-selected={i === index}
            aria-label={`跳到 ${p.id} · ${p.name}`}
            className="focus-ring flex h-4 w-8 items-center justify-center"
          >
            <span
              className={`block h-[3px] rounded-full transition-all ${
                i === index ? 'w-6 bg-white' : 'w-3 bg-white/25'
              }`}
            />
          </button>
        ))}
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

      {/* 抖音底部 tab bar · 首页 / 朋友 / + / 消息 / 我 · 复刻 Figma */}
      <div className="absolute inset-x-0 bottom-0 z-20 flex h-12 items-center justify-around border-t border-white/10 bg-black/80 px-4 text-[10px] text-white/70 no-select">
        <DouyinTab label="首页" active />
        <DouyinTab label="朋友" badge="5" />
        <span className="relative grid h-7 w-11 place-items-center rounded bg-white text-lg font-black text-black">
          +
          <span className="absolute inset-0 -z-10 translate-x-0.5 rounded bg-[color:var(--color-warmth)]" />
          <span className="absolute inset-0 -z-10 -translate-x-0.5 rounded bg-[color:var(--color-kiss)]" />
        </span>
        <DouyinTab label="消息" badge="23" />
        <DouyinTab label="我" />
      </div>
    </motion.article>
  );
}
