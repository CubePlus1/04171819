import { motion } from 'framer-motion';

function AnswerProduct({ answer }) {
  const { video, product, summary } = answer;
  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-2xl">
        <img src={video.cover} alt={video.title} className="h-64 w-full object-cover" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3">
          <div className="text-[13px] font-medium text-white">{video.title}</div>
        </div>
        <span className="absolute left-3 top-3 pill bg-ember/20 text-kiss">静音自动播放</span>
      </div>

      {product && (
        <div className="glass rounded-2xl p-3">
          <div className="flex items-start gap-3">
            <div className="h-14 w-14 shrink-0 rounded-lg bg-gradient-to-br from-kiss/70 to-warmth/70" />
            <div className="flex-1">
              <div className="text-[13px] text-stone-200">{product.name}</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-lg font-semibold text-ember">{product.price}</span>
                {product.original && (
                  <span className="text-[11px] text-stone-400 line-through">{product.original}</span>
                )}
              </div>
              <div className="mt-1 text-[11px] text-stone-400">来自 {product.shop}</div>
            </div>
          </div>
        </div>
      )}

      {summary && (
        <div className="text-[12px] leading-relaxed text-stone-300/90">
          {summary}
        </div>
      )}
    </div>
  );
}

function AnswerSeries({ answer }) {
  const { video, thumbnails, summary } = answer;
  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-2xl">
        <img src={video.cover} alt={video.title} className="h-40 w-full object-cover" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3">
          <div className="text-[13px] font-medium text-white">{video.title}</div>
        </div>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {thumbnails.map((t) => (
          <div key={t.day} className="relative overflow-hidden rounded-lg">
            <img src={t.cover} alt={t.title} className="h-16 w-full object-cover" />
            <span className="absolute left-1 top-1 rounded bg-black/60 px-1 py-0.5 text-[10px] text-white">
              D{t.day}
            </span>
          </div>
        ))}
      </div>
      {summary && <div className="text-[12px] leading-relaxed text-stone-300/90">{summary}</div>}
    </div>
  );
}

function AnswerInline({ answer }) {
  const { video, summary } = answer;
  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-2xl">
        <img src={video.cover} alt={video.title} className="h-72 w-full object-cover" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
          <div className="text-[13px] font-medium text-white">{video.title}</div>
        </div>
        <span className="absolute left-3 top-3 pill bg-ember/20 text-kiss">
          含 {video.preview_seconds}s 前情提要
        </span>
      </div>
      {summary && <div className="text-[12px] leading-relaxed text-stone-300/90">{summary}</div>}
    </div>
  );
}

function Answer({ answer }) {
  if (answer.type === 'product_card') return <AnswerProduct answer={answer} />;
  if (answer.type === 'series_grid') return <AnswerSeries answer={answer} />;
  return <AnswerInline answer={answer} />;
}

const ACTION_FEEDBACK = {
  add_wish: '已加到「我蹲过的」清单',
  view:     '播放中...（demo 演示，不跳转）',
  resume:   '续看 · 从 Day1 接着来',
  recap:    'AI 摘要：她其实没变，只是变得温柔了',
  play:     '播放中 · 含 10s 前情提要',
  share:    '已复制分享链接到剪贴板',
  save:     '收藏到「我蹲过的」',
  not_now:  '已告诉 AI：这次划过',
};

export default function CardPageP1({ page, scriptId, onAction }) {
  const handleAction = (id, label) => {
    const feedback = ACTION_FEEDBACK[id] ?? label;
    onAction?.(feedback);
  };
  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <span className="pill bg-warmth/15 text-warmth">AI 为你记得</span>
        <span className="pill">剧本 {scriptId}</span>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-[15px] font-medium leading-relaxed text-stone-50"
      >
        {page.context_line}
      </motion.div>

      <Answer answer={page.answer} />

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
        {page.actions?.primary?.map((a) => (
          <button
            key={a.id}
            onClick={() => handleAction(a.id, a.label)}
            className="focus-ring rounded-full bg-ember px-4 py-1.5 text-[13px] font-medium text-white shadow-card transition hover:translate-y-[-1px]"
          >
            {a.label}
          </button>
        ))}
        {page.actions?.secondary?.map((a) => (
          <button
            key={a.id}
            onClick={() => handleAction(a.id, a.label)}
            className="focus-ring rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[12px] text-stone-200 hover:bg-white/10"
          >
            {a.label}
          </button>
        ))}
      </div>

      <div className="text-center text-[12px] italic text-warmth/90">
        {page.emotional_close}
      </div>
    </div>
  );
}
