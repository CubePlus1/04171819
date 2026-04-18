import { AnimatePresence, motion } from 'framer-motion';

const STATUS_COLORS = {
  idle:   'bg-white/5  text-stone-200 border-white/5',
  active: 'bg-ember/15 text-kiss       border-ember/30 shadow-card animate-pulse-soft',
  done:   'bg-warmth/10 text-warmth    border-warmth/30',
  fail:   'bg-red-900/30 text-red-300  border-red-500/40',
};

const ACTION_VERB_CN = {
  post_link:        '把她蹲过的款放出了链接',
  post_sequel:      '发了那集的后续',
  series_completed: '把她收藏过的系列更完了',
  reply_tutorial:   '在回复里带上了她求的教程',
};

const SIGNAL_VERB_CN = {
  comment_intent:    '评论过',
  watch_later:       '按了稍后再看',
  unfinished_save:   '收藏过',
  unsatisfied_search:'搜过',
  passive_interest:  '反复刷到过',
};

function DetailStep1({ detail }) {
  // ambient 形态：{ total, open, note }
  if (detail.open != null) {
    return (
      <div className="mt-2 text-[12px] text-stone-300">
        <span className="text-stone-200">后台扫描：</span>
        {detail.note ?? `${detail.open} 件事还没接回来`}
      </div>
    );
  }
  // comment 形态（遗留）：{ text, length }
  return (
    <div className="mt-2 text-[12px] leading-relaxed text-stone-300">
      <span className="text-stone-200">她说：</span>「{detail.text}」
      <span className="ml-2 text-stone-200">字符数 {detail.length}</span>
    </div>
  );
}

function DetailStep2({ detail }) {
  // ambient 形态：{ hit, signal, creator, recall }
  if ('hit' in detail) {
    if (!detail.hit) {
      return <div className="mt-2 text-[12px] text-red-300">这一次还没找到能接住的那条</div>;
    }
    return (
      <div className="mt-2 space-y-1 text-[12px] text-stone-300">
        <div>
          <span className="text-stone-200">她当时：</span>
          {detail.signal?.text ? `「${detail.signal.text}」` : `《${detail.signal?.video_title}》`}
        </div>
        <div>
          <span className="text-stone-200">在：</span>{detail.creator}
        </div>
        {detail.recall && (
          <div className="text-stone-200 italic">{detail.recall}</div>
        )}
      </div>
    );
  }
  // comment 形态：{ label, confidence, rationale }
  return (
    <div className="mt-2 space-y-1 text-[12px] text-stone-300">
      <div>
        <span className="text-stone-200">分类：</span>
        <span className="text-kiss">{detail.label}</span>
        <span className="ml-2 rounded-full bg-warmth/15 px-2 py-0.5 text-[10px] text-warmth">
          把握度 {(detail.confidence * 100).toFixed(0)}%
        </span>
      </div>
      <div className="text-stone-200">{detail.rationale}</div>
    </div>
  );
}

function DetailStep3({ detail }) {
  // ambient 形态：{ creator, action_type, action_summary, script }
  if (detail.action_summary != null || detail.action_type != null) {
    return (
      <div className="mt-2 space-y-1 text-[12px] text-stone-300">
        <div>
          <span className="text-stone-200">她这次给了回音：</span>
          {detail.creator}
          <span className="mx-2 text-stone-600">·</span>
          {ACTION_VERB_CN[detail.action_type] ?? detail.action_type}
        </div>
        {detail.action_summary && (
          <div className="text-stone-200">{detail.action_summary}</div>
        )}
        {detail.script && (
          <div>
            <span className="text-stone-200">该用哪种方式接回来：</span>
            <span className="text-warmth">剧本 {detail.script}</span>
          </div>
        )}
      </div>
    );
  }
  // comment 形态：{ hit, signal, creator, action_type, script }（旧 runWorkflow）
  if (!detail.hit) {
    return <div className="mt-2 text-[12px] text-red-300">这一次没找到你曾惦记的那条</div>;
  }
  return (
    <div className="mt-2 space-y-1 text-[12px] text-stone-300">
      <div>
        <span className="text-stone-200">你当时说过：</span>
        {detail.signal?.text ? `「${detail.signal.text}」` : `《${detail.signal?.video_title}》`}
      </div>
      <div>
        <span className="text-stone-200">她这次给了回音：</span>{detail.creator}
        <span className="mx-2 text-stone-600">·</span>
        {ACTION_VERB_CN[detail.action_type] ?? detail.action_type}
      </div>
      <div>
        <span className="text-stone-200">该用哪种方式接回来：</span>
        <span className="text-warmth">{detail.script}</span>
      </div>
    </div>
  );
}

function DetailStep4({ detail }) {
  if (detail.ok === false) {
    return <div className="mt-2 text-[12px] text-red-300">{detail.reason ?? '这条刚刚被抢先接走了'}</div>;
  }
  return (
    <div className="mt-2 text-[12px] text-stone-300">
      <span className="text-stone-200">这次被接住的：</span>{' '}
      <code className="rounded bg-black/40 px-1.5 py-0.5 text-[11px] text-warmth">{detail.card_id}</code>
      <span className="ml-2 text-stone-200">·</span>
      <span className="ml-1 text-warmth">剧本 {detail.script}</span>
    </div>
  );
}

function DetailStep5({ detail }) {
  return (
    <div className="mt-2 space-y-1 text-[12px] text-stone-300">
      <div>
        <span className="text-stone-200">页面：</span>
        {detail.pages?.join(' / ')}
      </div>
      <div className="text-stone-200">{detail.preview_context}</div>
    </div>
  );
}

function Detail({ step, detail }) {
  if (!detail) return null;
  if (step === 1) return <DetailStep1 detail={detail} />;
  if (step === 2) return <DetailStep2 detail={detail} />;
  if (step === 3) return <DetailStep3 detail={detail} />;
  if (step === 4) return <DetailStep4 detail={detail} />;
  if (step === 5) return <DetailStep5 detail={detail} />;
  return null;
}

export default function AgentStep({ step, index, isLast }) {
  const color = STATUS_COLORS[step.status] ?? STATUS_COLORS.idle;
  const running = step.status === 'active';

  return (
    <div className="relative flex gap-3">
      <div className="flex flex-col items-center">
        <div
          className={`relative flex h-7 w-7 items-center justify-center rounded-full border text-[12px] font-semibold ${color}`}
        >
          {running ? (
            <motion.span
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1.4, ease: 'linear' }}
              className="inline-block h-2.5 w-2.5 rounded-full border-2 border-warmth border-t-transparent"
            />
          ) : (
            index + 1
          )}
        </div>
        {!isLast && <div className="step-line mt-1 w-px flex-1" />}
      </div>

      <motion.div
        layout
        className={`mb-3 flex-1 rounded-xl border px-3 py-2 transition ${color} bg-opacity-60`}
      >
        <div className="flex items-center justify-between">
          <div className="text-[13px] font-medium">{step.name}</div>
          <div className="text-[10px] tracking-[0.18em] text-stone-200">
            {step.status === 'active' ? '记起中…' : step.status === 'done' ? '已接住' : step.status === 'fail' ? '暂时落空' : '等下一次'}
          </div>
        </div>
        <AnimatePresence>
          {step.detail && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Detail step={step.step} detail={step.detail} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
