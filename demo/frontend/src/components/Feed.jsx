import { useMemo, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import FeedItem from './FeedItem.jsx';
import DunCard from './DunCard.jsx';
import { useDemoStore } from '../store/useDemoStore.js';

export default function Feed() {
  const feed = useDemoStore((s) => s.feed);
  const cards = useDemoStore((s) => s.cards);
  const spotlightCardId = useDemoStore((s) => s.spotlightCardId);
  const viewportRef = useRef(null);
  const spotlightRef = useRef(null);

  // 合并：把卡片插到信息流里，每 3 条后插一张新生成的卡片
  const items = useMemo(() => {
    if (!feed.length) return [];
    const merged = [];
    const cardsQueue = [...cards];
    feed.forEach((item, idx) => {
      merged.push({ kind: 'feed', id: item.id, data: item });
      if ((idx + 1) % 3 === 0 && cardsQueue.length) {
        const card = cardsQueue.shift();
        merged.push({ kind: 'card', id: card.id, data: card });
      }
    });
    // 剩下的卡片追加到末尾
    cardsQueue.forEach((card) => merged.push({ kind: 'card', id: card.id, data: card }));
    return merged;
  }, [feed, cards]);

  // 新卡片出现时，自动滚到它
  useEffect(() => {
    if (!spotlightCardId) return;
    const vp = viewportRef.current;
    const el = spotlightRef.current;
    if (!vp || !el) return;
    vp.scrollTo({ top: el.offsetTop - vp.offsetTop, behavior: 'smooth' });
  }, [spotlightCardId]);

  return (
    <div ref={viewportRef} className="feed-viewport scrollbar-none no-select">
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
              <DunCard card={it.data} spotlight={it.id === spotlightCardId} />
            )}
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
