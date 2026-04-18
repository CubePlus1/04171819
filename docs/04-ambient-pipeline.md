# 04 · Ambient 管线实现

**主入口**：`demo/backend/src/ambient.js`
**契约**：`shared/contracts.js` 的 `MIND_PHASES` + `STEP_TO_MIND_PHASE`

## 入口函数

```js
export async function runAmbient({
  userId,
  runId = newRunId(),      // 可自动生成
  topic = null,             // 可选精确主题
  signalId = null,          // 可选精确信号
  onStep,                   // 每步回调（WS 广播用）
  stepDelayMs = 400,        // 每步间隔
}) { ... }
```

返回 `{ ok, runId, card?, reason? }`。

## 5 步 · 每步字段形状

每步通过 `onStep(stepFrame)` 回调下发。`stepFrame` 结构：

```js
{
  run_id: string,     // 这次 tick 唯一 id
  step: 1..5,          // 步骤序号
  name: string,        // 人话版步骤名
  detail: object,      // 业务细节（每步不同）
  mind: object,        // 可视化数据（每步不同）
}
```

下面列每一步的 detail + mind 字段。

---

### Step 1 · scan

查 `intent_signals` 表，统计未履约数量。下发完整 mind.nodes 快照。

```js
{
  step: 1,
  name: "她还惦记着的",
  detail: {
    total: <int>,        // 该 user 总信号数
    open: <int>,         // 未履约的
    note: "3 件事还没接回来"  // 人话
  },
  mind: {
    phase: "scan",
    nodes: [
      { id: "signal:1", kind: "signal", topic: "...", label: "...", signal_type: "...", fulfilled: false, occurred_at: "..." },
      { id: "action:2", kind: "action", topic: "...", action_type: "...", occurred_at: "..." },
      ...
    ],
    open_count: <int>
  }
}
```

**实现**：`snapshotMindNodes(db, userId)` 查出 signals + actions · 转成统一 node 格式。

---

### Step 2 · recall

挑选下一条要履约的信号。

```js
{
  step: 2,
  name: "挑中这一条",
  detail: {
    hit: true,
    signal: {
      id: <int>,
      text: "蹲链接姐妹们",
      video_title: "...",
      occurred_at: "..."
    },
    creator: "大山的穿搭日记",
    recall: "她在「大山的穿搭日记」下评论过「蹲链接姐妹们」"
  },
  mind: {
    phase: "recall",
    focus_signal_id: "signal:1",
    topic: "dashan-knit-top"
  }
}
```

**失败分支**（没找到可接的）：
```js
{
  detail: {
    hit: false,
    reason: "这一次还没找到能接回来的"
  },
  mind: {
    phase: "recall",
    focus_signal_id: null,
    reason: "no-match"
  }
}
```

**实现**：`pickNextCandidate(db, { userId, topic, signalId })` SQL。

---

### Step 3 · match

识别 creator action + 决定 script（A/B/C）。

```js
{
  step: 3,
  name: "博主今天的新动作",
  detail: {
    creator: "大山的穿搭日记",
    action_type: "post_link",
    action_summary: "她把你蹲过的款放出了平替链接",
    script: "A"
  },
  mind: {
    phase: "match",
    focus_signal_id: "signal:1",
    focus_action_id: "action:2",
    topic: "dashan-knit-top",
    script: "A"
  }
}
```

**实现**：`ACTION_TO_SCRIPT` 映射（硬编码常量）+ `action.payload_json` 解析。

---

### Step 4 · seal

原子声明 + 入库。

**成功分支**：
```js
{
  step: 4,
  name: "记到她的履约里",
  detail: {
    card_id: "card_xxx",
    script: "A",
    fulfilled_signal_id: 1
  },
  mind: {
    phase: "seal",
    focus_signal_id: "signal:1",
    focus_action_id: "action:2",
    topic: "dashan-knit-top",
    card_id: "card_xxx"
  }
}
```

**失败分支**（并发输）：
```js
{
  detail: {
    ok: false,
    reason: "这条刚刚被抢先接走了"
  },
  mind: {
    phase: "seal",
    focus_signal_id: "signal:1",
    focus_action_id: "action:2",
    topic: "dashan-knit-top",
    ok: false,
    reason: "signal-already-fulfilled"
  }
}
```

**实现** · 原子事务：
```js
const persistTx = db.transaction(() => {
  const r = claimStmt.run(card.intent_signal_id);
  if (r.changes !== 1) {
    const err = new Error('signal-already-fulfilled');
    err.code = 'SIGNAL_ALREADY_FULFILLED';
    throw err;
  }
  insertCardStmt.run({
    id, user_id, script_id, intent_signal_id, creator_action_id, pages_json
  });
});
```

---

### Step 5 · emit

推送卡片。

```js
{
  step: 5,
  name: "浮到她的信息流",
  detail: {
    card_id: "card_xxx",
    pages: ["P1", "P2"],
    preview_context: "你 3 周前在大山的穿搭日记里评论过「蹲链接姐妹们」"
  },
  mind: {
    phase: "emit",
    focus_signal_id: "signal:1",
    focus_action_id: "action:2",
    topic: "dashan-knit-top",
    card_id: "card_xxx"
  }
}
```

**实现**：`stepFrame` 之后由 `server.js` 的路由 broadcast `card.generated` 事件 · 包含完整 card payload。

---

## pickNextCandidate 完整 SQL

