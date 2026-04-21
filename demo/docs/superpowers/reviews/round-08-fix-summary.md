# Round 08 Fix Summary

## W1 · bilibili.js timeout + retry budget
Before: `demo/backend/src/bilibili.js` 没有请求级 timeout，`MAX_RETRIES = 3` 实际只有 1 次初始 + 2 次重试，不满足 “初始 + 3 retries = 4 次尝试”。  
After: `requestJson()` 每次 fetch 都带 `AbortController`，默认 30s timeout；`MAX_RETRIES` 调整为 `4`，即 1 次初始 + 3 次退避重试。  
Commit: `6c2a0b5` `fix(bilibili): R8·W1-W3 share msgfeed normalize and retry budget`。  
Test:
- `cd demo/backend && node src/bilibili.test.js`

## W2 · msgfeed normalize 两份合约统一
Before: SW 的 `normalizeMsgfeedItem()` 兼容 nested `item/user` shape，backend `bilibili.js` 只认 flat shape，历史 backfill 和实时轮询对同一个 upstream endpoint 的解释漂移。  
After: 抽出 `demo/shared/bilibili-normalize.js` 作为单一 normalize 实现；backend `fetchMsgfeedReply()` 和 extension SW 都复用同一份 canonical flat contract，兼容 nested + flat 输入。  
Commit: `6c2a0b5` `fix(bilibili): R8·W1-W3 share msgfeed normalize and retry budget`。  
Test:
- `cd demo/backend && node src/bilibili.test.js`
- `cd demo/backend && node --check ../extension/service_worker.js`

## W3 · L1 replying_to_rpid 楼中楼父子回复修正
Before: SW 在 nested msgfeed shape 下可能优先 `root_reply_id`，把楼中楼回复挂到 thread root，而不是你真实的那条子评论。  
After: shared normalize 在 nested thread reply 场景优先 `source_id` / `reply_to_reply_id`，并把 `replying_to_rpid_source`、`root_reply_id`、`reply_to_reply_id` 记到 `debug` 字段里，便于排查。  
Commit: `6c2a0b5` `fix(bilibili): R8·W1-W3 share msgfeed normalize and retry budget`。  
Test:
- `cd demo/backend && node src/bilibili.test.js`

## W4 · notification 前端消费 card_id
Before: extension notification 点击后会打开 `?card_id=...`，但 frontend `App.jsx` 不读取 query，也不会自动 focus 对应卡片。  
After: bootstrap 完成后，`App.jsx` 读取 `card_id`，调用 `useDemoStore.focusCard(id)`，随后用 `history.replaceState()` 清掉 query，避免重复消费。  
Commit: `4933b41` `fix(bilibili): R8·W4-W5 focus deep link and trim ws payloads`。  
Test:
- `cd demo/frontend && npm run build`

## W5 · WS payload over-share trim
Before: `workflow.begin` 会把原始 comment text 广播给所有 WS client；ambient / workflow step detail 里也会带 `raw_text`。  
After: `workflow.begin` 改成只发 `{ run_id, user_id }`；ambient / workflow step detail 删除原始文本，只保留 `signal_id` / `action_id` 和必要 metadata；`card.generated` 保持完整，供 frontend 渲染。`server.js` 里补了 PII trim 注释说明策略。  
Commit: `4933b41` `fix(bilibili): R8·W4-W5 focus deep link and trim ws payloads`。  
Test:
- `cd demo/backend && node src/serverPayload.test.js`
- `cd demo/backend && node src/ambient.test.js`
- `cd demo/backend && node src/smoke.js`

## W6 · backfill 占位 raw_text 可被 hook 覆盖
Before: backfill 写入 `raw_text='(待补)'` 后，后续 `/api/ingest/comment` 命中同一 `rpid` 仍直接 409，真实评论正文永远补不回去。  
After: `/api/ingest/comment` 在发现同 `rpid` 且现有 `raw_text='(待补)'` 时，执行 in-place `UPDATE raw_text` 并返回 `200 { ok:true, updated:true }`；其他 duplicate 仍保留 409。  
Commit: `547ce5f` `fix(bilibili): R8·W6-W8 cover placeholder and ambient invariants`。  
Test:
- `cd demo/backend && node src/ingest.test.js`

## W7 · manifest scope 收窄
Before: `manifest.json` 带 `all_frames: true`，而本扩展当前只针对主 frame 工作；`storage` 权限是否可删也未核实。  
After: 保留 `storage`（SW 的 notification catch-up / 去重用到了 `chrome.storage.local`），去掉 `all_frames: true`，回到默认主 frame 注入。  
Commit: `547ce5f` `fix(bilibili): R8·W6-W8 cover placeholder and ambient invariants`。  
Test:
- `cd demo/backend && node --check ../extension/service_worker.js`

## W8 · invariant tests 补 AMB-1 / AMB-2 / AMB-4
Before: `AMB-1`、`AMB-2`、`AMB-4` 都只有实现上的 implied 保证，没有显式回归测试。  
After: `demo/backend/src/ambient.test.js` 新增：
- AMB-1: same signal 并发 `runAmbient()`，一条成功，一条 `SIGNAL_ALREADY_FULFILLED`
- AMB-2: 只有 `is_answer=0` action 时，`runAmbient()` 返回 `NO_MATCH`
- AMB-4: 成功履约后 `fulfilled` 保持 `1`，后续 ambient retry 不会把它改回 `0`，同时断言 step detail 不再泄露 raw text
Commit: `547ce5f` `fix(bilibili): R8·W6-W8 cover placeholder and ambient invariants`。  
Test:
- `cd demo/backend && node src/ambient.test.js`

## Final Verification
- `cd demo/backend && node src/answerJudge.test.js`
- `cd demo/backend && node src/bilibili.test.js`
- `cd demo/backend && node src/cardBuilder.test.js`
- `cd demo/backend && node src/historyBackfill.test.js`
- `cd demo/backend && node src/ingest.test.js`
- `cd demo/backend && node src/migrate.test.js`
- `cd demo/backend && node src/ambient.test.js`
- `cd demo/backend && node src/seed.test.js`
- `cd demo/backend && node src/contracts.test.js`
- `cd demo/backend && node src/serverSecurity.test.js`
- `cd demo/backend && node src/serverPayload.test.js`
- `cd demo/backend && node src/smoke.js`
- `cd demo/frontend && npm run build`
- `cd demo/backend && node --check ../extension/service_worker.js`

## Skipped · v0.3.1 Debt
- THEMES 12 vs 13 label · `data-split` 死代码 cleanup（R4-W2）
- `content_script` `CustomEvent` page leak（R3-W3）
- `SESSDATA cookies.getAll` fallback（R6-W2）
- popup 长任务 `chrome.storage` 反馈（R6-W4）
- MIG-3 / JUDGE-2 / FE-4 / FE-5 / EXT-1 / EXT-5 测试补齐
