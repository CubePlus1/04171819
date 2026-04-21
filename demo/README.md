# 蹲到了 · Dundao

> **逆风如解意 · 替你守到兑现**

从 Hackathon 展台 demo 跃迁为 **bilibili 自用履约工具** · v0.3.0。

一种新的**信息流内容单元**：
- 不是发现新内容 · 是对你过去某个念头的履约
- 在被刷到的那一秒就成立 · 不需要引导或解释
- 过去 × 此刻 · 一人一张

---

## v0.2.0 vs v0.3.0

| | v0.2.0 · Hackathon 展台 | v0.3.0 · 自用工具 |
|---|---|---|
| 数据源 | `fixtures.json` 种子 | 真实 B 站评论（插件 hook + service_worker 定时拉） |
| 用户 | `demo-user` 硬编码 | 你自己（`SESSDATA` via `chrome.cookies`） |
| 答 | mock answer + 三剧本 | L1 回复我的 + L2 同视频高赞 → R1 规则判真 |
| 壳 | Web 单页 | + Chrome MV3 插件（content_script + service_worker + popup） |
| 站内标记 | 无 | 视频评论区徽章 ✅ 已答 / ⏳ 等待中 |
| AI 透明面板 | 右侧 MindCanvas 5 相位 | 去掉（自用不需要叙事） |
| 目标 | 赛题评审 | 真实跑 · 每天对自己有用 |

v0.2.0 仍在 `feat/dundao-demo` 分支可跑（纯 mock 展台 · `npm run setup`）。v0.3.0 在 `feat/dundao-bilibili`。

---

## 一分钟起步（v0.3.0）

```bash
# 1 · backend
cd demo/backend
npm install
npm run migrate          # 执行 001/002 schema migration（forward-only）
npm run dev              # 127.0.0.1:4000

# 2 · frontend
cd demo/frontend
npm install
npm run dev              # 127.0.0.1:5173

# 3 · Chrome 插件
#   → chrome://extensions
#   → 右上角"开发者模式"
#   → "加载已解压的扩展程序"
#   → 选 demo/extension/
```

装完，确认已登录 `www.bilibili.com`，然后：

1. 点地址栏 🧩 → 蹲到了 · Tracker → **"开始历史倒推"**
2. 等 1–3 分钟（`msgfeed/reply` 分页拉完）
3. `localhost:5173` → "我的评论" tab 看历史列表
4. 信息流 tab 看履约卡自动浮现（如果历史有 answer）

