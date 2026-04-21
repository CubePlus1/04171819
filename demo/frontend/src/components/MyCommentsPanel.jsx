import { useEffect, useState } from 'react';
import { useDemoStore } from '../store/useDemoStore.js';

/**
 * C1 视图 · 我评论过的视频列表
 *
 * Props:
 *   - onOpenCard(cardId) · 用户点击"看卡" 时调用（切回 feed + focus）
 */
export default function MyCommentsPanel({ onOpenCard }) {
  const myComments = useDemoStore((s) => s.myComments);
  const fetchingMyComments = useDemoStore((s) => s.fetchingMyComments);
  const fetchMyComments = useDemoStore((s) => s.fetchMyComments);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchMyComments(filter);
  }, [filter, fetchMyComments]);

  const data = myComments;
  const items = data?.items ?? [];

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between text-[12px] text-stone-200">
        <span>
          {data ? `${data.total} 条评论 · ${data.fulfilled} 已答 · ${data.pending} 等待中` : '加载中...'}
        </span>
        <div className="flex items-center gap-1 rounded-full bg-black/20 p-0.5">
          {[
            { id: 'all', label: '全部' },
            { id: 'fulfilled', label: '已答' },
            { id: 'pending', label: '等待中' },
          ].map((opt) => (
            <button
              key={opt.id}
              onClick={() => setFilter(opt.id)}
              className={`focus-ring rounded-full px-2.5 py-0.5 transition ${
                filter === opt.id
                  ? 'bg-white/20 text-[color:var(--color-text)]'
                  : 'text-stone-300 hover:bg-white/5'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl bg-black/20 p-2">
        {fetchingMyComments && items.length === 0 && <EmptyLine text="拉取中..." />}
        {!fetchingMyComments && items.length === 0 && (
          <EmptyLine text={filter === 'pending' ? '你没有待履约的评论' : '还没有评论记录'} />
        )}
        {items.map((item) => (
          <CommentRow key={item.signal_id} item={item} onOpenCard={onOpenCard} />
        ))}
      </div>
    </div>
  );
}

function CommentRow({ item, onOpenCard }) {
  const fulfilled = Boolean(item.fulfilled);

  return (
    <div className="mb-2 rounded-xl border border-white/5 bg-white/5 px-3 py-2.5 last:mb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-[color:var(--color-text)]">
            {fulfilled ? '✅' : '⏳'}
            <span className="ml-1.5">{item.video_title}</span>
          </div>
          <div className="mt-1 truncate text-[11px] text-stone-300">
            你写过：「{item.content || '(待补)'}」
          </div>
          {fulfilled && item.top_answer && (
            <div className="mt-1 truncate text-[11px] text-stone-400">
              {item.top_answer.is_up ? `${item.creator?.name || 'UP'} 挂了：` : '网友答：'}
              {item.top_answer.content}
            </div>
          )}
          {!fulfilled && <div className="mt-1 text-[11px] text-stone-400">还没答</div>}
        </div>
        {fulfilled && item.card_id && (
          <button
            onClick={() => onOpenCard?.(item.card_id)}
            className="focus-ring shrink-0 rounded-full bg-ember/20 px-2.5 py-1 text-[11px] font-medium text-kiss hover:bg-ember/30"
          >
            看卡 →
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyLine({ text }) {
  return (
    <div className="flex h-full items-center justify-center py-8 text-[12px] text-stone-400">
      {text}
    </div>
  );
}
