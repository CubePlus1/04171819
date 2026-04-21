# Bilibili Tracker · v0.3.0 设计提案

**状态**：草案 · 待 user approve
**日期**：2026-04-21
**分支**：`feat/dundao-bilibili`
**前身**：`feat/dundao-demo` HEAD (409a8f3 · v0.2.0)

## 1 · 背景

字节大学生 Hackathon 已于 2026-04 结项。「蹲到了 (Dundao)」原是 40h 展台 MVP（`demo/` 子项目），所有数据走 `data/fixtures.json` 硬编码种子。

本 spec 把它从「展台 demo」升级为「**个人自用工具**」：
- 目标平台：**仅** bilibili
- 目标用户：**单用户（你自己）**
- 不再考虑：评委说服、pitch 讲稿、展示张力、AI 透明化叙事

核心工作：把 demo 的两条 mock 数据管道（`intent_signals` / `creator_actions`）换成真实 B 站数据。

## 2 · 范围

### In（v0.3.0 要做）

- Chrome 插件（Manifest V3）
  - content script：B 站发评论 XHR hook + 视频页评论旁注入标记（C2）
  - service worker：定时轮询 `msgfeed/reply` 和视频高赞评论
  - 桌面通知（`chrome.notifications`）· 新履约卡弹气泡
- localhost 后端扩展（在 `demo/backend/` 内增量）
  - 摄入接口：`/api/ingest/comment`、`/api/ingest/reply`、`/api/ingest/top-reply`
  - B 站 API 客户端模块（签名、分页）
  - 判真模块 `answerJudge.js`（R1 规则）
  - 历史倒推脚本 `historyBackfill.js`
  - DB schema 迁移（加字段、不破坏现有）
- localhost 前端裁剪（在 `demo/frontend/` 内）
  - `App.jsx` 去掉右面板 `AgentPanel`，只保留左面板 `ProductPanel`
  - 新增 `components/MyCommentsPanel.jsx`（C1 · "我的评论"列表视图 · 作为 ProductPanel 的子 tab）
  - 裁掉（但保留源文件）：`AgentPanel / AgentMind / AgentWorkflow / AgentStep / AmbientPulse / TriggerPicker` 的路由挂载
- 全量历史倒推：装插件首次跑一次，把 B 站消息中心"回复我的"分页到底灌入 DB

### Out（v0.3.0 不做）

- R2 · LLM 二审（→ v0.3.1）
- 其他平台（抖音 / 小红书 / ...）
- 首页/推荐/搜索视频缩略图角标（C3 → v0.3.1）
- 空间页自建"我的评论"聚合（C4 → v0.3.2）
- 多用户 / 白名单朋友
- 发布到 Chrome Web Store（维持 load unpacked 即可）
- demo 右面板 AgentPanel 相关的 `mind.phase` 可视化工作

## 3 · 架构总览

