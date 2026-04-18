import { useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import FeedItem from './FeedItem.jsx';
import DunCard from './DunCard.jsx';
import { useDemoStore } from '../store/useDemoStore.js';

// 单卡轮播：任何时刻只渲染一条 · 备选池 = queue 履约卡 + feed filler 轮播
// 切下一条 = 键盘 ↑/↓/Space/PageDown · 不支持鼠标点击翻页（鼠标留给卡内互动）
// 顶部进度条显示已刷过多少条 / 互动过多少次
export default function Feed({ onAction }) {
  const currentItem = useDemoStore((s) => s.currentItem);
  const spotlightCardId = useDemoStore((s) => s.spotlightCardId);
  const queueLen = useDemoStore((s) => s.queue.length);
  const advanceCount = useDemoStore((s) => s.advanceCount);
  const interactionCount = useDemoStore((s) => s.interactionCount);
  const advance = useDemoStore((s) => s.advance);
  const trackInteraction = useDemoStore((s) => s.trackInteraction);
  const reduce = useReducedMotion();
  const rootRef = useRef(null);

  // 键盘切下一条
  const onKey = useCallback(
    (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
        advance();
        e.preventDefault();
      }
    },
    [advance],
  );

  // 页面级键盘监听（不依赖 focus）· 展台评委随时按都能切
  useEffect(() => {
    const handler = (e) => {
      // 输入框里按空格不该切下一条
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
        advance();
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [advance]);

  // 包一层 onAction 把卡内互动计入 interactionCount
  const handleAction = useCallback(
    (label) => {
      trackInteraction();
      onAction?.(label);
    },
    [onAction, trackInteraction],
  );

  if (!currentItem) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="text-[14px] font-medium">信息流加载中…</div>
          <div className="mt-1 text-[12px] text-[color:var(--color-text-muted)]">
            正在把她的念头请进来
          </div>
        </div>
      </div>
    );
  }

  const isCard = currentItem.kind === 'card';
  const isSpotlightCard = isCard && currentItem.id === spotlightCardId;

  return (
    <div
      ref={rootRef}
      role="region"
      aria-label="抖音信息流模拟"
      onKeyDown={onKey}
      className="feed-viewport scrollbar-none no-select relative h-full w-full overflow-hidden"
    >
      {/* 顶部进度条 · 已刷 N / 互动 M · 当前是卡/视频 */}
      <div className="pointer-events-none absolute inset-x-2 top-2 z-20 flex items-center gap-2">
        <ProgressDots advanced={advanceCount} />
        <div className="ml-auto flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-white backdrop-blur">
          <span>刷 {advanceCount}</span>
          <span className="opacity-50">·</span>
          <span>互动 {interactionCount}</span>
          {queueLen > 0 && (
            <>
              <span className="opacity-50">·</span>
              <span className="text-[color:var(--color-warmth)]">队列+{queueLen}</span>
            </>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${currentItem.kind}-${currentItem.id}`}
          initial={{ opacity: 0, y: reduce ? 0 : 80 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduce ? 0 : -80, transition: { duration: 0.3, ease: 'easeIn' } }}
          transition={{ duration: reduce ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }}
          drag={reduce ? false : 'y'}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={0.2}
          onDragEnd={(_e, info) => {
            if (Math.abs(info.offset.y) >= 40) advance();
          }}
          className="absolute inset-0 px-2 py-2"
        >
          {isCard ? (
            <DunCard
              card={currentItem.data}
              spotlight={isSpotlightCard}
              onAction={handleAction}
            />
          ) : (
            <FeedItem item={currentItem.data} />
          )}
        </motion.div>
      </AnimatePresence>

      {/* 右下角操作提示 · 明确告诉用户键盘切下一条 */}
      <div className="pointer-events-none absolute right-3 bottom-[4.5rem] z-20 flex items-center gap-2 text-[11px]">
        <span className="rounded-full border border-white/15 bg-black/55 px-2.5 py-0.5 text-white backdrop-blur">
          按 ↑/↓ 或空格 · 切下一条
        </span>
      </div>
    </div>
  );
}

function ProgressDots({ advanced }) {
  // 展示最近 10 格进度 · 反映"你刷过几条了"
  const slots = 10;
  const filled = Math.min(advanced, slots);
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: slots }).map((_, i) => (
        <span
          key={i}
          className={`h-1 rounded-full transition-all ${
            i < filled
              ? 'w-5 bg-[color:var(--color-warmth)]'
              : 'w-2 bg-white/30'
          }`}
        />
      ))}
    </div>
  );
}
