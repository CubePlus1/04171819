# 06 · MindCanvas 5 相位 · 让 AI 看得见

> 读完这篇，你能讲清"为什么 5 步之外还要 5 相位"，以及 MindCanvas 在做什么。

## 一句话先

> **"5 步是后端的事，5 相位是让评委看见的事 —— 契约分开，这样未来哪一边改都不互相牵连。"**

## 5 步 vs 5 相位：两套独立契约

**5 步**（`workflow.step` 事件的 `step` 字段）：
- 是**后端管线的顺序号**：1→2→3→4→5
- 字段名"硬"：`step: 1` `step: 2` ...
- 变了意味着契约改 · 前端依赖

**5 相位**（`mind.phase`）：
- 是**可视化阶段名**：`scan` / `recall` / `match` / `seal` / `emit`
- 字段名"软"：可以独立演化
- 即使未来后端把 5 步合成 4 步，相位仍可能保留 5 个（视觉节奏需要）

### 两者映射表

| step | phase | 直觉 |
|---|---|---|
| 1 | scan | 扫描她还惦记着的 |
| 2 | recall | 挑中一条 |
| 3 | match | 和博主新动作对上 |
| 4 | seal | 原子声明 · 金印落下 |
| 5 | emit | 浮到信息流 |

映射常量在 `shared/contracts.js`：

```js
export const STEP_TO_MIND_PHASE = Object.freeze({
  1: MIND_PHASES.SCAN,
  2: MIND_PHASES.RECALL,
  3: MIND_PHASES.MATCH,
  4: MIND_PHASES.SEAL,
  5: MIND_PHASES.EMIT,
});
```

### 为什么这个映射要分开

假设未来产品要在 step 2 和 step 3 之间加一步"判断是否敏感内容过滤"（step 2.5）：
- 如果 mind.phase 直接用 step number，前端 MindCanvas 逻辑要改
- 现在 phase 是独立命名，后端加 2.5 时仍可以复用 `match` 相位（视觉不改）

**同样的解耦适用于：**
- 未来把 step 1+2 合并 → phase 可以保持 scan+recall 两个视觉阶段
- 未来去掉 step 3（match 隐式化）→ phase 可以由前端动画自己合并

**契约隔离 · 前后端可以各自演化。**

## 每一相位的视觉设计

### `scan` · 呼吸（step 1 · ~400ms）
所有未履约节点柔和呼吸。背景光晕浅浅铺。这一阶段 nodes 快照完整下发给前端。

**视觉隐喻**：AI 在"看"她的痕迹。
**reduced-motion 下**：关闭呼吸，仅静态显示所有节点。

### `recall` · 浮起（step 2 · ~400ms）
其中一个 signal 节点放大 + 光圈扩散。其余节点暗淡。

**视觉隐喻**：AI 想起了这一条。
**reduced-motion 下**：focus 节点直接变大，无过渡动画。

### `match` · 连线（step 3 · ~400ms）
从 focus signal 到 focus action 画一条虚线 · path 从 0→1 绘制。

**视觉隐喻**：两端对上了。
**reduced-motion 下**：连线直接出现，不绘制动画。

### `seal` · 金印（step 4 · ~400ms）
focus signal 上空一个金色圆环从 r=0 扩散到 r=14 · 透明度 0→1→0。

**视觉隐喻**：AI 在这件事上盖了个章 · 已接住。
**reduced-motion 下**：金印跳过，不显示。

### `emit` · 飞出（step 5 · ~600ms）
focus signal 向左上飞出 · 透明度下降。模糊滤镜让它变淡。

**视觉隐喻**：卡片从 AI 那里飞到左侧信息流。
**reduced-motion 下**：节点原地消失，不做位移动画。

## 数据下发的**分层策略**

每个 `workflow.step` 事件的 `mind` 字段只带**需要的那些**：