```sql
SELECT s.*,
       ca.id AS action_id,
       ca.action_type,
       ca.payload_json,
       ca.occurred_at AS action_occurred,
       c.handle,
       c.display AS creator_display,
       c.avatar AS creator_avatar,
       c.bio AS creator_bio
  FROM intent_signals s
  JOIN creator_actions ca ON ca.topic = s.topic
  JOIN creators c ON c.id = s.creator_id
 WHERE s.user_id = ? AND s.fulfilled = 0
   AND NOT EXISTS (
     SELECT 1 FROM cards cd
       JOIN intent_signals si ON si.id = cd.intent_signal_id
      WHERE cd.user_id = s.user_id AND si.topic = s.topic
   )
 ORDER BY s.occurred_at ASC, ca.occurred_at DESC
 LIMIT 1
```

**排序规则**：
- `s.occurred_at ASC` · 她惦记最久的那条（情感上最饱满）
- `ca.occurred_at DESC` · 博主最新的那个动作（更新鲜）

**排除**：主题下任何已履约的 → 整个 topic 不再挑。

---

## hasPendingAmbient（bootstrap 返回 pending）

```sql
SELECT COUNT(DISTINCT s.topic) AS c
  FROM intent_signals s
  JOIN creator_actions ca ON ca.topic = s.topic
 WHERE s.user_id = ?
   AND s.fulfilled = 0
   AND NOT EXISTS (
     SELECT 1 FROM cards cd
       JOIN intent_signals si ON si.id = cd.intent_signal_id
      WHERE cd.user_id = s.user_id AND si.topic = s.topic
   )
```

`COUNT(DISTINCT s.topic) > 0` 即 pending=true。

---

## Card Builder 接口

`cardBuilder.js:buildCard({ match, intentResult, userId })` 返回：

```js
{
  id: "card_xxx",
  user_id: "demo-user",
  script_id: "A",
  intent_signal_id: 1,
  creator_action_id: 2,
  pages: [
    { id: "P1", name: "情景 + 答案",
      context_line: "你 3 周前在「大山的穿搭日记」里评论过「蹲链接姐妹们」",
      emotional_close: "当时蹲的，这次替你接住了",
      answer: { type: "product_card", video: {...}, product: {...}, summary: "..." },
      actions: { primary: [...], secondary: [...] },
      creator: { id: "creator-dashan", display: "..." } },
    { id: "P2", name: "AI 解释",
      trigger_signal: "你在《磨毛上衣》下评论「蹲链接姐妹们」",
      ai_intent: "蹲链接 · 把握度 94%",
      rationale: "...",
      matched_basis: "她把你蹲的款式放出了平替链接",
      warm_summary: "..." }
  ]
}
```

**页结构**取决于 `SCRIPT_TO_PAGES`：
- A: P1 + P2
- B: P1 + P3
- C: P1 + P2 + P3

---

## 5 步时间轴

```
0ms     tick POST 到达后端
        ├─ snapshotMindNodes
        ├─ onStep(1 · scan)     → WS broadcast
        ├─ await sleep 400ms
400ms   ├─ pickNextCandidate
        ├─ onStep(2 · recall)   → WS broadcast
        ├─ await sleep 400ms
800ms   ├─ buildCard(...)
        ├─ onStep(3 · match)    → WS broadcast
        ├─ await sleep 400ms
1200ms  ├─ db.transaction: claim + insert
        ├─ onStep(4 · seal)     → WS broadcast
        ├─ await sleep 400ms
1600ms  ├─ onStep(5 · emit)     → WS broadcast
        ├─ broadcast card.generated
        └─ broadcast workflow.end ok=true
1600ms  HTTP 200 返回
```

总耗时 ~1.6 秒 · 加上前端 framer-motion 卡片浮入 0.4s ≈ 2 秒 step 5 结束。

## 前端如何消费

`useDemoStore.applyStep(frame)`：

```js
applyStep: (frame) => set((state) => {
  if (state.activeRunId && frame?.run_id && state.activeRunId !== frame.run_id) return state;
  const steps = state.steps.map((s) => {
    if (s.step < frame.step) return { ...s, status: 'done' };
    if (s.step === frame.step) {
      return {
        ...s,
        status: 'active',
        detail: frame.detail,
        name: frame.name,
        mind: frame.mind ?? s.mind,  // 保留 mind 字段
      };
    }
    return s;
  });
  return { steps };
})
```

`AgentMind.jsx` 订阅 `state.steps` · 取最近一个活跃 step 的 mind · 按 phase 驱动动画。

## 扩展点

### 替换意图分类为 LLM

现在 `classifyIntent(text)` 是规则 · 接 LLM：

```js
export async function classifyIntent(text) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Classify intent from Chinese comment...' },
        { role: 'user', content: text }
      ],
      response_format: { type: 'json_object' }
    })
  });
  const j = await resp.json();
  return JSON.parse(j.choices[0].message.content);
}
```

接入方式 · 函数签名保持 `(text) → { intent, confidence, rationale, topic_hint }` 不变。

### 替换 topic 抽取为 embedding

现在 topic 靠硬编码 · 生产用 embedding 聚类：

```js
async function inferTopic(rawText) {
  const embedding = await embed(rawText);
  const cluster = await findNearestCluster(embedding);
  return cluster.topic;
}
```

然后 `intent_signals.topic` 字段改存聚类结果。

## 下一步

→ [05-theme-system.md](./05-theme-system.md)
→ [07-testing-matrix.md](./07-testing-matrix.md)
