# 02 · 5 步管线讲得清

> 读完这篇，你能在白板上画出 5 步并解释每一步为什么必要。

## 一句话先

5 步管线讲的是**"AI 在后台干这 5 件事，把一个过去念头接回来"**：

1. **scan** · 她还惦记着什么
2. **recall** · 挑中这一条
3. **match** · 博主今天的新动作
4. **seal** · 记到她的履约里
5. **emit** · 浮到她的信息流

每一步都**必要**、每一步都**可见**（MindCanvas 直接可视化）、每一步都**要讲清**。

## 为什么是 5 步，不是 3 步不是 7 步

5 步是**最小可讲清的颗粒度**：
- 少于 5 步 · 评委脑内补不出 AI 的决策路径 ("你是怎么挑的？")
- 多于 5 步 · 展台 9 秒节奏演不完
- 5 步正好：每步 ~400ms，总共 ~2 秒，MindCanvas 每步一个视觉相位

如果再合并：
- 合并 1+2 · "挑中"这个决策瞬间就失掉了 · 变成 AI 黑箱
- 合并 3+4 · "原子声明" 和"识别博主动作"混在一起 · 并发保护就讲不清了
- 合并 4+5 · "入库"和"推送"混在一起 · 失败半途的情况就没法区分

## 逐步讲解

### Step 1 · scan（她还惦记着什么）

**字面在干什么**
查 `intent_signals` 表，统计这个用户还有多少条 `fulfilled=0` 的信号。下发给前端的节点快照也在这一步产生。

**代码位置**
`demo/backend/src/ambient.js` → `runAmbient()` 里第一个 `onStep?.(stepFrame(runId, 1, '她还惦记着的', ...))`

**为什么必要**
- 没有这一步，MindCanvas 连画什么节点都不知道
- 给评委看见"她还惦记着 N 件事"这个数字本身，就是一次情感击打
- 后续步骤的 focus 节点需要这一步的 nodes 快照做位置锚定

**展台怎么讲**
> "第一步，AI 看了一眼她还惦记着的东西 —— 这些是她过去在评论区、稍后再看、收藏里留下过的痕迹，一直没有被接回来。"

### Step 2 · recall（挑中这一条）

**字面在干什么**
执行 SQL `pickNextCandidate`：挑一条**最旧、未履约、主题尚未被任何卡片履约过**的信号。

**代码位置**
`ambient.js` → `pickNextCandidate()` SQL

**为什么必要**
- 多条未履约信号时需要一个明确的挑选规则（避免随机）
- "最旧的"这个排序规则对应情感设计：**她惦记最久的那件事，最该被接回来**
- 主题级去重是业务约束（见 `04-topic-level-aggregation.md`）

**展台怎么讲**
> "第二步，AI 从这些念头里挑了一条 —— 挑的是她惦记最久的那件事，而且这件事之前没被接回来过。"

### Step 3 · match（博主今天的新动作）

**字面在干什么**
`pickNextCandidate` 同时 JOIN `creator_actions`，找到和这个 topic 相同的博主新动作。action_type 决定落到 A/B/C 哪个剧本。

**代码位置**
`ambient.js` 里 `ACTION_TO_SCRIPT` 映射

**为什么必要**
- 没有博主新动作，就没有"可接回来"的东西 —— 这件事只是"想过"，不是"能接"
- action_type → script 的映射是产品定义的（post_link → A, post_sequel → C, series_completed → B）
- 这一步决定了最终卡片的形态（商品卡 / 系列网格 / 内嵌视频）

**展台怎么讲**
> "第三步，AI 看到博主今天刚好做了个动作 —— 放了链接、发了后续、更完了系列。这个动作和她那条念头正好能对上。"

### Step 4 · seal（记到她的履约里）

**字面在干什么**
在一个 SQLite 事务里：
1. `UPDATE intent_signals SET fulfilled = 1 WHERE id = ? AND fulfilled = 0` · 检查 `changes === 1`
2. `INSERT INTO cards ...` · 创建履约卡片记录

**代码位置**
`ambient.js` → `persistTx = db.transaction(() => {...})`

**为什么必要**
- 并发保护：两条请求同时找到同一条信号时，只有一条能 claim 成功（`changes === 1`）
- 防重复履约：UNIQUE INDEX on `cards(intent_signal_id)` 是第二层保险
- "记下来"是一种情感动作，让评委理解 AI 不是一次性触发，而是**替用户保管这件事**

