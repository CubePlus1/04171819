# Round 07 Fix Summary

## P0-A · Ambient auto-trigger
Before: `POST /api/ingest/reply`、`POST /api/ingest/top-reply`、history backfill 只写 `creator_actions`，不会自动把链路推进到 `runAmbient()`，真实数据不会生成卡。 After: `ingest.js` 和 `historyBackfill.js` 都支持 fire-and-forget `triggerAmbient`，`server.js` 注入自动 ambient 调度并广播 `workflow.begin -> step -> card.generated -> workflow.end`。 Commit: `f7b1834` `fix(bilibili): R7·P0-A restore ambient auto-trigger`。 Tests: `cd demo/backend && node src/ingest.test.js`、`cd demo/backend && node src/historyBackfill.test.js` passed.

## P0-B · B 站 DOM selector 过期
Before: content script 只盯 `.reply-warp/.reply-list/#comment`，当前视频页挂载点换成 `#commentapp` 时 observer 很容易永远不 attach。 After: `content_script.js` 扩展到 `#commentapp`，reply item 识别改成 `[data-rpid]/[data-id] + 常见 class fallback`，并在 open shadow root 场景下探测并告警。 Commit: `ad50cfa` `fix(bilibili): R7·P0-B refresh comment DOM selectors`。 Tests: `cd demo/backend && node --check ../extension/content_script.js` passed.

## P0-C · 本机绑定 + WS origin 加固
Before: backend 默认监听所有网卡，RFC1918 Origin 被放行，WS 缺失 Origin 也能连，extension 端仍大量写死 `localhost`。 After: `server.js` 绑定 `127.0.0.1`，Origin allowlist 只剩 `localhost/127.0.0.1`，`events.js` 对缺失 WS Origin 返回 403，extension backend/frontend/ws URL 改到 `127.0.0.1`，manifest host permission 同步到 loopback。 Commit: `b7e8238` `fix(bilibili): R7·P0-C harden loopback origins`。 Tests: `cd demo/backend && node src/serverSecurity.test.js`、`cd demo/backend && node --check ../extension/service_worker.js`、`cd demo/backend && node --check ../extension/popup.js` passed.

## P0-D · v0.2.0 fixture 回归
Before: `db:seed` 只跑基础 schema，mock fixtures 落不到 v2/v3，ambient 也认不出 mock answer，`/api/bootstrap` 和 `smoke.js` 会断。 After: `seed.js` 先 `applyMigrations()`，fixtures 明确补齐 `is_answer/source/replying_to_rpid`，ambient topic-match 接受 mock answer，seed 后仍有 pending ambient。 Commit: `6a9d550` `fix(bilibili): R7·P0-D restore v0.2.0 fixtures`。 Tests: `cd demo/backend && node src/seed.test.js` passed; final `smoke.js` passed.

## P1-E · Wake-driven notification catch-up
Before: MV3 service worker 休眠后只剩偶发 WS 在线窗口，`card.generated` 通知经常丢失且没有补偿。 After: `service_worker.js` 保留 WS 作为加速通道，但每次 alarm 唤醒后都会补拉 `/api/my-comments?filter=fulfilled`，并通过 `chrome.storage.local.lastNotifiedCardId` 去重补发通知。 Commit: `e20b1a6` `fix(bilibili): R7·P1-E add wake-driven notification catch-up`。 Tests: `cd demo/backend && node --check ../extension/service_worker.js` passed.

## P1-F / P1-G / P1-I · 评论契约、WS step、backfill contracts
Before: `/api/my-comments` 会把 mock 和非 comment signal 都带出来，fulfilled 依赖 card 是否存在；`workflow.step` 与 spec 的 `step` 漂移；`backfill.progress/done` 是本地硬编码。 After: `/api/my-comments` 只返回真实评论信号，fulfilled 改按 top answer 判断并单独返回 `card_id`；shared contracts 把 `WORKFLOW_STEP` 改回 `step` 并新增 `BACKFILL_EVENTS`，historyBackfill 改为直接复用 shared 常量。 Commit: `d64c54c` `fix(bilibili): R7·P1-F align comment and ws contracts`。 Tests: `cd demo/backend && node src/ingest.test.js`、`cd demo/backend && node src/contracts.test.js` passed.

## P1-H · Topic-level dedup 写入保障
Before: ambient 只在读取候选时按 topic 去重，两个不同 signal 同 topic 并发落库时仍可能插两张卡。 After: 新增 migration `003_topic_unique.sql`，给 `cards` 增加冗余 `topic` 并建立 `UNIQUE(user_id, topic)`，ambient insert 带上 topic，topic 唯一约束冲突统一映射回 `signal-already-fulfilled`。 Commit: `3a6d382` `fix(bilibili): R7·P1-H enforce topic-level card dedup`。 Tests: `cd demo/backend && node src/ambient.test.js`、`cd demo/backend && node src/migrate.test.js` passed.

## Final Verification
- `cd demo/backend && node src/answerJudge.test.js` passed.
- `cd demo/backend && node src/bilibili.test.js` passed.
- `cd demo/backend && node src/cardBuilder.test.js` passed.
- `cd demo/backend && node src/historyBackfill.test.js` passed.
- `cd demo/backend && node src/ingest.test.js` passed.
- `cd demo/backend && node src/migrate.test.js` passed.
- `cd demo/backend && node src/ambient.test.js` passed.
- `cd demo/backend && node src/seed.test.js` passed.
- `cd demo/backend && node src/contracts.test.js` passed.
- `cd demo/backend && node src/serverSecurity.test.js` passed.
- `cd demo/backend && node src/smoke.js` passed against a live local backend on `127.0.0.1:4000`.

## Skipped
- None.
