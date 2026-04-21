# Round 6 · Extension MV3 Robustness
## Summary
结论：当前扩展的“轮询链路”比“实时链路”可靠得多。`chrome.alarms` 这条线在休眠/重启后还能恢复，但 `service_worker.js` 里的 WebSocket 设计并不符合 MV3 service worker 的生命周期；`content_script.js` 的评论区 DOM 假设也已经落后于 2026-04-22 实测的 B 站视频页。`§10` 里的 R5 缩窄到 `.reply-warp` 的思路，在当前页面结构下已经不成立。

本轮判断基于两类证据：一是本地代码审阅；二是 2026-04-22 对 Chrome 官方扩展文档与 B 站 live HTML / 当前 video bundle 的核对。实测页能确认 `#commentapp` 与 `window.bbComment("#commentapp", aid, 1)`，未确认 `.reply-warp`、`.reply-list`、`#comment`。

## Critical (2)
- `WebSocket 实时通知链路在 MV3 下并不稳固。` `service_worker.js` 在模块顶层直接 `wsClient.connect()`，`ws_client.js` 再用 `setTimeout()` 做断线重连；但 MV3 service worker 空闲约 30s 就会被挂起，挂起后 JS timer 不继续跑，WebSocket 也会断。当前 alarm 周期是 15 / 30 分钟，远大于 idle 窗口，所以 worker 大部分时间都不在线。结果是：`card.generated` 桌面通知只会在“刚启动 / 刚被 alarm 唤醒”的短窗口内偶发可用，不能当作稳定实时通道。`onStartup` / `alarms` 确实会让它“下次再连上”，但做不到“服务端有新卡时把扩展主动叫醒”。文件：`demo/extension/service_worker.js:283-327`，`demo/extension/ws_client.js:12-63`。
- `评论徽章注入大概率在当前 B 站视频页根本起不来。` 代码只在 `.reply-warp`、`.reply-list`、`#comment` 上找 observer root，并在 60s 后停止轮询；但 2026-04-22 实测视频页是 `#commentapp` 挂载点，当前 video bundle 里也能看到 `window.bbComment("#commentapp", t.videoData.aid, 1)`。我没有在 live HTML 或当前 bundle 中找到 `.reply-warp`、`.reply-list`、`#comment`。这意味着 `attachReplyObserver()` 很可能永远返回 `false`，后续的 marks fetch 和 badge inject 都不会启动。文件：`demo/extension/content_script.js:360-419`，`demo/extension/content_script.js:539-589`。

## Warning (5)
- `XHR/fetch hook 现在大概率能跑，但它仍然是 best-effort。` 由于 content script 运行在 isolated world，当前实现通过追加 inline `<script>` 把 monkey-patch 放进 page world。这个桥今天大概率可用，因为实测响应头里没看到 `Content-Security-Policy`，页面自身也还在发 inline `<script>`；但 Chrome 的 main-world 注入本质上仍受 page CSP 影响。B 站一旦补 CSP/nonces，或者后续脚本再覆写一次 `window.fetch` / `XMLHttpRequest.prototype`，hook 就会静默失效。现在没有 hook-health telemetry，也没有 fallback。文件：`demo/extension/content_script.js:90-353`。
- `SESSDATA 读取覆盖了常见路径，但没覆盖难路径。` `chrome.cookies.get({ url: 'https://www.bilibili.com', name: 'SESSDATA' })` 对常规 `.bilibili.com` domain cookie 是成立的，所以“cookie 是 `.bilibili.com` 就一定取不到”这个担心本身不成立；真正的 robustness gap 在于 host 变化、store/partition 差异或未来登录流变化时，扩展只会得到 `null` 并直接停摆，没有 fallback。更稳的做法是追加 `cookies.getAll({ name: 'SESSDATA' })` 兜底，并记录命中的 `domain` / `storeId` / `partitionKey`。文件：`demo/extension/service_worker.js:96-103`，`demo/extension/popup.js:13-18`。
- `Bilibili API 轮询不会被多 tab 线性放大，但仍缺 durable mutex。` 多个活跃 tab 不会各自起一个 poll loop，因为 `chrome.alarms` 跑在单个扩展 SW 里，而且 `scheduleBiliRequest()` 也把同一 worker 内的 B 站请求串成了 1 req/s。真正剩下的风险在“worker 重启 / 唤醒边界”：当前没有持久化的 `lastRun` / `inFlight` 锁，遇到 startup + alarm 边界或异常重启时，可能出现重复 poll；后端 409 能吞掉幂等问题，但 API 量还是会上去。文件：`demo/extension/service_worker.js:12-18`，`demo/extension/service_worker.js:44-74`，`demo/extension/service_worker.js:194-280`，`demo/extension/service_worker.js:317-327`。
- `popup 生命周期太短，长任务反馈不连续。` popup 里的 backfill 进度只在初始化渲染或手点“状态”时刷新，popup 一关 DOM 就没了；后台任务仍在跑，但用户看不到持续进度，也没有 `chrome.storage`、runtime port、toolbar badge 或 notification 更新来承接这个状态。现状更像“临时控制台”，不是可恢复的任务面板。文件：`demo/extension/popup.html:62-65`，`demo/extension/popup.js:29-95`。
- `notifications 权限 UX 目前是隐式的，而且没有运行时校验。` `notifications` 被放在 required permissions 里，所以不会出现“首次点击按钮再弹 permission prompt”的代码路径；真正发生的是安装/更新阶段的权限告警。与此同时，`service_worker.js` 直接 `chrome.notifications.create()`，没有先检查 `chrome.notifications.getPermissionLevel()`，所以一旦被系统或用户层面禁掉，会静默退化。对本地 v0.3.0 这不是 blocker，但对公开分发不是好状态。文件：`demo/extension/manifest.json:6`，`demo/extension/service_worker.js:291-297`。

