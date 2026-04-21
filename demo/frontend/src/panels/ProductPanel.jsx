import { useEffect, useRef, useState } from 'react';
import Feed from '../components/Feed.jsx';
import MyCommentsPanel from '../components/MyCommentsPanel.jsx';
import { useDemoStore } from '../store/useDemoStore.js';
import { asset } from '../utils/asset.js';

// 从当前 item 里挑一张 cover 做模糊背景层 · 液态玻璃的色彩源泉
function pickCoverUrl(item) {
  if (!item) return null;
  if (item.kind === 'feed') return item.data?.cover ?? null;
  if (item.kind === 'card') {
    const p1 = item.data?.pages?.find((p) => p.id === 'P1');
    return p1?.answer?.video?.cover ?? null;
  }
  return null;
}

export default function ProductPanel({ bootStatus, onAction }) {
  const [tab, setTab] = useState('feed');
  const user = useDemoStore((s) => s.user);
  const cards = useDemoStore((s) => s.cards);
  const spotlightCardId = useDemoStore((s) => s.spotlightCardId);
  const advanceCount = useDemoStore((s) => s.advanceCount);
  const interactionCount = useDemoStore((s) => s.interactionCount);
  const queueLen = useDemoStore((s) => s.queue.length);
  const currentItem = useDemoStore((s) => s.currentItem);
  const coverUrl = asset(pickCoverUrl(currentItem));

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
      <div className="flex items-center justify-between gap-3">
        <div className="hidden items-center gap-2 shrink-0 md:flex">
          <span className="pill bg-kiss/15 text-kiss">产品面板</span>
          <span className="text-[12px] text-stone-200">
            {tab === 'feed' ? '信息流视图' : '我的评论历史'}
          </span>
        </div>

        <div className="flex items-center gap-1 rounded-full bg-black/30 p-1 text-[12px]">
          <button
            className={`focus-ring rounded-full px-3 py-1 transition ${
              tab === 'feed'
                ? 'bg-white/15 text-[color:var(--color-text)]'
                : 'text-[color:var(--color-text-muted)] hover:bg-white/5'
            }`}
            onClick={() => setTab('feed')}
          >
            信息流
          </button>
          <button
            className={`focus-ring rounded-full px-3 py-1 transition ${
              tab === 'my-comments'
                ? 'bg-white/15 text-[color:var(--color-text)]'
                : 'text-[color:var(--color-text-muted)] hover:bg-white/5'
            }`}
            onClick={() => setTab('my-comments')}
          >
            我的评论
          </button>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 text-[11px] text-stone-200">
          {tab === 'feed' && (
            <>
              <div className="hidden md:block">
                <ProgressDots advanced={advanceCount} />
              </div>
              <span className="hidden whitespace-nowrap font-medium text-[color:var(--color-text)] md:inline">
                刷 {advanceCount}
              </span>
              <span className="hidden opacity-40 md:inline">·</span>
              <span className="hidden whitespace-nowrap text-[color:var(--color-text-muted)] md:inline">
                互动 {interactionCount}
              </span>
              {queueLen > 0 && (
                <>
                  <span className="hidden opacity-40 md:inline">·</span>
                  <span className="whitespace-nowrap font-bold text-[color:var(--color-warmth)]">
                    队列+{queueLen}
                  </span>
                </>
              )}
            </>
          )}
          <span className="whitespace-nowrap">已蹲 {cards.length}</span>
          {tab === 'feed' && spotlightCardId && (
            <span className="pill whitespace-nowrap bg-ember/15 text-kiss animate-pulse-soft">新卡片浮现中</span>
          )}
        </div>
      </div>

      <span className="sr-only" role="status" aria-live="polite">
        {liveMsg}
      </span>

      <div className="relative flex-1 min-h-0 overflow-hidden rounded-3xl border border-white/5 bg-[color:var(--color-panel)]">
        {tab === 'feed' && coverUrl && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0 transition-[background-image] duration-700"
            style={{
              backgroundImage: `url(${coverUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              filter: 'blur(42px) saturate(140%)',
              transform: 'scale(1.25)',
            }}
          />
        )}
        <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-b from-black/10 via-transparent to-black/25" />

        <div className="relative z-10 h-full px-4 py-6">
          <div className="mx-auto h-full w-full max-w-[380px]">
            {tab === 'feed' ? (
              bootStatus === 'error' ? (
                <EmptyState
                  title="信息流暂不可用"
                  tip="后端断了连 · 点顶部「重试」或「重置演示」"
                />
              ) : bootStatus === 'loading' && cards.length === 0 && !user ? (
                <EmptyState title="信息流加载中..." tip="正在为你召回过去的念头" />
              ) : (
                <Feed onAction={onAction} />
              )
            ) : (
              <MyCommentsPanel
                onOpenCard={(cardId) => {
                  setTab('feed');
                  useDemoStore.getState().focusCard(cardId);
                }}
              />
            )}
          </div>
        </div>

        <div
          className="pointer-events-none absolute left-4 top-4 rounded-full bg-black/40 px-2.5 py-1 text-[11px] font-medium tracking-[0.2em] backdrop-blur"
          style={{ color: '#ffffff' }}
        >
          {tab === 'feed'
            ? (user?.nickname ? `${user.nickname} · 闲刷空窗` : '闲刷空窗')
            : '我的评论'}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ title, tip }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-stone-300">
      <div className="text-[14px] font-medium">{title}</div>
      <div className="text-[12px] text-stone-200">{tip}</div>
    </div>
  );
}

// 进度条：展示最近 10 格 · 反映已刷条数
function ProgressDots({ advanced }) {
  const slots = 10;
  const filled = Math.min(advanced, slots);
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: slots }).map((_, i) => (
        <span
          key={i}
          className={`h-1 rounded-full transition-all ${
            i < filled
              ? 'w-4 bg-[color:var(--color-warmth)]'
              : 'w-2 bg-black/15'
          }`}
        />
      ))}
    </div>
  );
}
