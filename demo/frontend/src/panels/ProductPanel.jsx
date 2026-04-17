import Feed from '../components/Feed.jsx';
import { useDemoStore } from '../store/useDemoStore.js';

export default function ProductPanel() {
  const user = useDemoStore((s) => s.user);
  const cards = useDemoStore((s) => s.cards);
  const spotlightCardId = useDemoStore((s) => s.spotlightCardId);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="pill bg-kiss/15 text-kiss">产品面板</span>
          <span className="text-[12px] text-stone-400">
            用户视角 · 抖音信息流模拟
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-stone-500">
          <span>已蹲 {cards.length}</span>
          {spotlightCardId && (
            <span className="pill bg-ember/15 text-kiss animate-pulse-soft">新卡片浮现中</span>
          )}
        </div>
      </div>

      <div className="relative flex-1 min-h-0 overflow-hidden rounded-3xl border border-white/5 bg-ink">
        <div className="absolute inset-x-0 top-0 z-10 h-16 bg-gradient-to-b from-ink to-transparent pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 z-10 h-16 bg-gradient-to-t from-ink to-transparent pointer-events-none" />

        <div className="h-full px-4 py-6">
          <div className="mx-auto h-full w-full max-w-[380px]">
            <Feed />
          </div>
        </div>

        <div className="pointer-events-none absolute left-4 top-4 text-[11px] tracking-[0.2em] text-stone-500">
          {user?.nickname ? `${user.nickname} · 闲刷空窗` : '闲刷空窗'}
        </div>
      </div>
    </div>
  );
}
