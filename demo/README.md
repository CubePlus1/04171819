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
│ ┌────────────┐ ┌─────────┐ ┌──────┐ ┌─────────┐ │
│ │ intent.js  │ │matcher.js│ │cards│ │events.js│ │
│ └────────────┘ └─────────┘ └──────┘ └─────────┘ │
│                    ▼                             │
│              better-sqlite3                      │
└──────────────────────────────────────────────────┘
```

## Agent 五步工作流

```
用户评论
  └── Step 1 评论入栈          → ws: workflow.step {step:1, ...}
  └── Step 2 AI 意图识别       → ws: workflow.step {step:2, intent, confidence}
  └── Step 3 匹配用户历史      → ws: workflow.step {step:3, match}
  └── Step 4 写入数据库        → ws: workflow.step {step:4, recordId}
  └── Step 5 触发卡片生成      → ws: card.generated {card}
```

每步之间带有 ~400ms 的观察延迟，供评委肉眼跟读。

## 目录

```
demo/
├── backend/
│   ├── data/
│   │   ├── schema.sql           数据库 schema
│   │   └── fixtures.json        博主 / 信号 / 视频素材
│   ├── src/
│   │   ├── server.js            HTTP + WS 入口
│   │   ├── db.js                better-sqlite3 封装
│   │   ├── intent.js            规则意图分类器
│   │   ├── matcher.js           历史匹配逻辑
│   │   ├── cardBuilder.js       P1/P2/P3 卡片构造
│   │   ├── workflow.js          5 步管线
│   │   ├── events.js            WS 广播
│   │   ├── logger.js            轻量日志
│   │   └── seed.js              种子数据脚本
│   └── package.json
├── frontend/
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx
│   │   ├── index.css
│   │   ├── api/                 client + ws
│   │   ├── panels/              ProductPanel / AgentPanel
│   │   ├── components/          卡片 / 工作流 / 输入
│   │   ├── store/               zustand
│   │   └── data/                mock feed
│   └── package.json
└── package.json                 根并发脚本
```

## 设计决策（关键）

| 决策 | 理由 |
|------|------|
| 意图分类用规则引擎而非真实 LLM | 展示>技术；展台演示时延稳定 |
| SQLite 单文件 | 零外部依赖，npm 一条命令跑起 |
| WebSocket 而非 SSE | 双向：未来可支持评委端打点回传 |
| Zustand | 轻量、无 Provider 嵌套地狱 |
| Framer Motion | 多页卡片翻页手势 + 卡片浮入动效 |

## 约束边界（不做）

- 不接真实抖音 / 电商 / 微信 API
- 不跳出卡片拉第三方内容
- 不真跑 LLM（展台时延优先）
- 不做用户注册，单演示用户 `demo-user`
