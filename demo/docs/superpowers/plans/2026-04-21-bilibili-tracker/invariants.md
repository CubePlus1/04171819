# Bilibili Tracker v0.3.0 · Invariants & Ambiguity Resolutions

> Parent plan: [../2026-04-21-bilibili-tracker.md](../2026-04-21-bilibili-tracker.md)
> Role：把 spec 和 plan 里**所有模糊点**落到显式约束；把**每个模块的不变式**列为测试可验证的 properties。
> 执行阶段（codex）把本文当合同清单，每张清单条目要么有测试覆盖要么有显式豁免理由。

---

## Part 1 · Ambiguity Resolutions

消除 plan 执行时 "可能两种解释" 的每一个决策点。格式：**[原始模糊]** → **[显式约束]**。

### §1.1 · 数据库 / schema

- **[混淆]** `creators.id` 在 demo 是字符串（`'大山'`），B 站是数字 mid → **[约束]** `creators.id = String(mid)`（数字转字符串存入），demo mock 数据 `source='mock'` 不迁移。真实插入全走 `INSERT OR IGNORE INTO creators(id, handle, display, avatar, bio)`。
- **[混淆]** `aid` 是 B 站 视频号 · 可能为 bvid 转过 → **[约束]** `aid` 一律存 **数字 aid**（不是 `BV1xx...` 字符串），content_script / service_worker 如果拿到 bvid 先转 aid 再入库（B 站视频页 URL 同时有 aid 和 bvid，优先用 aid）。
- **[混淆]** 用户原评论 content 可能为空（msgfeed 不带） → **[约束]** `intent_signals.content` 允许 NULL → 插入时 `(待补)` 占位；cardBuilder 看到 `(待补)` 或 NULL fallback `video_title`。
- **[混淆]** migration 是 forward-only 还是支持回滚？ → **[约束]** **仅 forward**。`migrate.js` 不实现 `down`；错了开新 migration 文件修。`user_version` PRAGMA 单调。
- **[混淆]** 旧 fixtures mock 数据要不要打 `source='mock'`？ → **[约束]** 不强制回填。新字段 `source` 允许 NULL，查询时 `WHERE source='mock' OR source IS NULL` 一视同仁为 mock。

### §1.2 · Ingest 摄入语义

- **[混淆]** 插件 hook 拿到 rpid 后立即 POST，还是批量？ → **[约束]** **立即 POST**（每条一个请求）。MV3 service worker 不保证长存，批量丢失风险大于 per-request 开销。
- **[混淆]** 重复 POST 同 rpid → **[约束]** backend 返回 `409 { ok:false, reason: 'duplicate_rpid' }`；content_script 看到 409 不重试、不报错（这是幂等，不是失败）。
- **[混淆]** `POST /api/ingest/comment` 要不要立刻 trigger ambient.js？ → **[约束]** **立刻 trigger**（异步 fire-and-forget）。因为 "写评论时刻" 对应的已履约卡通常不存在，但可能 trigger 把之前等待的 topic 接回来。
- **[混淆]** L2 top-reply 的 batch 大小？ → **[约束]** 每 aid 一次最多 20 条（B 站 `ps=20` 默认，匹配 `sort=2` 响应）。
- **[混淆]** 重复 POST 同 aid 的 top-reply batch → **[约束]** 每条 action 按 `UNIQUE INDEX idx_action_rpid` 去重；batch 里已存在的跳过（`INSERT OR IGNORE`）；返回 `{ ok, ingested, answers, skipped }`。

### §1.3 · answerJudge 判真 R1

- **[混淆]** `is_answer = score >= threshold` 的 threshold 取值 → **[约束]** **0.3**（父 plan 定 `JUDGE_THRESHOLD=0.3`）。调参在 `answerJudge.js` 顶部常量暴露。
- **[混淆]** score 能否为负？ → **[约束]** 可以（noise_patterns 命中减 0.5）。`is_answer = score >= 0.3`，不是 `abs(score)`。
- **[混淆]** UP 主和置顶同时命中时是否超加权 → **[约束]** 规则独立加分，最终 `score = sum(matched_rules)`。UP 主 (+0.5) + 置顶 (+0.3) = 0.8，超过 threshold 必真。
- **[混淆]** 关键词 `淘口令` 被用户评论过，是否也命中 answer_patterns？ → **[约束]** answer_patterns 只针对 **replying_to_rpid 非空 的 creator_actions**（回复），不判 intent_signals。

### §1.4 · Ambient 管线适配

