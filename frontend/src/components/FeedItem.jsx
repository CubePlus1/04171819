// Douyin 风格视频卡：全屏封面 + 左下博主信息 + 右侧竖排互动栏 + 底部装饰 tab bar
export default function FeedItem({ item }) {
  return (
    <div className="feed-snap relative h-full w-full overflow-hidden rounded-2xl bg-black">
      <img
        src={item.cover}
        alt={item.title}
        className="h-full w-full object-cover"
        loading="lazy"
        draggable={false}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

      {/* 右侧竖排互动栏 */}
      <div className="absolute right-3 bottom-24 z-10 flex flex-col items-center gap-5 text-white">
        <div className="flex flex-col items-center">
          <div className="grid h-11 w-11 place-items-center overflow-hidden rounded-full border border-white/25 bg-black/40 text-[9px] text-white/90">
            头像
          </div>
          <span className="-mt-2 grid h-4 w-4 place-items-center rounded-full bg-[color:var(--color-warmth)] text-[10px] leading-none text-white">+</span>
        </div>
        <SideAction icon="♥" count={item.likes} />
        <SideAction icon="💬" count={'3412'} />
        <SideAction icon="🔖" count={'8901'} />
        <SideAction icon="🔁" count={'1.2w'} />
        <div
          className="mt-1 grid h-9 w-9 animate-spin place-items-center rounded-full border-2 border-white/15 bg-black/40"
          style={{ animationDuration: '4s' }}
        >
          <span className="h-4 w-4 rounded-full bg-[color:var(--color-warmth)]" />
        </div>
      </div>

      {/* 左下博主 + 文案 · 在底部 tab bar 上方 */}
      <div className="absolute inset-x-0 bottom-16 z-10 px-4 pb-3 text-white">
        <div className="mb-1 flex items-center gap-1 text-[14px] font-bold">
          {item.creator}
          <span className="text-[10px] text-[color:var(--color-kiss)]">✓</span>
        </div>
        <div className="text-[13px] leading-relaxed opacity-95">
          {item.title}
        </div>
        <div className="mt-2 flex items-center gap-2 text-[11px] opacity-90">
          <span>#{item.tag}</span>
          <span>· ♥ {item.likes}</span>
        </div>
      </div>

      {/* 底部装饰 tab bar（静态 · 只作视觉提示） */}
      <div className="absolute inset-x-0 bottom-0 z-20 flex h-14 items-center justify-around border-t border-white/10 bg-black/85 px-5 text-[10px] text-white/70">
        <span className="font-bold text-white">首页</span>
        <span className="opacity-50">朋友</span>
        <span className="relative grid h-7 w-11 place-items-center rounded bg-white text-lg font-black text-black">
          +
          <span className="absolute inset-0 -z-10 translate-x-0.5 rounded bg-[color:var(--color-warmth)]" />
          <span className="absolute inset-0 -z-10 -translate-x-0.5 rounded bg-[color:var(--color-kiss)]" />
        </span>
        <span className="opacity-50">消息</span>
        <span className="opacity-50">我</span>
      </div>
    </div>
  );
}

function SideAction({ icon, count }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[22px] leading-none">{icon}</span>
      <span className="text-[11px] opacity-95">{count}</span>
    </div>
  );
}