```
┌──────────────────────────────────────────────────────────────┐
│                Chrome 插件 (Manifest V3)                       │
│                                                                │
│  content_script.js   注入 *.bilibili.com                       │
│    ├─ monkey-patch fetch / XMLHttpRequest.send                 │
│    │    hook POST /x/v2/reply/add                             │
│    │    hook POST /x/v2/reply/reply/add                       │
│    │    → POST http://localhost:4000/api/ingest/comment       │
│    │                                                           │
│    └─ C2 DOM 注入：视频页评论区                                 │
│        MutationObserver 监听 .reply-item                       │
│        若 rpid 命中 GET /api/marks → 渲染 ✅/⏳ 徽章            │
│                                                                │
│  service_worker.js   后台独立                                   │
│    ├─ chrome.alarms 每 15 分钟                                  │
│    │    fetch msgfeed/reply → /api/ingest/reply               │
│    ├─ chrome.alarms 每 30 分钟                                  │
│    │    对 open intent 所在 aid 拉 top 高赞 → /api/ingest/top-reply │
│    └─ 订阅 localhost WS /ws                                    │
│         收到 card.generated → chrome.notifications.create      │
│                                                                │
│  popup.html          极简入口                                   │
│    └─ "打开主视图"、"历史倒推"、"状态面板" 三按钮                │
└────────────────────────┬───────────────────────────────────────┘
                         │ HTTP · 仅 127.0.0.1
                         ▼
┌──────────────────────────────────────────────────────────────┐
│   localhost:4000  (复用 demo/backend Express + SQLite WAL)     │
│                                                                │
│   新增路由 (src/ingest.js)                                      │
│     POST /api/ingest/comment                                   │
│     POST /api/ingest/reply       (L1 · 回复我的)               │
│     POST /api/ingest/top-reply   (L2 · 同视频高赞)             │
│     GET  /api/my-comments        (C1 · 列表视图数据)           │
│     GET  /api/marks?aids=[]      (C2 · DOM 注入用徽章数据)     │
│                                                                │
│   新增模块                                                       │
│     src/bilibili.js       B 站 API 客户端（签名/分页）          │
│     src/answerJudge.js    R1 判真                              │
│     src/historyBackfill.js 一次性倒推                           │
│                                                                │
│   复用现有                                                       │
│     src/ambient.js        5 步管线 · fixtures→DB 切换           │
│     src/cardBuilder.js    P1/P2/P3 卡片构造                     │
│     src/db.js / events.js / logger.js                          │
└────────────────────────┬───────────────────────────────────────┘
                         │ WebSocket /ws
                         ▼
┌──────────────────────────────────────────────────────────────┐
│   localhost:5173  (demo/frontend React + Vite · 裁剪版)        │
│                                                                │
│   保留：ProductPanel · Feed · FeedItem · DunCard (P1/P2/P3)    │
│         12 主题 / ThemeSwitcher / Toast                        │
│   新增：MyCommentsPanel (C1 · 我评论过的视频列表 + 状态)        │
│   去除：右面板 AgentPanel 全套                                  │
└──────────────────────────────────────────────────────────────┘
```

## 4 · 数据流

### 4.1 装插件首次（一次性）

```
用户 Chrome 载入 unpacked extension
  ↓
chrome.runtime.onInstalled · popup 弹窗询问 "开始历史倒推?"
  ↓ 点击"开始"
service_worker 调 chrome.cookies.get .bilibili.com SESSDATA
  ↓
POST /api/backfill/start  (带 SESSDATA)
  ↓
backend historyBackfill.js:
  for page in 1..N:
    fetch /x/msgfeed/reply?cursor=...
    → 每条 item 期望字段 { source_id (你原评论 rpid), source_content (你原评论),
                          business_id (aid), title, reply_content, mid_replier, like, is_up }
    → INSERT intent_signals (source='backfill', rpid=source_id, aid, content=source_content)
    → INSERT creator_actions (source='backfill', replying_to_rpid=source_id, 经 answerJudge 判真)
  降级 · 若 item 不带 source_content：signal content 标 '(待补)'，
         后续插件 hook 到新评论时覆盖；DunCard raw_text 空时 fallback video_title
  ↓
WebSocket 推 backfill.progress + backfill.done
  ↓
ambient.js 开始遍历 intent_signals · 生成履约卡
  ↓
前端 Feed 浮入全部历史履约卡
```

### 4.2 日常（持续）

```
你在 B 站发评论
  ↓
content_script 捕获 XHR 响应（含 rpid、aid）
  ↓
POST /api/ingest/comment → INSERT intent_signals (source='hook')
  ↓
service_worker 下一轮 tick（15 分钟内）
  ↓
拉 msgfeed/reply → 新回复 → POST /api/ingest/reply
拉视频高赞 → POST /api/ingest/top-reply
  ↓
backend answerJudge 判真 → is_answer=true 的入 creator_actions
  ↓
ambient.js 扫到 (未履约 signal × is_answer action) → 生成履约卡
  ↓
WebSocket broadcast card.generated
  ↓ 同时
frontend Feed 浮入新卡    +    service_worker chrome.notifications 弹桌面气泡
```

