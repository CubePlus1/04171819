import { motion } from 'framer-motion';

function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 10" fill="none" aria-hidden="true" className="shrink-0">
      <path
        d="M3.2 5h2.3M8.5 5h2.3M5.1 3.1h3.8M5.1 6.9h3.8"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <rect x="0.6" y="0.6" width="12.8" height="8.8" rx="2" stroke="rgba(255,255,255,0.4)" strokeWidth="1.2" />
    </svg>
  );
}

function AvatarRow({ avatar, label }) {
  return (
    <div className="flex items-center gap-3">
      <span className="fig-avatar">
        {avatar ? <img src={avatar} alt="" /> : <span className="block h-full w-full bg-white/20" />}
      </span>
      <span className="text-[14px] font-medium leading-[1.43]">{label}</span>
    </div>
  );
}

function CommentBody({ text }) {
  return (
    <p className="whitespace-pre-line text-[14px] font-medium leading-[1.625] text-white">
      {text}
    </p>
  );
}

function LinkedVideoRow({ title, cover, shape = 'landscape' }) {
  // landscape = 144×89（Figma Card B · 主 thumbnail）
  // portrait  = 77×103（Figma Card A/C）
  const thumbStyle = shape === 'portrait'
    ? { width: 77, height: 103 }
    : { width: 144, height: 89 };
  return (
    <div className="flex items-start gap-4">
      <LinkIcon />
      <div className="flex-1 whitespace-pre-line text-[16px] font-medium leading-[1.625] text-white">
        {title}
      </div>
      <div className="fig-thumb" style={thumbStyle}>
        <img src={cover} alt={title} />
      </div>
    </div>
  );
}

function AuthorRow({ display, avatar }) {
  return (
    <div className="flex items-center gap-3">
      <span className="fig-author-badge">
        {avatar && <img src={avatar} alt="" />}
      </span>
      <span className="text-[14px] font-medium leading-[1.43] text-white/80">{display}</span>
    </div>
  );
}

// A 剧本专属 · 替换 Figma 珍珠胶囊里的抖音 URL 为商品条
function ProductPearl({ product }) {
  if (!product) return null;
  return (
    <div className="fig-pearl">
      <div className="flex-1 truncate">
        <div className="truncate text-[13px] font-semibold text-black">{product.name}</div>
        <div className="mt-0.5 flex items-baseline gap-2">
          <span className="text-[15px] font-extrabold text-[#fe2c55]">{product.price}</span>
          {product.original && (
            <span className="text-[11px] text-black/45 line-through">{product.original}</span>
          )}
          <span className="text-[11px] text-black/55">· {product.shop}</span>
        </div>
      </div>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M6 4l4 4-4 4" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// B 剧本专属 · 系列小缩略条（代替 Figma 珍珠胶囊的位置）
function SeriesStrip({ thumbnails }) {
  if (!Array.isArray(thumbnails) || thumbnails.length === 0) return null;
  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-none">
      {thumbnails.map((t) => (
        <div key={t.day} className="fig-thumb shrink-0" style={{ width: 56, height: 72 }}>
          <img src={t.cover} alt={t.title} />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1 py-1 text-[9px] leading-none text-white">
            D{t.day}
          </div>
        </div>
      ))}
    </div>
  );
}

const OPEN_FEEDBACK = {
  A: '链接已为你打开 · 同款已备好',
  B: 'Day1-Day5 的后续已按顺序接上',
  C: '教程已开播 · 分步拆解已展开',
};

export default function CardPageP1({ page, scriptId, onAction }) {
  const { answer, creator } = page;
  const videoTitle = answer?.video?.title ?? '';
  const cover = answer?.video?.cover;

  const handleDismiss = (e) => {
    e.stopPropagation();
    onAction?.('那先不打扰了 · 你随时叫我回来');
  };
  const handleOpen = (e) => {
    e.stopPropagation();
    onAction?.(OPEN_FEEDBACK[scriptId] ?? '为你打开了');
  };

  // 珍珠条/条目 显示规则
  const isA = scriptId === 'A';
  const isB = scriptId === 'B';
  const product = isA ? answer?.product : null;
  const seriesThumbs = isB ? (answer?.thumbnails ?? []) : [];
  const thumbShape = isB ? 'landscape' : 'portrait';

  // 评论文本用原始 raw_text · 即 Figma 的 "我的评论"
  const myComment = page.my_comment ?? page.comment_text ?? '';

  // 头像旁带 "我 · N 天前"
  const myLabel = page.occurred_relative
    ? `我 · ${page.occurred_relative}`
    : '我';

  return (
    <div className="flex h-full flex-col justify-center gap-5 px-5">
      {/* Figma 顶端大标题 · style_UKXK95 · 22px/500 */}
      {page.headline && (
        <motion.header
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="w-[342px] max-w-full self-center"
        >
          <div className="text-[12px] font-medium tracking-[0.28em] text-white/75">
            蹲到了
          </div>
          <div className="mt-1 text-[22px] font-semibold leading-[1.35] text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
            {page.headline}
          </div>
        </motion.header>
      )}

      <motion.article
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.05 }}
        className="fig-card relative w-[342px] max-w-full self-center"
      >
        <AvatarRow label={myLabel} />
        {myComment && <CommentBody text={myComment} />}
        {videoTitle && (
          <div className="relative">
            <LinkedVideoRow title={videoTitle} cover={cover} shape={thumbShape} />
          </div>
        )}
        {isA && product && <ProductPearl product={product} />}
        {isB && seriesThumbs.length > 0 && <SeriesStrip thumbnails={seriesThumbs} />}
        <AuthorRow display={creator?.display ?? ''} avatar={creator?.avatar} />

        {/* Figma 底部双按钮 · 不用了（退出功能）· 去看看（算法自信 · 直达） */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={handleDismiss}
            className="focus-ring h-10 rounded-2xl border border-white/20 bg-white/10 text-[14px] font-semibold text-white/85 backdrop-blur-md transition hover:bg-white/15 active:scale-[0.97]"
          >
            不用了
          </button>
          <button
            type="button"
            onClick={handleOpen}
            className="focus-ring h-10 rounded-2xl border border-white/40 bg-white/90 text-[14px] font-semibold text-black shadow-[0_6px_16px_-8px_rgba(0,0,0,0.4)] transition hover:bg-white active:scale-[0.97]"
          >
            去看看
          </button>
        </div>
      </motion.article>
    </div>
  );
}
