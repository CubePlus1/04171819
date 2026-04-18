# 蹲到了 · Dundao Demo

字节大学生 Hackathon · **赛道三｜AI 体验：刷到懂你的瞬间** 展台 Demo。

> **逆风如解意 —— 把你念念不忘的，接回来。**

**展台进度真实档** → [`PROGRESS.md`](./PROGRESS.md) · 记录哪些是真代码、哪些是占位、还能抢什么

一种新的**信息流内容单元**：
- 不是发现新内容 · 是对你过去某个念头的履约
- 在被刷到的那一秒就成立 · 不需要引导或解释
- 过去 × 此刻 · 一人一张

---

## 一分钟起步

```bash
cd demo
npm run setup     # 首次：装依赖 + 初始化 SQLite + seed
npm run dev       # 并发启动前后端 · 后端 :4000 / 前端 :5173
```

浏览器打开 http://localhost:5173

左侧抖音信息流模拟 · 右侧 AI 后台扫描台 + 12 主题切换。
**什么都不用做** —— 每 9 秒后台自动挑一条履约卡片浮到左侧信息流。

---

## 三类文档

这个 repo 有三类文档 · 对应三种使用场景：

| 目录 | 目的 | 什么时候读 |
|---|---|---|
| [`studydocs/`](./studydocs/) | **教你把后端逻辑讲出来** | 面试 / 展台 / 向队友解释时 |
| [`docs/`](./docs/) | 工程参考文档 | 改代码 / 部署 / 排查时 |
| [`report/`](./report/) | 赛道三评审报告 | 决策回顾 / 对外展示 |

### 推荐阅读路径

**面试前 30 分钟**：
1. `studydocs/README.md` · 学习路径总览
2. `studydocs/00-core-philosophy.md` · 履约型内容是什么
3. `studydocs/12-faq.md` · 常见问答速览

**展台前准备**：
1. `report/07-wakeup-action.md` · 2 小时行动清单
2. `studydocs/09-pitch-10sec.md` · 10 秒卖点
3. `studydocs/10-pitch-90sec.md` · 90 秒讲稿
4. `studydocs/13-whiteboard.md` · 现场可画的图
5. `report/06-risks-fallbacks.md` · 现场防爆

**要改代码**：
1. `docs/01-architecture.md` · 整体架构
2. `docs/02-api-contract.md` · API 契约
3. `docs/03-data-model.md` · 数据层
4. `docs/07-testing-matrix.md` · 测试矩阵

---

## 三剧本演示

AI 后台每 9 秒自动挑一条 · 也可点右面板的 3 个触发器手动优先：

| 剧本 | 场景 | 卡片结构 |
|---|---|---|
| A · 蹲链接 | 她 3 周前评论过"蹲链接" · 博主放了链接 | P1 + P2 |
| B · 稍后再看 | 她一个月前按过"稍后再看" · 博主更完了系列 | P1 + P3 |
| C · 蹲后续 | 她 2 周前评论过"蹲后续" · 博主发了下集 | P1 + P2 + P3 |

---

## 架构

```
浏览器
 ├── 左面板 · TikTok 风格信息流（普通视频 + 履约卡片交替）
 └── 右面板 · AI 后台（AmbientPulse · AgentMind 可视化 · 触发器）
        │
        │  WebSocket /ws
        ▼
Express :4000
 ├── GET /api/bootstrap        · 用户 + 信息流 + 触发器 + 历史 + 卡片
 ├── POST /api/ambient/tick    · 触发一次 AI 履约（主路径）
 ├── POST /api/reset            · 清库重 seed（仅本机）
 └── WS 广播 workflow.*, card.generated, demo.reset
        │
        ▼
SQLite (WAL)
 ├── intent_signals (她留下的痕迹)
 ├── creator_actions (博主的新动作)
 └── cards (已履约快照)
```

详见 [`docs/01-architecture.md`](./docs/01-architecture.md)。

---

## 5 步 AI 管线

```
tick
  ├── ① scan    · 她还惦记着的
  ├── ② recall  · 挑中这一条（最旧 × 未履约 × 主题没接过）
  ├── ③ match   · 对上博主的新动作（JOIN by topic）
  ├── ④ seal    · 原子声明记下（UPDATE fulfilled=0→1 · atomic）
  └── ⑤ emit    · 浮到她的信息流（WS broadcast card.generated）
```

