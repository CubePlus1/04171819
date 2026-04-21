# Bilibili Tracker v0.3.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 demo 的 mock 管道切换成真实 B 站抓取：Chrome 插件 hook 发评论/定时抓回复 → localhost:4000 (Express) 摄入 + R1 规则判真 → 沿用 `ambient.js` 5 步管线生成履约卡 → 前端（裁剪后只剩 `ProductPanel`）+ B 站评论徽章注入。

**Architecture:** 单 Node.js runtime 三层 —— (1) Chrome Extension MV3：content_script hook B 站评论 XHR + MutationObserver 注入徽章；service_worker 定时拉 `msgfeed/reply` + 视频 `sort=2` 高赞 + `chrome.notifications`。(2) localhost:4000 复用 `demo/backend/`，新增 `ingest / bilibili / answerJudge / historyBackfill / migrate` 模块。(3) localhost:5173 复用 `demo/frontend/`，裁掉 AgentPanel，新增 `MyCommentsPanel`。数据单向：插件 ingest → DB → ambient → WebSocket → 前端 UI + 桌面通知。

**Tech Stack:** Node.js 20（原生 fetch）· Express · better-sqlite3 (WAL) · ws · React 18 · Vite · Tailwind · Chrome Extension Manifest V3 · **无测试框架**（`node:assert` 原生，沿用 `cardBuilder.test.js` 风格）

**Reference:** Design spec at `demo/docs/superpowers/specs/2026-04-21-bilibili-tracker-design.md`

---

## 子计划导航

| 子文件 | 任务 | 预计 | 关键产出 |
|---|---|---|---|
| [T1-T6-backend.md](./2026-04-21-bilibili-tracker/T1-T6-backend.md) | T1 迁移 · T2 B 站 API · T3 判真 · T4 摄入 · T5 倒推 · T6 ambient 适配 | ~4h | localhost:4000 能真实响应 ingest，ambient 从真实 DB 挑数据 |
| [T7-frontend.md](./2026-04-21-bilibili-tracker/T7-frontend.md) | T7 裁 AgentPanel · MyCommentsPanel (C1) · api/client · store | ~1.5h | localhost:5173 只显示信息流 + 我的评论列表 |
| [T8-T9-extension.md](./2026-04-21-bilibili-tracker/T8-T9-extension.md) | T8 manifest + content_script XHR hook + service_worker + popup · T9 C2 徽章 DOM 注入 | ~3h | 装插件能 hook 评论和定时抓 + 在 B 站页面注入 ✅/⏳ 徽章 |
| [T10-qa.md](./2026-04-21-bilibili-tracker/T10-qa.md) | T10 手工验证 checklist · runbook 增补 | ~0.5h | `demo/docs/09-ops-runbook.md` 可照着启起来 |

**依赖链**：T1 → (T2, T3) → T4 → T5 → T6 → T7 → T8 → T9 → T10

**可并行**（给 Subagent-Driven 模式参考）：(T2 ∥ T3)、(T7 ∥ T8) 在 T6 完成后即可分头

---

## 全局共享约定

### 文件路径
- 后端：`demo/backend/src/` 新增 `.js`，迁移 SQL 在 `demo/backend/data/migrations/`
- 前端：新组件放 `demo/frontend/src/components/`（`MyCommentsPanel` 属于 `ProductPanel` 的子面板）
- 插件：`demo/extension/` 独立目录（不嵌在 backend/frontend 里）
- **不动**：`demo/shared/contracts.js`、`demo/data/fixtures.json`、`demo/data/schema.sql` （旧种子保留，新字段用 migration 加）

### 测试约定（demo 现有风格）
- **无测试框架**，`import { strict as assert } from 'node:assert'`
- 测试文件 `X.test.js` 与实现 `X.js` 同目录
- 运行：`node demo/backend/src/X.test.js`（单文件）
- 汇总 script（在 T4 末尾加）：`demo/backend/package.json` `"test:bilibili": "node src/migrate.test.js && node src/bilibili.test.js && node src/answerJudge.test.js && node src/ingest.test.js && node src/historyBackfill.test.js"`

