# 03 · 三张表讲通数据层

> 读完这篇，你能在白板上画出 3 张表 + 外键 + 数据流，并说清为什么是 3 张不是 1 张。

## 一句话先

> **"3 张表对应 3 个产品概念：她过去的念头（intent_signals）· 博主的新动作（creator_actions）· 已经接回来的履约（cards）。"**

数据层就是产品模型。不是数据库先设计好，**是产品概念先厘清，表才长这样**。

## 3 张表

### 1. `intent_signals` — 她过去留下的痕迹

每一行是**用户留过的一条未完成痕迹**：蹲、稍后再看、收藏、搜索、长停留。

关键字段：
- `user_id` · 谁留的
- `creator_id` · 在哪个博主下
- `topic` · 这是关于什么的（`dashan-knit-top` / `30days-series` / `grandpa-archive`）
- `signal_type` · 什么形式的痕迹（`comment_intent` / `watch_later` / ...）
- `raw_text` · 评论原文（如果是评论型）
- `occurred_at` · 留下的时间
- `fulfilled` · 是不是已经被接回来了（原子声明用的）

### 2. `creator_actions` — 博主今天的新动作

每一行是**博主今天做了什么**：放链接、发后续、更完系列。

关键字段：
- `creator_id` · 谁做的
- `topic` · 关于什么的（必须和 intent_signals.topic 能对上）
- `action_type` · 什么形式（`post_link` / `post_sequel` / `series_completed` / `reply_tutorial`）
- `payload_json` · 这个动作的具体内容（商品信息 / 视频 id / 缩略图 / 摘要 / ...）
- `occurred_at` · 做的时间

### 3. `cards` — 已经接回来的履约

每一行是**一次成功履约**：把一条 signal 和一个 action 合起来，生成一张多页卡片。

关键字段：
- `user_id` · 给谁的
- `script_id` · A/B/C（从 action_type 映射）
- `intent_signal_id` · 接回来的是哪条念头（UNIQUE · 并发保护）
- `creator_action_id` · 配对的是哪个博主动作
- `pages_json` · P1/P2/P3 整张卡的内容（离线渲染）

## 为什么是 3 张表，不是 1 张大表

**一个朴素的反问：既然最终生成一张 cards 里已经有所有信息，为什么不直接把 signal 和 action 的字段合进 cards？**

答：**因为 signal 和 action 是独立演化的实体**。

- `intent_signals` 是**用户生产的**：她留下的每一条痕迹都是一次性的、不可变的事件
- `creator_actions` 是**博主生产的**：博主发一个动作，可能对应多条不同用户的信号
- `cards` 是**系统生产的**：每一张卡片是一次成功的 (signal × action) 匹配

3 张表对应 3 个生产主体、3 种生命周期、3 种可变性。合进一张表会丢失所有这些语义。

### 举个例子

博主今天放了上衣链接（一次 creator_action）——
- 用户 A 三周前评论过"蹲链接" · 系统生成 cards[a1]
- 用户 B 一周前长停留过这个视频 · 系统生成 cards[b1]
- 用户 C 没留过任何痕迹 · 不生成卡片

同一个 creator_action 对应**多个 cards**（多对一）。
如果 action 的字段合进 cards，数据会冗余、更新 action 时要同步多张卡。3 张表分开，action 一份、卡片引用它的 id，干净。

## 数据流（写 / 读）

### 写：一次 ambient tick 的完整路径

```
[触发] POST /api/ambient/tick
  │
  ▼
[查 intent_signals] pickNextCandidate()
  SELECT * FROM intent_signals s
    JOIN creator_actions ca ON ca.topic = s.topic
   WHERE s.user_id = ? AND s.fulfilled = 0
     AND NOT EXISTS (SELECT 1 FROM cards WHERE topic = s.topic)
   ORDER BY s.occurred_at ASC LIMIT 1
  │
  ▼
[build card 内存对象] buildCard({signal, action, creator, ...})
  │
  ▼
[db.transaction]
  1. UPDATE intent_signals SET fulfilled=1 WHERE id=? AND fulfilled=0
  2. INSERT INTO cards (...)
  │
  ▼
[广播] WebSocket → card.generated 事件
```

### 读：/api/bootstrap 的全量视图

```
GET /api/bootstrap
  │
  ├─ 查 users（单用户 demo）
  ├─ 查 intent_signals JOIN creators → 历史列表
  └─ 查 cards ORDER BY created_at DESC LIMIT 30 → 已履约卡片
```

每张卡片展开 `pages_json` 就是 P1/P2/P3 的完整内容。

## 为什么 `pages_json` 是整份存进去，而不是再拆多张表