全程 ~2 秒 · MindCanvas 同步演 5 相位：**scan → recall → match → seal → emit**。

详见 [`studydocs/02-five-steps.md`](./studydocs/02-five-steps.md) + [`docs/04-ambient-pipeline.md`](./docs/04-ambient-pipeline.md)。

---

## 核心特性

### 1. 被动刷到即成立
**没有输入框**。用户什么都不用做，左侧信息流里卡片自己浮入。

### 2. MindCanvas · AI 决策透明化
5 相位可视化 · 扫描 / 挑中 / 配对 / 盖章 / 飞出 · 每一步看得见 · 不是黑盒。

### 3. 主题级聚合履约
同一念头只接一次。她为一件事留过 5 条痕迹 · 系统只生成 1 张卡片。

### 4. 12 套可切换视觉主题
暖色治愈 / 赛博霓虹 / 极简杂志 / ... / 水墨禅意 / 剪贴簿。
按 `[` `]` 快速切 · 展台视觉钩子。

### 5. 工程稳定性
- 并发保护：原子声明 + UNIQUE 索引
- 安全层：CORS allowlist + WS origin · rate limit · reset 本机限制
- 优雅关闭：WS → wss → httpServer → closeDb
- 经过 10 轮 codex review + smoke + 单测

详见 [`studydocs/`](./studydocs/) 各专题。

---

## 目录

```
demo/
├── README.md               ← 你在这里
│
├── studydocs/              ← 教你把后端逻辑讲出来
│   ├── 00-core-philosophy.md
│   ├── 01-why-no-input.md
│   ├── 02-five-steps.md
│   ├── 03-three-tables.md
│   ├── 04-topic-level-aggregation.md
│   ├── 05-atomic-claim.md
│   ├── 06-mind-phases.md
│   ├── 07-security-layer.md
│   ├── 08-graceful-shutdown.md
│   ├── 09-pitch-10sec.md
│   ├── 10-pitch-90sec.md
│   ├── 11-pitch-3min.md
│   ├── 12-faq.md
│   └── 13-whiteboard.md
│
├── docs/                   ← 工程参考文档
│   ├── 01-architecture.md
│   ├── 02-api-contract.md
│   ├── 03-data-model.md
│   ├── 04-ambient-pipeline.md
│   ├── 05-theme-system.md
│   ├── 06-frontend-components.md
│   ├── 07-testing-matrix.md
│   ├── 08-config-env.md
│   └── 09-ops-runbook.md
│
├── report/                 ← 赛道三评审报告
│   ├── 00-executive-summary.md
│   ├── 01-scoring-matrix.md
│   ├── 02-main-demo-analysis.md
│   ├── 03-echo-analysis.md
│   ├── 04-convergence-decision.md
│   ├── 05-pitch-compression.md
│   ├── 06-risks-fallbacks.md
│   └── 07-wakeup-action.md
│
├── shared/
│   └── contracts.js        ← 前后端共享契约（WS_EVENTS / REASON_CODES / MIND_PHASES）
│
├── backend/
│   ├── data/
│   │   ├── schema.sql
│   │   └── fixtures.json
│   └── src/
│       ├── server.js       · HTTP + WS 入口
│       ├── ambient.js      · 核心：5 步管线 + mind 字段
│       ├── workflow.js     · 遗留评论触发路径
│       ├── intent.js       · 规则意图分类
│       ├── matcher.js      · 历史匹配
│       ├── cardBuilder.js  · P1/P2/P3 卡片构造
│       ├── db.js           · better-sqlite3 封装
│       ├── events.js       · WebSocket 广播
│       ├── rateLimit.js    · 令牌桶
│       ├── logger.js
│       ├── seed.js
│       ├── smoke.js        · E2E 测试
│       └── cardBuilder.test.js
│
└── frontend/
    ├── index.html          · web fonts 加载
    ├── vite.config.js
    ├── tailwind.config.js  · 颜色/radius/shadow 全部 CSS 变量
    └── src/
        ├── main.jsx
        ├── App.jsx         · WS 接线 + toast + 主题
        ├── index.css       · :root 默认变量
        ├── api/
        ├── store/useDemoStore.js    · Zustand
        ├── themes/        · 12 主题系统
        ├── panels/        · ProductPanel / AgentPanel
        └── components/    · Feed / DunCard / AgentMind / ...
```

