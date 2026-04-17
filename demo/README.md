# 蹲到了 · Dundao Demo

字节大学生 Hackathon · 赛道三 AI 体验双面板展台 Demo。

> 让抖音信息流里多一种「你过去未完成的念头回来找你」的瞬间。

## 一分钟起步

```bash
cd demo
npm run setup     # 安装根/后端/前端依赖 + 初始化 SQLite 数据
npm run dev       # 并发启动：后端 :4000 / 前端 :5173
```

浏览器打开 http://localhost:5173 — 左侧抖音信息流模拟 + 右侧 AI Agent 面板。

## 演示路径

右侧 Agent 面板点击预设或自由输入评论，即可触发跨面板联动：

| 剧本 | 预设评论 | 卡片结构 |
|------|----------|---------|
| A · 蹲链接 | `蹲链接姐妹们 上衣链接求！` | P1 + P2 |
| B · 稍后再看 | `一个月前按稍后再看 忘了看` | P1 + P3 |
| C · 蹲后续 | `蹲后续 爷爷真帅` | P1 + P2 + P3 |

## 架构概览

```
┌──────────────────────────────────────────────────┐
│ 浏览器                                           │
│ ┌──────────────┐     ┌──────────────┐           │
│ │ 产品面板     │     │ Agent 面板   │           │
│ │ 信息流+卡片  │<────│ 输入+工作流  │           │
│ └──────────────┘     └──────────────┘           │
└───────────────▲──────────────────▲───────────────┘
                │ WebSocket        │ WebSocket
                │                  │
┌───────────────▼──────────────────▼───────────────┐
│ Express (Node 20+)                               │
│ ┌────────────┐ ┌─────────┐ ┌──────────────┐     │
│ │ intent.js  │ │matcher  │ │ cardBuilder  │     │
│ └────────────┘ └─────────┘ └──────────────┘     │
│                    ▼                             │
│              better-sqlite3                      │
└──────────────────────────────────────────────────┘
```

## Agent 五步工作流

```
用户评论
  └── Step 1 评论入栈          → ws: workflow.step {step:1, run_id}
  └── Step 2 AI 意图识别       → ws: workflow.step {step:2, intent, confidence}
  └── Step 3 匹配用户历史      → ws: workflow.step {step:3, match}
  └── Step 4 写入数据库        → ws: workflow.step {step:4, card_id}
  └── Step 5 触发卡片生成      → ws: workflow.step {step:5, preview}
                              → ws: card.generated {card}
                              → ws: workflow.end {ok, cardId}
```

每步之间带有 ~400ms 的观察延迟，供评委肉眼跟读。

## 共享契约

`demo/shared/contracts.js` 是前后端共用的单一事实源：

- `WS_EVENTS` — 所有 WebSocket 事件类型（`workflow.begin` / `workflow.step` / `workflow.end` / `card.generated` / `demo.reset` / `server.shutdown` / `ws.hello`）
- `REASON_CODES` — 失败原因枚举（`no-match` / `signal-already-fulfilled` / `server-error` / `rate-limited` / `in-flight-workflow`）
- `SCRIPT_IDS` · `PAGE_IDS` · `ANSWER_TYPES` · `SCRIPT_TO_PAGES` · `INTENTS` — 卡片 / 意图常量

前端通过 vite alias `@shared` 导入，后端用相对路径 `../../shared/contracts.js`。

## 目录

