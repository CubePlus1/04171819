import { useEffect, useRef, useState } from 'react';
import Feed from '../components/Feed.jsx';
import { useDemoStore } from '../store/useDemoStore.js';

export default function ProductPanel({ bootStatus, onAction }) {
  const user = useDemoStore((s) => s.user);
  const cards = useDemoStore((s) => s.cards);
  const spotlightCardId = useDemoStore((s) => s.spotlightCardId);

  const [liveMsg, setLiveMsg] = useState('');
  const lastSpotlightRef = useRef(null);

  useEffect(() => {
    if (spotlightCardId && spotlightCardId !== lastSpotlightRef.current) {
      lastSpotlightRef.current = spotlightCardId;
      const card = cards.find((c) => c.id === spotlightCardId);
      const ctx = card?.pages?.[0]?.context_line;
      setLiveMsg(ctx ? `AI 为你记得 · ${ctx}` : 'AI 为你浮现出一张新卡片');
    }
  }, [spotlightCardId, cards]);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="pill bg-kiss/15 text-kiss">产品面板</span>
          <span className="text-[12px] text-stone-400">
            用户视角 · 抖音信息流模拟
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-stone-400">
          <span>已蹲 {cards.length}</span>
          {spotlightCardId && (
            <span className="pill bg-ember/15 text-kiss animate-pulse-soft">新卡片浮现中</span>
          )}
        </div>
      </div>

      <span className="sr-only" role="status" aria-live="polite">
        {liveMsg}
      </span>

      <div className="relative flex-1 min-h-0 overflow-hidden rounded-3xl border border-white/5 bg-ink">
        <div className="absolute inset-x-0 top-0 z-10 h-16 bg-gradient-to-b from-ink to-transparent pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 z-10 h-16 bg-gradient-to-t from-ink to-transparent pointer-events-none" />

        <div className="h-full px-4 py-6">
          <div className="mx-auto h-full w-full max-w-[380px]">
            {bootStatus === 'error' ? (
              <EmptyState
                title="信息流暂不可用"
                tip="后端断了连 · 点顶部「重试」或「重置演示」"
              />
            ) : bootStatus === 'loading' && cards.length === 0 && !user ? (
              <EmptyState title="信息流加载中..." tip="正在为你召回过去的念头" />
            ) : (
              <Feed onAction={onAction} />
            )}
          </div>
        </div>

        <div className="pointer-events-none absolute left-4 top-4 text-[11px] tracking-[0.2em] text-stone-400">
          {user?.nickname ? `${user.nickname} · 闲刷空窗` : '闲刷空窗'}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ title, tip }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-stone-300">
      <div className="text-[14px] font-medium">{title}</div>
      <div className="text-[12px] text-stone-400">{tip}</div>
    </div>
  );
}
