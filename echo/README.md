# 回响 · Echo

字节 Hackathon 赛道三 · 履约型内容的**另一种猜想**。

> 如果不做双面板，不做信息流 —— 如果让「AI 把你的念头接回来」只是一次**私人对话**呢？

主 demo（`dundao-demo`）把履约做成「左边信息流 + 右边 Agent 面板」的展示型拼贴；
这里（`dundao-echo`）把同一个原则反过来做：**只有一条对话**，没有面板，没有卡片浮现在信息流里。
用户留下一句念头，AI 像一位安静的朋友，一句一句地，把那件事的回音告诉你。

## 一分钟起步

```bash
cd echo
npm run setup        # 安装依赖（server + web）
npm run dev          # 起后端 :4100 + 前端 :5174
```

浏览器打开 http://localhost:5174，把心里的「蹲」打出来，按回车。

## 技术选择 vs 主 demo 的反面

| 维度 | `dundao-demo` | `dundao-echo` |
|-----|---------------|---------------|
| 架构 | Express + WS + SQLite + React + Tailwind | 原生 Node http + SSE + in-memory + React + 原生 CSS |
| 布局 | 7/5 双面板 | 单列阅读流 |
| 色调 | 深色暖红暖橙 | 奶白纸面 + 墨色 |
| 字体 | 无衬线 (PingFang) | 衬线 (Noto Serif SC / Songti) |
| 反馈 | 5 步状态面板 + 多页卡片 | 5 条对话气泡 + 一张「明信片」bubble |
| 推送 | WebSocket broadcast | SSE 单向流 |
| 状态 | Zustand + runId 过滤 | 单次 request 一次订阅，无全局 store |

## 情感设计

- **节奏**：每句气泡"打字"出来（≈30ms/字），给人一种"她在想怎么说"的停顿感
- **气泡措辞**：不用 enum、不用 "RUNNING / DONE"；每一步都是 AI 在自言自语
  - "听到了..."
  - "这句话我在哪儿见过... 哦是在「大山」那儿"
  - "我记得这件事 · 她今天刚好放了下文"
  - "这是当时那条链接"
- **最终回音**：一张「明信片」气泡，P1 情景锚点 + 内容答案 + 一句情感收束；无多页翻页，也不想模仿信息流
- **背景**：奶白纸面 + 浅米色网格 + 灯光晕；AI 说话时晕染会微微加深

## 剧本

对齐主 demo 的三剧本，但表达路径不同：

| 剧本 | 触发 | Echo 如何回响 |
|------|------|--------------|
| A · 蹲链接 | `蹲链接姐妹们` | 气泡回音 →「这是当时那件上衣的链接」明信片 |
| B · 稍后再看 | `一个月前按稍后再看` | 气泡回音 →「她已经更完了 · 我替你从 Day1 说到 Day30」 |
| C · 蹲后续 | `蹲后续 爷爷真帅` | 气泡回音 →「爷爷的老战友联系到他了 · 想让你看看」 |

## 目录

```
echo/
├── server/
│   ├── server.mjs       原生 Node http + SSE（无 Express）
│   ├── store.mjs        in-memory 数据（用户历史 × 博主动作）
│   ├── echo.mjs         5 步对话生成器
│   └── smoke.mjs        端到端冒烟（SSE 流解析）
├── web/
│   ├── index.html
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx
│       ├── App.jsx      单文件组件树
│       ├── Bubble.jsx   气泡渲染 + 打字机
│       ├── Postcard.jsx 明信片最终气泡
│       ├── useEcho.js   fetch + SSE 订阅
│       └── style.css    原生 CSS（零 Tailwind）
└── package.json
```

## 不做

- 不做信息流 · 不做左右分屏 · 不做多页手势
- 不加 WebSocket · 不加数据库文件 · 不加 Zustand
- 不用 Tailwind，不用组件库，不堆 token 系统
- 无登录、无 CRUD、无多用户

## 部署边界

**Echo 是「单用户 localhost 实验」**：

- 全局进程内一份 state；没有用户隔离
- `/api/reset` 默认仅本机可触发（`ALLOW_REMOTE_RESET=1` 显式开）
- 并发 SSE 流上限：单 IP `3` · 全局 `32`（可通过 `MAX_STREAMS_PER_IP` / `MAX_STREAMS_GLOBAL` 调整）
- rate limiter 每 64 请求 prune 一次 idle bucket

要放到公网 / 多用户环境，需要另外做 session 隔离 + 代理信任链 + 并发审计。

这是一个**姊妹实验**：同一份原则，不同的表达直觉。
