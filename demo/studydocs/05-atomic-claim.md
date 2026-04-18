# 05 · 原子声明 · 并发保护

> 读完这篇，你能在白板上讲清"两条并发请求怎么只生成一张卡片"。

## 一句话先

> **"一条 UPDATE 决定输赢 —— 先改 `fulfilled=0→1` 的那个赢，另一个看到 `changes===0` 就优雅放弃。"**

## 场景：为什么会并发？

展台 / 生产环境里，两种并发情景：

1. **评委快速双击** · 展台触发器被快速点两次
2. **多标签页** · 评委在一个标签开着 demo，另一个标签也开着，两边的 auto tick 时钟恰好撞上
3. **生产上** · 后端水平扩展多实例时，两个进程同时扫到同一条

都可能导致：**两个请求同时找到同一条未履约信号**，都试图给它生成卡片。

如果不处理，后果：
- 数据库里出现两张卡片都引用同一条 signal
- 前端在同一个 topic 下看到两张几乎一样的卡片
- **产品语义塌**：履约承诺是"只接一次"，结果接了两次

## 防护分三层

### 第 1 层 · 应用层原子 UPDATE（赢家独占）

看代码 `ambient.js`：

```js
const claimStmt = db.prepare(
  'UPDATE intent_signals SET fulfilled = 1 WHERE id = ? AND fulfilled = 0',
);

const persistTx = db.transaction(() => {
  const r = claimStmt.run(card.intent_signal_id);
  if (r.changes !== 1) {
    const err = new Error('signal-already-fulfilled');
    err.code = 'SIGNAL_ALREADY_FULFILLED';
    throw err;
  }
  insertCardStmt.run({ ... });
});
```

**关键是 `WHERE id = ? AND fulfilled = 0`** 这个条件 + 检查 `r.changes`。

- 如果 `changes === 1` · 这一次 UPDATE 真的改了一行 · 当前请求赢了
- 如果 `changes === 0` · 另一条请求已经把 fulfilled 改成 1 · 当前请求输了 · 抛错、回滚事务、返回 `reason: 'signal-already-fulfilled'`

SQLite 的 UPDATE 是原子的 —— 两条并发请求里只有一条能看到 `changes===1`。不需要显式锁。

### 第 2 层 · 数据库 UNIQUE 索引（硬护栏）

schema.sql 里：

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_unique_signal
  ON cards(intent_signal_id);
