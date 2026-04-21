# Round 4 · Regression vs v0.2.0
## Summary
v0.2.0 的遗留 `/api/comment` 路径本身还活着，`intent.js` / `matcher.js` / `workflow.js` / `cardBuilder.js` 这条老链路没有被 T6 直接打坏；我在隔离副本里验证了 `POST /api/comment` 仍能 200 返回 `ok:true`，并继续发出 `workflow.begin -> workflow.step x5 -> card.generated -> workflow.end`。

真正的回归出在 ambient/mock 兼容层。spec 第 12 节声称 “demo v0.2.0 fixtures 种子数据继续可用（`source='mock'` 标记）” [spec](../specs/2026-04-21-bilibili-tracker-design.md#L537)，但当前 `seed.js` 只跑基础 `schema.sql`，没有确保 002 迁移列存在；而 ambient 查询又强依赖 `ca.is_answer` / `ca.source` / `ca.replying_to_rpid`。结果是：干净库 `db:seed` 后 `/api/bootstrap` 直接 500；即便补跑 migration，fixtures 也会因为 `is_answer=0` 且 `source='mock'` 而完全选不出 ambient 卡，`smoke.js` 因此失败。

## Critical (2) · v0.2.0 行为真 broken
1. `npm run db:seed` 不再能把 v0.2.0 mock 数据种成“可 ambient 运行”的数据库。
证据：
`seed.js` 只调用 `runSchema()` [seed.js](../../../backend/src/seed.js#L21)；`runSchema()` 只执行基础 `schema.sql` [db.js](../../../backend/src/db.js#L24)；而基础 `schema.sql` 没有 `aid/rpid/source/is_answer/...` 这些 002 列 [schema.sql](../../../backend/data/schema.sql#L1)。ambient 查询却在 `pickNextCandidate()` / `hasPendingAmbient()` 里直接依赖 `ca.is_answer`、`ca.source`、`ca.replying_to_rpid` [ambient.js](../../../backend/src/ambient.js#L51) [ambient.js](../../../backend/src/ambient.js#L405)。
运行证据：
在临时副本里执行 `npm run db:seed` 后启动 server，`GET /api/bootstrap` 返回 500，错误是 `SqliteError: no such column: ca.is_answer`；`POST /api/ambient/tick` 也 500。只有 `/api/comment` 还能走通。
影响：
“fresh clone -> seed -> 启 demo” 这一条 v0.2.0 展台路径已经坏了。

2. 即便手动补跑 migration，fixtures mock 也不会再被 ambient 选中生成卡。
证据：
002 migration 给 `creator_actions.is_answer` 默认值 `0`、`source` 默认值 `'mock'` [002_bilibili_fields.sql](../../../backend/data/migrations/002_bilibili_fields.sql#L10)。`seed.js` 插入 actions 时没有写 `is_answer/source/replying_to_rpid` [seed.js](../../../backend/src/seed.js#L64)；ambient 匹配又要求 `ca.is_answer = 1` 且满足 `replying_to_rpid = s.rpid`，或 `ca.source = 'L2' AND ca.topic = s.topic` [ambient.js](../../../backend/src/ambient.js#L58)。
运行证据：
在隔离副本里执行 `npm run db:seed && npm run migrate` 后查询 join 计数，`intent_signals x creator_actions` 的 ambient 命中数为 `0`。此时 `GET /api/bootstrap` 虽恢复 200，但 `pending=false`；`POST /api/ambient/tick` 返回 `ok:false, reason:\"no-match\"`；`npm run smoke` 直接失败在 `bootstrap.pending=true` 断言。
影响：
spec 第 12 节“fixtures 继续可用”的 claim 当前不成立；`/api/reset` 也会不断把 demo 重置回一个 ambient 不可用的状态 [server.js](../../../backend/src/server.js#L258)。

## Warning (2) · 潜在破坏
1. `DEMO_LOOP=1` 的 loopMode 逻辑本身还在，但被当前 fixtures 回归掩盖了。
代码上，`server.js` 仍然通过 `DEMO_LOOP` / `LOOP_MODE` 驱动 ambient [server.js](../../../backend/src/server.js#L30)；`ambient.js` 仍保留 `useLoopReplay -> softResetForLoop()` 逻辑 [ambient.js](../../../backend/src/ambient.js#L203) 和 `hasPendingAmbient(..., { loopMode })` 分支 [ambient.js](../../../backend/src/ambient.js#L405)。
运行上，我在隔离副本把 seed 出来的 action 临时改成 `is_answer=1, source='L2'` 后，用 `DEMO_LOOP=1` 连续打 4 次 `/api/ambient/tick`，前三次接完后第四次仍然 `ok:true`，`bootstrap.pending` 一直是 `true`。说明 loop replay 没被删，但当前 seed/reset 产出的数据根本触发不到这条路径。

2. 主题切换没整体炸，但“12 主题 + layout 变化”这个说法已经不准确。
`ThemeSwitcher` 仍挂在 header 上 [App.jsx](../../../frontend/src/App.jsx#L178) [ThemeSwitcher.jsx](../../../frontend/src/themes/ThemeSwitcher.jsx#L4)，`useTheme()` 也还会注入 `data-surface/data-split/data-card-aspect/data-type-scale` [useTheme.js](../../../frontend/src/themes/useTheme.js#L19)。但当前 `THEMES` 实际是 13 套，不是 12 套 [tokens.js](../../../frontend/src/themes/tokens.js#L9)；同时单栏版 `App -> ProductPanel` 已经固定成单面板、`max-w-[380px]` [App.jsx](../../../frontend/src/App.jsx#L161) [ProductPanel.jsx](../../../frontend/src/panels/ProductPanel.jsx#L124)，代码库里也没有任何地方消费 `data-split` / `data-card-aspect`，只有 `data-type-scale` 还在 CSS 里生效 [index.css](../../../frontend/src/index.css#L76)。
结论：
颜色、字体、字号切换还正常；“布局跟主题联动”这一层现在基本失效，属于退化不是硬崩。

## Info (3)
1. `/api/comment` 遗留路径本身没有被 T6 打坏。`runWorkflow()` 仍走 v0.2.0 的 `classifyIntent -> matchHistory -> buildCard` [workflow.js](../../../backend/src/workflow.js#L41)；`matcher.js` 依旧按 `topic + action_type` 从 v0.2.0 fixtures 里取动作 [matcher.js](../../../backend/src/matcher.js#L39)。`cardBuilder.test.js` 也全绿，包括 T6 新增的 `raw_text=''` / `(待补)` fallback。
2. `schema.sql` 与 migrations 不是“直接重复冲突”，但加载序列很危险。当前 fresh DB 走的是 `schema.sql` only；只有显式跑 `npm run migrate` 才会补 001+002。也就是说，兼容问题不在“001/002 会立刻打架”，而在“server/seed 不会主动把库推进到 ambient 运行所需版本”。
3. GH Pages mock deploy 仍然是隔离成功的。`api/client.js` 和 `api/ws.js` 都在 `VITE_MOCK=1` 时切到浏览器端 mock pipeline [client.js](../../../frontend/src/api/client.js#L3) [ws.js](../../../frontend/src/api/ws.js#L9)；我在隔离副本里跑 `VITE_MOCK=1 VITE_BASE=/04171819/ npm run build`，构建成功。

## v0.2.0 Feature Matrix
| feature | v0.3.0 status | test evidence |
| --- | --- | --- |
| /api/comment evaluation | Pass | 隔离副本 `POST /api/comment` after reset -> `200 ok:true`，并收到 `workflow.begin -> workflow.step x5 -> card.generated -> workflow.end` |
| DEMO_LOOP=1 loopMode | Pass but masked by fixture regression | 代码仍有 `LOOP_MODE` + `softResetForLoop()`；把 temp DB actions 改成 `is_answer=1, source='L2'` 后，`DEMO_LOOP=1` 下第 4 次 `/api/ambient/tick` 仍 `ok:true` |
| fixtures mock cards | Broken | `npm run db:seed` fresh DB 下 `/api/bootstrap` 500 `no such column: ca.is_answer`；`db:seed + migrate` 后 ambient join 命中数为 `0`，`/api/ambient/tick -> no-match` |
| smoke.js end-to-end | Broken | 隔离副本 `npm run smoke` 退出 1，失败在 `bootstrap.pending=true（还有未履约信号）` |
| 12 主题切换 | Partial | 主题切换 UI/build 正常，但 `THEMES.length === 13`；`data-split` / `data-card-aspect` 已无消费方，单栏布局下只剩颜色/字号明显生效 |
| GH Pages VITE_MOCK build | Pass | 隔离副本 `VITE_MOCK=1 VITE_BASE=/04171819/ npm run build` 成功 |

## Passed
- `cardBuilder.test.js` 全部通过，说明 T6 的 `raw_text` fallback 没把 v0.2.0 卡片契约打坏。
- `/api/comment` 保留路径仍能生成卡并发 WS 广播，legacy 评审入口还在。
- `DEMO_LOOP=1` replay 逻辑没有被删；问题在于当前 seed/reset 数据不再满足 ambient 过滤条件。
- GH Pages mock pipeline 仍与 localhost 后端解耦，静态构建可用。
