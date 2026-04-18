# 03 · 数据模型

**Schema 源**：`demo/backend/data/schema.sql`
**种子源**：`demo/backend/data/fixtures.json`

## 5 张表

| 表 | 行数（seed） | 作用 |
|---|---:|---|
| `users` | 1 | demo user |
| `creators` | 3 | 博主身份 |
| `intent_signals` | 5 | 用户过去留的痕迹 |
| `creator_actions` | 3 | 博主今天的新动作 |
| `cards` | 0 | 已生成履约卡片（运行时填） |

## 表定义

### users
```sql
CREATE TABLE users (
  id           TEXT PRIMARY KEY,
  nickname     TEXT NOT NULL,
  avatar       TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### creators
```sql
CREATE TABLE creators (
  id           TEXT PRIMARY KEY,
  handle       TEXT NOT NULL,
  display      TEXT NOT NULL,
  avatar       TEXT,
  bio          TEXT
);
```

### intent_signals
```sql
CREATE TABLE intent_signals (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT NOT NULL,
  creator_id      TEXT NOT NULL,
  video_id        TEXT NOT NULL,
  video_title     TEXT NOT NULL,
  signal_type     TEXT NOT NULL CHECK (signal_type IN (
    'comment_intent','watch_later','unfinished_save',
    'unsatisfied_search','passive_interest'
  )),
  raw_text        TEXT,           -- 评论原文（signal_type=comment_intent 时必填）
  topic           TEXT NOT NULL,  -- 主题聚合用
  occurred_at     TEXT NOT NULL,  -- ISO8601
  fulfilled       INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id)    REFERENCES users(id),
  FOREIGN KEY (creator_id) REFERENCES creators(id)
);
CREATE INDEX idx_intent_signals_user_topic
  ON intent_signals(user_id, topic, fulfilled, occurred_at);
```

### creator_actions
```sql
CREATE TABLE creator_actions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  creator_id      TEXT NOT NULL,
  action_type     TEXT NOT NULL CHECK (action_type IN (
    'post_link','post_sequel','series_completed','reply_tutorial'
  )),
  payload_json    TEXT NOT NULL,  -- 详细内容（商品信息 / 视频 / 系列缩略图）
  topic           TEXT NOT NULL,  -- 和 intent_signals.topic 配对
  occurred_at     TEXT NOT NULL,
  FOREIGN KEY (creator_id) REFERENCES creators(id)
);
CREATE INDEX idx_creator_actions_topic ON creator_actions(topic, occurred_at DESC);
CREATE INDEX idx_creator_actions_type_time ON creator_actions(action_type, occurred_at DESC);
```

### cards
```sql
CREATE TABLE cards (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL,
  script_id        TEXT NOT NULL CHECK (script_id IN ('A','B','C')),
  intent_signal_id INTEGER,
  creator_action_id INTEGER,
  pages_json       TEXT NOT NULL,  -- P1/P2/P3 整份序列化
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id)           REFERENCES users(id),
  FOREIGN KEY (intent_signal_id)  REFERENCES intent_signals(id),
  FOREIGN KEY (creator_action_id) REFERENCES creator_actions(id)
);
CREATE INDEX idx_cards_user_created ON cards(user_id, created_at DESC);
CREATE UNIQUE INDEX idx_cards_unique_signal
  ON cards(intent_signal_id);     -- 防重复履约的硬护栏
```

## 外键关系

```
users ────────┬───→ intent_signals
              │
              └───→ cards

creators ─────┬───→ intent_signals
              │
              └───→ creator_actions

