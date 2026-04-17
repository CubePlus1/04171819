import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export default function ThemeSwitcher({ themes, current, onPick }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="focus-ring rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[12px] text-stone-200 hover:bg-white/10"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--color-warmth)]" />
        风格 · {current.name}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            role="listbox"
            aria-label="切换展台风格"
            className="absolute right-0 top-[calc(100%+6px)] z-40 w-[320px] overflow-hidden rounded-2xl border border-white/10 bg-[var(--color-panel)] shadow-soft"
          >
            <div className="max-h-[60vh] overflow-y-auto p-2">
              {themes.map((t) => {
                const active = t.id === current.id;
                return (
                  <button
                    key={t.id}
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      onPick(t.id);
                      setOpen(false);
                    }}
                    className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
                      active ? 'bg-white/10' : 'hover:bg-white/5'
                    }`}
                  >
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10"
                      style={{
                        background: t.tokens['--surface-glow'] ?? t.tokens['--color-panel'],
                      }}
                    >
                      <span
                        className="block h-3 w-3 rounded-full"
                        style={{
                          background: t.tokens['--color-ember'],
                          boxShadow: `0 0 8px ${t.tokens['--color-kiss']}`,
                        }}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-medium text-stone-100">{t.name}</span>
                        <span className="text-[10px] text-stone-400">{t.surface}</span>
                      </div>
                      <div className="truncate text-[11px] text-stone-400">{t.tagline}</div>
                    </div>
                    {active && (
                      <span className="ml-1 rounded-full bg-[var(--color-warmth)]/20 px-2 py-0.5 text-[10px] text-[var(--color-warmth)]">
                        当前
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="border-t border-white/5 px-4 py-2 text-[10px] text-stone-500">
              共 {themes.length} 套风格 · 支持 ← → 或 [ ] 键快切
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
