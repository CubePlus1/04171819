# 06 · 前端组件树

## 组件层级

```
App.jsx                                   ← 全局 WS 接线 + MotionConfig + Toast
├── Header                                ← 顶栏（user / connected / ThemeSwitcher / reset）
├── ErrorBanner                           ← bootstrap 失败
├── <main grid-12>
│   ├── ProductPanel                      ← 左面板
│   │   └── Feed                          ← 信息流 + 卡片插入
│   │       ├── FeedItem (xN)             ← 普通视频
│   │       └── DunCard                   ← 多页履约卡
│   │           ├── CardPageP1            ← P1 · 情景 + 答案
│   │           │   ├── AnswerProduct     ← 剧本 A · 商品卡
│   │           │   ├── AnswerSeries      ← 剧本 B · 系列网格
│   │           │   └── AnswerInline      ← 剧本 C · 内嵌视频
│   │           ├── CardPageP2            ← P2 · AI 解释
│   │           └── CardPageP3            ← P3 · 行为足迹
│   └── AgentPanel                        ← 右面板
│       ├── AmbientPulse                  ← 自动节奏指示器
│       ├── AgentMind                     ← MindCanvas 可视化
│       ├── TriggerPicker                 ← 3 触发器按钮
│       ├── <details>                     ← 折叠 "查看 AI 背后的 5 步"
│       │   └── AgentWorkflow
│       │       └── AgentStep (×5)        ← 每步 UI + Detail
│       └── 历史列表（她曾经放不下的这些事）
└── Toast                                 ← 全局轻提示
```

## 关键组件职责

### App.jsx

- WS 生命周期管理（连接 · 重连 · epoch 校验）
- bootstrap 拉取 + 错误 banner
- `reducedMotion` 检测 · 透传 `MotionConfig`
- 全局 toast state
- 主题 hook 挂载
- 快捷键 `[` `]` 切主题

### useDemoStore (Zustand)

**单一全局 state**：

```js
{
  connected: boolean,
  serverEpoch: string | null,

  user, feed, triggers, history, pending,

  cards: Card[],
  spotlightCardId: string | null,

  // 5 步 workflow
  running: boolean,
  activeRunId: string | null,
  steps: [{ step, status, detail, mind }, ...],
  lastCompleted, lastReason,
}
```

**关键 actions**：
- `hydrate(data)` · bootstrap 数据注入 · merge cards
- `beginWorkflow(runId)` · 开始新 run · 重置 steps
- `applyStep(frame)` · 更新 step 状态（含 mind 字段）
- `endWorkflow({ok, ...})` · 结束 run
- `onCardGenerated(card, isLocal)` · 插入新卡片
- `reset()` · 硬复位

### ProductPanel

左面板容器。
只订阅 `cards` + `spotlightCardId` + `user`。
渲染 `Feed` 和状态指示条（已蹲 N · 新卡片浮现中）。
**不**订阅 steps · 和 AI 解耦。

### Feed

**合并逻辑**：把普通视频和生成的卡片交错渲染。
每 3 条 feed 插一张卡片 · 剩余卡片追加末尾。

**自动滚动**：spotlightCardId 变化时 smooth scroll 到那张卡。

**键盘支持**：
- ↑/↓ PageUp/PageDown Space · 滚动一屏
- Home/End · 滚到顶/底

### DunCard

多页卡片容器。
- 键盘：← → Home End 翻页
- 手势：Framer Motion drag 水平滑
- 圆点 tab：点击直达某页
- spotlight prop · 高亮边框 + shadow

根据 `script_id` 渲染 P1/P2/P3 组合。

### AgentPanel

右面板容器。
订阅 `running` / `pending` / `history` / `lastCompleted`。

**自动 tick 引擎**：
```js
useEffect(() => {
  if (!autoOn || !connected || !pending) return;
  if (running || submittingRef.current) return;
  autoTimerRef.current = setTimeout(() => trigger(), 9000);
  return () => clearTimeout(autoTimerRef.current);
}, [autoOn, connected, pending, running, trigger]);
```

**首次 kickoff**：
```js
useEffect(() => {
  if (firstKickoffRef.current) return;
  firstKickoffRef.current = true;
  const t = setTimeout(() => trigger(), 1200);
}, [autoOn, connected, pending, trigger]);
```