**展台怎么讲**
> "第四步，AI 把这件事记到她的履约里 —— 从此这条念头算是接回来了，不会再重复。如果同一时刻有两个后台都想接它，只有一个能成功，另一个会看到已经被抢先接走了。"

（这是**讲并发保护最自然的时机**。）

### Step 5 · emit（浮到她的信息流）

**字面在干什么**
通过 WebSocket 广播 `card.generated` 事件，前端收到后把卡片插入到 `Feed` 里，高亮浮现。

**代码位置**
`ambient.js` 最后一个 `onStep?.(stepFrame(runId, 5, ...))` + server.js 里 `broadcast(WS_EVENTS.CARD_GENERATED, ...)`

**为什么必要**
- 这是用户**真正"刷到"履约的那一刻**
- 前后端解耦 · 后端只负责生产，前端负责呈现
- 广播模型让所有打开的标签页都能看到（多屏演示场景）

**展台怎么讲**
> "第五步，AI 把这张履约卡片浮到她的信息流里 —— 就是您左边看到的那一张。她只是在刷，它就在那儿等她刷到。"

## 一次完整 tick 的时间轴

```
0.0s  tick POST → workflow.begin 广播
0.4s  step 1 scan   → mind.phase=scan    · 节点快照
0.8s  step 2 recall → mind.phase=recall  · focus signal 亮起
1.2s  step 3 match  → mind.phase=match   · signal ↔ action 连线
1.6s  step 4 seal   → mind.phase=seal    · 原子声明成功 · 金印落下
2.0s  step 5 emit   → mind.phase=emit    · 卡片浮入左侧
      card.generated 广播
      workflow.end ok=true
2.0s ~ 9.0s  评委观察卡片 · 可选左右滑看 P1/P2/P3 多页
9.0s  下一次 tick 开始
```

9 秒一个周期 · 评委看不完不急 · 下一轮自然启动。

## 失败路径讲得清

5 步不是每一步都必定成功。3 类失败，每类怎么讲：

### 失败 A · scan 后发现没有可接的 (`no-match`)
原因：所有 topic 都已经被接过了（3 个剧本都履约完），或者根本没有未履约信号配对。

**展台讲法**：
> "她的念头这一轮都接完了 —— 您看右下方显示 `pending=false`。按 `重置演示` 可以让她重新拥有 3 件未履约的事。"

### 失败 B · seal 阶段并发输（`signal-already-fulfilled`）
原因：两个请求同时抢同一条信号，只有一个赢。

**展台讲法**：
> "这就是并发保护 —— 同一瞬间两个后台都想接这条，我们用一个原子 UPDATE 让只有一个能成功。您看左面板只有一张卡片，不会重复。"

### 失败 C · 服务器内部错误（`server-error`）
原因：DB 死锁、disk full、代码 bug 等。

**展台讲法**：
> "我们的 WebSocket 会广播 workflow.end with ok=false，前端 toast 提示'刚刚没接住'，下一轮会自然继续。不会把 UI 卡死。"

## 一句话版本（背下来）

> **"AI 后台做 5 件事把一个过去念头接回来 —— 扫描 → 挑中 → 配对 → 记下 → 浮出。每件都 400ms，整套 2 秒演完。这 5 件事都在 MindCanvas 里看得见，不是黑盒。"**

## 5 步对应的事件形状

每一步通过 WebSocket 发一个 `workflow.step` 事件，形状是：

```js
{
  run_id: "run_xxx",       // 这次 tick 的唯一 id
  step: 1,                 // 1..5
  name: "她还惦记着的",      // 人话版名字
  detail: { ... },         // 这一步的业务细节
  mind: {                  // MindCanvas 要的数据
    phase: "scan",         // scan|recall|match|seal|emit
    nodes: [...],          // 只 step 1 下发完整
    focus_signal_id: ...,
    focus_action_id: ...,
    card_id: ...,
  }
}
```

前端 `useDemoStore.applyStep` 把这个 frame 挂到 `steps[step-1]` 上，`AgentMind` 按 phase 渲染。

**`mind.phase` 是独立于 `step` 的契约**：代码里 `STEP_TO_MIND_PHASE = {1:'scan', 2:'recall', 3:'match', 4:'seal', 5:'emit'}` 只是当前映射；未来如果 step 拆/合，mind.phase 可以自己演化而不破坏前端。