### 提交约定
- 格式：`<type>(bilibili): T<N>·<step> <简短中文>`
- type: feat/fix/refactor/test/docs/chore
- **频繁提交**：每完成一个 Task 的最后 Step 做一次 commit（test + 实现一起）；中间的步骤不必每 step 一 commit
- Commit message 尾附：`Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`

### 共享常量
- `SIGNAL_SOURCE`: `'mock'` · `'hook'` · `'backfill'`
- `ACTION_SOURCE`: `'mock'` · `'L1'` · `'L2'` · `'backfill'`
- `JUDGE_THRESHOLD`: `0.3`（`is_answer = confidence >= threshold`）
- `RATE_LIMIT_MS`: `1000`（B 站 API 每端点最小间隔）

### 共享字段命名（各层一致）
SQL / JS 字段名在各 task 间保持：

- `aid` · 视频数字 id（非字符串 bvid）
- `rpid` · 评论数字 id
- `parent_rpid` · 父评论 id（子评论才有）
- `replying_to_rpid` · 回复指向的原评论 id（creator_actions 专用）
- `is_answer` / `confidence` / `judge_reason` · R1 判真三字段
- `source` · 标数据来源

### 不做的事（scope 外）
- 不做 WBI 签名（v0.3.0 用到的 B 站接口都不需要）
- 不做多账号切换（`user_id='demo-user'` 固化）
- 不做插件 Chrome Web Store 发布（仅开发者模式 load unpacked）
- 不做 R2 LLM 二审（留 v0.3.1）
- 不做 C3 视频缩略图角标 / C4 空间页聚合（留 v0.3.x）
- 不做 `mind.phase` 相关前端消费（后端仍发 `mind` 字段，前端 just ignore）

---

## 风险与应对（快速索引）

| # | 风险 | 应对 |
|---|---|---|
| R1 | B 站 `msgfeed/reply` 字段 shape 和假设不符 | T2 Step 1 先 `curl` 一次打印 JSON，再 normalize 解析 |
| R2 | B 站改接口或限流 | `bilibili.js` 统一 rate-limit 1 req/s + 指数退避 |
| R3 | SESSDATA 泄漏 | Express 只绑 `127.0.0.1`，cookie 只内存流转 |
| R4 | content_script 注入被 B 站 DOM 改版打破 | MutationObserver 降级只 `console.warn`，不阻断 |
| R5 | `ambient.js` loopMode 假设 mock 循环 | T6 Step 3 强制 `loopMode=false`（真实模式下） |
| R6 | `msgfeed/reply` 不含用户原评论内容 | T5 Step 4 降级：`content='(待补)'`，DunCard `raw_text` 空时 fallback `video_title` |
| R7 | R1 误报率 30%+ | v0.3.0 忍受，UI 加"否决按钮" 是 v0.3.1 的事 |

完整风险表见 [spec §10](../specs/2026-04-21-bilibili-tracker-design.md#10--风险与开放问题)

---

## 自审备案

本 plan 已过 4 点 self-review（详见各子文件尾部）：
1. **Spec coverage** · T1-T10 覆盖 spec §5 / §6 / §7 所有模块
2. **Placeholder scan** · 每 step 都有完整 code block 或精确命令，无 TBD/TODO/待定
3. **Type consistency** · `aid / rpid / is_answer / confidence / judge_reason / source` 等字段在 migration / ingest / backfill / ambient / frontend 各处签名一致
4. **Spec gap** · 无遗漏

---

## 执行切换

Plan 各子文件是 **independent executable units**，打开任意一个可以立刻开工。

完成后请移步主 plan 底部的 Execution Handoff 小节（默认推荐 Subagent-Driven）。
