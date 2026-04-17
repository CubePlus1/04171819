import { useDemoStore } from '../store/useDemoStore.js';

const SCRIPT_COLORS = {
  A: 'bg-hintA/15 text-hintA border-hintA/30',
  B: 'bg-hintB/15 text-hintB border-hintB/30',
  C: 'bg-hintC/15 text-hintC border-hintC/30',
};

export default function PresetPicker({ onPick, disabled }) {
  const presets = useDemoStore((s) => s.presets);

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] uppercase tracking-[0.18em] text-stone-500">预设评论 · 评委一键触发</div>
      <div className="grid grid-cols-1 gap-2">
        {presets.map((p) => (
          <button
            key={p.id}
            disabled={disabled}
            onClick={() => onPick?.(p.text)}
            className={`group flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-[13px] transition disabled:opacity-40 disabled:cursor-not-allowed hover:-translate-y-px ${
              SCRIPT_COLORS[p.script] ?? 'bg-white/5 text-stone-200 border-white/10'
            }`}
          >
            <span className="truncate">{p.text}</span>
            <span className="shrink-0 rounded-full bg-black/30 px-2 py-0.5 text-[10px] tracking-widest text-stone-300">
              剧本 {p.script}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
