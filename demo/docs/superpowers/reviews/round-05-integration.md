# Round 5 · Backend Integration Chain
## Summary
- `topic` is internally consistent on the Bilibili path: all real inserts converge on `bilibili:aid:<aid>`.
- `rpid` / `replying_to_rpid` and `is_answer` / `confidence` are mostly wired correctly through ingest and ambient selection.
- The main break is after ingest: neither `POST /api/ingest/reply`, `POST /api/ingest/top-reply`, nor `backfill.done` automatically hand off into `runAmbient`, so the spec's `answerJudge -> ambient -> card.generated` chain does not happen on its own.
- Secondary drift exists in `msgfeed/reply` normalization, topic-vs-signal fulfillment semantics, notification deep-linking, and reconnect behavior.

## Critical (1)
- The real Bilibili chain currently stops at `creator_actions`; there is no automatic transition into `ambient`. `ingest.js` only writes rows and broadcasts `ingest.signal` / `ingest.action` (`demo/backend/src/ingest.js:255-259`, `336-342`, `434-440`). `historyBackfill.js` only forwards `backfill.progress` / `backfill.done` (`demo/backend/src/historyBackfill.js:342-356`). `runAmbient` is only reachable through `POST /api/ambient/tick` (`demo/backend/src/server.js:212-248`). The only frontend caller is `ambientTick()` in `AgentPanel.jsx` (`demo/frontend/src/api/client.js:42-55`, `demo/frontend/src/panels/AgentPanel.jsx:27-65`), but `App.jsx` no longer mounts `AgentPanel` and renders only `ProductPanel` (`demo/frontend/src/App.jsx:3`, `168`). Against spec §4.1/§4.2, this means backfill/live ingest can populate `intent_signals` and `creator_actions`, but no `cards` insert, no `card.generated`, and therefore no frontend fan-out or SW notification unless something external manually calls `/api/ambient/tick`.

## Warning (5)
- `msgfeed/reply` is normalized by two different contracts. The service worker accepts nested `item/user` fields and multiple timestamp shapes (`demo/extension/service_worker.js:105-161`), while backend backfill only reads flat fields like `source_id`, `business_id`, `reply_content`, and `occurred_at` (`demo/backend/src/bilibili.js:25-42`). This is drift on the same upstream endpoint. Inference: if the live payload shape leans on nested fields, daily L1 polling may still work while history backfill silently degrades or skips rows.
- The L1 `replying_to_rpid` fallback order is only conditionally correct for nested replies. In `service_worker.js`, when `source_id` is absent it prefers `inner.root_reply_id` before `inner.reply_to_reply_id` (`demo/extension/service_worker.js:110-115`). Inference: for replies to your child comment inside a thread, this can bind the action to the thread root instead of your exact `rpid`. `ingest/reply` will still store that value (`demo/backend/src/ingest.js:271-281`, `324-326`), but ambient L1 matching is exact on `ca.replying_to_rpid = s.rpid` (`demo/backend/src/ambient.js:58-67`), so the answer becomes orphaned from the intended signal.
- Ambient fulfillment is topic-level, but `/api/my-comments` pending state is signal-level. Ambient suppresses a second card for the same `topic` via `NOT EXISTS (... si.topic = s.topic)` (`demo/backend/src/ambient.js:70-76`, `436-440`). `/api/my-comments` marks a row fulfilled only when that exact `intent_signal_id` has a card (`demo/backend/src/ingest.js:159-170`, `190-198`). `pollTopReplies()` then derives pending `aid`s from that endpoint (`demo/extension/service_worker.js:238-248`). Result: if multiple comments exist under one `aid`, one card can fulfill the topic while sibling signals remain permanently "pending" and keep driving redundant L2 polling.
- Notification click deep-linking is not completed. The SW opens `http://localhost:5173?card_id=<id>` on notification click (`demo/extension/service_worker.js:300-306`), but the frontend never reads `location.search` or `card_id`; the only focus path is internal `focusCard(cardId)` from `MyCommentsPanel` (`demo/frontend/src/panels/ProductPanel.jsx:138-143`, `demo/frontend/src/store/useDemoStore.js:232-246`). The notification opens the app, but not the intended card.
- Spec §4.1 says backfill rows with missing `source_content` should later be overwritten by the hook path. Current code cannot do that. `historyBackfill.js` inserts `(待补)` when content is missing (`demo/backend/src/historyBackfill.js:26-28`, `206-218`), while `/api/ingest/comment` is `INSERT OR IGNORE` on unique `rpid` and returns `409 duplicate_rpid` instead of updating `raw_text` (`demo/backend/src/ingest.js:228-253`). So placeholder backfill rows stay placeholders indefinitely.

