import { useMemo, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import FeedItem from './FeedItem.jsx';
import DunCard from './DunCard.jsx';
import { useDemoStore } from '../store/useDemoStore.js';

// 每张履约卡后面跟多少条 filler 视频 · 让信息流"有东西可刷"
const FILLERS_AFTER_EACH_CARD = 3;
// 首屏纯 filler 铺垫（还没接回来第一张卡时）
const BOOT_FILLER_COUNT = 9;
// filler 循环最大总量（跨所有卡后缀之和 + 首屏）· 防止 DOM 爆炸
const MAX_FILLERS_TOTAL = 60;

export default function Feed({ onAction }) {
  const feed = useDemoStore((s) => s.feed);
  const cards = useDemoStore((s) => s.cards);
  const spotlightCardId = useDemoStore((s) => s.spotlightCardId);
  const viewportRef = useRef(null);
  const spotlightRef = useRef(null);

  /**
   * 合成策略：
   * - 最新卡在最前（cards 来自 store，已是 newest-first）
   * - 每张卡后跟 N 条 filler（循环使用 fixtures.feed）
   * - 无卡时用 BOOT_FILLER_COUNT 条 filler 保底 · 看起来像个真实信息流
   * - filler 的 key 带循环计数 · 避免 key 重复导致 AnimatePresence 紊乱
   */
  const items = useMemo(() => {
    if (!feed.length) return [];
    const merged = [];
    let fillerIdx = 0;

    const pushFiller = (scope, scopeIdx) => {
      const f = feed[fillerIdx % feed.length];
      const loop = Math.floor(fillerIdx / feed.length);
      merged.push({
        kind: 'feed',
        id: `${f.id}-${scope}${scopeIdx}-l${loop}`,
        data: f,
      });
      fillerIdx += 1;
    };

    if (cards.length === 0) {
      for (let i = 0; i < BOOT_FILLER_COUNT; i += 1) pushFiller('boot', i);
      return merged;
    }

    cards.forEach((card, idx) => {
      merged.push({ kind: 'card', id: card.id, data: card });
      for (let k = 0; k < FILLERS_AFTER_EACH_CARD; k += 1) {
        if (fillerIdx >= MAX_FILLERS_TOTAL) return;
        pushFiller(`c${idx}`, k);
      }
    });

    // 尾部再补 3 条 filler · 保证用户滚到底还能再滑一下
    for (let i = 0; i < 3 && fillerIdx < MAX_FILLERS_TOTAL; i += 1) {
      pushFiller('tail', i);
    }

    return merged;
  }, [feed, cards]);

  // 新卡到 → 视口滚到那张卡的位置（spotlight 在顶部附近，符合抖音"下一条"直觉）
  useEffect(() => {
    if (!spotlightCardId) return;
    const vp = viewportRef.current;
    const el = spotlightRef.current;
    if (!vp || !el) return;
    vp.scrollTo({ top: el.offsetTop - vp.offsetTop - 4, behavior: 'smooth' });
  }, [spotlightCardId]);

  const onKey = useCallback((e) => {
    const vp = viewportRef.current;
    if (!vp) return;
    const step = vp.clientHeight * 0.9;
    if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
      vp.scrollBy({ top: step, behavior: 'smooth' });
      e.preventDefault();
    }
    if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      vp.scrollBy({ top: -step, behavior: 'smooth' });
      e.preventDefault();
    }
    if (e.key === 'Home') { vp.scrollTo({ top: 0, behavior: 'smooth' }); e.preventDefault(); }
    if (e.key === 'End')  { vp.scrollTo({ top: vp.scrollHeight, behavior: 'smooth' }); e.preventDefault(); }
  }, []);

  return (
    <div
      ref={viewportRef}
      tabIndex={0}
      role="region"
      aria-label="抖音信息流模拟"
      onKeyDown={onKey}
      className="feed-viewport focus-ring scrollbar-none no-select"
    >
      <AnimatePresence initial={false}>
        {items.map((it) => (
          <div
            key={`${it.kind}-${it.id}`}
            ref={it.kind === 'card' && it.id === spotlightCardId ? spotlightRef : null}
            className="mb-4 h-[640px] w-full"
          >
            {it.kind === 'feed' ? (
              <FeedItem item={it.data} />
            ) : (
              <DunCard
                card={it.data}
                spotlight={it.id === spotlightCardId}
                onAction={onAction}
              />
            )}
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
