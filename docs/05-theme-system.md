# 05 · 主题系统

**入口**：`demo/frontend/src/themes/tokens.js`（12 主题定义）
**hook**：`demo/frontend/src/themes/useTheme.js`
**UI**：`demo/frontend/src/themes/ThemeSwitcher.jsx`

## 12 主题

| id | name | surface | 定位 |
|---|---|---|---|
| `healing-warmth` | 暖色治愈 | dark | 默认 · 温暖的余烬与呼吸感 |
| `cyber-neon` | 赛博霓虹 | dark | 未来主义 · 高饱和的电子梦境 |
| `minimal-magazine` | 极简杂志 | light | 纸本触感 · 呼吸感与留白的艺术 |
| `soft-clay` | 软糖粘土 | light | 微光拟态 · 柔润触手可及 |
| `frosted-glass` | 迷雾玻璃 | dark | 磨砂质感 · 虚实交织的纵深 |
| `neo-brutalism` | 新野兽派 | light | 高反差 · 粗砺而自信 |
| `pixel-y2k` | 像素千禧 | light | 8-bit · 泡泡糖色的数字乡愁 |
| `notebook-paper` | 手记纸本 | light | 触感记录 · 每一笔都有温度 |
| `forest-nature` | 森林自然 | dark | 生机勃勃 · 旷野的深呼吸 |
| `hk-neon` | 霓虹港风 | dark | 午夜街头 · 王家卫式的电影感 |
| `zen-ink` | 水墨禅意 | light | 大道至简 · 留白里的万象 |
| `scrapbook` | 剪贴簿 | light | 拼贴记忆 · 灵感的混沌与秩序 |

## 工作原理 · CSS 变量优先

整个主题系统基于 **CSS 自定义属性（variables）**：

### 1. 默认变量在 `:root`（`index.css`）

```css
:root {
  --color-stage:      #0b0b0f;
  --color-panel:      #15151d;
  --color-text:       #f5f5f4;
  --color-text-muted: #a8a29e;
  --color-warmth:     #f4cf83;
  --color-ember:      #ff5a5f;
  --color-kiss:       #ffb3c0;
  /* ... */
  --font-sans:        'PingFang SC', ..., sans-serif;
  --radius-card:      1rem;
  --shadow-card:      0 18px 48px -16px rgba(255, 91, 95, 0.35);
}
```

### 2. Tailwind 把颜色/radius/shadow 映射到变量（`tailwind.config.js`）

```js
theme: {
  extend: {
    colors: {
      stage:  'var(--color-stage)',
      panel:  'var(--color-panel)',
      ember:  'var(--color-ember)',
      warmth: 'var(--color-warmth)',
      /* ... */
    },
    borderRadius: { card: 'var(--radius-card)', pill: 'var(--radius-pill)' },
    boxShadow:    { card: 'var(--shadow-card)', soft: 'var(--shadow-soft)' },
  }
}
```

### 3. 主题切换时覆盖 `document.documentElement` 的 style

`useTheme.js:applyTheme(theme)`：

```js
export function applyTheme(theme) {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme.id);
  root.setAttribute('data-surface', theme.surface);
  root.setAttribute('data-split', theme.layout.split_ratio);
  root.setAttribute('data-card-aspect', theme.layout.card_aspect);
  root.setAttribute('data-type-scale', theme.layout.type_scale);

  for (const [k, v] of Object.entries(theme.tokens)) {
    root.style.setProperty(k, v);
  }
}
```

**切换 = 重写 `:root` 上的 CSS variable**。整个 UI 的配色、字体、radius、shadow 瞬间跟着变。无需 re-render、无需 unmount。

## Theme 形状

```js
{
  id: 'cyber-neon',                    // kebab-case 英文
  name: '赛博霓虹',                    // 中文显示名
  tagline: '未来主义 · 高饱和的电子梦境',
  surface: 'dark' | 'light',            // 配色基调
  tokens: {
    '--color-stage':  '#020617',
    '--color-panel':  '#0f172a',
    /* ... 14 个颜色 */
    '--font-sans':    '"JetBrains Mono", monospace',
    '--radius-card':  '4px',
    '--shadow-card':  '0 0 24px rgba(34, 211, 238, 0.25)',
    /* ... */
  },
  layout: {
    split_ratio: '6-6' | '7-5' | '8-4' | '5-7',
    card_aspect: 'portrait' | 'square' | 'landscape',
    type_scale:  'compact' | 'normal' | 'airy'
  }
}
```

## 用户切换

