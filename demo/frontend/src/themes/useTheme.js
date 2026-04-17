import { useEffect, useState } from 'react';

const STORAGE_KEY = 'dundao:themeId';

export function getStoredThemeId() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeThemeId(id) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {/* ignore */}
}

export function applyTheme(theme) {
  if (!theme) return;
  const root = document.documentElement;
  root.setAttribute('data-theme', theme.id);
  root.setAttribute('data-surface', theme.surface ?? 'dark');
  const layout = theme.layout ?? {};
  root.setAttribute('data-split', layout.split_ratio ?? '7-5');
  root.setAttribute('data-card-aspect', layout.card_aspect ?? 'portrait');
  root.setAttribute('data-type-scale', layout.type_scale ?? 'normal');

  for (const [k, v] of Object.entries(theme.tokens ?? {})) {
    root.style.setProperty(k, v);
  }
}

export function useTheme(themes) {
  const [current, setCurrent] = useState(() => {
    const stored = getStoredThemeId();
    return themes.find((t) => t.id === stored) ?? themes[0];
  });

  useEffect(() => {
    applyTheme(current);
  }, [current]);

  const switchTheme = (id) => {
    const t = themes.find((x) => x.id === id);
    if (!t) return;
    storeThemeId(id);
    setCurrent(t);
  };

  const cycleTheme = (direction = 1) => {
    const idx = themes.findIndex((t) => t.id === current.id);
    const next = themes[(idx + direction + themes.length) % themes.length];
    switchTheme(next.id);
  };

  return { current, switchTheme, cycleTheme, themes };
}
