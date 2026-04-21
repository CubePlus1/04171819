# Round 1 · Spec Compliance
## Summary
Implementation coverage is solid across the new extension/backend/frontend surface, but there are still a few spec-facing contract drifts. The largest gaps are in `GET /api/my-comments` semantics and the WebSocket contract: the endpoint currently returns a broader dataset than C1 defines, and the shared WS event names/constants do not match §7.2. Schema/migration work is mostly in place, with smaller convention drift around creator handles and the Bilibili client retry/timeout behavior.

## Critical (3)
- [ ] `demo/backend/src/ingest.js:148` · `GET /api/my-comments` returns every `intent_signals` row, including mock and non-comment signals, instead of the C1 "我的评论" dataset for Bilibili comment intents · spec ref §5.3, §7.1 · fix suggestion: filter to real comment signals only, e.g. `signal_type = 'comment_intent'` plus real Bilibili sources / non-null `rpid`.
- [ ] `demo/backend/src/ingest.js:159` · `GET /api/my-comments` derives `fulfilled`/`pending` from card existence, but §7.1 models 已答/等待中 around answer state and exposes `card_id` as a separate field · spec ref §7.1 · fix suggestion: compute `fulfilled` from whether a top answer exists, then attach `card_id` independently.
- [ ] `demo/shared/contracts.js:10` · the shared WS contract uses `workflow.step`, while the spec preserves `step`; a client implemented against §7.2 will miss step frames · spec ref §7.2 · fix suggestion: rename the event back to `step` everywhere, or update the spec and all consumers together so there is one canonical contract.

## Warning (3)
- [ ] `demo/backend/src/historyBackfill.js:13` · `backfill.progress` and `backfill.done` are hardcoded locally and never added to `demo/shared/contracts.js`, even though §7.2 says these WS events should reuse the shared contract file · spec ref §7.2 · fix suggestion: add both event constants to `demo/shared/contracts.js` and import them from there.
- [ ] `demo/backend/src/bilibili.js:110` · the Bilibili client retries failures, but it has no request timeout and `MAX_RETRIES = 3` only gives 2 retries after the initial attempt, short of the specified "超时重试 3 次 + 指数退避" behavior · spec ref §5.2 · fix suggestion: add an `AbortController` timeout and treat the retry budget as 3 retries beyond the first attempt.
- [ ] `demo/backend/src/ingest.js:223` · real creator rows persist `handle` as `@name` (same pattern in `historyBackfill.js:54`), while §6 says Bilibili-mode `creators.handle` should store the space display name itself · spec ref §6 · fix suggestion: persist the raw display name in `handle`, or explicitly revise the schema convention if the `@` prefix is intentional.

## Info (0)

## Passed Checks
- ✅ `demo/extension/manifest.json` matches the §5.1 MV3 baseline: permissions, host permissions, background worker, `document_start` content script, and popup entry are all present.
- ✅ `demo/extension/content_script.js` implements the required response-side XHR/fetch hook for `/x/v2/reply/(reply/)?add`, wraps failures in `console.warn`, and batches `/api/marks?rpids=...` lookups with a 500ms debounce as described in §5.1.
- ✅ `demo/backend/data/migrations/002_bilibili_fields.sql` adds the required Bilibili columns and the unique `rpid` indexes for both `intent_signals` and `creator_actions`, matching §6.
- ✅ `demo/backend/src/migrate.js` scans `migrations/*.sql` in version order and enforces `PRAGMA user_version`, which aligns with the migration runner described in §6.
- ✅ `demo/backend/src/bilibili.js` exposes `fetchMsgfeedReply`, `fetchVideoReplies`, and `fetchVideoView`, and keeps `SESSDATA` in-memory via the outbound `Cookie` header as required by §5.2.
- ✅ `demo/frontend/src/App.jsx`, `ProductPanel.jsx`, `MyCommentsPanel.jsx`, `useDemoStore.js`, and `api/client.js` implement the §5.3 frontend reshape: AgentPanel is unmounted, ProductPanel owns the 信息流/我的评论 switch, and the My Comments API/store path exists.