intent_signals ───→ cards   (UNIQUE)
creator_actions ──→ cards
```

## 关键索引 · 为什么

| 索引 | 支持的查询 |
|---|---|
| `idx_intent_signals_user_topic` | `pickNextCandidate`：按用户 + 主题 + fulfilled 过滤 |
| `idx_creator_actions_topic` | JOIN by topic · 取最新动作 |
| `idx_creator_actions_type_time` | 按 action_type 倒序（`matcher.js` 用） |
| `idx_cards_user_created` | bootstrap 取最近 30 张卡 |
| `idx_cards_unique_signal` | 并发保护 · 拒绝重复履约 |

## Topic 字段的作用

**Topic 是履约的配对键**。
所有 signal 和 action 通过 `s.topic = ca.topic` JOIN。

种子里的 3 个 topic：
- `dashan-knit-top` · 大山的穿搭日记 · 磨毛上衣
- `30days-series` · 30 天变身计划 · 系列
- `grandpa-archive` · 爷爷的退伍档案 · 后续

真实世界需要从评论文本 / 视频标签做聚类抽取 · 展台 demo 是硬编码。

## 种子数据

`fixtures.json` 结构：

```json
{
  "users": [{ "id": "demo-user", "nickname": "小栗子🌰", "avatar": "..." }],
  "creators": [
    { "id": "creator-dashan", "display": "大山的穿搭日记", ... },
    { "id": "creator-30days", "display": "30天变身计划", ... },
    { "id": "creator-grandpa", "display": "爷爷的退伍档案", ... }
  ],
  "intent_signals": [
    // 5 条 · 覆盖 3 个 topic（部分 topic 有多条）
    { "user_id": "demo-user", "creator_id": "creator-dashan", "topic": "dashan-knit-top",
      "signal_type": "comment_intent", "raw_text": "蹲链接姐妹们",
      "video_id": "v-dashan-001", "video_title": "...", "days_ago": 21 },
    ...
  ],
  "creator_actions": [
    // 3 条 · 每个 topic 一条
    { "creator_id": "creator-dashan", "action_type": "post_link",
      "topic": "dashan-knit-top", "hours_ago": 3,
      "payload": { "video_id": "...", "product": { "name": "...", "price": "¥128" }, ... } },
    ...
  ],
  "feed": [
    // 6 条普通填充视频（展台信息流填充物）
    { "id": "feed-filler-1", "kind": "video", "creator": "@街边咖啡图鉴", "title": "...", "cover": "..." },
    ...
  ]
}
```

## 种子数据约束

- 每个 topic **至少有 1 条 creator_action**（否则该 topic 永远不能履约）
- 每个 topic **可有多条 intent_signal**（主题级聚合会只接一次）
- `days_ago` / `hours_ago` 运行时转成 ISO 字符串写入 occurred_at
- action.payload 是自由结构 · 不同 action_type 字段不同（见 cardBuilder.js 的处理）

## 添加新剧本

想加一个剧本 D（比如"催更型"）：

### 1. 更新 action_type enum
```sql
-- schema.sql
CHECK (action_type IN (
  'post_link','post_sequel','series_completed','reply_tutorial',
  'reply_catchup'   -- 新加
))
```

### 2. 加 topic
在 `fixtures.json` 中：
```json
"intent_signals": [
  { "creator_id": "creator-xxx", "topic": "dance-tutorial",
    "signal_type": "comment_intent", "raw_text": "催更教程",
    "days_ago": 14 }
],
"creator_actions": [
  { "creator_id": "creator-xxx", "action_type": "reply_catchup",
    "topic": "dance-tutorial", "hours_ago": 2,
    "payload": { "title": "...", "summary": "..." } }
]
```

### 3. 更新 `ACTION_TO_SCRIPT` 映射
在 `ambient.js`：
```js
const ACTION_TO_SCRIPT = {
  post_link:        'A',
  post_sequel:      'C',
  series_completed: 'B',
  reply_tutorial:   'A',
  reply_catchup:    'D',   // 新加
};
```

### 4. `cardBuilder.js` 加剧本 D 的 `buildAnswer` 分支
```js
function buildAnswer({ scriptId, action }) {
  if (scriptId === 'A') { ... }
  if (scriptId === 'B') { ... }
  if (scriptId === 'C') { ... }
  if (scriptId === 'D') {
    return { type: 'tutorial_card', video: { ... }, summary: ... };
  }
}
```

### 5. 前端 CardPageP1 渲染 tutorial_card

见 `CardPageP1.jsx` 的 `AnswerXxx` 组件族 · 加一个。

### 6. 更新 bootstrap triggers
`server.js` 里 `triggers` 数组 · 加一条剧本 D 触发器。

### 7. 跑 smoke + unit 确认不破

## 重要：主题聚合的查询模式

`pickNextCandidate` 和 `hasPendingAmbient` 都用这个排除条件：

```sql
AND NOT EXISTS (
  SELECT 1 FROM cards cd
    JOIN intent_signals si ON si.id = cd.intent_signal_id
   WHERE cd.user_id = s.user_id AND si.topic = s.topic
)
```

意思是：**这个 topic 下没有任何已履约的信号 → 可接**。
一条接了 · 整个 topic 就不再接。

## 数据重置

```bash
cd demo/backend
npm run db:seed    # 清 + 重 seed
```

或者：
```bash
curl -X POST http://localhost:4000/api/reset
```

两者等价 · reset 接口多一步 drain in-flight + 广播 demo.reset。

## 下一步

→ [04-ambient-pipeline.md](./04-ambient-pipeline.md)
