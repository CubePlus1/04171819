# Bilibili Tracker v0.3.0 · Frontend Sub-Plan (T7)

> Parent plan: [../2026-04-21-bilibili-tracker.md](../2026-04-21-bilibili-tracker.md)
> Spec reference: [../../specs/2026-04-21-bilibili-tracker-design.md](../../specs/2026-04-21-bilibili-tracker-design.md) §5.3, §7.1 (GET `/api/my-comments`)

## 范围

- 删除右面板 `AgentPanel`（含 `AgentMind / AgentWorkflow / AmbientPulse / TriggerPicker` 的路由挂载）
- 把 `ProductPanel` 改成两 tab：**信息流** | **我的评论**
- 新增 `MyCommentsPanel` 组件 · 筛选 `全部/已答/等待中` + 点击跳履约卡
- 扩 `useDemoStore` `myComments` slice
- 扩 `api/client.js` · `getMyComments(filter)` 方法（含 mock fallback）
- 手工 smoke verify

**不做**：删除 `AgentPanel.jsx / AgentMind.jsx` 等源文件（保留给后续 v0.3.x / v0.4.x 复活或抽库用），只去掉挂载点。

---

## Task T7.1 · App.jsx 去掉 AgentPanel 挂载 + 改单栏布局

**Files:**
- Modify: `demo/frontend/src/App.jsx`

### Step 1 · 写 smoke 验证（手工 checklist 性质，无 unit test）

本 task 无单测（无框架 + 仅 UI layout 改动），用手工 smoke。写成 checklist 放 `demo/docs/09-ops-runbook.md` 末尾 T10 里统一维护，本 step 跳过 write test，直接进 Step 2。

### Step 2 · 去掉 AgentPanel import 和 SPLIT_TO_GRID 常量

Edit `demo/frontend/src/App.jsx`:

```diff
-import AgentPanel from './panels/AgentPanel.jsx';
```

```diff
-// Mobile（<md）下单列展示 · 右侧 AgentPanel 驱动 pipeline 所以不能 unmount
-// 用 hidden md:block 让它继续跑 · 视口里看不到
-// 完整枚举每个 variant · Tailwind JIT 只扫源代码里字面量出现过的 class
-const SPLIT_TO_GRID = {
-  '7-5': { left: 'col-span-12 md:col-span-7', right: 'hidden md:block md:col-span-5' },
-  '6-6': { left: 'col-span-12 md:col-span-6', right: 'hidden md:block md:col-span-6' },
-  '8-4': { left: 'col-span-12 md:col-span-8', right: 'hidden md:block md:col-span-4' },
-  '5-7': { left: 'col-span-12 md:col-span-5', right: 'hidden md:block md:col-span-7' },
-};
```

### Step 3 · 去掉 `const split = SPLIT_TO_GRID[...]` 和 AgentPanel 挂载

在 `App.jsx` 里把 `App` 函数体的 split 行和 `<main>...</main>` 替换：

```diff
-  const split = SPLIT_TO_GRID[theme.layout?.split_ratio ?? '7-5'];
-
-        <main className="relative grid flex-1 min-h-0 grid-cols-12 gap-4 px-3 pb-3 md:px-5 md:pb-5">
-          <motion.section
-            initial={{ opacity: 0, y: 18 }}
-            animate={{ opacity: 1, y: 0 }}
-            transition={{ duration: 0.45 }}
-            className={`${split.left} min-h-0`}
-          >
-            <ProductPanel bootStatus={bootState.status} onAction={(label) => setToast(label)} />
-          </motion.section>
-
-          <motion.section
-            initial={{ opacity: 0, y: 18 }}
-            animate={{ opacity: 1, y: 0 }}
-            transition={{ duration: 0.45, delay: 0.08 }}
-            className={`${split.right} min-h-0`}
-          >
-            <AgentPanel onToast={setToast} />
-          </motion.section>
-        </main>
+        <main className="relative flex flex-1 min-h-0 flex-col gap-4 px-3 pb-3 md:px-5 md:pb-5">
+          <motion.section
+            initial={{ opacity: 0, y: 18 }}
+            animate={{ opacity: 1, y: 0 }}
+            transition={{ duration: 0.45 }}
+            className="flex-1 min-h-0"
+          >
+            <ProductPanel bootStatus={bootState.status} onAction={(label) => setToast(label)} />
+          </motion.section>
+        </main>
```

