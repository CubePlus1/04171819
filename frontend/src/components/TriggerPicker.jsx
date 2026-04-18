import { useDemoStore } from '../store/useDemoStore.js';

const SCRIPT_COLORS = {
  A: 'bg-hintA/15 text-hintA border-hintA/30',
  B: 'bg-hintB/15 text-hintB border-hintB/30',
  C: 'bg-hintC/15 text-hintC border-hintC/30',
};

// 注意：这里不是"输入评论"。
//
// principle.json 要求"被动刷到即成立"——真实用户不会停下来打字，所以 UI 不提供输入框。
// 这三个按钮是 demo 控制器：让评委在展台上选一类信号主题，让 AI 后台优先接回来。
// 默认是"AI 自动看"——什么都不点，每隔几秒自动挑最旧的未履约那条。
export default function TriggerPicker({ onPick, disabled }) {
  const triggers = useDemoStore((s) => s.triggers);

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] uppercase tracking-[0.18em] text-stone-200">
        展台控制 · 让下一条优先接哪类
      </div>
      <div className="grid grid-cols-1 gap-2">
        {triggers.map((t) => (
          <button
            key={t.id}
            disabled={disabled}
            onClick={() => onPick?.(t)}
            className={`focus-ring group flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-[13px] transition disabled:opacity-40 disabled:cursor-not-allowed hover:-translate-y-px ${
              SCRIPT_COLORS[t.script] ?? 'bg-white/5 text-stone-200 border-white/10'
            }`}
            aria-label={`${t.label}：${t.hint}`}
          >
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{t.label}</span>
              <span className="truncate text-[11px] text-stone-200">{t.hint}</span>
            </div>
            <span className="shrink-0 rounded-full bg-black/30 px-2 py-0.5 text-[10px] tracking-widest text-stone-300">
              剧本 {t.script}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