- **[混淆]** v0.3.0 真实数据下 `loopMode` 是 true 还是 false？ → **[约束]** **false**。真实数据不循环，`pending=false` 就是真的没了。
- **[混淆]** `pickNextCandidate` 过滤 action 的条件 → **[约束]** 必须 `JOIN creator_actions ca ON ca.topic = s.topic AND is_answer=1`（加 is_answer 过滤）。**现有 ambient.js 没这条件**，T6 必须加。
- **[混淆]** 一个 signal 有多个 is_answer=1 的 action，挑哪个？ → **[约束]** 按 `ca.confidence DESC, ca.occurred_at DESC` 取 top 1。
- **[混淆]** `snapshotMindNodes` 要不要继续发？（前端 AgentPanel 已去掉）→ **[约束]** **继续发**（step 1 仍发 `mind.phase=SCAN, nodes=[...]`）。前端 App.jsx 仍消费 WORKFLOW_STEP（只是不渲染），去掉会破坏 demo 兼容。等 v0.4.0 再精简。

### §1.5 · 前端 / 路由

- **[混淆]** MyCommentsPanel 的 tab 切换是 ProductPanel 内部 state 还是 URL 路由？ → **[约束]** 内部 state（demo 没引 react-router），不改 URL。
- **[混淆]** "看卡 →" 跳转时当前已在 feed tab 但 card 不在 currentItem？ → **[约束]** 调 `focusCard(cardId)`：若 cards 里有 → 设为 currentItem；没有 → 什么都不做 + 控制台 warn（MyComments 的 cards 可能超出 MAX_CARDS_IN_UI=6 被淘汰了）。
- **[混淆]** 桌面通知点击后 URL `?card_id=xxx` 前端怎么处理？ → **[约束]** App.jsx 启动时 `new URLSearchParams(location.search).get('card_id')`，若非空 bootstrap 后调 `focusCard(id)`；读完用 `history.replaceState` 清掉 query（避免刷新再跳）。

### §1.6 · Extension / MV3

- **[混淆]** content_script XHR hook 是 before 还是 after response？ → **[约束]** **after response**（addEventListener('load')），因为要从 response 拿 rpid。
- **[混淆]** hook 会不会被 B 站 CSP 阻止？ → **[约束]** content_script 运行在 isolated world，绕开页面 CSP；XHR hook 只改 isolated world 的原型，但 B 站 XHR 实例创建在 main world，**hook 可能失效**。若失效 → 用 `chrome.scripting.executeScript` inject 到 main world，或降级用 `webRequest.onCompleted` 监听 `/x/v2/reply/add` 响应。T8.2 Step 2 smoke 必跑验证。
- **[混淆]** MutationObserver root (`.reply-warp` / `.reply-list` / `#comment`) 哪个稳定？ → **[约束]** 三个 selector 按优先级尝试，找到哪个就挂。首次 root 可能不存在（页面懒加载），用 `setInterval(1s, 60s)` 轮询直到出现。
- **[混淆]** service_worker 在 idle 30s 后被 Chrome 休眠，WS 断开 → **[约束]** `ws_client.js` 有 auto-reconnect（5s），SW 被唤醒时（alarms 到点）自动重连。桌面通知失效窗口可达 30s，接受。
- **[混淆]** SESSDATA 过期后如何处理？ → **[约束]** `chrome.cookies.get` 返回 null 视为未登录，popup status 显示"请先登录 B 站"，service_worker 跳过本次 alarm，下次再试（非永久失败）。

### §1.7 · WebSocket 事件

- **[混淆]** 消息 payload `client_id` 字段必填？ → **[约束]** backend ambient 广播不带 `client_id`（自动任务无 client），前端 isMine = (!p.client_id || p.client_id === myClient)，即"无 client_id 一律本地接"。这条保留现有 App.jsx 逻辑。
- **[混淆]** `card.generated` 在 extension SW 里是否也要 dedupe？ → **[约束]** 要，用 `card.id` 作为 `chrome.notifications.create(id, ...)` 的第一个参数，重复同 id 会 replace 不会弹两次。

### §1.8 · 历史倒推

- **[混淆]** `/api/backfill/start` 是同步还是异步？ → **[约束]** **异步**。立即返回 `{ ok: true, runId }`，进度走 WebSocket `backfill.progress`。popup 每 2s `GET /api/backfill/status` 查进度（不直接监听 WS，SW 不常在）。
- **[混淆]** 倒推正在跑时再次 trigger → **[约束]** backend 用内存 `activeBackfillRun` 单例锁，第二次返回 `409 { ok:false, reason: 'backfill_in_progress' }`。
- **[混淆]** msgfeed 分页终止条件 → **[约束]** 连续 2 页无新增（全是已存 rpid）视为到底，退出分页；或 cursor 返回空。

