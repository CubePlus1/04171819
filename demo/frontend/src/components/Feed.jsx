import { useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import FeedItem from './FeedItem.jsx';
import DunCard from './DunCard.jsx';
import { useDemoStore } from '../store/useDemoStore.js';

// 单卡轮播：视口里任何时刻只渲染一条
// - 备选池：store.queue（后端推送进来的履约卡）+ store.feed 的 filler 视频
// - 触发：用户上/下滑 · 按 ↑/↓/Space · 点击视口 · 或右面板"接下一条"按钮
// - 不保留历史 · 不整流渲染 · 用户感受："我滑一下，它给我下一条"
const SWIPE_THRESHOLD = 40; // 拖动超过 40px 才算滑

export default function Feed({ onAction }) {
  const currentItem = useDemoStore((s) => s.currentItem);
  const spotlightCardId = useDemoStore((s) => s.spotlightCardId);
  const queueLen = useDemoStore((s) => s.queue.length);
  const advance = useDemoStore((s) => s.advance);
  const reduce = useReducedMotion();
  const rootRef = useRef(null);

  // 键盘触发下一条
  const onKey = useCallback(
    (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
        advance();
        e.preventDefault();
      }
    },
    [advance],
  );

  // 点击视口任意位置也切下一条（展台用户/评委不需要先对齐按钮）
  const onClick = useCallback(() => advance(), [advance]);

  // 上滑下滑（轻量手势）
  const onDragEnd = useCallback(
    (_e, info) => {
      if (Math.abs(info.offset.y) >= SWIPE_THRESHOLD) advance();
    },
    [advance],
  );

  // 挂载后 focus · 键盘可直接用
  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  if (!currentItem) {
    return (
      <div className="flex h-full items-center justify-center text-stone-200">
        <div className="text-center">
          <div className="text-[14px] font-medium">信息流加载中…</div>
          <div className="text-[12px] text-stone-300 mt-1">正在把她的念头请进来</div>
        </div>
      </div>
    );
  }

  const isCard = currentItem.kind === 'card';
  const isSpotlightCard = isCard && currentItem.id === spotlightCardId;

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      role="region"
      aria-label="抖音信息流模拟"
      onKeyDown={onKey}
      onClick={onClick}
      className="feed-viewport focus-ring scrollbar-none no-select relative h-full w-full overflow-hidden"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${currentItem.kind}-${currentItem.id}`}
          initial={{ opacity: 0, y: reduce ? 0 : 80 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduce ? 0 : -80, transition: { duration: 0.3, ease: 'easeIn' } }}
          transition={{ duration: reduce ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }}
          drag={reduce ? false : 'y'}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={0.3}
          onDragEnd={onDragEnd}
          className="absolute inset-0 px-2 py-2"
        >
          {isCard ? (
            <DunCard
              card={currentItem.data}
              spotlight={isSpotlightCard}
              onAction={onAction}
            />
          ) : (
            <FeedItem item={currentItem.data} />
          )}
        </motion.div>
      </AnimatePresence>

      {/* 右下角操作提示 · 让用户知道怎么看下一条 */}
      <div className="pointer-events-none absolute right-3 bottom-3 flex items-center gap-2 text-[11px] text-stone-200">
        <span className="rounded-full border border-white/10 bg-black/40 px-2 py-0.5 backdrop-blur">
          上/下滑 · 或空格 · 切下一条
        </span>
        {queueLen > 0 && (
          <span className="rounded-full bg-warmth/20 px-2 py-0.5 text-warmth font-medium backdrop-blur">
            队列 +{queueLen}
          </span>
        )}
      </div>
    </div>
  );
}