### AgentMind (核心可视化)

- 订阅 `steps` · 找最近的 active/done step · 取 mind
- 从 scan phase 缓存 nodes 快照
- 按 phase 渲染 SVG：scan 呼吸 · recall focus · match 连线 · seal 金印 · emit 飞出
- `reducedMotion=always` 时所有 motion 都是 0s duration

### AgentWorkflow / AgentStep

5 步文字版折叠细节。评委想看技术细节时展开。
每步有 idle/active/done/fail 四态 · 对应颜色。
`AgentStep.Detail` 按 step 号 dispatch 到不同渲染分支 · 兼容 ambient 和 comment 两种 detail shape。

### AmbientPulse

呼吸指示器 + 下一次 tick 倒计时 + 立即接一条按钮 + 自动接开关。
核心交互是可视的"AI 正陪着她"感 · 不是冷冰冰的进度条。

### TriggerPicker

3 个剧本触发器（A/B/C）。
点击走 `ambientTick({ topic })`。
文案强调"让 AI 优先接这类" · 不是"输入"。

## 状态流

### 卡片浮入流程
```
WS: card.generated
  ↓
useDemoStore.onCardGenerated(card, isLocal=true)
  ↓
cards 数组 prepend + spotlightCardId = card.id
  ↓
Feed 重新计算 items (useMemo)
  ↓
spotlightRef 指向新卡 · useEffect 触发 smooth scroll
  ↓
DunCard 挂载 · Framer Motion 弹入动画
```

### MindCanvas 驱动流程
```
WS: workflow.step (step=1, mind={phase:'scan', nodes:[...]})
  ↓
applyStep(frame) · step 1 记录 mind
  ↓
AgentMind 订阅 steps · useMemo(pickActiveMindStep(steps))
  ↓
检测到 phase=scan + nodes 非空 · setNodes(快照)
  ↓
渲染所有节点 · 开始 mindBreathe animation
  ↓
(400ms 后) WS: workflow.step (step=2, mind={phase:'recall', focus_signal_id})
  ↓
同上流程 · 但这次不更新 nodes 缓存
  ↓
渲染 focus 节点放大
```

## 防并发与防串台

### 多标签页 client_id
`getClientId()` 从 sessionStorage 读（每 tab 独立 UUID）。
WS 事件带 `client_id` · 前端过滤只处理本 tab 发起的 run。
避免其它 tab 的 tick 污染我的 workflow UI。

### activeRunId 过滤
```js
applyStep: (frame) => set((state) => {
  if (state.activeRunId && frame?.run_id && state.activeRunId !== frame.run_id) return state;
  // ...
});
```

防止两个 overlapping run 的 step frame 互相覆盖。

## 性能优化点

### useMemo
- `Feed` 的 merged items
- `AgentMind` 的 `pickActiveMindStep`
- 主题切换后的 `positioned` nodes

### Framer Motion layout
- `motion.section` 的 `layout` prop · 自动过渡布局变化

### 卡片上限
`MAX_CARDS_IN_UI = 40` · store 层限制 · 防长对话场景内存膨胀。

## 可访问性

- `role="img"` + `aria-label` · AgentMind / DunCard
- `aria-live="polite"` · Toast + 履约到达时的 live region
- `aria-current="page"` · 当前 card page 指示
- 所有按钮 `focus-ring` class（统一 focus 样式）
- 键盘可操作所有交互（Feed 滚动 · Card 翻页 · Trigger 选择）
- `prefers-reduced-motion` 全局尊重（MotionConfig）

## 扩展：加新页

想给 card 加 P4（比如"更多同类推荐"）：

1. `shared/contracts.js` 的 `PAGE_IDS` 加 `P4`
2. `cardBuilder.js` 加 `buildP4(...)` · 更新 `SCRIPT_TO_PAGES`
3. 前端创建 `CardPageP4.jsx`
4. `DunCard.jsx` 的 `PAGE_RENDERERS` 加 `P4: CardPageP4`

5 步管线不用改。

## 下一步

→ [07-testing-matrix.md](./07-testing-matrix.md)
→ [08-config-env.md](./08-config-env.md)