```jsx
import { useTheme } from '../themes/useTheme.js';
import { THEMES } from '../themes/tokens.js';

function App() {
  const { current, switchTheme, cycleTheme } = useTheme(THEMES);
  return (
    <>
      <ThemeSwitcher themes={THEMES} current={current} onPick={switchTheme} />
      {/* ... */}
    </>
  );
}
```

**快捷键**：`[` 上一款 · `]` 下一款（App.jsx 全局 keydown）。

**持久化**：`localStorage.dundao:themeId` · 下次刷新保持选中。

## 添加新主题

在 `tokens.js` 的 `THEMES` 数组最后追加：

```js
{
  id: 'aurora-purple',
  name: '极光紫',
  tagline: '冰层下的流光',
  surface: 'dark',
  tokens: {
    '--color-stage':      '#0a0a2e',
    '--color-panel':      '#1a1a40',
    '--color-ink':        '#0a0a2e',
    '--color-text':       '#e0e7ff',
    '--color-text-muted': '#94a3b8',
    '--color-warmth':     '#a78bfa',
    '--color-ember':      '#c084fc',
    '--color-kiss':       '#f0abfc',
    '--color-hintA':      '#67e8f9',
    '--color-hintB':      '#fde047',
    '--color-hintC':      '#86efac',
    '--font-sans':        '"PingFang SC", system-ui, sans-serif',
    '--radius-card':      '1rem',
    '--radius-pill':      '9999px',
    '--shadow-card':      '0 12px 40px -8px rgba(167, 139, 250, 0.5)',
    '--shadow-soft':      '0 4px 16px rgba(0, 0, 0, 0.2)',
    '--card-border':      '1px solid rgba(167, 139, 250, 0.2)',
    '--surface-glow':     'radial-gradient(800px 400px at 50% 0%, rgba(167, 139, 250, 0.2), transparent 60%), #0a0a2e',
  },
  layout: { split_ratio: '7-5', card_aspect: 'portrait', type_scale: 'normal' }
}
```

必填字段：`id`, `name`, `tagline`, `surface`, `tokens.--color-*`。
可选字段：`layout` · 不给默认走 `'7-5' / 'portrait' / 'normal'`。

## 约束

### 颜色对比度
主题里正文色（`--color-text`）与底色（`--color-stage` / `--color-panel`）对比度**应 ≥ 4.5:1**（WCAG AA）。
现有 12 套主题都已过检查。加新主题请用 [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/) 验证。

### 字体 fallback
Web fonts（Inter / JetBrains Mono / Noto Serif SC / Archivo Black / Press Start 2P / Caveat）在 `index.html` 预加载。
加载失败时回落到系统字体（PingFang SC · Source Han Sans SC）· 不会崩。

### 默认主题
`:root` 里的默认值必须对应第一个主题（`healing-warmth`）。如果未来换默认主题，两处都要更新。

## 响应式

没有传统意义上的 `@media` 响应式断点。
布局差异通过 `data-split` attribute + grid 类实现：

```js
// App.jsx
const SPLIT_TO_GRID = {
  '7-5': { left: 'col-span-7', right: 'col-span-5' },
  '6-6': { left: 'col-span-6', right: 'col-span-6' },
  '8-4': { left: 'col-span-8', right: 'col-span-4' },
  '5-7': { left: 'col-span-5', right: 'col-span-7' },
};
```

不同主题可以改变左右比例 · 视觉感完全不同。

## prefers-reduced-motion

CSS 媒体查询关闭主题切换本身的过渡（避免切换时动画惊扰）：

```css
@media (prefers-reduced-motion: reduce) {
  * { transition-duration: 0.001ms !important; }
}
```

主题切换瞬间完成 · 无渐变动画。

## 性能

- 单次切换：重设 ~20 个 CSS variable · 浏览器会 repaint 一次 · < 16ms
- 没有 React re-render（不走 state）
- 没有 CSS bundle 变化（同一套 CSS，只是变量值换了）

## 常见踩坑

### 加了新主题但颜色不变
→ 检查 `tailwind.config.js` 里**有没有这个颜色**
→ 如 `bg-aurora-purple` 需要在 config 里加

但现有代码用的是 `bg-stage / bg-panel / bg-warmth`（通用名）· 主题值变但 class name 不变 · 所以加主题通常**不需要改 tailwind.config**。

### 主题切换后回退到默认
→ `localStorage` 里 `dundao:themeId` 值可能是旧名 · 手动清一下

### ThemeSwitcher UI 挡住了其它元素
→ 组件用了 `z-40` · 在 AgentMind 等组件之上 · 一般不应挡信息流

## 下一步

→ [06-frontend-components.md](./06-frontend-components.md)