## 5 · 关键模块

### 5.1 Chrome 插件

**路径**：`demo/extension/`（新建）

**Manifest V3 要点**：
```json
{
  "manifest_version": 3,
  "name": "蹲到了 · Bilibili Tracker",
  "version": "0.3.0",
  "permissions": ["cookies", "storage", "notifications", "alarms"],
  "host_permissions": [
    "*://*.bilibili.com/*",
    "http://localhost:4000/*"
  ],
  "background": { "service_worker": "service_worker.js" },
  "content_scripts": [{
    "matches": ["*://*.bilibili.com/*"],
    "js": ["content_script.js"],
    "run_at": "document_start"
  }],
  "action": { "default_popup": "popup.html" }
}
```

**XHR hook 策略**：
- `document_start` 注入 `content_script.js` → 直接 monkey-patch `XMLHttpRequest.prototype.open` + `.send` 以及 `window.fetch`
- 匹配 URL pattern `/x/v2/reply/(reply/)?add`，不匹配函数名（B 站可能混淆）
- hook 在 **response 后**触发（拿到 rpid），而不是 request 前
- 带 try/catch 包裹，任何异常降级为 `console.warn`，不打断 B 站原生行为

**MutationObserver 注入徽章**：
- watch `document.body`（或更窄的 `.reply-warp`）childList
- 对每个新挂载的 `.reply-item`，读 `data-rpid` → 批量 GET `/api/marks?rpids=[]` → DOM 插入 `<span class="dundao-badge">✅</span>`
- 防抖：500ms 批量聚合，避免每条 reply 一次 fetch

### 5.2 localhost 后端

**复用 demo/backend，新增文件**：

```
demo/backend/src/
├── ingest.js             [新] 摄入接口
├── bilibili.js           [新] B 站 API 客户端
├── answerJudge.js        [新] R1 判真
├── historyBackfill.js    [新] 一次性倒推脚本
├── ambient.js            [改] 从 fixtures 切到真实 DB
├── cardBuilder.js        [改] B 站 payload 字段适配
├── server.js             [改] 挂载新路由
└── migrations/
    └── 002_bilibili_fields.sql  [新] DDL 变更
```

**bilibili.js 核心函数**：
```
fetchMsgfeedReply({ sessdata, cursor, ps=20 }) → { replies[], hasMore, nextCursor }
fetchVideoReplies({ aid, sort=2, ps=20 }) → { replies[], page }
fetchVideoView({ aid }) → { title, desc, owner, pinned_reply }
```
- 不依赖 WBI 签名（v0.3.0 用到的接口要么 cookie-only 要么公开，不需要 WBI 算签）
- SESSDATA 通过 HTTP header `Cookie: SESSDATA=...` 传，只在内存流转不写磁盘
- Rate limit：每个 endpoint 每秒 1 次，超时重试 3 次 + 指数退避

### 5.3 localhost 前端

**变更**：

```
demo/frontend/src/
├── App.jsx               [改] 去掉 <AgentPanel />，只留 <ProductPanel />
├── panels/
│   └── ProductPanel.jsx  [改] 加 tab 切换: "信息流" | "我的评论"
├── components/
│   └── MyCommentsPanel.jsx  [新] C1 视图 · 作为 ProductPanel 的子面板
├── api/
│   └── client.js         [改] 加 GET /api/my-comments 调用
└── store/
    └── useDemoStore.js   [改] 加 myComments 子状态
```

**MyCommentsPanel 布局**：
```
┌─────────────────────────────────────────┐
│ 我的评论 (342)                           │
│ 筛选: [全部] [已答 ✅] [等待中 ⏳]       │
├─────────────────────────────────────────┤
│ ✅ 《焦糖褐色外套开箱》                   │
│    你写过："蹲链接"                      │
│    大山(UP) 3 周后挂了：¥329 旗舰店       │
│    → 看卡                                │
├─────────────────────────────────────────┤
│ ⏳ 《XXX BGM 合集 Part1》                 │
│    你写过："蹲 BGM"                      │
│    还没答                                 │
├─────────────────────────────────────────┤
│ ...                                      │
└─────────────────────────────────────────┘
```

