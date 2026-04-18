# 04 · 主题级聚合 · 从 bug 到设计

> 读完这篇，你能讲清为什么履约是按 topic 聚合，不是按 signal。

## 一句话先

> **"一个念头只该被接一次，哪怕她留了 5 条痕迹都是关于这件事的。"**

履约的粒度不是"信号条数"，是**"主题"（topic）**。

## 这个设计不是一开始就有的

最早版本的查询是：

```sql
SELECT * FROM intent_signals
 WHERE user_id = ? AND fulfilled = 0
 ORDER BY occurred_at ASC LIMIT 1
```

**后来 smoke 测试挂了 —— 因为同主题生成了多张重复卡片。**

### Bug 复现（历史 smoke 失败日志）
种子数据里：
- 信号 1：蹲链接（topic: knit-top）· comment_intent
- 信号 4：长停留（topic: knit-top）· passive_interest
- 信号 2：稍后再看（topic: 30days）
- 信号 5：搜索（topic: 30days）· unsatisfied_search
- 信号 3：蹲后续（topic: grandpa）

触发 3 次 ambient tick 后：
- 第 1 次接了信号 1 · 生成一张关于上衣的卡片
- 第 2 次接了信号 2 · 生成一张关于 30 天系列的卡片
- 第 3 次接了信号 3 · 生成一张关于爷爷的卡片
- `pending` 仍然 = true · 因为信号 4、5 还有 `fulfilled=0`

Smoke 断言 "接完 3 个 topic 后 pending=false" 失败 —— **测试揭示了产品 bug**：再跑一轮，AI 会用信号 4 生成**另一张关于上衣的卡片**（重复履约同一件事）。

### 修复 · 加一个 NOT EXISTS

现在的查询（见 `ambient.js:pickNextCandidate`）：

```sql
SELECT * FROM intent_signals s
  JOIN creator_actions ca ON ca.topic = s.topic
 WHERE s.user_id = ? AND s.fulfilled = 0
   AND NOT EXISTS (
     SELECT 1 FROM cards cd
       JOIN intent_signals si ON si.id = cd.intent_signal_id
      WHERE cd.user_id = s.user_id AND si.topic = s.topic
   )
 ORDER BY s.occurred_at ASC LIMIT 1
```

`NOT EXISTS` 子查询读的是**"这个 topic 是否已经生成过任何卡片"**。如果已经有过，这个 topic 就被排除，不会再挑任何属于它的信号。

## 为什么这不只是技术修复，而是**设计重校准**

最初的 schema 设计隐含一个假设："一条 signal 对应一次履约"。
这个假设在**数据模型层面**是对的（`cards.intent_signal_id` 1:1）。
但在**产品语义层面**是错的。

产品语义：
- `intent_signal` 是一条**痕迹**（trace）
- `topic` 是这条痕迹所属的**念头**（intent / thought）
- 一个念头可能留下多条痕迹

**履约是接"念头"，不是接"痕迹"。**

你在评论区打了"蹲链接"是痕迹 1。
你一周后又回去长停留是痕迹 2。
你两周后搜了同款关键词是痕迹 3。

这些是**同一个念头的 3 次表现**。博主放链接时系统接一次就够了 —— 不该因为你留了 3 个痕迹就给你 3 张几乎一样的卡片。

所以：
- 数据层保留细粒度（5 条 signal 都记录下来 · 数据不丢）
- 业务层按 topic 聚合（一个 topic 只履约一次 · 语义正确）

## 实现细节

### 挑选（pickNextCandidate）
```
WHERE s.fulfilled = 0                    ← 信号本身未履约
  AND NOT EXISTS(... topic 已履约 ...)   ← 该 topic 从未生成过卡片
```

### 判断是否还有可接（hasPendingAmbient）
```sql
SELECT COUNT(DISTINCT s.topic) AS c
  FROM intent_signals s
  JOIN creator_actions ca ON ca.topic = s.topic
 WHERE s.user_id = ?
   AND s.fulfilled = 0
   AND NOT EXISTS (... cards 覆盖了这个 topic ...)
```

**关键是 `COUNT(DISTINCT s.topic)`** —— 数的是主题数，不是信号条数。

### 为什么 hasPending 不直接数 `cards` vs `distinct topics`

更直观的写法：
```sql
-- 所有有动作的 topic 数 - 已履约的 topic 数 = 还能接的数量
```

但那样会复杂 · 现在这个写法**语义直接**："还有多少 topic 同时满足未履约 + 没卡片"。

## Footprints · 主题聚合的另一面

P3 页（行为足迹）展示的是**同一主题的多条痕迹**。

```sql
SELECT * FROM intent_signals
 WHERE user_id = ? AND topic = ?
 ORDER BY occurred_at DESC LIMIT 6
```

这里不过滤 `fulfilled`，因为我们要给用户看的是**"你过去为这件事留下过这些痕迹"** —— 包括刚刚被接走那一条。

主题级聚合让这件事自然可行：你挑中一条信号的同时，就知道它属于哪个 topic，拉出这个 topic 下所有 signal 就是 footprints。

## 展台怎么讲这个设计决策

> "我们做了一次设计修正：履约是按主题聚合的，不是按信号。
> 假如她留了 5 条关于同一件上衣的痕迹，我们只会接一次。
> 数据层完整保留所有痕迹，业务层按主题去重 —— 这让她 P3 页的「行为足迹」能展示多条痕迹，但卡片不会重复浮出来。"

**这是一个"从 bug 到设计"的好故事，面试或评委问到时主动讲，加分。**

## 一句话版本（背下来）

> **"履约粒度是主题，不是信号条数。一个念头哪怕她留了 5 条痕迹，系统只接一次 —— 数据层完整、业务层去重。"**

## 常见问答

**Q："如果她真的对同一件事留了两次蹲（间隔半年），那半年后是不是还会再接一次？"**
A：当前 demo 逻辑下不会 —— `NOT EXISTS` 是对所有 cards 检查的，永久去重。生产上可以加"过期策略"：比如 cards 超过 3 个月未被查看就软删，允许再接一次。这是产品决策，不是技术限制。

**Q："multiple signals for same topic, 挑哪条？"**
A：按 `occurred_at ASC` 挑最早的那条。因为情感设计是"她惦记最久的那件事"。
另一种可选：挑 `raw_text` 最丰富的（评论原文优于 passive interest），但当前没做。

**Q："你们这个 NOT EXISTS 不会慢吗？百万级 cards 怎么办？"**
A：展台规模下不慢（~100 row scan）。百万级时需要加索引：
- `cards(user_id, intent_signal_id)` 已经 UNIQUE，快速判存
- 再加 `intent_signals(topic)` 索引让 JOIN 快
- 真正的扩展是把"用户已履约 topic 集合"拉到 Redis Set 里做 O(1) 判存