```js
// step 1 (scan) · 下发完整 nodes 快照（后续步骤不再下发）
mind: {
  phase: 'scan',
  nodes: [...],   // 所有 signal + creator_action 节点
  open_count: 3,
}

// step 2 (recall) · 只带 focus
mind: {
  phase: 'recall',
  focus_signal_id: 'signal:1',
  topic: 'dashan-knit-top',
}

// step 3 (match) · signal + action 配对
mind: {
  phase: 'match',
  focus_signal_id: 'signal:1',
  focus_action_id: 'action:2',
  topic: 'dashan-knit-top',
  script: 'A',
}

// step 4 (seal) · 确认性成功状态
mind: {
  phase: 'seal',
  focus_signal_id: 'signal:1',
  focus_action_id: 'action:2',
  topic: 'dashan-knit-top',
  card_id: 'card_xxx',
}

// step 5 (emit) · 同 seal + 触发飞出
mind: {
  phase: 'emit',
  focus_signal_id: 'signal:1',
  focus_action_id: 'action:2',
  topic: 'dashan-knit-top',
  card_id: 'card_xxx',
}
```

**为什么只在 step 1 下发 nodes？**
Nodes 可能有几十上百个。如果每步都下发，wire 体积 5 倍。前端 `useDemoStore.applyStep` 把 frame 挂到对应 step，`AgentMind` 组件从最近一次 scan 缓存里拿 nodes —— 只接 focus 信息即可。

## Smoke 断言 · 契约稳定性

`demo/backend/src/smoke.js` 里强制：

```js
// 每一条 workflow.step 都必须带 mind.phase（契约）
const phasesActual = run.map((f) => f.payload.mind?.phase);
const phasesExpect = ['scan', 'recall', 'match', 'seal', 'emit'];
assert(
  JSON.stringify(phasesActual) === JSON.stringify(phasesExpect),
  `mind.phase 序列正确`,
);

const scanFrame = run.find((f) => f.payload.step === 1);
assert(
  Array.isArray(scanFrame?.payload.mind?.nodes) && scanFrame.payload.mind.nodes.length > 0,
  `mind.nodes 在 step 1 下发完整快照`,
);

const matchFrame = run.find((f) => f.payload.step === 3);
assert(
  matchFrame?.payload.mind?.focus_signal_id?.startsWith('signal:') &&
    matchFrame?.payload.mind?.focus_action_id?.startsWith('action:'),
  'match 阶段携带 focus_signal_id / focus_action_id',
);
```

这些断言确保：
- 5 相位顺序不变
- step 1 下发完整 nodes
- match 阶段 focus 信息齐全

任何修改 ambient.js 的 mind 字段都会被 smoke 抓住。

## 展台讲 MindCanvas

**30 秒版**：
> "这是 AI 工作时的可视化。左边是她的念头，右边是博主的动作。AI 先扫描一遍（scan），挑中一条念头（recall），和博主的动作连线（match），在数据库里盖章声明（seal），最后送到她的信息流（emit）。每一步都在这里看得见，不是黑盒。"

**触摸到争议点时**（"这也是规则引擎，不是真 AI"）：
> "AI 的决策透明化 —— 您能看见它是怎么挑的、怎么连的、怎么落地的。AI 被前台化，这本身是产品定义的一部分。"

## 一句话版本（背下来）

> **"5 步是后端管线，5 相位是前端可视化 —— 两个契约分开演化。MindCanvas 的 scan→recall→match→seal→emit 让 AI 决策前台化，评委一眼看懂 AI 在做什么。"**

## 常见问答

**Q："为什么 5 个 phase 不是 3 个或 7 个？"**
A：5 个正好覆盖"观察 → 决策 → 配对 → 落地 → 推送"这 5 种语义单元。少了任何一个，视觉节奏就断。多了，评委跟不上（9 秒塞不下）。

**Q："MindCanvas 有 accessibility 吗？"**
A：
- `role="img"` + `aria-label`（随 phase 变动） · 屏幕阅读器能读当前 phase
- `prefers-reduced-motion` 下关闭所有动画 · 只保留节点位置和 focus 高亮
- 不通过颜色单一区分（形状 + 颜色并用）

**Q："reduced-motion 下演示会不会很难看？"**
A：不会 —— reduced-motion 下 MindCanvas 显示**静态图谱** · 所有节点、连线、focus 都展示 · 只是没有动画过渡。这是 accessibility 的正确表现，也是演示的 fallback。

**Q："如果 MindCanvas 挂了，还能演吗？"**
A：能。MindCanvas 只是可视化 · 底层 5 步管线照常跑 · 卡片照常生成。右面板下面的 `<details>` 里还有 5 步的详细文字版 · 可展开。这是**视觉降级**路径。
