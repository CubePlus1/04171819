# Round 2 · Invariants
## Summary
36 个 invariants 里，18 个有显式测试断言，15 个只靠实现结构成立，3 个既没有测试也没有被当前实现真正锁死。风险最高的是 `ING-5`、`AMB-3`、`EXT-2`：评论摄入没有触发 ambient/workflow，topic 级去重只停留在查询层，badge 去重只做了局部 DOM 守卫。

## Coverage Table
| ID | status | evidence (file:line) | gap |
| --- | --- | --- | --- |
| MIG-1 | IMPLIED | `demo/backend/src/migrate.js:55-71` | No explicit skip-older regression test. |
| MIG-2 | COVERED | `demo/backend/src/migrate.test.js:80-86` | - |
| MIG-3 | IMPLIED | `demo/backend/src/migrate.js:58-71` | No injected-failure test proving rollback leaves `user_version` unchanged. |
| MIG-4 | IMPLIED | `demo/backend/src/migrate.js:45-96` | No explicit test/CLI assertion for absent rollback path. |
| BILI-1 | COVERED | `demo/backend/src/bilibili.test.js:212-244` | - |
| BILI-2 | COVERED | `demo/backend/src/bilibili.test.js:130-178` | - |
| BILI-3 | COVERED | `demo/backend/src/bilibili.test.js:180-210` | - |
| BILI-4 | COVERED | `demo/backend/src/bilibili.test.js:246-319` | - |
| JUDGE-1 | COVERED | `demo/backend/src/answerJudge.test.js:253-269` | - |
| JUDGE-2 | IMPLIED | `demo/backend/src/answerJudge.js:41-69`; `demo/backend/src/answerJudge.test.js:271-291` | Tests only assert confidence extremes, not the hidden `score` bound directly. |
| JUDGE-3 | COVERED | `demo/backend/src/answerJudge.test.js:293-329` | - |
| JUDGE-4 | COVERED | `demo/backend/src/answerJudge.test.js:331-342` | - |
| ING-1 | COVERED | `demo/backend/src/ingest.test.js:132-141` | - |
| ING-2 | COVERED | `demo/backend/src/ingest.test.js:108-129` | - |
| ING-3 | COVERED | `demo/backend/src/ingest.test.js:144-161` | - |
| ING-4 | COVERED | `demo/backend/src/ingest.test.js:228-239` | - |
| ING-5 | MISSING | `demo/backend/src/ingest.js:255-261` | Comment ingest emits only `ingest.signal`; no ambient trigger and no `workflow.begin` assertion. |
| BF-1 | COVERED | `demo/backend/src/historyBackfill.test.js:113-335` | - |
| BF-2 | COVERED | `demo/backend/src/historyBackfill.test.js:219-225,319-325` | - |
| BF-3 | COVERED | `demo/backend/src/historyBackfill.test.js:197-226,307-326` | - |
| BF-4 | COVERED | `demo/backend/src/historyBackfill.test.js:338-423` | - |
| AMB-1 | IMPLIED | `demo/backend/src/ambient.js:322-365` | No concurrent `runAmbient` test proving one caller gets `SIGNAL_ALREADY_FULFILLED`. |
| AMB-2 | IMPLIED | `demo/backend/src/ambient.js:52-77`; `demo/backend/src/ambient.js:418-435` | No seed-based test proving `is_answer=0` yields `NO_MATCH`. |
| AMB-3 | MISSING | `demo/backend/src/ambient.js:68-76,332-347`; `demo/backend/data/migrations/001_initial.sql:77-78` | Query filters by topic, but persistence only has unique-by-signal; concurrent same-topic runs can still insert two cards. |
| AMB-4 | IMPLIED | `demo/backend/src/ambient.js:152-156`; `demo/backend/src/ambient.js:322-324` | No explicit assertion that normal paths never reset `fulfilled` to `0`. |
| AMB-5 | COVERED | `demo/backend/src/cardBuilder.test.js:140-149` | - |
| FE-1 | COVERED | `demo/backend/src/ingest.test.js:121-127` | - |
| FE-2 | IMPLIED | `demo/backend/src/ingest.js:160-199` | No explicit intersection test across `fulfilled` and `pending` fetches. |
| FE-3 | IMPLIED | `demo/backend/src/ingest.js:162-179` | No schema assertion over every required item key. |
| FE-4 | IMPLIED | `demo/frontend/src/components/MyCommentsPanel.jsx:11-18`; `demo/frontend/src/store/useDemoStore.js:220-229` | No mount/unmount tab-switch test proving feed queue and spotlight remain unchanged. |
| FE-5 | IMPLIED | `demo/frontend/src/store/useDemoStore.js:232-246` | No explicit test for warn-and-state-unchanged on unknown card id. |
| EXT-1 | IMPLIED | `demo/extension/content_script.js:291-349` | No injected-throw test proving native XHR/fetch behavior survives hook-side failures. |
| EXT-2 | MISSING | `demo/extension/content_script.js:442-478,480-496` | Badge guard is local to one reply node; duplicated DOM nodes with the same `rpid` can each receive a badge. |
| EXT-3 | IMPLIED | `demo/extension/service_worker.js:285-297` | No notification spy test on repeated `card.generated` payloads. |
| EXT-4 | IMPLIED | `demo/extension/content_script.js:360-419`; `demo/extension/content_script.js:539-566` | No automated assertion that observer root never falls back to `document.body`. |
| EXT-5 | IMPLIED | `demo/extension/service_worker.js:44-74` | No timing test around consecutive Bilibili requests. |

## Critical Missing (3)
- [ ] `ING-5` · `POST /api/ingest/comment` never fire-and-forget triggers ambient/workflow, so there is no path that can emit `workflow.begin` from comment ingest. Suggested fix: call the ambient orchestration entrypoint after successful signal insert and add a ws/broadcast assertion.
- [ ] `AMB-3` · topic-level dedupe is only in the selection query; the write path does not re-check topic uniqueness and the schema only enforces unique `intent_signal_id`. Suggested fix: enforce uniqueness at persistence time, ideally with a topic-level key plus a concurrent race test.
- [ ] `EXT-2` · `.dundao-badge` dedupe is scoped to one reply node’s `.info` container, not to the logical `rpid`. Suggested fix: tag badges with `data-dundao-rpid` and reject duplicates across the observer root, then add a repeated-DOM-append test.

## Warning
Extension, ambient, and frontend invariants are mostly untested in this round. Several “IMPLIED” rows are reasonable by code inspection, but they still lack failure-path evidence, especially `MIG-3`, `JUDGE-2`, `AMB-1`, `AMB-2`, `FE-4`, `EXT-1`, and `EXT-5`.

## Passed
- Count: 18 COVERED, 15 IMPLIED, 3 MISSING