### 5.4 判真模块 R1

**`answerJudge.js` 规则链**（加权打分）：

```
score = 0
+ 0.5  若 replier_mid === target_creator_mid  (UP 主回复)
+ 0.3  若 is_top (置顶评论 or 置顶回复)
+ 0.2  若 like_count >= max(10, video_total_replies * 0.05)
+ 0.3  若 content 匹配 answer_patterns:
         /^(是|答案|bgm|BGM|链接)[:：]/ 
         /(是|叫)\s?[《"]?\w+[》"]?/
         /https?:\/\//
         /淘口令|复制打开|点淘宝/
- 0.5  若 content 匹配 noise_patterns:
         /^[+＋]1\s*蹲/
         /^同蹲/
         /^(楼上|楼下|前排|后排)/
         /^(哈哈+|233+|笑死|好看)/

is_answer = score >= 0.3
```

**判真结果**入 `creator_actions`：
```sql
is_answer      INTEGER DEFAULT 0  -- 0/1
confidence     REAL    DEFAULT 0  -- 0.0 ~ 1.0+（>1 可能）
judge_reason   TEXT               -- '+up +keyword_bgm -noise_same_squat' 之类的 flag 拼接
source         TEXT               -- 'L1' | 'L2' | 'backfill'
```

**失败 / 降级**：
- 规则异常抛错 → 写 `is_answer=0, confidence=0, judge_reason='error: ...'`，后端 log warn
- 不阻塞履约管线（ambient 只挑 `is_answer=1` 的）

## 6 · 数据模型变更

**迁移文件**：`demo/backend/data/migrations/002_bilibili_fields.sql`

```sql
-- intent_signals: 加 B 站标识字段
ALTER TABLE intent_signals ADD COLUMN aid       INTEGER;   -- 视频 aid
ALTER TABLE intent_signals ADD COLUMN rpid      INTEGER;   -- 评论 rpid
ALTER TABLE intent_signals ADD COLUMN parent_rpid INTEGER; -- 若是 reply 他人，记父评论
ALTER TABLE intent_signals ADD COLUMN source    TEXT DEFAULT 'mock';
-- source: mock | hook | backfill

CREATE UNIQUE INDEX IF NOT EXISTS idx_intent_rpid ON intent_signals(rpid) WHERE rpid IS NOT NULL;

-- creator_actions: 加判真字段
ALTER TABLE creator_actions ADD COLUMN rpid           INTEGER;
ALTER TABLE creator_actions ADD COLUMN replying_to_rpid INTEGER;
ALTER TABLE creator_actions ADD COLUMN is_answer      INTEGER DEFAULT 0;
ALTER TABLE creator_actions ADD COLUMN confidence     REAL    DEFAULT 0;
ALTER TABLE creator_actions ADD COLUMN judge_reason   TEXT;
ALTER TABLE creator_actions ADD COLUMN source         TEXT DEFAULT 'mock';
-- source: mock | L1 | L2 | backfill

CREATE UNIQUE INDEX IF NOT EXISTS idx_action_rpid ON creator_actions(rpid) WHERE rpid IS NOT NULL;
```

**迁移执行**：`demo/backend/src/migrate.js` 新写一个脚本，扫 `migrations/*.sql` 按文件名排序顺跑，用 `user_version` PRAGMA 记已执行版本。

**creators 表 id 约定**：
- B 站场景下 `creators.id` 存 mid 的字符串形式（如 `'123456789'`）
- `handle` 存 B 站用户 space 显示名
- demo 种子数据的 id（如 `'大山'`）不迁移，继续存在（`source='mock'`）
- 新插入真实 creator 用 `INSERT OR IGNORE INTO creators(id, handle, ...) VALUES ...` 保证 idempotent

