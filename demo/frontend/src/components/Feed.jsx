import { useMemo, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import FeedItem from './FeedItem.jsx';
import DunCard from './DunCard.jsx';
import { useDemoStore } from '../store/useDemoStore.js';

export default function Feed({ onAction }) {
  const feed = useDemoStore((s) => s.feed);
  const cards = useDemoStore((s) => s.cards);
  const spotlightCardId = useDemoStore((s) => s.spotlightCardId);
  const viewportRef = useRef(null);
  const spotlightRef = useRef(null);

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
    cardsQueue.forEach((card) => merged.push({ kind: 'card', id: card.id, data: card }));
    return merged;
  }, [feed, cards]);

  useEffect(() => {
    if (!spotlightCardId) return;
    const vp = viewportRef.current;
    const el = spotlightRef.current;
    if (!vp || !el) return;
    vp.scrollTo({ top: el.offsetTop - vp.offsetTop, behavior: 'smooth' });
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