```

即使应用层代码有 bug（比如以后改了并发保护逻辑漏了一个分支），数据库也会拒绝两张卡片引用同一条信号。INSERT 会抛 UNIQUE constraint 错误。

> **"两条防线 · 应用层一条 · 数据库一条。互相独立、互相冗余。"**

### 第 3 层 · 事务保证原子性

整个"claim + insert"包在一个 `db.transaction()` 里：

```js
const persistTx = db.transaction(() => {
  // 1. claim
  const r = claimStmt.run(card.intent_signal_id);
  if (r.changes !== 1) throw ...; 
  // 2. insert card
  insertCardStmt.run({ ... });
});
persistTx();
```

这保证：
- claim 失败 · 整个事务回滚 · 没有任何副作用
- claim 成功 · insert 必然写入 · 不会出现 "fulfilled=1 但没卡片" 的怪异中间态

## 为什么先 claim 后 insert · 顺序重要

反过来的顺序（先 insert 再 claim）会产生 race：
- 进程 A 先 INSERT cards （卡片已经写进去了）
- 进程 B 同时 INSERT cards （UNIQUE 索引触发，B 失败）
- 但 B 失败之前，B 可能已经把 fulfilled 改成 1（如果顺序是 UPDATE-then-INSERT）

实际上两种顺序都能 work（UNIQUE 索引兜底），但 **UPDATE-first 更优雅**：
- claim 失败成本低（一个 UPDATE 的 rollback）
- insert 失败成本高（可能要释放已分配的资源 / 触发触发器）
- 而且 claim 的语义对应产品叙事："先把这件事预定下来"

## 这个机制在前端怎么表现

前端 `useDemoStore.onCardGenerated` 接收 `card.generated` 事件。如果并发两条请求：
- 赢家收到 `workflow.end ok:true` + `card.generated` 推广
- 输家收到 `workflow.end ok:false reason:signal-already-fulfilled`

输家的 MindCanvas 停在 step 4，显示 "这条刚刚被抢先接走了" · 不会生成卡片 · 信息流左面板不会多出一张重复的。

## Smoke 测试验证

`demo/backend/src/smoke.js` 里：

```js
// 并发去重 · 同 topic 两条并发应只落一张卡
await resetDemo();
const [concA, concB] = await Promise.all([
  ambientTick({ topic: 'dashan-knit-top' }),
  ambientTick({ topic: 'dashan-knit-top' }),
]);
const okCount = [concA, concB].filter((r) => r.body.ok).length;
assert(okCount === 1, `并发去重 · 仅 1 条成功`);
assert(dupReasons.includes('signal-already-fulfilled'), '失败方 reason=signal-already-fulfilled');
```

每次 build 都会跑这个断言 · 机制退化了会第一时间被抓到。

## 展台讲法

**简短版**：
> "两条请求同时进来，我们用一个 UPDATE 让只有一条能改 `fulfilled=0→1`。另一条看到 `changes===0` 就知道自己输了，优雅返回。数据库上再加个 UNIQUE 索引做二次保险。"

**画图版**（在白板画这个）：
```
 请求 A 来了            请求 B 来了
    │                      │
    ▼                      ▼
  SELECT → signal        SELECT → signal      （两条都找到同一个 signal）
    │                      │
    ▼                      ▼
 UPDATE fulfilled=1    UPDATE fulfilled=1
  WHERE fulfilled=0    WHERE fulfilled=0
    │                      │
  changes=1             changes=0
  (赢家)                (输家)
    │                      │
    ▼                      ▼
 INSERT cards          throw 'signal-already-fulfilled'
    │                      │
    ▼                      ▼
 emit card.generated   emit workflow.end ok=false
```

## 一句话版本（背下来）

> **"一条 UPDATE 决定输赢 · 应用层加上 UNIQUE 索引做硬护栏 · 整个 claim+insert 包在一个事务里。Smoke 测试每轮都验证并发去重。"**

## 常见问答

**Q："为什么不用分布式锁？"**
A：SQLite 的 UPDATE 本身就是原子的 · 不需要外部锁。生产上换成 Postgres 也一样（`UPDATE ... RETURNING` + `WHERE fulfilled=0` 的 pattern 照搬）。分布式锁只有在跨进程、跨机器时才需要 —— 而且那时你先要考虑的是数据库的锁（行锁足够），不是独立 Redis 锁。

**Q："两边都 changes=0 会不会？"**
A：不会。UPDATE 是串行的（SQLite 是严格串行执行）· 两条并发请求到数据库时会被强行排队。排第一的看到 fulfilled=0 成功，排第二的看到 fulfilled=1 失败。不存在"都失败"的情况（除非信号本来就不存在，那是另一个错误）。

**Q："如果 claim 成功了但 INSERT 因为磁盘满失败呢？"**
A：事务回滚 · fulfilled 回到 0 · 什么都没发生。下次 tick 还能再挑到这条信号。完美的 all-or-nothing 语义。

**Q："这个机制能扩展到生产规模吗？"**
A：
- 行级锁（SQLite UPDATE · Postgres 的 SELECT FOR UPDATE）已足够
- 高并发场景可以加**幂等 key**（前端生成 requestId，后端拒绝已处理过的 requestId）—— 但这是防"重复点击"，不是防"并发竞争"
- 跨数据中心的主写冲突可以用乐观锁（version 字段） · 但履约型内容这种低频场景不需要