**向后兼容**：
- 旧 fixtures seed 的数据仍可用（`source='mock'`，新字段均 NULL）
- ambient.js 取信号时不过滤 source，一视同仁
- 通过 UNIQUE INDEX 防止真实数据重复

## 7 · 接口契约

### 7.1 后端新增 HTTP 端点

**`POST /api/ingest/comment`**（插件 hook 推）
```json
{
  "aid": 112233445566,
  "rpid": 99887766,
  "parent_rpid": null,
  "content": "蹲链接",
  "video_title": "焦糖褐色外套开箱",
  "target_creator_mid": 123456,
  "target_creator_name": "大山",
  "target_creator_avatar": "https://...",
  "occurred_at": "2026-04-21T10:30:00+08:00"
}
```
→ `200 { ok, signal_id }` 或 `409 { ok: false, reason: 'duplicate_rpid' }`

**`POST /api/ingest/reply`**（L1 · service worker 推）
```json
{
  "source": "L1",
  "replying_to_rpid": 99887766,
  "rpid": 99887800,
  "replier_mid": 123456,
  "replier_name": "大山",
  "content": "链接上了！¥329，淘口令 xxx",
  "like_count": 42,
  "is_up": true,
  "is_top": false,
  "aid": 112233445566,
  "occurred_at": "2026-04-21T11:00:00+08:00"
}
```
→ `200 { ok, action_id, is_answer, confidence, judge_reason }`

**`POST /api/ingest/top-reply`**（L2 · batch）
```json
{
  "source": "L2",
  "aid": 112233445566,
  "batch": [
    { "rpid": 99887801, "replier_mid": 654321, "replier_name": "网友A",
      "content": "BGM 是陈粒 - 芳草地", "like_count": 520, "is_up": false, "is_top": false,
      "occurred_at": "..." },
    { "rpid": 99887802, "...": "..." }
  ]
}
```
→ `200 { ok, ingested: N, answers: M }`

**`GET /api/my-comments?filter=all|fulfilled|pending`**（C1）
```json
{
  "total": 342,
  "fulfilled": 87,
  "pending": 255,
  "items": [
    { "signal_id": 1, "aid": ..., "video_title": "...", "content": "蹲链接",
      "occurred_at": "...", "fulfilled": 1, "card_id": "card_xxx",
      "creator": { "mid": ..., "name": "大山", "avatar": "..." },
      "top_answer": { "content": "链接上了！...", "is_up": true }  // 若已答
    },
    ...
  ]
}
```

**`GET /api/marks?rpids=1,2,3,...`**（C2 · content script 批量查）
```json
{
  "marks": {
    "99887766": { "has_my_comment": true, "fulfilled": true, "card_id": "card_xxx" },
    "99887767": { "has_my_comment": true, "fulfilled": false },
    "99887768": { "has_my_comment": false }
  }
}
```

### 7.2 WebSocket 事件（复用 demo/shared/contracts.js）

保留 demo 已有：
- `workflow.begin` / `workflow.end`
- `card.generated`
- `step`（前端可以只消费 step=5 的 emit，其余 ignore —— AgentPanel 不渲染）

新增：
- `backfill.progress`  `{ stage, current, total, hint }`
- `backfill.done`      `{ total_signals, total_actions, total_cards }`

### 7.3 用到的 B 站公开 API

| 用途 | Endpoint | 需要 | 备注 |
|---|---|---|---|
| L1 · 回复我的 | `GET /x/msgfeed/reply` | SESSDATA | 分页 cursor-based |
| L2 · 视频评论 | `GET /x/v2/reply?type=1&oid=<aid>&sort=2&ps=20` | 无 | sort=2 按热度 |
| 视频元数据 | `GET /x/web-interface/view?aid=<aid>` | 无 | 标题、UP 主、置顶 reply |
| hook 点 | `POST /x/v2/reply/add` · `POST /x/v2/reply/reply/add` | B 站自带 | 不主动调，只拦截 |

**不用** 的（v0.3.0 out of scope）：`/x/space/wbi/arc/search`（UP 主新作品，要 WBI 签名）