---

## HTTP / WS 合约速查

| Endpoint | 说明 |
|---|---|
| `GET /api/health` | liveness |
| `GET /api/bootstrap` | 用户 + 信息流 + 触发器 + 历史 + 卡片 + pending + server_epoch |
| `GET /api/epoch` | 当前 server epoch |
| `POST /api/ambient/tick` | **主路径** · 触发一次履约（可选 topic/signalId） |
| `POST /api/comment` | (遗留) 评论触发 |
| `POST /api/reset` | 清库 + 重 seed · 仅本机 |
| `WS /ws` | 订阅 `WS_EVENTS.*` · verifyClient origin 校验 |

详见 [`docs/02-api-contract.md`](./docs/02-api-contract.md)。

---

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | `4000` | HTTP 端口 |
| `LOG_LEVEL` | `info` | 日志级别 |
| `ALLOWED_ORIGINS` | `""` | 逗号分隔的额外 CORS 允许 origin |
| `ALLOW_REMOTE_RESET` | `0` | `1` 允许非本机触发 reset |
| `RATE_LIMIT_CAPACITY` | `12` | 令牌桶容量 |
| `RATE_LIMIT_REFILL` | `3` | 每秒补充令牌数 |
| `BOOTSTRAP_CARDS_LIMIT` | `30` | bootstrap 返回最近多少张卡片 |

详见 [`docs/08-config-env.md`](./docs/08-config-env.md)。

---

## 测试

```bash
cd demo/backend

# 单测
npm test

# E2E smoke (需要 server 已启动)
npm start &
npm run smoke

# 前端构建验证
cd ../frontend && npm run build
```

详见 [`docs/07-testing-matrix.md`](./docs/07-testing-matrix.md)。

---

## 设计决策速览

| 决策 | 理由 |
|---|---|
| 意图分类用规则引擎而非 LLM | 展台时延稳定 · 可解释 · 见 [`studydocs/00-core-philosophy.md`](./studydocs/00-core-philosophy.md) |
| SQLite 单文件 | 零外部依赖 · 一条命令跑起 |
| WebSocket 而非 SSE | 双向 · 未来支持评委端反馈回传 |
| Zustand · 无 Provider 污染 | 轻量 |
| Framer Motion · reduced-motion 感知 | 多页卡片翻页 + Mind 可视化 |
| 共享 `contracts.js` | 前后端事件名/错误码不 drift |
| `mind.phase` 独立于 `step` | 契约解耦 · 见 [`studydocs/06-mind-phases.md`](./studydocs/06-mind-phases.md) |
| 主题级聚合履约 | 一个念头只接一次 · 见 [`studydocs/04-topic-level-aggregation.md`](./studydocs/04-topic-level-aggregation.md) |

---

## 工程质量

- ✅ 经过 **10 轮 codex 自动 review**（并发 / shutdown / 安全 / 性能 / a11y / 可维护性 / 测试 / 集成 / 文案 / 最终 go-no-go）
- ✅ smoke + 单测 + frontend build 全绿
- ✅ prefers-reduced-motion 全尊重
- ✅ 单用户 localhost 展台 ready
- ✅ 91/100 final go

---

## 约束边界（不做）

- ❌ 不接真实抖音 / 电商 / 微信 API
- ❌ 不跳出卡片拉第三方内容
- ❌ 不真跑 LLM（展台时延优先 · pipeline LLM-ready）
- ❌ 不做用户注册，单演示用户 `demo-user`
- ❌ 不做 Echo 分支（姊妹探索已冻结 · 见 [`report/03-echo-analysis.md`](./report/03-echo-analysis.md)）

---

## 一句话

> **逆风如解意 —— 把你念念不忘的，接回来。**
>
> 代码已经够了 · 剩下的是讲得清 · 演得稳 · 打得动。

下一步：
- 看进度 → [`PROGRESS.md`](./PROGRESS.md)
- 生成素材 → [`docs/10-media-prompts.md`](./docs/10-media-prompts.md)
- 学讲稿 → [`studydocs/README.md`](./studydocs/README.md)