详细 runbook：[docs/09-ops-runbook.md § v0.3.0](./docs/09-ops-runbook.md#v030--bilibili-tracker-启停)

---

## 架构（v0.3.0）

```
Chrome (www.bilibili.com)
  ├── content_script · /x/v2/reply/(reply/)?add XHR hook → POST /api/ingest/comment
  │                   + MutationObserver(.reply-warp) → 徽章 ✅/⏳ (C2)
  └── service_worker · chrome.alarms(msgfeed 15m, top-reply 30m)
                       直调 api.bilibili.com → normalize → POST /api/ingest/{reply,top-reply}
                       WebSocket 订阅 card.generated → chrome.notifications
        │
        │ HTTP + WebSocket · 127.0.0.1 only
        ▼
Express (demo/backend · Node 20 · Express 4)
  ├── /api/ingest/{comment,reply,top-reply}  · 幂等 rpid 去重 → answerJudge R1 判真
  ├── /api/backfill/{start,status}            · 异步一次性历史倒推 + 进度 WS
  ├── /api/my-comments · /api/marks            · 前端列表 · 徽章批量查
  ├── /api/ambient/tick · /api/reset           · 遗留展台路径（仍可跑 mock）
  └── WebSocket /ws · card.generated · backfill.progress · workflow.*
        │
        ▼
SQLite (WAL)
  ├── intent_signals  · (你的评论) source=hook|backfill|mock · aid/rpid/topic=bilibili:aid:<aid>
  ├── creator_actions · (答) source=L1|L2|backfill|mock · is_answer/confidence/judge_reason
  ├── cards           · 履约快照（不可变）
  └── creators
        │
        ▼
React (demo/frontend · Vite + Tailwind + Zustand)
  ├── ProductPanel   · tab: 信息流 / 我的评论
  │   ├─ Feed        · DunCard P1/P2/P3 卡片
  │   └─ MyCommentsPanel · 全部 / 已答 / 等待中 筛选（C1）
  └── 12 主题系统 · 键盘 [ / ] 切换
```

---

## 判真 R1（规则引擎 · v0.3.0）

```
score = 0
+ 0.5  若 replier 是 UP 主
+ 0.3  若置顶 / 是 reply top
+ 0.2  若 like >= max(10, total_replies * 0.05)
+ 0.3  若 content 匹配 answer_patterns（"是 / BGM / 链接 / 淘口令 / http"）
- 0.5  若 content 匹配 noise_patterns（"+1 蹲 / 楼上 / 哈哈 / 前排"）

is_answer = score >= 0.3
```

20+ 真实评论样本测试覆盖（见 `backend/src/answerJudge.test.js`）。R2 LLM 二审（Deepseek API）留 v0.3.1。

---

## 5 步 AI 管线（保留）

```
ambient tick
  ├── ① scan    · 我还惦记着的
  ├── ② recall  · 挑中这一条（未履约 × is_answer=1 存在 × 主题没接过）
  ├── ③ match   · 绑 creator_action（按 confidence DESC · occurred_at DESC）
  ├── ④ seal    · 原子声明（UPDATE fulfilled=0→1 atomic）
  └── ⑤ emit    · WS broadcast card.generated · 前端浮入 + 桌面通知
```

前端右侧 AgentPanel 在 v0.3.0 下架（自用不需要）。后端 `mind.phase` 事件仍发送（保留兼容，前端不消费）。

---

## 常用脚本

### backend
| 命令 | 作用 |
|---|---|
| `npm run migrate` | forward-only schema 迁移（001 + 002） |
| `npm run dev` | 起 Express + WS (`DEMO_LOOP=1` · 展台循环开关) |
| `npm run start` | production 启动 |
| `npm run db:seed` | 注入 fixtures mock（回到 v0.2.0 展台数据） |
| `npm run smoke` | 端到端冒烟（ambient 生成卡） |
| `npm test` | 跑 cardBuilder.test.js（v0.2.0 兼容） |
| `node src/migrate.test.js` | 单独跑 migrate 测试 |
| 等 · 6 个 `<module>.test.js` | migrate / bilibili / answerJudge / ingest / historyBackfill / cardBuilder |

### frontend
| 命令 | 作用 |
|---|---|
| `npm run dev` | Vite dev server 127.0.0.1:5173 |
| `npm run build` | 打包 dist/（GH Pages 部署走这个 · `VITE_MOCK=1` 走浏览器端 mock） |
| `npm run preview` | dist 本地预览 |

### extension
不装 npm · 直接 Chrome → `chrome://extensions` → 开发者模式 → 加载已解压 → 选 `demo/extension/`。改了代码点插件卡片 ↻ 刷新。

---

## 目录

```
demo/
├── README.md                        · 本文（v0.3.0）
├── package.json                     · 根级 wrapper 脚本
├── shared/
│   └── contracts.js                 · 前后端共享契约（WS_EVENTS / REASON_CODES / MIND_PHASES）
├── backend/
│   ├── data/
│   │   ├── schema.sql               · 原 v0.2.0 schema（保留，新字段走 migrations）
│   │   ├── fixtures.json            · 3 创作者 / 3 信号 / 3 博主动作（v0.2.0 mock）
│   │   └── migrations/
│   │       ├── 001_initial.sql      · schema 快照 + user_version=1
│   │       └── 002_bilibili_fields.sql · ALTER 9 字段 + UNIQUE INDEX + user_version=2
│   └── src/
│       ├── server.js                · Express + WS · 挂 ingest / backfill / ambient 路由
│       ├── migrate.js               · user_version PRAGMA forward-only runner
│       ├── bilibili.js              · msgfeed/reply / view / 1 req/s 限流 / 3 次指数退避
│       ├── answerJudge.js           · R1 规则打分 · is_answer/confidence/judge_reason
│       ├── ingest.js                · 5 HTTP 端点 + INGEST_EVENTS 常量
│       ├── historyBackfill.js       · CLI + programmatic · 单 run lock · R8 (待补) 降级
│       ├── ambient.js               · 5 步管线（真实 DB 模式 · is_answer 过滤）
│       ├── cardBuilder.js           · P1/P2/P3 组装 · raw_text 空 fallback video_title
│       ├── workflow.js / intent.js / matcher.js  · v0.2.0 遗留（评论触发路径）
│       ├── db.js · events.js · rateLimit.js · logger.js · seed.js · smoke.js
│       └── *.test.js                · 6 个 test suite（node:assert · 无框架）
├── frontend/
│   ├── index.html · vite.config.js · tailwind.config.js
│   ├── public/scenes/               · 6 场景图（GH Pages 走 jsdelivr）
│   └── src/
│       ├── App.jsx                  · v0.3.0 单栏布局（AgentPanel 挂载已去）
│       ├── main.jsx · index.css
│       ├── api/{client,ws}.js · mock/index.js
│       ├── store/useDemoStore.js    · 加 myComments slice + focusCard
│       ├── themes/{tokens,useTheme,ThemeSwitcher}.js · 12 主题系统
│       ├── panels/ProductPanel.jsx  · 加 tab 切换（信息流 / 我的评论）
│       └── components/
│           ├── MyCommentsPanel.jsx  · C1 · 新增
│           ├── Feed.jsx / FeedItem.jsx / DunCard.jsx / CardPageP1-P3.jsx
│           └── AgentPanel.jsx / AgentMind.jsx / AgentWorkflow.jsx · v0.2.0 遗留（保留源文件）
├── extension/                       · v0.3.0 新增 · Chrome MV3
│   ├── manifest.json                · service_worker type=module · host_permissions bilibili + localhost:4000
│   ├── content_script.js            · XHR/fetch hook + MutationObserver(.reply-warp) 徽章注入
│   ├── service_worker.js            · chrome.alarms + 直调 B 站 API + ws_client
│   ├── ws_client.js                 · 轻量 auto-reconnect WebSocket
│   ├── popup.html / popup.js        · 3 按钮（打开主视图 / 历史倒推 / 状态）
│   ├── README.md                    · 装机步骤
│   └── icon.png
├── docs/
│   ├── README.md                    · 工程文档索引
│   ├── 01-architecture.md ... 15-submission-copy.md   · v0.2.0 工程文档
│   ├── 16-design-thinking.md
│   ├── 09-ops-runbook.md            · ⭐ v0.3.0 启停/倒推/故障表
│   └── superpowers/
│       ├── specs/2026-04-21-bilibili-tracker-design.md    · v0.3.0 设计
│       └── plans/
│           ├── 2026-04-21-bilibili-tracker.md             · 实施 plan 索引
│           └── 2026-04-21-bilibili-tracker/
│               ├── T1-T6-backend.md · T7-frontend.md · T8-T9-extension.md · T10-qa.md
│               └── invariants.md    · 36 property contracts + 8 区歧义消除
└── studydocs/                       · v0.2.0 产品思考（保留）
```

---

## 约束边界（v0.3.0）

- ✅ 接真实 B 站**公开** API（`msgfeed/reply` / `video/view` / `sort=2 replies`）
- ✅ 单用户（你自己 · `SESSDATA` via `chrome.cookies.get`，只内存流转不写盘）
- ✅ 本地单机 · backend 绑 `127.0.0.1`（不开 `0.0.0.0`）
- ❌ 不发 Chrome Web Store（仅 load unpacked · 自用即可）
- ❌ 不跨平台（v0.3.x 只 bilibili · 抖音/小红书留 v0.4.0 再论）
- ❌ 不做 LLM 判真（v0.3.0 纯 R1 规则 · R2 Deepseek API 留 v0.3.1）
- ❌ 不采他人评论（只抓"你自己评论路径上的 reply"）
- ❌ 不引 Python（全程 Node.js runtime · 见 spec §11）

---

## 常见坑

### 1. `better-sqlite3` 安装 / native build
多数走预编译 prebuilt。受限网络下临时放 SSL：

```bash
npm config set strict-ssl false
cd demo/backend && npm install
npm config set strict-ssl true
```

### 2. 端口冲突 `:4000` / `:5173`
```bash
lsof -i :4000 -t | xargs kill
lsof -i :5173 -t | xargs kill
```

### 3. 插件 popup 点倒推报 `SESSDATA not found`
没登 B 站。去 `www.bilibili.com` 登录后点插件卡片 ↻ 刷新重试。

### 4. 视频页评论旁没徽章
- 检查 `chrome://extensions` 看 content_script 是否有 ERROR log
- B 站改 DOM class 可能命中失败 · 看 `content_script.js` 的 `.reply-warp / .reply-list / #comment` selector · 需要时更新

### 5. `/api/my-comments` 返回空
backend migrate 没跑。`cd demo/backend && npm run migrate && npm run dev` 重启。

### 6. fixtures mock 数据想切回来
```bash
cd demo/backend
rm data/dundao.db
npm run migrate && npm run db:seed
```

### 7. Node 版本
Node **20+** 推荐（实测 22 / 25）。

---

## 路线图

### v0.3.1（下一步）
- R2 · Deepseek API 二审 judgeAnswer（~0.0005 元/条）
- UI · `AnswerReject.jsx` 否决按钮收集 R1 误判样本
- C3 · 首页/推荐视频缩略图挂角标

### v0.3.2
- R2-local · Ollama / Qwen 7B 本地推理（隐私敏感变体）
- C4 · 空间页自建"我的评论"聚合

### v0.4.0+
- 抖音 / 小红书 content_script driver 插拔
- 多账号（朋友白名单）
- 考虑 Chrome Web Store 发布

---

## 文档入口

| 我想 | 去 |
|---|---|
| 装上跑起来 | [docs/09-ops-runbook.md · v0.3.0](./docs/09-ops-runbook.md#v030--bilibili-tracker-启停) |
| 理解为什么这么做 | [docs/superpowers/specs/2026-04-21-bilibili-tracker-design.md](./docs/superpowers/specs/2026-04-21-bilibili-tracker-design.md) |
| 看实施步骤 | [docs/superpowers/plans/2026-04-21-bilibili-tracker.md](./docs/superpowers/plans/2026-04-21-bilibili-tracker.md) |
| 核对不变式 | [docs/superpowers/plans/2026-04-21-bilibili-tracker/invariants.md](./docs/superpowers/plans/2026-04-21-bilibili-tracker/invariants.md) |
| 查前后端契约 | [docs/02-api-contract.md](./docs/02-api-contract.md) + spec §7 |
| 了解和竞品区别 | [docs/竞品.md](./docs/竞品.md) |

---

## 一句话

> **逆风如解意 —— 把你念念不忘的，接回来。**