## 8 · 部署 / 安装流程

```
# 1. 克隆并进 worktree
cd /Users/sevencolor/code/0BKHDD/.worktrees/dundao-bilibili

# 2. 后端
cd demo/backend
npm install
npm run migrate           # 执行 002_bilibili_fields.sql
npm run dev               # 监听 127.0.0.1:4000

# 3. 前端
cd ../frontend
npm install
npm run dev               # 监听 127.0.0.1:5173

# 4. 插件
# Chrome → chrome://extensions → 开启"开发者模式" → 加载已解压的扩展程序 → 选 demo/extension/

# 5. 首次使用
# 5.1 确保你已登录 www.bilibili.com
# 5.2 点击插件图标 → 「开始历史倒推」
# 5.3 等待 1-3 分钟（状态栏显示 "fetching page 3/~30"）
# 5.4 打开 localhost:5173 看第一批履约卡浮现
# 5.5 日常：插件在后台每 15 分钟扫一次，新卡来了会桌面弹气泡
```

## 9 · 测试策略

复用 `demo/docs/07-testing-matrix.md` 既有框架，**新增**：

**单元测试**（`demo/backend/src/*.test.js`）：
- `answerJudge.test.js` · R1 规则打分，喂 20+ 条真实样本评论（从我自己 B 站捞）
- `bilibili.test.js` · API 客户端 mock 响应，校验分页 cursor、签名、错误重试
- `historyBackfill.test.js` · mock msgfeed 分页，校验 dedup + INSERT

**集成测试**：
- ingest 三个端点的幂等性（重复 rpid 必须 409 或 no-op）
- ambient 管线在真实 schema 下端到端（从 INSERT signal → 期望 card 浮现）

**手工验证** checklist（`demo/docs/09-ops-runbook.md` 加一节）：
- [ ] 装插件 → cookies 权限提示 → 同意
- [ ] 打开一个 B 站视频 → F12 看 content script 有没有 inject
- [ ] 写一条"蹲 BGM" → localhost:5173 应该立刻看到新的 intent signal
- [ ] 等回复或模拟 msgfeed 响应 → 判真后生成履约卡 + 桌面通知弹出
- [ ] 历史倒推一次 → 进度条 0→100% → 履约卡成堆浮入

**不做**：
- Chrome 插件的自动化 UI 测试（Puppeteer 投入太大 · 手动验证够用）
- 跨浏览器（只测 Chrome 稳定版）

## 10 · 风险与开放问题

| # | 风险 | 概率 | 影响 | 应对 |
|---|---|---|---|---|
| R1 | B 站 msgfeed 分页深度有限（传闻最多 20 页 ≈ 400 条） | 高 | 历史倒推覆盖不全 | 分页拉到空为止；记 `last_seen_reply_id` 下次续接 |
| R2 | B 站 XHR 混淆 / 改接口名 | 中 | hook 失效 | 按 URL pattern 匹配而不是函数名；降级日志不阻断页面 |
| R3 | SESSDATA 经 localhost 泄漏 | 低 | 账号被盗 | 后端只绑 127.0.0.1 不开 0.0.0.0；cookie 只在内存流转不写盘 |
| R4 | R1 误报 30%+ | 中 | 履约卡噪声高 | 前端每张卡加"这不是答案"按钮，否决样本存库给 v0.3.1 R2 训 few-shot |
| R5 | MutationObserver 在重型 B 站 DOM 上性能差 | 中 | 页面卡 | 防抖 500ms，只观察 `.reply-warp` 子树不是 `body` |
| R6 | B 站 rate limit 封 SESSDATA | 低 | 抓取中断 | 单端点 1 req/s；退避重试；封了就提示用户手动等 |
| R7 | demo 的 `ambient.js` loopMode 逻辑假设 mock 数据循环 | 低 | 真实数据下循环反而有害 | `loopMode` 关掉，真实模式下 `hasPendingAmbient` 看 fulfilled=0 即可 |
| R8 | msgfeed/reply 响应不含你原评论 content 字段 | 中 | backfill 的 signal 侧文本缺失 | signal content 先标 '(待补)'，hook 后续新评论时覆盖；DunCard raw_text 空 fallback video_title |