---

## Part 2 · Invariants by Module (Property-Based Contract)

每个模块列可验证的 invariants。执行阶段测试必须覆盖每条（即使用 example-based test 也要至少一个 example 验证）。

### §2.1 · migrate.js

| ID | Property | Definition | Falsification |
|---|---|---|---|
| MIG-1 | **Monotonicity** | `PRAGMA user_version` 永远单调递增 | 先跑 003 再跑 002 · 期望 002 被跳过 |
| MIG-2 | **Idempotency** | 多次跑 `npm run migrate` 结果等价于跑一次 | 跑 10 次，最终 user_version 不变，表结构不变 |
| MIG-3 | **Atomicity** | 单个 migration 文件出错时不留部分副作用 | 002 中途 inject 错误 SQL → user_version 仍为 1 |
| MIG-4 | **Forward-only** | 不提供 down / rollback 路径 | 找不到降级命令是预期行为 |

### §2.2 · bilibili.js

| ID | Property | Definition | Falsification |
|---|---|---|---|
| BILI-1 | **Rate limit fairness** | 每 endpoint 间隔 ≥1000ms，不全局 | 同时调 `msgfeed` 和 `view` 不互相阻塞 |
| BILI-2 | **Retry finiteness** | 失败最多 3 次退避，不无限 | 永远 500 的 endpoint 4 次后抛 |
| BILI-3 | **Header isolation** | SESSDATA 只在显式需要的 endpoint 发送 | 公开 endpoint 不带 cookie（验证 network dump） |
| BILI-4 | **Normalize totality** | msgfeed item 任何 shape 都能 normalize 不崩 | 空 object `{}` / 缺 `item` / 缺 `user` 都返回合法 signal |

### §2.3 · answerJudge.js

| ID | Property | Definition | Falsification |
|---|---|---|---|
| JUDGE-1 | **Determinism** | 同 input → 同 output | 跑 100 次同一 content，score 相同 |
| JUDGE-2 | **Boundedness** | `score ∈ [-0.5, ∞)`；`confidence = max(0, score)` | 纯 noise → score=-0.5；UP+置顶+点赞+关键词 → score > 1 |
| JUDGE-3 | **Monotonicity in rules** | 增加命中规则 → score 不下降 | UP 回复 +0.5 后再加关键词 +0.3 → score 严格大于只有 UP |
| JUDGE-4 | **UP reply default pass** | UP 主回复必定 `is_answer=true` | UP 回 "哈哈哈" score = 0.5 - 0.5(noise) = 0.0 × wait... | 

Wait MIG-4 / JUDGE-4 有矛盾 —— UP 回 "哈哈哈" 命中 noise_patterns (笑)。这个 case 是 edge：UP 主说玩笑话也不该视为 answer。JUDGE-4 去掉。

改：

| JUDGE-4 | **Noise dominance** | Noise 减分可以拒绝所有加分 | UP 回 "哈哈哈": +0.5 - 0.5 = 0 < 0.3，正确归为 non-answer |

### §2.4 · ingest.js

| ID | Property | Definition | Falsification |
|---|---|---|---|
| ING-1 | **Idempotency by rpid** | 同 rpid 第二次 POST → 409 | POST 两次 · 第二次返回 409 · DB 只有 1 行 |
| ING-2 | **Round-trip (comment)** | POST 后立刻 GET /my-comments · 含该行 | rpid=999001 POST 后 /my-comments 返回含该 signal |
| ING-3 | **Judge side-effect** | POST reply 后 creator_actions 有 is_answer/confidence 非 NULL | 每次 POST 后 `SELECT is_answer FROM creator_actions WHERE rpid=?` 非 NULL |
| ING-4 | **Payload bounds** | 单次 payload ≤ 1MB 否则 413 | 10MB payload 拒 |
| ING-5 | **WebSocket emit** | POST comment 后 ws 发 workflow.begin（若触发 ambient） | spy ws send · 期望至少一次 workflow.begin |

### §2.5 · historyBackfill.js

