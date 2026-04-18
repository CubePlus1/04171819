# 02 · API 契约

**唯一事实源**：`demo/shared/contracts.js`
本文档是它的可读描述。

## HTTP Endpoints

所有端点返回 JSON `content-type: application/json`。所有错误返回 `{ ok: false, error: <reason code> }`。

### GET /api/health

Liveness check。

**Response 200**：
```json
{ "ok": true, "ts": 1234567890 }
```

---

### GET /api/epoch

当前服务实例 epoch（每次 reset 会变）。前端重连后对比 epoch · 不一致则清本地 stale 数据。

**Response 200**：
```json
{ "ok": true, "epoch": "mX3pZqK2" }
```

---

### GET /api/bootstrap

一次拉完演示所需的所有数据。

**Response 200**：
```json
{
  "server_epoch": "mX3pZqK2",
  "user": {
    "id": "demo-user",
    "nickname": "小栗子🌰",
    "avatar": "..."
  },
  "feed": [
    { "id": "feed-filler-1", "kind": "video", "creator": "...", "title": "...", "cover": "...", "likes": "12.4w", "tag": "咖啡" },
    ...6 条
  ],
  "triggers": [
    { "id": "trigger-A", "label": "蹲链接 · 链接型", "script": "A", "topic": "dashan-knit-top", "hint": "..." },
    { "id": "trigger-B", ... },
    { "id": "trigger-C", ... }
  ],
  "pending": true,
  "history": [
    {
      "id": 1,
      "user_id": "demo-user",
      "creator_id": "creator-dashan",
      "creator_display": "大山的穿搭日记",
      "creator_avatar": "...",
      "video_title": "这件磨毛圆领打底",
      "signal_type": "comment_intent",
      "raw_text": "蹲链接姐妹们",
      "topic": "dashan-knit-top",
      "occurred_at": "2025-03-28T12:34:56.789Z",
      "fulfilled": 0
    },
    ...至少 5 条
  ],
  "cards": [
    { "id": "card_xxx", "user_id": "demo-user", "script_id": "A", ..., "pages": [/* P1/P2/P3 */] },
    ...最多 30 条（最新）
  ]
}
```

---

### POST /api/ambient/tick

**主路径**。触发一次 AI ambient 履约。

**Request body**：
```json
{
  "userId": "demo-user",           // 可选，默认 demo-user
  "clientId": "c_xxx",             // 可选，per-tab UUID
  "topic": "dashan-knit-top",      // 可选，精确指定主题
  "signalId": 1                    // 可选，精确指定信号 id
}
```

无 topic / signalId 时，挑"最旧 × 未履约 × 主题未接过"的那条。

**Rate limit**：每 IP 默认 12 burst + 3 refill/s。超限返回：
```
429 Retry-After: <秒>
{ "ok": false, "error": "rate-limited", "retry_after": "0.33" }
```

**Response 200**（成功）：
```json
{
  "ok": true,
  "runId": "run_abc-xxx",
  "pending": true,           // 是否还有可履约主题
  "cardId": "card_xxx"
}
```

**Response 200**（无可接）：
```json
{
  "ok": false,
  "runId": "run_abc-xxx",
  "pending": false,
  "reason": "no-match"
}
```

**Response 200**（并发输）：
```json
{
  "ok": false,
  "runId": "run_abc-xxx",
  "pending": true,
  "reason": "signal-already-fulfilled"
}
```

---

### POST /api/comment (遗留)

评论触发路径。保留用于 `runWorkflow` 向后兼容 smoke 测试。

**Request body**：
```json
{ "text": "蹲链接姐妹们", "userId": "demo-user", "clientId": "c_xxx" }
```

走 `workflow.js:runWorkflow`（意图分类 + 匹配）。响应结构与 ambient 相似。

真实产品不使用此路径。

---

### POST /api/reset

清库 + 重 seed + 递增 epoch。

**Restriction**：仅 loopback（`127.0.0.1` / `::1` / `localhost`）。需要远程请设 `ALLOW_REMOTE_RESET=1`。

**In-flight drain**：reset 前等最多 3s 让 in-flight workflow 跑完。等不到返回 409。

**Response 200**：
```json
{ "ok": true, "epoch": "mX3pZqK_new" }
```

**Response 403**：
```json
{ "ok": false, "error": "reset is local-only" }
```

**Response 409**：
```json
{ "ok": false, "error": "in-flight-workflow" }
```

---

## WebSocket /ws

**Origin 校验**：握手阶段 verifyClient 检查 · 非 allowlist origin 返回 403。

连接后立刻收到 `ws.hello`：
```json
{ "type": "ws.hello", "ts": 1234567890 }
```

## WS 事件类型

见 `shared/contracts.js` 的 `WS_EVENTS`：