## 11 · v0.3.1+ 后续规划

**Runtime 决策 · 全程 Node.js 不引入 Python**

- 所有大模型相关（R2 Deepseek API / R2-local Ollama / 未来 embedding / RAG）都走 HTTP，Node.js `fetch` 够用
- 不需要 langchain / instructor / pydantic 等 Python 生态：R2 判真是**单轮 classification**（prompt ~300 tokens，输出 `{is_answer, confidence, reason}` JSON），超出 REST 调用的复杂度有限
- v0.3.2 Ollama 本地推理：Ollama 自身就是 HTTP 服务（`http://localhost:11434/api/generate`），Node 直接调，和调 Deepseek 没区别
- 真要 Python 才划算的场景：重度 agent orchestration、fine-tuning、模型训练 —— **v0.3 / v0.4 范围内都不涉及**，v0.5+ 再重新评估
- 收益：
  - 单一 runtime · 一份 `package.json` · 启停一条命令（`npm run dev`）
  - 部署路径清晰：一个 Node 进程 + 一个 SQLite 文件 + 一个 Chrome 扩展目录
  - 避免 Node ↔ Python 进程间 HTTP 通信的额外时延和故障面

**v0.3.1**
- R2 · LLM 二审（Deepseek API · ~0.0005 元/条）· Node 原生 fetch 实现
- UI：`frontend/components/AnswerReject.jsx` · 误报否决按钮 + 样本收集（给 v0.3.2 微调做标注数据）
- C3 · 首页/推荐视频缩略图挂角标

**v0.3.2**
- R2-local · Ollama / Qwen 7B 本地模型变体（隐私敏感者用）
- C4 · 空间页自建"我的评论"聚合伪页面

**v0.4.0**
- 多账号（朋友白名单）
- 跨平台（抖音 / 小红书 content script）
- Chrome Web Store 发布

**v1.0（未决）**
- 把 `demo/` 子目录重命名为 `dundao/`（名字不再是"展台 demo"）
- 考虑抽象出 `platform-adapter/` 接口，让抖音 / 小红书 / B 站作为 driver 插拔

## 12 · 向后兼容

- demo v0.2.0 fixtures 种子数据继续可用（`source='mock'` 标记）
- `shared/contracts.js` 的 `mind.phase` / `MIND_PHASES` / `REASON_CODES` 保留不删（后端 ambient 仍产生，前端不消费）
- demo 的 GH Pages 静态部署（commit 974c606）不受影响 —— 它走的是浏览器端 mock pipeline，不碰 localhost

## 13 · 实施切分（预告，待 writing-plans 细化）

粗略拆成 8 个独立任务包，便于后续 plan 生成和并行实施：

1. **T1 · DB 迁移 + schema 扩字段**（`migrations/002_bilibili_fields.sql` + `migrate.js`）
2. **T2 · B 站 API 客户端**（`src/bilibili.js` + unit test）
3. **T3 · 判真模块 R1**（`src/answerJudge.js` + 规则打分 + test）
4. **T4 · 摄入接口**（`src/ingest.js` + `src/server.js` 挂路由）
5. **T5 · 历史倒推脚本**（`src/historyBackfill.js` + CLI 入口）
6. **T6 · Chrome 插件骨架**（`demo/extension/` 目录 + manifest + content_script + service_worker + popup）
7. **T7 · 前端裁剪与 C1**（`App.jsx` 去 AgentPanel + `MyCommentsPanel.jsx`）
8. **T8 · C2 DOM 注入**（content_script 里 MutationObserver + `/api/marks` 调用）

依赖关系：T1 → (T2, T3) → T4 → T5、T6 → T7 → T8

## 14 · 批准状态

- [ ] user 审阅本 spec
- [ ] user approve（回"spec 可以"或修改意见）
- [ ] 进入 writing-plans 阶段