| ID | Property | Definition | Falsification |
|---|---|---|---|
| BF-1 | **Dedup across runs** | 跑 N 次后 `intent_signals` 行数 = 单次跑结果 | 跑 3 次，行数不增 |
| BF-2 | **Progress monotonic** | WS `backfill.progress` 的 `current` 只增不减 | 观察序列，断言 `forall i: current[i] <= current[i+1]` |
| BF-3 | **Termination guarantee** | 有限输入下必然返回 done 事件 | 50 条 fixture response → `backfill.done` emit |
| BF-4 | **Single run lock** | 并发两次 backfill → 第二次 409 | concurrent test：POST /start ∥ POST /start → 其中一个 409 |

### §2.6 · ambient.js 适配

| ID | Property | Definition | Falsification |
|---|---|---|---|
| AMB-1 | **Fulfillment atomicity** | `signal.fulfilled 0→1` 是单步 UPDATE changes=1 | 并发两次 runAmbient 同 signal · 其中一个拿到 `SIGNAL_ALREADY_FULFILLED` |
| AMB-2 | **is_answer filter** | 不挑 is_answer=0 的 action | DB seed 一条 is_answer=0 action · runAmbient 返回 NO_MATCH |
| AMB-3 | **Topic-level dedup** | 同 topic 至多一张卡 | 同 topic 两条 signal + 两条 answer · 只生成一张 card |
| AMB-4 | **Monotonicity of fulfilled** | fulfilled 1→0 只能通过 DEMO_LOOP softReset · 正常不回退 | 正常路径不存在 UPDATE fulfilled=0 语句 |
| AMB-5 | **Card preview non-empty** | `card.pages[0].context_line` 永不空字符串 | Signal content='(待补)' 时 fallback `video_title` 且非空 |

### §2.7 · Frontend (T7)

| ID | Property | Definition | Falsification |
|---|---|---|---|
| FE-1 | **Filter soundness** | `fulfilled + pending === total`（抽样） | 后端查 /my-comments · 三者 +-0 精确相等 |
| FE-2 | **Filter exclusivity** | fulfilled list ∩ pending list = ∅ | 抽 item 检查 `fulfilled` 字段唯一 |
| FE-3 | **MyComments item shape stability** | 所有 item 有 `signal_id / video_title / content / occurred_at / fulfilled` | schema assert |
| FE-4 | **Tab switch no-leak** | 从 my-comments 切回 feed · Feed 状态保留 | 切出前后 Feed 的 spotlight / queue 不变 |
| FE-5 | **focusCard safety** | `focusCard(unknownId)` 不 crash · 控制台 warn | 不存在的 id 传入 · 验证 console.warn 且 state 不变 |

### §2.8 · Extension (T8-T9)

| ID | Property | Definition | Falsification |
|---|---|---|---|
| EXT-1 | **XHR hook non-intrusive** | hook 失败不阻断 B 站原生 XHR | 在 hook 里 throw · 原生 callback 仍触发 |
| EXT-2 | **Badge uniqueness** | 同 rpid 在 DOM 里至多一个 `.dundao-badge` | observe 追加同 reply 10 次 · querySelectorAll('.dundao-badge') 计数 = 1 |
| EXT-3 | **Notification dedup** | 同 card.id 的通知不重复弹 | WS 连接重连时 backfill 阶段重发 card.generated · notif 只弹一次 |
| EXT-4 | **Observer scope** | MutationObserver root 非 document.body | dev-tools 检查 observer root.tagName ≠ 'BODY' |
| EXT-5 | **SW-to-BE rate** | service_worker 调 B 站连续请求间隔 ≥1000ms | 打点 fetch 前后的 Date.now() diff |

---

## Part 3 · Execution Contract Summary

执行阶段（`codex` / 后续 `/ccg:spec-impl`）开工前读一遍这两部分，每写完一个 Task 对照 invariants 自检：

- [ ] Task T1 完成后：MIG-1/2/3/4 全部可通过
- [ ] Task T2 完成后：BILI-1/2/3/4
- [ ] Task T3 完成后：JUDGE-1/2/3/4
- [ ] Task T4 完成后：ING-1/2/3/4/5
- [ ] Task T5 完成后：BF-1/2/3/4
- [ ] Task T6 完成后：AMB-1/2/3/4/5
- [ ] Task T7 完成后：FE-1/2/3/4/5
- [ ] Task T8-T9 完成后：EXT-1/2/3/4/5
- [ ] Task T10 完成后：full-stack smoke（所有 invariants 手工 sample）

不满足的 invariant 要在 commit 信息里显式标注 `<TODO-INVARIANT: XXX-N · rationale>` · 不允许沉默豁免。

## Maintenance

- 每加一个 module · 此文件追加一节 invariants
- 每次发现 bug · 回头看是否应新增一条 invariant · "bug 是未被 invariant 捕获的 case"