## Info (3)
- `creators` insertion is idempotent, and I do not see a real duplicate-row race under the current server model. Both ingest and backfill use `INSERT OR IGNORE INTO creators` on `creators.id` (`demo/backend/src/ingest.js:65-70`, `221-226`, `286-290`, `383-387`; `demo/backend/src/historyBackfill.js:51-63`, `199-204`, `229-232`), and SQLite writes are serialized through the backend process. The real weakness is first-write-wins metadata: later avatar/bio/name enrichment is ignored.
- Rate limiting is split rather than literally doubled on one code path. Backend `bilibili.js` enforces 1 req/s per endpoint key for backfill/server-side fetches (`demo/backend/src/bilibili.js:96-115`, `149-206`). The extension SW has its own global 1 req/s queue across all Bilibili requests (`demo/extension/service_worker.js:12-18`, `44-74`). So there is no same-request double sleep, but the semantics drift: SW is stricter than spec, while concurrent SW + backfill still do not share one global budget.
- WS fan-out is intentionally dual-channel. `card.generated` is broadcast to every WS client (`demo/backend/src/events.js:28-35`, `demo/backend/src/server.js:238-239`). The frontend dedupes cards by `card.id` before enqueueing (`demo/frontend/src/store/useDemoStore.js:167-187`), and the SW uses deterministic notification ids `card-<card.id>` (`demo/extension/service_worker.js:291-297`), which makes each consumer locally idempotent. The remaining gap is missed-event recovery: frontend rehydrates on reconnect (`demo/frontend/src/App.jsx:71-76`), but SW has no replay/bootstrap path, so disconnected periods can miss notifications permanently.

## Data Flow Diagram
```mermaid
flowchart LR
  CS["content_script\nPOST /api/ingest/comment"] --> SIG["intent_signals\nrpid / topic=bilibili:aid:<aid>"]
  BF["historyBackfill\nGET /x/msgfeed/reply"] --> SIG

  SW1["service_worker L1\nGET /x/msgfeed/reply"] --> IR["POST /api/ingest/reply"]
  SW2["service_worker L2\nGET /x/v2/reply"] --> IT["POST /api/ingest/top-reply"]

  IR --> ACT["creator_actions\nrpid / replying_to_rpid /\nis_answer / confidence"]
  IT --> ACT

  SIG -. L1 exact match: s.rpid .-> AMB["runAmbient /api/ambient/tick"]
  ACT -. L2 topic match:\nsource=L2 && replying_to_rpid IS NULL .-> AMB

  ACT -. missing automatic handoff in current code .-> GAP["No automatic ambient trigger\nafter ingest/backfill"]

  AMB --> CARD["DB tx:\nUPDATE intent_signals.fulfilled\nINSERT cards"]
  CARD --> WS["WS card.generated"]
  WS --> FE["frontend onCardGenerated\ncard.id dedupe"]
  WS --> NOTI["service_worker\nchrome.notifications.create(card-<id>)"]
  NOTI --> OPEN["open http://localhost:5173?card_id=<id>"]
  OPEN -. frontend does not consume card_id .-> FE
```

## Passed
- Insert topic consistency is correct on the real Bilibili path. `POST /api/ingest/comment` uses `topicFromAid(aid)` (`demo/backend/src/ingest.js:14-16`, `243`), `historyBackfill.js` uses the same helper (`demo/backend/src/historyBackfill.js:18-20`, `213`, `258`), and reply/top-reply ingestion falls back to `context.topic ?? topicFromAid(aid)` (`demo/backend/src/ingest.js:281-285`, `366-369`).
- `rpid` / `replying_to_rpid` are persisted end to end for the intended L1 path. The SW sends both (`demo/extension/service_worker.js:149-161`), `ingest/reply` stores both (`demo/backend/src/ingest.js:268-330`), and ambient selects L1 answers by exact `ca.replying_to_rpid = s.rpid` (`demo/backend/src/ambient.js:58-67`).
- `is_answer` / `confidence` are computed immediately on reply and top-reply ingest, persisted into `creator_actions`, and ambient only considers `ca.is_answer = 1` (`demo/backend/src/ingest.js:292-301`, `326-329`, `389-398`, `423-426`; `demo/backend/src/ambient.js:58-67`, `425-434`).
- L1 vs L2 association logic is explicitly separated and matches the design intent. L1 is exact-`rpid`; L2 is `source='L2'` plus `replying_to_rpid IS NULL` plus `topic` equality (`demo/backend/src/ambient.js:58-67`, `425-434`).
- The card fan-out consumers are individually deduped enough for simultaneous frontend + SW subscription. Frontend removes an existing card with the same id before append (`demo/frontend/src/store/useDemoStore.js:169-186`), and SW notification ids are stable per card (`demo/extension/service_worker.js:291-297`).
