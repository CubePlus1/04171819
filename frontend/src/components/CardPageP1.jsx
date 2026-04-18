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
                  <span className="text-[11px] text-stone-200 line-through">{product.original}</span>
                )}
              </div>
              <div className="mt-1 text-[11px] text-stone-200">来自 {product.shop}</div>
            </div>
          </div>
        </div>
      )}

      {summary && (
        <div className="text-[12px] leading-relaxed text-stone-100">
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
      {summary && <div className="text-[12px] leading-relaxed text-stone-100">{summary}</div>}
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
      {summary && <div className="text-[12px] leading-relaxed text-stone-100">{summary}</div>}
    </div>
  );
}

function Answer({ answer }) {
  if (answer.type === 'product_card') return <AnswerProduct answer={answer} />;
  if (answer.type === 'series_grid') return <AnswerSeries answer={answer} />;
  return <AnswerInline answer={answer} />;
}

/**
 * 主按钮组：
 * - 单按钮时全宽大块
 * - 两个按钮：第一个全宽抖音粉 · 第二个白底次级（保持情感主导 + 分流操作）
 */
function PrimaryButtons({ actions, onAction }) {
  if (actions.length === 0) return null;
  const [lead, ...rest] = actions;
  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onAction(lead.id, lead.label);
        }}
        className="focus-ring w-full rounded-2xl bg-[color:var(--color-warmth)] px-5 py-3.5 text-[15px] font-black text-white shadow-lg shadow-[color:var(--color-warmth)]/25 transition-all hover:brightness-110 active:scale-[0.97]"
      >
        {lead.label}
      </button>
      {rest.length > 0 && (
        <div className="grid grid-cols-1 gap-2" style={{ gridTemplateColumns: `repeat(${rest.length}, minmax(0, 1fr))` }}>
          {rest.map((a) => (
            <button
              key={a.id}
              onClick={(e) => {
                e.stopPropagation();
                onAction(a.id, a.label);
              }}
              className="focus-ring rounded-2xl border border-[color:var(--color-warmth)]/30 bg-[color:var(--color-warmth)]/8 px-4 py-3 text-[13px] font-bold text-[color:var(--color-warmth)] transition-all hover:bg-[color:var(--color-warmth)]/15 active:scale-[0.97]"
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

// 每个 action id 对应的回显文案 · 缺失则直接回显 label
const ACTION_FEEDBACK = {
  // 默认旧 id（保留兼容）
  add_wish: '已加到「我蹲过的」· 不让它再错过',
  view:     '先替你留在这儿，不让它再溜走',
  resume:   '从 Day1 接着给你看',
  recap:    '前情替你捋好了，她的心意也接上了',
  play:     '放给你看',
  save:     '收藏到「我蹲过的」· 等下次相遇',
  save_later: '好，下次她再冒出来',
  not_now:  '好，这次先放过它',
  // 剧本特化 id
  view_link:        '链接已为你打开 · 平替同款',
  view_outfit:      '她的搭配灵感替你整理了',
  resume_d1:        '从 Day1 开始 · 帮你接回来',
  play_sequel:      '下集已备好 · 含 10 秒前情',
  share_grandpa:    '这份惦记，替你带给爷爷了',
  claim_template:   '模板已归入你的笔记 · 免费可复制',
  view_method:      '笔记方法已展开',
  start_day1:       '从第一天开始做起 · 清单在手',
  save_menu:        '菜单存到「我蹲过的」',
  play_music:       '这版已为你循环播放',
  share_friend:     '已转给和你一起追的朋友',
  play_travel:      '下集开播 · 替你补上前情',
  save_route:       '这条路线存好了',
  start_training_d1:'Day1 开始 · 训练计划已就位',
  save_plan:        '训练表存到「我蹲过的」',
  follow_tutorial:  '分步已展开 · 画一张吧',
  save_tutorial:    '教程已收藏',
  claim_kit:        '新手包链接已为你打开',
  view_plants:      '种什么好 · 已整理给你',
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

      {/* CTA 区 · 抖音风按钮组：主按钮大块粉 + 次按钮分列白底 */}
      <div className="mt-auto flex flex-col gap-2 pt-2">
        <PrimaryButtons actions={page.actions?.primary ?? []} onAction={handleAction} />
        {page.actions?.secondary?.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {page.actions.secondary.map((a) => (
              <button
                key={a.id}
                onClick={(e) => {
                  e.stopPropagation();
                  handleAction(a.id, a.label);
                }}
                className="focus-ring rounded-2xl border border-black/5 bg-black/[0.03] px-3 py-3 text-[13px] font-bold text-[color:var(--color-text)] transition-all hover:bg-black/[0.06] active:scale-[0.97]"
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="text-center text-[12px] italic text-[color:var(--color-warmth)]/90">
        {page.emotional_close}
      </div>
    </div>
  );
}