### Step 4 · 浏览器验证

在 worktree 根跑：

```bash
cd /Users/sevencolor/code/0BKHDD/.worktrees/dundao-bilibili/demo/frontend
npm run dev
```

打开 `http://localhost:5173` 检查：
- [ ] 页面只有一栏（之前的右面板消失）
- [ ] `ProductPanel` 撑满宽度
- [ ] 顶部 Header 正常
- [ ] 主题切换（按 `]`/`[`）切换样式
- [ ] 控制台无 `AgentPanel` 相关报错

### Step 5 · Commit

```bash
cd /Users/sevencolor/code/0BKHDD/.worktrees/dundao-bilibili
git add demo/frontend/src/App.jsx
git commit -m "$(cat <<'EOF'
feat(bilibili): T7.1·App 去 AgentPanel · 改单栏布局

v0.3.0 自用工具不需要 AI 透明化右面板。保留 AgentPanel.jsx
源文件，只删挂载点 + SPLIT_TO_GRID 常量。ProductPanel 撑满。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task T7.2 · ProductPanel 加 Tab 切换

**Files:**
- Modify: `demo/frontend/src/panels/ProductPanel.jsx`

### Step 1 · 加 tab state + tab bar UI

在 `ProductPanel.jsx` 顶部加 import + state：

```jsx
import { useEffect, useRef, useState } from 'react';
import Feed from '../components/Feed.jsx';
import MyCommentsPanel from '../components/MyCommentsPanel.jsx';
import { useDemoStore } from '../store/useDemoStore.js';
import { asset } from '../utils/asset.js';
```

在 `ProductPanel` 函数体最顶部加：

```jsx
const [tab, setTab] = useState('feed');  // 'feed' | 'my-comments'
```

### Step 2 · 改 main content 分支渲染

找到 `<div className="relative flex-1 min-h-0 overflow-hidden rounded-3xl ...">` 的内容块，把内部改成：

```jsx
<div className="relative flex-1 min-h-0 overflow-hidden rounded-3xl border border-white/5 bg-[color:var(--color-panel)]">
  {/* 液态玻璃氛围底 · 仅信息流 tab 用 */}
  {tab === 'feed' && coverUrl && (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 transition-[background-image] duration-700"
      style={{
        backgroundImage: `url(${coverUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        filter: 'blur(42px) saturate(140%)',
        transform: 'scale(1.25)',
      }}
    />
  )}
  <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-b from-black/10 via-transparent to-black/25" />

  <div className="relative z-10 h-full px-4 py-6">
    <div className="mx-auto h-full w-full max-w-[380px]">
      {tab === 'feed' ? (
        bootStatus === 'error' ? (
          <EmptyState title="信息流暂不可用" tip="后端断了连 · 点顶部「重试」或「重置演示」" />
        ) : bootStatus === 'loading' && cards.length === 0 && !user ? (
          <EmptyState title="信息流加载中..." tip="正在为你召回过去的念头" />
        ) : (
          <Feed onAction={onAction} />
        )
      ) : (
        <MyCommentsPanel onOpenCard={(cardId) => {
          setTab('feed');
          // spotlight 让 Feed 跳到该卡（依赖 useDemoStore · 下面 T7.4 补 focusCard action）
          useDemoStore.getState().focusCard(cardId);
        }} />
      )}
    </div>
  </div>

  {/* 左上角状态条 · 两个 tab 通用 */}
  <div
    className="pointer-events-none absolute left-4 top-4 rounded-full bg-black/40 px-2.5 py-1 text-[11px] font-medium tracking-[0.2em] backdrop-blur"
    style={{ color: '#ffffff' }}
  >
    {tab === 'feed'
      ? (user?.nickname ? `${user.nickname} · 闲刷空窗` : '闲刷空窗')
      : '我的评论'}
  </div>
</div>
```

### Step 3 · 加 tab bar UI（放在头部右侧）

找到 `<div className="flex items-center justify-between gap-3">` 那段，在 `ProgressDots` 之前插入 tab 切换按钮：

```jsx
<div className="flex items-center justify-between gap-3">
  <div className="hidden items-center gap-2 shrink-0 md:flex">
    <span className="pill bg-kiss/15 text-kiss">产品面板</span>
    <span className="text-[12px] text-stone-200">
      {tab === 'feed' ? '信息流视图' : '我的评论历史'}
    </span>
  </div>

  {/* Tab 切换 */}
  <div className="flex items-center gap-1 rounded-full bg-black/30 p-1 text-[12px]">
    <button
      className={`focus-ring rounded-full px-3 py-1 transition ${
        tab === 'feed'
          ? 'bg-white/15 text-[color:var(--color-text)]'
          : 'text-[color:var(--color-text-muted)] hover:bg-white/5'
      }`}
      onClick={() => setTab('feed')}
    >
      信息流
    </button>
    <button
      className={`focus-ring rounded-full px-3 py-1 transition ${
        tab === 'my-comments'
          ? 'bg-white/15 text-[color:var(--color-text)]'
          : 'text-[color:var(--color-text-muted)] hover:bg-white/5'
      }`}
      onClick={() => setTab('my-comments')}
    >
      我的评论
    </button>
  </div>

  <div className="flex min-w-0 flex-1 items-center justify-end gap-2 text-[11px] text-stone-200">
    {/* 进度条/刷数/互动/队列 · 只在 feed tab 下显示 */}
    {tab === 'feed' && (
      <>
        <div className="hidden md:block">
          <ProgressDots advanced={advanceCount} />
        </div>
        <span className="hidden whitespace-nowrap font-medium text-[color:var(--color-text)] md:inline">
          刷 {advanceCount}
        </span>
        <span className="hidden opacity-40 md:inline">·</span>
        <span className="hidden whitespace-nowrap text-[color:var(--color-text-muted)] md:inline">
          互动 {interactionCount}
        </span>
        {queueLen > 0 && (
          <>
            <span className="hidden opacity-40 md:inline">·</span>
            <span className="whitespace-nowrap font-bold text-[color:var(--color-warmth)]">
              队列+{queueLen}
            </span>
          </>
        )}
      </>
    )}
    <span className="whitespace-nowrap">已蹲 {cards.length}</span>
    {tab === 'feed' && spotlightCardId && (
      <span className="pill whitespace-nowrap bg-ember/15 text-kiss animate-pulse-soft">新卡片浮现中</span>
    )}
  </div>
</div>
```

### Step 4 · 浏览器验证

```bash
# 复用上一个 dev server
```

- [ ] `localhost:5173` 页面顶部看到 `信息流 · 我的评论` 切换按钮
- [ ] 默认 active 是信息流
- [ ] 点击"我的评论"切到空面板（MyCommentsPanel 还没写实际数据，应显示空态）
- [ ] 点回"信息流"，Feed 恢复
- [ ] 主题切换不破坏 tab bar 样式

### Step 5 · Commit

```bash
cd /Users/sevencolor/code/0BKHDD/.worktrees/dundao-bilibili
git add demo/frontend/src/panels/ProductPanel.jsx
git commit -m "$(cat <<'EOF'
feat(bilibili): T7.2·ProductPanel 加 tab · 信息流/我的评论

新增 '我的评论' tab，切换后挂载 MyCommentsPanel（本 task 先画壳）。
进度条/队列计数仅在信息流 tab 显示。左上角状态条文案按 tab 切换。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task T7.3 · MyCommentsPanel 组件

**Files:**
- Create: `demo/frontend/src/components/MyCommentsPanel.jsx`

### Step 1 · 写完整组件

```jsx
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
  const [filter, setFilter] = useState('all'); // 'all' | 'fulfilled' | 'pending'

  useEffect(() => {
    fetchMyComments(filter);
  }, [filter, fetchMyComments]);

  const data = myComments;
  const items = data?.items ?? [];

  return (
    <div className="flex h-full flex-col gap-3">
      {/* 统计 + 筛选 bar */}
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

      {/* 列表 */}
      <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl bg-black/20 p-2">
        {fetchingMyComments && items.length === 0 && (
          <EmptyLine text="拉取中..." />
        )}
        {!fetchingMyComments && items.length === 0 && (
          <EmptyLine text={filter === 'pending' ? '你没有待履约的评论' : '还没有评论记录'} />
        )}
        {items.map((it) => (
          <CommentRow key={it.signal_id} item={it} onOpenCard={onOpenCard} />
        ))}
      </div>
    </div>
  );
}

function CommentRow({ item, onOpenCard }) {
  const fulfilled = Boolean(item.fulfilled);
  return (
    <div className="mb-2 rounded-xl border border-white/5 bg-white/5 px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-[color:var(--color-text)]">
            {fulfilled ? '✅' : '⏳'}
            <span className="ml-1.5">{item.video_title}</span>
          </div>
          <div className="mt-1 text-[11px] text-stone-300 truncate">
            你写过：「{item.content || '(待补)'}」
          </div>
          {fulfilled && item.top_answer && (
            <div className="mt-1 text-[11px] text-stone-400 truncate">
              {item.top_answer.is_up ? `${item.creator?.name || 'UP'} 挂了：` : '网友答：'}
              {item.top_answer.content}
            </div>
          )}
          {!fulfilled && (
            <div className="mt-1 text-[11px] text-stone-400">还没答</div>
          )}
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
```

### Step 2 · 浏览器验证（mock 数据）

本 task 依赖 store `fetchMyComments` 和 api `getMyComments`，先在 T7.4/T7.5 实现后再回来跑 e2e smoke。本 step 只校验组件能无错渲染（空态）：

```bash
# dev server 已跑
```

- [ ] 切到"我的评论" tab
- [ ] 看到"加载中..."→ "还没有评论记录"
- [ ] 三个筛选按钮可点击，active 样式切换
- [ ] 控制台无 React 警告

### Step 3 · Commit

```bash
cd /Users/sevencolor/code/0BKHDD/.worktrees/dundao-bilibili
git add demo/frontend/src/components/MyCommentsPanel.jsx
git commit -m "$(cat <<'EOF'
feat(bilibili): T7.3·MyCommentsPanel · C1 我的评论列表

筛选 全部/已答/等待中，每行 ✅/⏳ 徽章 + 你写过什么 + 答是什么，
已答显示「看卡 →」按钮回跳 Feed 并 focus。依赖 T7.4 store
actions，本 task 先过空态。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task T7.4 · 扩 useDemoStore 加 myComments slice + focusCard

**Files:**
- Modify: `demo/frontend/src/store/useDemoStore.js`

### Step 1 · 扩 initialState

在 `demo/frontend/src/store/useDemoStore.js` 的 `initialState` 对象里（line ~15-44），在 `lastReason: null` 后加两个字段：

```diff
   lastReason: null,
+
+  // 我的评论（C1 · MyCommentsPanel）
+  myComments: null,            // { total, fulfilled, pending, items: [...] } | null
+  fetchingMyComments: false,
 };
```

### Step 2 · 扩 store actions

在 `create((set) => ({ ... }))` 的 actions 区（`reset` 之前），加两个新 action：

```diff
   clearSpotlight: () => set({ spotlightCardId: null }),

+  /**
+   * 拉我的评论列表 · filter: 'all' | 'fulfilled' | 'pending'
+   */
+  fetchMyComments: async (filter = 'all') => {
+    const { getMyComments } = await import('../api/client.js');
+    set({ fetchingMyComments: true });
+    try {
+      const data = await getMyComments(filter);
+      set({ myComments: data, fetchingMyComments: false });
+    } catch (err) {
+      console.warn('fetchMyComments failed', err);
+      set({ fetchingMyComments: false });
+    }
+  },
+
+  /**
+   * Feed focus 某张卡 · 用于从 MyCommentsPanel 的 "看卡 →" 跳转
+   * 逻辑：把目标 card 提到 queue 头部（advance 时立刻展示）
+   */
+  focusCard: (cardId) =>
+    set((state) => {
+      const card = state.cards.find((c) => c.id === cardId);
+      if (!card) return state;
+      const item = { kind: 'card', id: card.id, data: card };
+      const queueWithout = state.queue.filter((q) => !(q.kind === 'card' && q.id === card.id));
+      return {
+        currentItem: item,
+        queue: queueWithout,
+        spotlightCardId: card.id,
+      };
+    }),
+
   reset: () =>
     set((state) => ({
       ...initialState,
       connected: state.connected,
     })),
```

### Step 3 · 浏览器验证

- [ ] 切到"我的评论" tab
- [ ] 控制台 Network 看到 `GET /api/my-comments?filter=all` 请求（失败也行，重点 action 调到了）
- [ ] 后端没起也没报 JS error（store 里 try/catch 包住）

### Step 4 · Commit

```bash
cd /Users/sevencolor/code/0BKHDD/.worktrees/dundao-bilibili
git add demo/frontend/src/store/useDemoStore.js
git commit -m "$(cat <<'EOF'
feat(bilibili): T7.4·store 扩 myComments slice + focusCard

myComments: { total, fulfilled, pending, items } 拉列表。
focusCard(cardId) 把目标卡提到 queue 头，配合 advance 立即展示。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task T7.5 · 扩 api/client.js 加 getMyComments

**Files:**
- Modify: `demo/frontend/src/api/client.js`
- Modify: `demo/frontend/src/mock/index.js` (add mockMyComments)

### Step 1 · 加 mockMyComments

先看 `demo/frontend/src/mock/index.js` 当前 export。在文件末尾 export 新函数：

```js
/**
 * GitHub Pages 部署或无 backend 时的 fallback · 返回固定 3 条示例
 */
export function mockMyComments(filter = 'all') {
  const items = [
    {
      signal_id: 1,
      aid: 112233445566,
      video_title: '焦糖褐色外套开箱（MOCK）',
      content: '蹲链接',
      occurred_at: new Date(Date.now() - 21 * 86400_000).toISOString(),
      fulfilled: 1,
      card_id: 'mock-card-A',
      creator: { mid: '1', name: '大山', avatar: null },
      top_answer: { content: '链接上了！¥329 旗舰店', is_up: true },
    },
    {
      signal_id: 2,
      aid: 112233445567,
      video_title: 'XXX BGM 合集 Part1（MOCK）',
      content: '蹲 BGM',
      occurred_at: new Date(Date.now() - 7 * 86400_000).toISOString(),
      fulfilled: 0,
      card_id: null,
      creator: { mid: '2', name: '音乐怪', avatar: null },
      top_answer: null,
    },
    {
      signal_id: 3,
      aid: 112233445568,
      video_title: '下一集什么时候（MOCK）',
      content: '蹲下集',
      occurred_at: new Date(Date.now() - 3 * 86400_000).toISOString(),
      fulfilled: 0,
      card_id: null,
      creator: { mid: '3', name: '更新鸽子', avatar: null },
      top_answer: null,
    },
  ];
  const filtered =
    filter === 'fulfilled' ? items.filter((x) => x.fulfilled) :
    filter === 'pending'   ? items.filter((x) => !x.fulfilled) :
    items;
  return Promise.resolve({
    total: items.length,
    fulfilled: items.filter((x) => x.fulfilled).length,
    pending: items.filter((x) => !x.fulfilled).length,
    items: filtered,
  });
}
```

### Step 2 · 在 client.js 顶部 import + 末尾 export

Edit `demo/frontend/src/api/client.js`:

```diff
-import { mockBootstrap, mockAmbientTick, mockResetDemo } from '../mock/index.js';
+import { mockBootstrap, mockAmbientTick, mockResetDemo, mockMyComments } from '../mock/index.js';
```

文件末尾追加：

```js
/**
 * 我的评论（C1 · MyCommentsPanel）
 * filter: 'all' | 'fulfilled' | 'pending'
 */
export async function getMyComments(filter = 'all') {
  if (IS_MOCK) return mockMyComments(filter);
  return handle(await fetch(`/api/my-comments?filter=${encodeURIComponent(filter)}`));
}
```

### Step 3 · 浏览器验证

```bash
# 复用 dev server
```

- [ ] 切到"我的评论" tab → 显示 3 条 mock 数据（仅在 `VITE_MOCK=1` build 下；dev 下会尝试真 fetch 404 后静默降级为空态）
- [ ] 点"已答"筛选 → 只剩 "焦糖褐色外套开箱"
- [ ] 点"等待中" → 剩 2 条
- [ ] 点"看卡 →"（仅已答项可见）→ 切到信息流 tab（因为本地 cards 里没这个 mock-card-A，spotlight 不变，但 tab 切换应成功）

### Step 4 · Commit

```bash
cd /Users/sevencolor/code/0BKHDD/.worktrees/dundao-bilibili
git add demo/frontend/src/api/client.js demo/frontend/src/mock/index.js
git commit -m "$(cat <<'EOF'
feat(bilibili): T7.5·api client getMyComments + mock fallback

dev 模式走真 fetch /api/my-comments?filter=...；
VITE_MOCK=1 build 走 mockMyComments 返回 3 条示例数据，
用来验证 MyCommentsPanel UI 在无后端时也能看。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task T7.6 · 端到端 smoke

**Files:**
- 无修改（仅验证）

### Step 1 · 启动完整栈（需 T1-T6 backend 完成）

打三个 terminal：

```bash
# Terminal 1: backend
cd /Users/sevencolor/code/0BKHDD/.worktrees/dundao-bilibili/demo/backend
npm install
npm run migrate  # T1 产物
npm run dev

# Terminal 2: frontend
cd /Users/sevencolor/code/0BKHDD/.worktrees/dundao-bilibili/demo/frontend
npm install
npm run dev

# Terminal 3: 灌测试数据
cd /Users/sevencolor/code/0BKHDD/.worktrees/dundao-bilibili/demo/backend
node -e "
import('./src/db.js').then(({ getDb }) => {
  const db = getDb();
  db.prepare(\`INSERT INTO intent_signals(user_id, creator_id, video_id, video_title, signal_type, raw_text, topic, occurred_at, fulfilled, aid, rpid, source)
              VALUES ('demo-user', 'test-up-1', 'av112233', '测试视频 · 蹲 BGM', 'comment_intent', '蹲 BGM', 'test-topic-bgm', datetime('now','-5 days'), 0, 112233, 999001, 'hook')\`).run();
  db.prepare(\`INSERT INTO creators(id, handle, display, avatar, bio) VALUES ('test-up-1', 'testup1', '测试 UP', null, '测试')\`).run();
  console.log('seeded');
});
"
```

### Step 2 · 验证 checklist

- [ ] 打开 `localhost:5173` · 默认 tab 是"信息流"，能看到 filler 视频
- [ ] 切到"我的评论" · 看到 1 条待答 item ("测试视频 · 蹲 BGM")
- [ ] 筛选 `等待中` → 还是这 1 条
- [ ] 筛选 `已答` → 空态
- [ ] 头部统计文字："1 条评论 · 0 已答 · 1 等待中"

### Step 3 · 清理

```bash
cd /Users/sevencolor/code/0BKHDD/.worktrees/dundao-bilibili/demo/backend
sqlite3 data/dundao.db "DELETE FROM intent_signals WHERE rpid=999001; DELETE FROM creators WHERE id='test-up-1';"
```

### Step 4 · No commit needed

本 task 仅验证，无代码修改，不 commit。

---

## Self-Review

**Spec coverage**：
- [x] spec §5.3 · 裁剪前端（去 AgentPanel, 加 MyCommentsPanel） — T7.1/T7.2/T7.3
- [x] spec §7.1 · `GET /api/my-comments` 调用 — T7.5
- [x] spec §7.1 · `{fulfilled, pending, items[]}` 响应 shape 消费 — T7.3

**Placeholder scan**：
- [x] 所有 diff 段都有完整 before/after
- [x] 所有 code block 无 "..." "TBD" "similar to above"
- [x] Commit message 带 Co-Authored-By footer

**Type consistency**：
- `myComments: { total, fulfilled, pending, items }` · 与 spec §7.1 响应一致
- `focusCard(cardId)` · 在 T7.2 被 ProductPanel 调用，在 T7.4 被定义 — 一致
- `fetchMyComments(filter)` · 在 T7.3 被调用，在 T7.4 被定义，filter 类型 `'all'|'fulfilled'|'pending'` 一致

**Frontend gaps**：
- AgentPanel.jsx / AgentMind.jsx 等**源文件保留**（只删挂载）· 若后续想彻底移除，新开 task
- 12 主题系统不动 · 本 plan 未验证主题切换在单栏下所有布局正常，smoke 抽查即可
