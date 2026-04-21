# Round 10 · Green-Light Report

## 1. Executive Summary
经过 R1-R9 的收敛，v0.3.0 的核心单机场景已经闭环：评论/回复摄入、ambient 自动履约、卡片生成、前端聚焦、扩展轮询与通知 catch-up 都有对应实现与验证证据。R7/R8 关闭了大多数真正阻断上线的点，尤其是 loopback 安全、ambient auto-trigger、v0.2.0 fixture 兼容、topic 级去重、当前 B 站评论挂载点适配，以及 `/api/my-comments` / WS 合约修正。R9 的最新人工验证与源码审阅一致：backend 10/10 suites green、frontend build green、extension manifest + 4 个 JS parse green。结论是：对“单用户、本机 localhost、自装扩展”的 personal use，可认为已经达到生产可用；对任何多用户、远程暴露、公开分发或强依赖实时通知的场景，仍不应视为 production-ready。

## 2. 10-Round Journey Table
| Round | Focus | Key Findings | Resolved? |
| --- | --- | --- | --- |
| R1 | Spec compliance | 3 Critical, 3 Warning | 3/3 critical fixed in `d64c54c`; bilibili timeout/retry fixed in `6c2a0b5`; creator `handle` convention drift remains non-blocking debt |
| R2 | Invariants | 18 COVERED, 15 IMPLIED, 3 MISSING | `ING-5` fixed in `f7b1834`; `AMB-3` fixed in `3a6d382`; `AMB-1/2/4` promoted to covered in `547ce5f`; `EXT-2` remains |
| R3 | Security | 1 Critical, 4 Warning | Loopback/origin critical fixed in `b7e8238`; WS payload trim fixed in `4933b41`; `CustomEvent` leak remains debt |
| R4 | Regression | 2 Critical, 2 Warning | 2/2 critical fixed in `6a9d550`; theme-count / layout-coupling warning deferred to v0.3.1 |
| R5 | Integration | 1 Critical, 5 Warning | Ambient chain critical fixed in `f7b1834`; normalization + retry warnings fixed in `6c2a0b5`; deep-link fixed in `4933b41`; placeholder overwrite fixed in `547ce5f` |
| R6 | Extension robustness | 2 Critical, 5 Warning | Selector critical fixed in `ad50cfa`; MV3 WS issue mitigated by `e20b1a6` but not fully eliminated; several MV3 hardening items deferred |
| R7 | Fix batch A | P0/P1 closure wave | Landed `f7b1834`, `ad50cfa`, `b7e8238`, `6a9d550`, `e20b1a6`, `d64c54c`, `3a6d382` |
| R8 | Fix batch B | W1-W8 closure wave | Landed `6c2a0b5`, `4933b41`, `547ce5f` |
| R9 | Manual verification | Backend 10/10 green; frontend vite build OK; extension manifest + 4 JS parse OK | Accepted as latest verification evidence for release-readiness judgment |
| R10 | Final review | Green-light decision, residual risks, v0.3.1 debt | This report |

## 3. Critical Audit · 12→2 remaining
| # | Origin | Finding | Status | Commit Reference | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | R1 | `/api/my-comments` returned mock + non-comment signals | FIXED | `d64c54c` | Now filtered to real `comment_intent` Bilibili comment signals |
| 2 | R1 | `/api/my-comments` derived fulfilled from card existence, not answer state | FIXED | `d64c54c` | `fulfilled` now follows top-answer state and keeps `card_id` separate |
| 3 | R1 | Shared WS contract used `workflow.step` instead of `step` | FIXED | `d64c54c` | Shared contracts now expose canonical `step` and keep legacy compatibility |
| 4 | R2 | `ING-5` automatic handoff into ambient/workflow missing | FIXED | `f7b1834` | Reply/top-reply/backfill now fire ambient automatically and surface workflow/card broadcasts |
| 5 | R2 | `AMB-3` topic-level dedupe only existed at read-time | FIXED | `3a6d382` | `cards` now carry topic with `UNIQUE(user_id, topic)` plus race coverage |
| 6 | R2 | `EXT-2` badge dedupe scoped to DOM node, not logical `rpid` | KNOWN-DEBT | `ad50cfa` | Selector refresh landed, but logical-rpid duplicate badge edge still lacks a dedicated fix/test |
| 7 | R3 | Backend was not truly loopback-only; WS origin policy too broad | FIXED | `b7e8238` | Bind host and origin allowlist now match the localhost threat model |
| 8 | R4 | `db:seed` no longer produced an ambient-runnable v0.2.0 fixture DB | FIXED | `6a9d550` | Seed now applies migrations first |
| 9 | R4 | Even after migrate, mock fixtures no longer matched ambient | FIXED | `6a9d550` | Fixtures now set `is_answer/source/replying_to_rpid`, and ambient accepts mock answer topic match |
| 10 | R5 | Bilibili chain stopped at `creator_actions` and never auto-generated cards | FIXED | `f7b1834` | Real ingest/backfill path now hands off into `runAmbient()` |
| 11 | R6 | MV3 WebSocket real-time notification chain was not lifecycle-safe | DEFERRED | `e20b1a6` | Wake-driven catch-up makes it acceptable for personal use, but not true real-time delivery |
| 12 | R6 | Video-page comment observer targeted stale DOM roots | FIXED | `ad50cfa` | `#commentapp` and broader reply-item selectors restored current-page compatibility |