```
demo/
├── shared/
│   └── contracts.js           前后端共享常量（事件名/错误码/脚本映射）
├── backend/
│   ├── data/
│   │   ├── schema.sql         SQLite schema
│   │   └── fixtures.json      博主 / 信号 / 视频素材
│   ├── src/
│   │   ├── server.js          HTTP + WS 入口（CORS / reset drain / shutdown）
│   │   ├── db.js              better-sqlite3 封装
│   │   ├── intent.js          规则意图分类器
│   │   ├── matcher.js         历史匹配（带启动自检）
│   │   ├── cardBuilder.js     P1/P2/P3 卡片构造
│   │   ├── workflow.js        5 步管线（带 runId 与原子履约声明）
│   │   ├── events.js          WS 广播 + origin allowlist
│   │   ├── rateLimit.js       per-IP 令牌桶
│   │   ├── logger.js          轻量日志
│   │   ├── smoke.js           端到端冒烟（含并发去重 / CORS / 非法 JSON 用例）
│   │   └── seed.js            种子数据脚本
│   └── package.json
├── frontend/
│   ├── index.html
│   ├── vite.config.js         @shared alias + /api、/ws 代理
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx            WS 接线 / 错误态 / prefers-reduced-motion / toast
│   │   ├── index.css
│   │   ├── api/               client + ws（自动重连）
│   │   ├── panels/            ProductPanel / AgentPanel
│   │   ├── components/        卡片 / 工作流 / 输入 / Toast
│   │   ├── store/             zustand（activeRunId 过滤 + 卡片去重合并 + 40 上限）
│   │   └── utils/             time.js
│   └── package.json
└── package.json               根并发脚本
```

## HTTP / WS 合约速查

| Endpoint | 说明 |
|----------|------|
| `GET  /api/health` | liveness |
| `GET  /api/bootstrap` | 用户 + 信息流素材 + 预设评论 + 历史信号 + 最近 30 张卡片 |
| `POST /api/comment` | 触发 5 步工作流；返回 `{ ok, runId, cardId?, reason? }` |
| `POST /api/reset` | **仅本机**，清库 + 重 seed（in-flight 排空最多 3s，否则 409） |
| `WS   /ws` | 订阅 `WS_EVENTS.*`，带 origin allowlist 与 verifyClient 校验 |

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `PORT` | `4000` | HTTP 端口 |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `ALLOWED_ORIGINS` | `""` | 逗号分隔的额外 CORS / WS origin（支持 `*`） |
| `ALLOW_REMOTE_RESET` | `0` | `1` 允许非本机触发 `/api/reset` |
| `RATE_LIMIT_CAPACITY` | `12` | `/api/comment` 令牌桶容量 |
| `RATE_LIMIT_REFILL` | `3` | 每秒补充令牌数 |
| `BOOTSTRAP_CARDS_LIMIT` | `30` | bootstrap 返回最近多少张卡片 |

默认允许的 origin：`localhost` / `127.0.0.1` / LAN 网段（10.x / 192.168.x / 172.16-31.x）。

## 验收矩阵

```bash
cd backend
npm run db:seed        # 重置 demo 数据
npm start              # 或 npm run dev（watch 模式）
npm run smoke          # 端到端断言：三剧本 + runId + CORS + 并发去重 + 非法 JSON
```

smoke 覆盖：
- 三剧本 A/B/C 多页结构 + 情景锚点格式
- WS 事件 runId 穿透（workflow.step × 5 + card.generated）
- 边界：空评论 / 超长评论 / 非法 JSON → 400 且 `application/json`
- 并发去重：同一意图两条并发 → 1 张卡 + 另一条 `signal-already-fulfilled`
- CORS：`evil.example.com` 不在响应头里

## 设计决策

| 决策 | 理由 |
|------|------|
| 意图分类用规则引擎而非真实 LLM | 展示>技术；展台演示时延稳定 |
| SQLite 单文件 | 零外部依赖，npm 一条命令跑起 |
| WebSocket 而非 SSE | 双向：未来可支持评委端打点回传 |
| Zustand | 轻量、无 Provider 嵌套地狱 |
| Framer Motion + MotionConfig | 多页卡片翻页 + `prefers-reduced-motion` 自适配 |
| 共享 `contracts.js` | 前后端事件名/错误码/脚本映射不飘 |

## 约束边界（不做）

- 不接真实抖音 / 电商 / 微信 API
- 不跳出卡片拉第三方内容
- 不真跑 LLM（展台时延优先）
- 不做用户注册，单演示用户 `demo-user`
