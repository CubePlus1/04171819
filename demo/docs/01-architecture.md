# 01 · 架构

## 整体形态

```
┌───────────────────────────────────────────────────────────────┐
│  Browser (localhost:5173)                                      │
│                                                                 │
│  ┌────────────────────┐        ┌────────────────────┐          │
│  │  ProductPanel      │        │  AgentPanel        │          │
│  │  (左 · 信息流)      │◀──────▶│  (右 · AI 视图)    │          │
│  │                    │  state │                    │          │
│  │  Feed              │◀──────▶│  AmbientPulse      │          │
│  │   FeedItem         │        │  TriggerPicker     │          │
│  │   DunCard          │        │  AgentMind         │          │
│  │   ├ CardPageP1     │        │  AgentWorkflow     │          │
│  │   ├ CardPageP2     │        │                    │          │
│  │   └ CardPageP3     │        │                    │          │
│  └────────────────────┘        └────────────────────┘          │
│        Zustand store (useDemoStore)                            │
│         ├ cards / spotlightCardId                               │
│         ├ steps (每步含 mind 字段)                              │
│         └ activeRunId / running / pending                       │
└──────────────────────┬──────────────────────┬──────────────────┘
                       │                      │
               HTTP /api/*              WebSocket /ws
                       │                      │
                       ▼                      ▼
┌───────────────────────────────────────────────────────────────┐
│  Express (localhost:4000)                                      │
│                                                                 │
│  Routes (server.js)                                             │
│   ├ GET  /api/bootstrap    → state + triggers + cards          │
│   ├ GET  /api/epoch        → server epoch                      │
│   ├ POST /api/ambient/tick → 触发一次 ambient 履约             │
│   ├ POST /api/comment      → (遗留) 评论触发                    │
│   └ POST /api/reset        → 清库重 seed (仅 loopback)          │
│                                                                 │
│  WebSocket (events.js · verifyClient origin allowlist)          │
│                                                                 │
│  业务层                                                          │
│   ├ ambient.js  · runAmbient / hasPendingAmbient                │
│   ├ workflow.js · (遗留) runWorkflow for /api/comment           │
│   ├ intent.js   · 规则意图分类                                   │
│   ├ matcher.js  · 历史匹配                                       │
│   └ cardBuilder.js · P1/P2/P3 卡片构造                          │
│                                                                 │
│  基础设施                                                        │
│   ├ db.js        · better-sqlite3 + WAL                         │
│   ├ rateLimit.js · 令牌桶限流                                    │
│   ├ logger.js    · 日志                                          │
│   └ seed.js      · 种子数据 (fixtures.json)                     │
└──────────────────────────────┬─────────────────────────────────┘
                               │
                               ▼
                        ┌────────────┐
                        │  SQLite    │
                        │  WAL mode  │
                        │            │
                        │ users      │
                        │ creators   │
                        │ intent_    │
                        │ signals    │
                        │ creator_   │
                        │ actions    │
                        │ cards      │
                        └────────────┘
```

## 分层结构

```
demo/
├── shared/
│   └── contracts.js          ← 前后端共享契约（唯一事实源）
│
├── backend/
│   ├── data/
│   │   ├── schema.sql        ← 表定义 + 索引 + UNIQUE 约束
│   │   └── fixtures.json     ← 种子数据（users / creators / signals / actions / feed）
│   └── src/
│       ├── server.js         ← Express 入口 + 路由 + shutdown
│       ├── db.js             ← SQLite 封装
│       ├── events.js         ← WebSocket 广播 + origin 校验
│       ├── ambient.js        ← 核心：5 步管线 · mind 字段注入
│       ├── workflow.js       ← 遗留：评论触发路径
│       ├── intent.js         ← 规则意图分类（展台版）
│       ├── matcher.js        ← 遗留：历史匹配（给 workflow.js 用）
│       ├── cardBuilder.js    ← P1/P2/P3 卡片构造
│       ├── rateLimit.js      ← 令牌桶
│       ├── logger.js         ← 轻量日志
│       ├── seed.js           ← 种子脚本（CLI）
│       ├── smoke.js          ← 端到端冒烟
│       └── cardBuilder.test.js ← 单测
│
└── frontend/
    ├── index.html            ← web fonts 加载
    ├── vite.config.js        ← 端口、proxy、@shared alias
    ├── tailwind.config.js    ← 颜色/radius/shadow 全部用 CSS 变量
    ├── postcss.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx           ← 布局 + WS 接线 + 全局 toast
        ├── index.css         ← :root CSS 变量默认值 + 全局样式
        ├── api/
        │   ├── client.js     ← fetch 封装 + clientId
        │   └── ws.js         ← WebSocket 封装（自动重连）
        ├── store/
        │   └── useDemoStore.js ← Zustand store
        ├── themes/
        │   ├── tokens.js     ← 12 主题定义
        │   ├── useTheme.js   ← 主题切换 + localStorage
        │   └── ThemeSwitcher.jsx
        ├── panels/
        │   ├── ProductPanel.jsx   ← 左面板（信息流）
        │   └── AgentPanel.jsx     ← 右面板（AI 视图）
        ├── components/
        │   ├── Feed.jsx           ← 信息流 + 卡片插入
        │   ├── FeedItem.jsx       ← 普通视频卡片
        │   ├── DunCard.jsx        ← 多页履约卡片
        │   ├── CardPageP1.jsx     ← P1 情景 + 答案
        │   ├── CardPageP2.jsx     ← P2 AI 解释
        │   ├── CardPageP3.jsx     ← P3 行为足迹
        │   ├── AgentMind.jsx      ← MindCanvas 可视化
        │   ├── AgentWorkflow.jsx  ← 5 步折叠细节
        │   ├── AgentStep.jsx      ← 单步 UI
        │   ├── AmbientPulse.jsx   ← 自动节奏指示器
        │   ├── TriggerPicker.jsx  ← 展台触发器
        │   ├── CommentInput.jsx   ← (遗留)
        │   ├── PresetPicker.jsx   ← (遗留)
        │   └── Toast.jsx
        └── utils/
            └── time.js      ← relativeTimeCn (转发 @shared)
```