## 4. Invariants Status · final 36 count
| Bucket | R2 Baseline | R10 Final | Delta |
| --- | --- | --- | --- |
| COVERED | 18 | 23 | +5 |
| IMPLIED | 15 | 12 | -3 |
| MISSING | 3 | 1 | -2 |

- Newly moved to `COVERED`: `ING-5` (`f7b1834`), `AMB-3` (`3a6d382`), `AMB-1` / `AMB-2` / `AMB-4` (`547ce5f`).
- Still `IMPLIED`: `MIG-1`, `MIG-3`, `MIG-4`, `JUDGE-2`, `FE-2`, `FE-3`, `FE-4`, `FE-5`, `EXT-1`, `EXT-3`, `EXT-4`, `EXT-5`.
- Still `MISSING`: `EXT-2` only.
- Delta interpretation: the ambient chain moved from “missing” to “code + test locked”; the remaining gaps are now concentrated in migration failure-path proof, answer-judge bound proof, frontend state-behavior tests, and extension robustness tests.

## 5. Known Debt for v0.3.1
Explicitly deferred in R7/R8 and still open:

- `R4-W2` · `THEMES` 12 vs 13 label drift, plus `data-split` / `data-card-aspect` dead-code cleanup
- `R3-W3` · `content_script` `CustomEvent` page-world leak
- `R6-W2` · `SESSDATA` `cookies.getAll()` fallback + domain/store/partition diagnostics
- `R6-W4` · popup long-task feedback via `chrome.storage` / recoverable task state
- `R6-W5` · `chrome.notifications.getPermissionLevel()` runtime check
- Invariant test gaps · `MIG-3`, `JUDGE-2`, `FE-4`, `FE-5`, `EXT-1`, `EXT-5`

## 6. Residual Risks
- SW WS 休眠问题：`R7-E` 已做 alarm wake-up catch-up，但 `card.generated` 仍存在 real-time 延迟窗，不能当严格实时通知 SLA。
- Extension CSP fragility：XHR/fetch hook 当前可用，但 B 站若加严 CSP / nonces 或二次覆写 hook，桥接可能静默失效。
- B 站 DOM selector drift：虽然已扩展到 `#commentapp`，评论区 DOM 仍属于脆弱依赖，建议补 runtime telemetry 监控 attach 失败率。
- R1 误判率未量化：目前只有 20+ 样本规则测试，实际 false positive / false negative 仍可能到 30%+。

## 7. Green-Light Decision
**GREEN**

前置条件是明确收窄范围：`GREEN for personal localhost use`，仅限单用户、本机 `127.0.0.1` 后端、自装扩展、接受 eventual-not-real-time 通知体验。当前版本不再存在会直接打断核心闭环的 P0/P1 问题，且 R9 验证证据与源码状态一致，因此可以进入自用阶段。  
**NOT GREEN** for any multi-user deployment, internet-exposed backend, public extension distribution, or any scenario that demands hardened injection and guaranteed real-time notification delivery.

## 8. Recommended Next Actions
1. Highest priority for v0.3.1: close `CustomEvent` leak, add `SESSDATA getAll` fallback, add notification permission-level checks, and decide whether to close `EXT-2` logical-rpid badge dedupe before broader dogfooding.
2. Next priority:补齐 invariant tests for `MIG-3`, `JUDGE-2`, `FE-4`, `FE-5`, `EXT-1`, `EXT-5`; these are the cheapest way to stop regressions from reopening.
3. Nice-to-have: popup 长任务状态持久化、`THEMES` label/死代码清理、真实 icon 资源替换。
4. 推荐真人 smoke 流程：按模板 [template-v0.3.0.md](/Users/sevencolor/code/0BKHDD/.worktrees/dundao-bilibili/demo/docs/superpowers/smoke-reports/template-v0.3.0.md) 跑一轮真实账号验证，重点记录四个假设是否被打破：
   第一，评论提交 hook 仍能抓到 `/x/v2/reply/add`。
   第二，`#commentapp` 路径下 badge observer 能稳定 attach。
   第三，浏览器睡眠/唤醒后 catch-up 通知延迟是否仍可接受。
   第四，`judgeAnswer` 的误判是否在你的真实样本里明显高于当前测试集。
