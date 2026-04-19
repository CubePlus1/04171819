# 蹲到了 · Dundao Demo

字节大学生 Hackathon · **赛道三｜AI 体验：刷到懂你的瞬间** 展台 Demo。

> **逆风如解意 · 替你守到兑现**

一种新的**信息流内容单元**：
- 不是发现新内容 · 是对你过去某个念头的履约
- 在被刷到的那一秒就成立 · 不需要引导或解释
- 过去 × 此刻 · 一人一张

---

## 一分钟起步

```bash
npm run setup
npm run dev
```

浏览器打开 http://localhost:5173 （后端跑在 :4000，前端跑在 :5173）

左侧抖音信息流模拟 · 右侧 AI 后台扫描台 + 主题切换。
**什么都不用做** —— 后台自动挑一条履约卡片浮到左侧信息流。

---

## 三场景

按 Figma 三张原型重写，每条剧本对应一个真实情绪场景：

| 剧本 | 场景 | 卡片结构 |
|---|---|---|
| A · 收纳好物 | 我 7 天前评论"求链接" · 博主放了商品 | P1 + P2 |
| B · 男友失联 | 我 5 天前蹲过的"后续" · 博主更完了 5 天 | P1 + P3 |
| C · 剪辑教程 | 我 9 天前求过的"教学" · 博主真的录了 | P1 + P2 + P3 |

每张 P1 卡：头像「我·N天前」+ 我的评论 + 链接视频 + 作者标签 + 「不用了 · 去看看」双按钮。

---

## 架构

```
浏览器
 ├── 左面板 · 抖音风格信息流（普通视频 + 履约卡片交替）
 └── 右面板 · AI 后台（AmbientPulse · MindCanvas · 触发器）
        │
        │  WebSocket /ws
        ▼
Express :4000
 ├── GET /api/bootstrap        · 用户 + 信息流 + 触发器 + 历史 + 卡片
 ├── POST /api/ambient/tick    · 触发一次 AI 履约（主路径）
 ├── POST /api/reset           · 清库重 seed（仅本机）
 └── WS 广播 workflow.*, card.generated, demo.reset
        │
        ▼
SQLite (WAL)
 ├── intent_signals  (我留下的痕迹)
 ├── creator_actions (博主的新动作)
 └── cards           (已履约快照)
```

---

## 5 步 AI 管线

```
tick
  ├── ① scan    · 我还惦记着的
  ├── ② recall  · 挑中这一条（最旧 × 未履约 × 主题没接过）
  ├── ③ match   · 对上博主的新动作（JOIN by topic）
  ├── ④ seal    · 原子声明记下（UPDATE fulfilled=0→1 · atomic）
  └── ⑤ emit    · 浮到她的信息流（WS broadcast card.generated）
```

全程 ~2 秒 · MindCanvas 同步演 5 相位：**scan → recall → match → seal → emit**。

---

## 常用脚本

| 命令 | 作用 |
|---|---|
| `npm run setup` | 装依赖 + 初始化 SQLite + seed |
| `npm run dev` | 并发起前后端（dev 模式 · DEMO_LOOP=1） |
| `npm run dev:backend` | 只起后端 |
| `npm run dev:frontend` | 只起前端 |
| `npm run build` | 前端打包 |
| `npm run start` | 后端 production 启动 |
| `npm run clean` | 清 node_modules / dist / db |

---

## 常见坑

### 1. 不要给 `package.json` 加 `#` 注释
JSON **不支持注释**。如果你看到我们的命令示例里有 `# xxx`，那是 **bash 注释**，只在命令行里有效，**绝对不要复制进 `package.json` 的字符串里**，否则 `npm run dev` 会把 `#` 后面的当 shell 命令找，报 `command not found`。

### 2. better-sqlite3 安装失败 / SSL 证书拦截
绝大多数情况会走预编译 prebuilt，不会卡。如果你的网络环境（公司 / 学校 / 公网受限）真的把 SSL 拦了，可以临时关 SSL 校验装一次：

```bash
npm config set strict-ssl false
npm run setup
npm config set strict-ssl true   # 装完务必关回来
```

### 3. 端口冲突 (`EADDRINUSE :::4000` / 5173)
说明本机已经有进程占着这两个端口：

```bash
lsof -i :4000 -t | xargs kill   # 释放后端
lsof -i :5173 -t | xargs kill   # 释放前端
```

### 4. fixtures 改了但卡片没变
后端启动时 db 已存在就不会重 seed。改完 `backend/data/fixtures.json` 后：
- 点页面右上角 **"重置演示"** 按钮，或
- `curl -X POST http://localhost:4000/api/reset`

### 5. Node 版本
推荐 **Node 20+**（实测 22.16.0 ✓）。Node 18 也能跑，但 better-sqlite3 偶尔需要 rebuild。

---

## 目录

```
.
├── README.md
├── package.json               · 一键 setup / dev
├── shared/contracts.js        · 前后端共享契约（WS_EVENTS / REASON_CODES）
├── backend/
│   ├── data/
│   │   ├── schema.sql
│   │   └── fixtures.json      · 3 创作者 / 3 信号 / 3 博主动作
│   └── src/
│       ├── server.js          · Express + WS
│       ├── ambient.js         · 5 步管线（主路径）
│       ├── workflow.js        · 评论触发遗留路径
│       ├── intent.js          · 意图分类（规则）
│       ├── matcher.js         · 历史匹配
│       ├── cardBuilder.js     · 卡片组装（A/B/C 剧本）
│       ├── db.js / events.js / rateLimit.js / logger.js
│       └── seed.js / smoke.js / cardBuilder.test.js
└── frontend/
    ├── index.html · vite.config.js · tailwind.config.js · postcss.config.js
    ├── public/scenes/         · 6 张场景图（3 thumb + 3 bg）
    └── src/
        ├── App.jsx · main.jsx · index.css
        ├── api/{client,ws}.js
        ├── store/useDemoStore.js
        ├── themes/{tokens, useTheme, ThemeSwitcher}.js
        ├── panels/{ProductPanel, AgentPanel}.jsx
        └── components/        · DunCard / CardPageP1-P3 / Feed / AgentMind / ...
```

---

## 约束边界（不做）

- ❌ 不接真实抖音 / 电商 / 微信 API
- ❌ 不跳出卡片拉第三方内容
- ❌ 不真跑 LLM（展台时延优先 · pipeline LLM-ready）
- ❌ 不做用户注册，单演示用户 `demo-user`

---

## 一句话

> **逆风如解意 —— 把你念念不忘的，接回来。**
