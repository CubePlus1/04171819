export default function FeedItem({ item }) {
  return (
    <div className="feed-snap relative h-full w-full overflow-hidden rounded-2xl">
      <img
        src={item.cover}
        alt={item.title}
        className="h-full w-full object-cover"
        loading="lazy"
        draggable={false}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-4">
        <div className="text-[12px] tracking-wide text-stone-100">{item.creator}</div>
        <div className="mt-1 text-[15px] font-semibold leading-snug text-white">
          {item.title}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="pill">#{item.tag}</span>
          <span className="pill">♥ {item.likes}</span>
        </div>
      </div>
    </div>
  );
}