`cards.pages_json` 字段存的是一个**完全序列化的 JSON**：P1 的情景锚点 + 答案布局 + 按钮 · P2 的 AI 解释 · P3 的行为足迹。

**反问：为什么不再拆一张 `card_pages` 表？**

答：**这张卡片是一次性快照**。它生成的那一刻，情景锚点、相对时间、博主数据都凝固了 —— 以后 intent_signals 或 creator_actions 即使被修改，这张卡不应该变（她收到的是那一刻的描述）。

所以 `cards` 写的是**事件的快照**，不是**实时视图**。JSON 字段最自然、不拆表。

（这个设计也符合 "Event Sourcing" 的 intuition：卡片是不可变事件，不是可变实体。）

## 外键关系图

```
┌────────────┐
│  users     │
│  id (PK)   │
└─────┬──────┘
      │
      │
      ▼
┌───────────────────┐          ┌──────────────────┐
│ intent_signals    │          │ creator_actions  │
│ id (PK)           │          │ id (PK)          │
│ user_id   ─┬───(FK)          │ creator_id ─(FK) │
│ creator_id─┴───(FK)─┐        │ topic            │
│ topic              │          │ action_type      │
│ fulfilled          │          │ payload_json     │
└─────┬──────────────┘          └────┬─────────────┘
      │                               │
      │   （by topic · JOIN）         │
      │   ──────────────────>         │
      │                               │
      ▼                               ▼
      ┌──────────────────────────────────┐
      │                                  │
      │        cards                     │
      │   id (PK · 字符串)               │
      │   user_id (FK)                   │
      │   script_id (A/B/C)              │
      │   intent_signal_id  (FK, UNIQUE) │
      │   creator_action_id (FK)         │
      │   pages_json                     │
      │   created_at                     │
      │                                  │
      └──────────────────────────────────┘

┌────────────┐
│ creators   │
│ id (PK)    │
└────────────┘
  ↑
  │ (被 intent_signals.creator_id 和 creator_actions.creator_id 引用)
```

## 为什么 `cards.intent_signal_id` 是 UNIQUE

这是并发保护的第二层（第一层是 `UPDATE ... WHERE fulfilled=0` 的原子判定）。

设想：两个请求同时到，都从 pickNextCandidate 查到同一个 signal。第一个 UPDATE 把 fulfilled 改成 1，写入 cards。第二个 UPDATE 因为 `fulfilled=0` 条件失败（`changes===0`）返回 —— 这一层就挡住了。

**但是**，如果代码有 bug 或者未来改了并发保护逻辑，UNIQUE INDEX 是一道硬护栏：数据库层面**拒绝**两张卡片引用同一条信号。

> **"原子声明 + UNIQUE INDEX · 应用层一层 + 数据库层一层。"**

## 展台讲数据层的顺序

在白板上先画，**按这个顺序**：

1. 画 `intent_signals`（左上）· 说"她留下的痕迹"
2. 画 `creator_actions`（右上）· 说"博主的新动作"
3. 画一条 JOIN 线 by topic · 说"这两张表通过 topic 字段配对"
4. 画 `cards`（下面）· 说"成功配对一次，系统就生成一张履约卡"
5. 画 UNIQUE 标志在 `cards.intent_signal_id` 上 · 说"一条信号只能被接一次"

这个顺序对应的是产品叙事：**念头 → 博主动作 → 履约**。

## 一句话版本（背下来）

> **"三张表对应三个产品概念：念头、动作、履约。念头和动作各自独立演化，通过 topic 配对；履约是一次性的快照。原子声明加上 UNIQUE 索引保证同一念头只被接一次。"**

## 常见问答

**Q："为什么不用 NoSQL？SQLite 不是 demo 玩具吗？"**
A：履约关系是**天然关系型的**：一个念头对应一个履约（1:1），一个博主动作可能对应多个履约（1:N），JOIN by topic 是核心查询。NoSQL 做 JOIN 反而累。SQLite 是合适的选择，不是妥协。

**Q："如果生产环境要上，这个 schema 要改什么？"**
A：展台用 SQLite 单文件、单进程。生产上：
- `users` 表会很大 · 需要分片 or 改 Postgres
- `intent_signals` 是高频写 · 需要分区 by user_id + time
- `cards` 是读多写少 · 加缓存层（Redis LRU）
- `pages_json` 可能要存对象存储（S3）· 卡片 meta 留数据库

但 schema 的三个概念核心不变。

**Q："你们的 topic 是硬编码的几个字符串？"**
A：展台 demo 是的（`dashan-knit-top` / `30days-series` / `grandpa-archive`）。生产上 topic 需要自动抽取 —— 从评论内容、博主描述、视频标签做 embedding 聚类。展台走规则引擎只是为了时延稳定。