## Info (3)
- `浏览器休眠后的 alarm 行为是“补一次”，不是“补全错过的每一轮”。` 这意味着 laptop 睡眠几小时后，扩展醒来时最多只会把 missed repeating alarm 触发一次，然后从 wake 时刻重新计时。对 eventual polling 是可接受的，但不能把 15/30 分钟周期理解成严格 SLA。
- `Chrome 重启后 alarm 可能被清空，但当前代码已经做了正确的自恢复。` `ensureAlarms()` 同时挂在 `onInstalled`、`onStartup` 和模块顶层初始化上，这正是 MV3 下比较稳妥的做法。相比之下，alarm 恢复这一块比 WS 可靠得多。文件：`demo/extension/service_worker.js:181-192`，`demo/extension/service_worker.js:309-327`。
- `icon.png 仍然是占位资源。` 本地文件是 1x1 的灰度 alpha PNG。既然 v0.3.0 不发 store，它现在只是 debt；但一旦要上架，这会同时影响 action icon、notification icon 和品牌可信度。

## MV3 Quirk Matrix
| quirk | current behavior | risk | mitigation |
| --- | --- | --- | --- |
| SW idle 30s | 顶层连 WS，空闲后 worker 会被挂起 | WS 长时间离线，实时通知不可靠 | 不把 WS 当主通道；改成 wake-driven catch-up，或引入能跨 idle 存活的方案 |
| WS reconnect after alarms/startup | worker 被 alarm / startup 唤醒后会重新执行模块顶层并再连 WS | 只能“下次醒来再连”，不能靠服务端主动唤醒 | 每次 wake 都做 catch-up poll；WS 仅作加速通道 |
| XHR hook in isolated world | 通过 inline `<script>` 注入 page world 做 patch | CSP/nonces 或页面二次覆写会让 hook 静默失效 | 增加 hook-installed 健康探针与 fallback 路径 |
| B 站当前评论挂载点 | 代码等待 `.reply-warp/.reply-list/#comment` | 当前实测是 `#commentapp`，observer 可能永远不 attach | 先改到当前挂载点，再重新验真实 reply item selector |
| Shadow DOM | 当前只用 light DOM `querySelector` + `MutationObserver` | 一旦评论区进入 shadow root，完全看不见 | 监控挂载器并兼容 open shadow root；闭包 shadow root 需换更上层方案 |
| alarms after device sleep | 醒来后最多补一次，再按 wake 时间重排 | 周期漂移，不能按睡眠前节拍 catch-up | 把 alarm 当 eventual consistency；wake 后主动补拉一次 |
| alarms after browser restart | alarm 可能丢，但代码会 `ensureAlarms()` | 若未重建则后台轮询停摆 | 保留当前 `ensureAlarms()`，并把 desired schedule 持久化 |
| SESSDATA cookie scope | `get(url=https://www.bilibili.com)` 能覆盖常规 `.bilibili.com` cookie | store/partition/host 变化时直接返回空 | 加 `getAll()` 兜底并打诊断日志 |
| Bilibili API rate limit | 单 worker 内 1 req/s 串行；不是 per-tab 叠加 | wake / restart 边界仍可能重复 poll | 增加 persisted mutex、last-run、退避和 jitter |
| popup lifecycle | popup 关闭后只剩后端任务继续跑 | 用户看不到持续进度，只能重新打开手查 | 用 `chrome.storage` / notification / badge 承接长任务状态 |
| Chrome restart & badge cache | 没有 action badge；`MARKS_CACHE` 只存在页面内存里 | 没有持久 stale cache，但也没有重建 UI | 现状可接受；若以后加 action badge，再从 storage/backend 重建 |
| notifications permission | required permission，运行时不检查 permission level | 安装后或系统层禁用时静默失败 | store 版本改 optional permission 或至少先检查 permission level |
| icon & 品牌 | `icon.png` 是 1x1 占位图 | 本地可忍，发布会伤审核和可见性 | 发布前补齐 16/48/128 实际图标 |

## Passed
- `SESSDATA` 的 `.bilibili.com` domain scope 本身不是当前实现的直接 bug；用 `https://www.bilibili.com` 作为 `cookies.get()` 的 URL，常规登录态应该能命中。
- 多个 B 站 tab 不会各自复制一套 alarm 轮询；轮询是 extension-global，不是 tab-local。
- `MARKS_CACHE` 是 content script 页面内存态，Chrome 重启或页面刷新后会自然清空；当前不存在“重启后沿用旧 badge cache”的持久化问题。
- `host_permissions` 覆盖了 `*.bilibili.com` 与本地后端，满足当前 `cookies`、`api.bilibili.com` 和 `localhost:4000` 访问面。