```js
export const WS_EVENTS = {
  HELLO:             'ws.hello',
  WORKFLOW_BEGIN:    'workflow.begin',
  WORKFLOW_STEP:     'workflow.step',
  WORKFLOW_END:      'workflow.end',
  CARD_GENERATED:    'card.generated',
  DEMO_RESET:        'demo.reset',
  SERVER_SHUTDOWN:   'server.shutdown',
};
```

### workflow.begin

一次 tick 开始。

```json
{
  "type": "workflow.begin",
  "ts": 1234567890,
  "payload": {
    "run_id": "run_abc",
    "client_id": "c_xxx",
    "ambient": true,
    "userId": "demo-user"
  }
}
```

### workflow.step

5 步中的每一步。

```json
{
  "type": "workflow.step",
  "ts": 1234567890,
  "payload": {
    "run_id": "run_abc",
    "step": 1,                  // 1-5
    "name": "她还惦记着的",
    "detail": { /* step 具体数据 · 见 04-ambient-pipeline.md */ },
    "mind": {                    // 可视化数据
      "phase": "scan",           // scan/recall/match/seal/emit
      "nodes": [...],            // 只 step 1 下发
      "focus_signal_id": ...,    // step 2+ 有
      "focus_action_id": ...,    // step 3+ 有
      "card_id": ...,            // step 4+ 有
      "topic": ...
    },
    "ambient": true
  }
}
```

### card.generated

成功履约后广播完整卡片。

```json
{
  "type": "card.generated",
  "ts": 1234567890,
  "payload": {
    "run_id": "run_abc",
    "client_id": "c_xxx",
    "card": {
      "id": "card_xxx",
      "user_id": "demo-user",
      "script_id": "A",
      "intent_signal_id": 1,
      "creator_action_id": 1,
      "pages": [ /* P1/P2/P3 */ ]
    }
  }
}
```

### workflow.end

一次 tick 结束。

**成功**：
```json
{
  "type": "workflow.end",
  "ts": 1234567890,
  "payload": {
    "run_id": "run_abc",
    "client_id": "c_xxx",
    "ambient": true,
    "ok": true,
    "cardId": "card_xxx"
  }
}
```

**失败**：
```json
{
  "payload": {
    "run_id": "run_abc",
    "ambient": true,
    "ok": false,
    "reason": "no-match" | "signal-already-fulfilled" | "server-error"
  }
}
```

### demo.reset

`/api/reset` 触发时广播。前端收到会清 store 并 re-bootstrap。

```json
{
  "type": "demo.reset",
  "ts": 1234567890,
  "payload": { "epoch": "mX3pZqK_new" }
}
```

### server.shutdown

SIGTERM 关服时广播给所有 client。

```json
{ "type": "server.shutdown", "ts": 1234567890 }
```

## Reason Codes

见 `shared/contracts.js` 的 `REASON_CODES`：

| code | 含义 |
|---|---|
| `no-match` | pickNextCandidate 返回 null · 没有可履约的主题 |
| `signal-already-fulfilled` | 并发输 / 数据已被别人接走 |
| `server-error` | 未预期错误 · 看 logs |
| `rate-limited` | 令牌桶限流 · 客户端应按 retry_after 等待 |
| `in-flight-workflow` | reset 时 drain 超时 |

## Mind Phases

见 `shared/contracts.js` 的 `MIND_PHASES`：

| phase | 对应 step | 视觉 |
|---|---|---|
| `scan` | 1 | 所有节点呼吸 · 下发完整 nodes |
| `recall` | 2 | focus signal 放大 |
| `match` | 3 | signal ↔ action 连线 |
| `seal` | 4 | 金印落下 |
| `emit` | 5 | focus 飞出 |

## 客户端实现要点

### 前端 WS 事件处理

```js
ws.onMessage((msg) => {
  const p = msg.payload;
  const myClient = getClientId();
  const isMine = !p.client_id || p.client_id === myClient;
  switch (msg.type) {
    case WS_EVENTS.WORKFLOW_BEGIN:  if (isMine) beginWorkflow(p.run_id); break;
    case WS_EVENTS.WORKFLOW_STEP:   if (isMine) applyStep(p); break;
    case WS_EVENTS.WORKFLOW_END:    if (isMine) endWorkflow({...}); break;
    case WS_EVENTS.CARD_GENERATED:  onCardGenerated(p.card, isMine); break;
    case WS_EVENTS.DEMO_RESET:      resetStore(); boot(); break;
  }
});
```

`client_id` 过滤用于**多标签防串台**：多个标签页都在同一域名下，WS 广播会到所有标签，但每个标签只处理"自己发起的 run"。

## 下一步

→ [03-data-model.md](./03-data-model.md)
→ [04-ambient-pipeline.md](./04-ambient-pipeline.md)
