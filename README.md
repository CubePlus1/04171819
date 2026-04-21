# 蹲到了 · Dundao

> **逆风如解意 · 替你守到兑现**

一种新的**信息流内容单元**：不是发现新内容，是把你**过去留下的蹲字**、**过去收藏的视频**、**过去说过"等等"的那个承诺** —— 等到博主真的做到了、网友真的给出答案了 —— 在下一次你刷 B 站时，作为**履约卡**浮到你面前。

过去 × 此刻 · 一人一张 · 在被刷到的那一秒就成立 · 不需要引导或解释。

---

## 这是什么 · 不是什么

- ✅ **一个真实的自用工具**。每天在 B 站用。
- ✅ Chrome MV3 插件 + localhost Node.js 后端 + React 前端。
- ✅ 只抓**你自己**的评论和它们对应的回复链 · `SESSDATA` 只在内存流转。
- ❌ 不是 SaaS · 不是商店发行品 · 不是广告投放载体。
- ❌ 不采别人的公开数据 · 不训模型 · 不存云端。
- ❌ 不是 Hackathon demo 了（虽然出身于此 · 见下方"由来"）。

---

## 快速起步

当前能跑的版本：**v0.3.0 · bilibili tracker**。实现在 [`demo/`](./demo/) 子目录。

```bash
cd demo
# 跟着 demo/README.md 装三端（backend migrate + frontend dev + Chrome load unpacked）
```

→ [`demo/README.md`](./demo/README.md) · **完整安装、架构、脚本、目录、路线图**

---

## 架构速览

```
Chrome (www.bilibili.com)
  ├── content_script · XHR hook + MutationObserver 徽章注入
  └── service_worker · chrome.alarms 拉 msgfeed/reply + 高赞评论
        │
        ▼
Express localhost:4000 (127.0.0.1 only)
  ├── /api/ingest/*  · 摄入 + R1 规则判真
  ├── /api/backfill/* · 历史倒推
  ├── /api/my-comments / /api/marks · 前端与徽章查询
  └── WebSocket /ws · card.generated / backfill.progress
        │
        ▼
SQLite (WAL) · intent_signals / creator_actions / cards
        │
        ▼
React localhost:5173 · ProductPanel (Feed + MyCommentsPanel)
```

两条管道：
- **问** —— 你在 B 站发的评论（`content_script` hook 增量 + 首次全量 `msgfeed/reply` 倒推）
- **答** —— L1 别人直接回你 + L2 同视频高赞评论（`service_worker` 每 15/30 分钟轮询 · R1 规则判真 → `is_answer/confidence`）

匹配到 → `ambient.js` 5 步管线 → 生成履约卡 → WebSocket 推前端 + `chrome.notifications` 弹桌面。

---

## 目录

```
./
├── README.md           · 本文（项目入口）
├── demo/               · v0.3.0 实现主体（backend + frontend + extension + docs）
│   └── README.md       · ⭐ 装机 / 架构 / 脚本 / 路线图 全入口
├── report/             · Hackathon 期间的方向分析与决策档（归档）
└── .github/            · CI 等仓库配置
```

> 注：`demo/` 这个目录名来自 Hackathon 展台原型，**v1.0 会考虑重命名为 `dundao/`**（spec §11 · 未决）。当前 `demo/` 仍然是 v0.3.0 生产代码所在。

---

## 分支布局

| 分支 | 状态 | 说明 |
|---|---|---|
| `main` | 基线 | repo 主线 |
| `feat/dundao-demo` | 冻结 · v0.2.0 | 40h Hackathon 展台 demo · 纯 mock 管道 · 仍可 `npm run setup` 跑 |
| `feat/dundao-bilibili` | **当前** · v0.3.0 | 真实 B 站接入 · Chrome 插件 + 判真 + 徽章 |
| `feat/dundao-echo` | 旁枝 | 姊妹 SSE demo（v0.2.x 探索） |

---

## 判真 R1（核心机制）

现有路径（v0.3.0 纯规则）：

```
score = 0
+ 0.5  UP 主回复
+ 0.3  置顶评论 / 置顶回复
+ 0.2  like 达阈值
+ 0.3  内容含"是/BGM/链接/淘口令/http"
- 0.5  内容像"+1 蹲/楼上/哈哈/前排"

is_answer = score >= 0.3
```

20+ 真实 B 站评论样本覆盖。规则引擎时延稳定可解释。

**v0.3.1** 计划加 R2：Deepseek API 二审规则通过的候选（~0.0005 元/条 · 估计每天 < 0.5 元）。再后面 v0.3.2 出 Ollama 本地推理变体。

---

## 路线图

| 版本 | 要点 |
|---|---|
| v0.3.0 ✅ | bilibili 抓取 + R1 判真 + C2 徽章 · 当前可用 |
| v0.3.1 | R2 · LLM 二审（Deepseek API） · 误判否决 UI |
| v0.3.2 | R2-local · Ollama/Qwen 本地推理 · 空间页聚合 (C4) |
| v0.4.0 | 抖音 / 小红书 driver 插拔 · 多账号（朋友白名单） |
| v1.0 ? | 考虑 Chrome Web Store 发布 · `demo/` → `dundao/` 重命名 |

---

## 约束 · 原则

- **Node.js 单 runtime** · 所有 LLM/embedding 走 HTTP，不引 Python（spec §11）
- **本地优先** · backend 绑 `127.0.0.1` · cookie 只内存流转不写盘
- **规则 > LLM** · v0.3.0 先让规则跑通，LLM 作为增量而非基础设施
- **单用户 · 自用** · `demo-user` 硬编码 · 不做多用户系统
- **向后兼容** · v0.2.0 Hackathon fixtures 数据仍可共存（`source='mock'`）

---

## 由来（Origin）

2026-04 字节大学生 Hackathon 赛道三「AI 体验 · 刷到懂你的瞬间」参赛项目。40 小时从 0 跑通「蹲到了」展台 demo（`feat/dundao-demo` · v0.2.0 · 纯 mock 管道 · 右侧 MindCanvas 5 相位 AI 透明化）。

Hackathon 结项后决定延续开发，去掉"展示 / 评委"叙事，**装上真实 B 站数据**变成自用工具。去掉右侧 AI 透明面板，加真实 B 站抓取 + 规则判真 + 站内徽章。

> 这不是 AI 可以做 · 是 AI 已经做完了 · 你往下划就看到。
> 不是让 AI 猜你喜欢 · 是让 AI 接你说过要看的。

---

## 一句话

> **逆风如解意 —— 把你念念不忘的，接回来。**

---

## 深入

- 装上跑起来 → [`demo/README.md`](./demo/README.md)
- 运维 runbook → [`demo/docs/09-ops-runbook.md`](./demo/docs/09-ops-runbook.md)
- 设计 spec → [`demo/docs/superpowers/specs/2026-04-21-bilibili-tracker-design.md`](./demo/docs/superpowers/specs/2026-04-21-bilibili-tracker-design.md)
- 实施 plan → [`demo/docs/superpowers/plans/2026-04-21-bilibili-tracker.md`](./demo/docs/superpowers/plans/2026-04-21-bilibili-tracker.md)
- 不变式清单 → [`demo/docs/superpowers/plans/2026-04-21-bilibili-tracker/invariants.md`](./demo/docs/superpowers/plans/2026-04-21-bilibili-tracker/invariants.md)
- 和竞品的区别 → [`demo/docs/竞品.md`](./demo/docs/竞品.md)