## 数据流 · 一次 ambient tick

```
[前端]                    [后端]                 [DB]
  │
  │ autoTick 到点 / 手动点按钮
  │
  ├──POST /api/ambient/tick──▶
                            │
                            ├─ WS broadcast workflow.begin ──▶ [前端] beginWorkflow
                            │
                            ├─ snapshotMindNodes()
                            │    ├ SELECT intent_signals WHERE user_id=?
                            │    └ SELECT creator_actions
                            │
                            ├─ WS broadcast step 1 (scan, nodes) ──▶ [前端] applyStep
                            │
                            ├─ sleep 400ms
                            │
                            ├─ pickNextCandidate()
                            │    └ SELECT ... JOIN ... NOT EXISTS cards
                            │
                            ├─ WS broadcast step 2 (recall, focus_signal) ──▶
                            │
                            ├─ sleep 400ms
                            ├─ 识别 action_type → script (A/B/C)
                            ├─ WS broadcast step 3 (match, focus_action) ──▶
                            │
                            ├─ sleep 400ms
                            ├─ db.transaction:
                            │    ├ UPDATE fulfilled=1 WHERE fulfilled=0 (atomic)
                            │    └ INSERT cards (UNIQUE intent_signal_id)
                            │
                            ├─ WS broadcast step 4 (seal, card_id) ──▶
                            │
                            ├─ sleep 400ms
                            │
                            ├─ WS broadcast step 5 (emit) ──▶
                            ├─ WS broadcast card.generated ──▶ [前端] onCardGenerated
                            │                                   Feed 插入卡片
                            │
                            ├─ WS broadcast workflow.end (ok=true) ──▶ [前端] endWorkflow
                            │
  ◀──HTTP 200 { ok, runId, cardId, pending }────────┘
  │
  │ 更新 pending · 决定下次 tick
  │
```

## 关键设计决策

### 1 · 为什么 WebSocket 不是 SSE
- WS 是**双向**：未来可支持评委端反馈回传（如"这张卡我喜欢"）
- SSE 是**单向**：如果只做 server push，SSE 更轻
- 姊妹 demo Echo 用的是 SSE · 可对比

### 2 · 为什么每 step 带 mind 字段
- 契约解耦：step 是后端管线序号、mind.phase 是可视化阶段
- 未来 step 增减时 mind 不破 · 反之亦然

### 3 · 为什么只在 step 1 下发完整 nodes
- nodes 可能几十上百个 · 5 步都下发就 5 倍 wire
- 前端 `AgentMind` 缓存第一次 scan 的 nodes · 后续只读 focus

### 4 · 为什么 cards.pages_json 是整份 JSON
- 卡片是不可变快照 · 不该随数据源变化而变
- JSON 字段最自然 · 无需拆表

### 5 · 为什么 /api/reset 只本机
- 破坏性操作 · 恶意远端可以一直 reset 让展台永远初态
- 默认 loopback · 显式放开用 `ALLOW_REMOTE_RESET=1`

详细展开见：
- `03-data-model.md` · 表设计
- `04-ambient-pipeline.md` · 管线实现
- `02-api-contract.md` · 契约

## 下一步

→ [02-api-contract.md](./02-api-contract.md)
