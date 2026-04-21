# v0.3.0 · 真人 smoke 报告模板

> **用法**：复制本文件为 `YYYY-MM-DD-run-NN.md` 同目录下 · 按顺序跑每一节 · 每条打 ✅ / ❌ / ⚠️ · 有异常填"实际 / 备注"。
> **目标**：一次 smoke 填完本模板 · 30-60 分钟。
> **前提**：已按 [`demo/README.md`](../../../README.md) 装好三端 + 登过 B 站。

---

## Meta
- **日期**：`YYYY-MM-DD HH:MM`
- **Git HEAD**：`git rev-parse --short HEAD` → `______`
- **B 站账号 mid**：`______`（非必填 · 可留空）
- **Chrome 版本**：`chrome://version` → `______`
- **Node 版本**：`node -v` → `______`

---

## § 1 · 前置健康 (5 分钟)

```bash
# 打三个 terminal
# T1: backend
cd demo/backend && npm run migrate && npm run dev

# T2: frontend
cd demo/frontend && npm run dev

# T3（装完后不动，等日志）
# Chrome: chrome://extensions → load unpacked → demo/extension
```

| # | 检查 | 预期 | 实际 |
|---|---|---|---|
| 1.1 | backend 启动日志 | `listening on 127.0.0.1:4000` | ☐ |
| 1.2 | frontend vite | `Local: http://localhost:5173/` | ☐ |
| 1.3 | `localhost:5173` 打开 | 只有左面板 ProductPanel · 顶部有 "信息流 / 我的评论" tab | ☐ |
| 1.4 | `chrome://extensions` 看插件 | "蹲到了 · Bilibili Tracker" · Enabled · 无 ERROR | ☐ |
| 1.5 | 点插件卡片 "Service Worker" | devtools 打开 · console 有 `[Dundao] Alarms scheduled` | ☐ |

**1 节结论**：☐ 全绿 ☐ 有问题（记 §6 排查）

---

## § 2 · 历史倒推 (3-5 分钟)

| # | 检查 | 预期 | 实际 |
|---|---|---|---|
| 2.1 | 访问 `www.bilibili.com` · 确认登录 | 右上角有你头像 | ☐ |
| 2.2 | 点插件 🧩 图标 · popup 出现 | 3 按钮 + status | ☐ |
| 2.3 | 点 "历史倒推" | status 变 "正在获取 SESSDATA..." → "正在启动倒推..." | ☐ |
| 2.4 | SESSDATA 存在 | status 变 "倒推已启动..." | ☐ |
| 2.5 | backend terminal 有 `[backfill]` log | 分页 progress 连续打印 | ☐ |
| 2.6 | `localhost:5173` 状态栏 | (可选) WS progress 或 toast | ☐ |
| 2.7 | 倒推完成（最多 5 分钟） | backend log 有 `backfill done { totalSignals: N, totalActions: M, totalCards: K }` | N=__ M=__ K=__ |
| 2.8 | 切 "我的评论" tab | 看到历史评论列表（数量 ≈ N） | ☐ 行数=__ |
| 2.9 | 随便点一个 fulfilled 的 | "看卡 →" 切回信息流并 focus | ☐ |
| 2.10 | DB 检查（可选） | `sqlite3 demo/backend/data/dundao.db "SELECT count(*) FROM intent_signals WHERE source='backfill'"` | ☐ 数=__ |

**2 节结论**：☐ 通过 ☐ 部分（记 §6）

---

## § 3 · 增量 hook · 发评论 (5 分钟)

挑一个你最近刷的 B 站视频 · 评论区写一条**测试评论**（建议带 "蹲" 字便于后续追踪）。

| # | 检查 | 预期 | 实际 |
|---|---|---|---|
| 3.1 | F12 · Network tab | 评论提交时看到 `reply/add` 或 `reply/reply/add` | ☐ |
| 3.2 | 30s 内 backend log | `[ingest] comment signal_id=N rpid=X aid=Y` | ☐ |
| 3.3 | `localhost:5173` 我的评论 tab · 刷新 | 新行（你刚发的评论内容）在 pending 列表 | ☐ |
| 3.4 | 回 B 站该视频 · 刷新 | 评论区自己那条旁有 ⏳ 徽章 | ☐ |
| 3.5 | 点徽章 | 开新 tab 跳 `localhost:5173?card_id=` | ☐ |

**3 节结论**：☐ 通过 ☐ 失败（记 §6）

---

## § 4 · 定时拉取 (可选 · 15 分钟等待 OR 手动触发)

**手动触发更快**：chrome://extensions → 插件卡片 → "Service Worker" inspect → console 跑：

```js
chrome.runtime.sendMessage({ type: 'manual-poll', alarm: 'msgfeed-poll' })
// 或直接调函数：
pollMsgfeed()
pollTopReplies()
```

| # | 检查 | 预期 | 实际 |
|---|---|---|---|
| 4.1 | pollMsgfeed 返回 | SW console `[Dundao] msgfeed poll done · items=N` | ☐ N=__ |
| 4.2 | backend log | N 条 `[ingest] reply` | ☐ |
| 4.3 | pollTopReplies 返回 | SW console `[Dundao] top-reply poll done · aids=M` | ☐ M=__ |
| 4.4 | backend log | `[ingest] top-reply` 若干条 | ☐ |
| 4.5 | DB check | `SELECT source, count(*) FROM creator_actions GROUP BY source` L1/L2 行数非 0 | L1=__ L2=__ |

**4 节结论**：☐ 通过 ☐ 跳过 ☐ 失败

---

## § 5 · 履约卡生成 · R1 判真抽查 (10 分钟)

前提：§2 倒推 + §4 拉取至少一个完成 · 数据库有 `is_answer=1` 行。

| # | 检查 | 预期 | 实际 |
|---|---|---|---|
| 5.1 | `sqlite3 ... "SELECT count(*) FROM cards"` | > 0 | ☐ 数=__ |
| 5.2 | 桌面通知弹窗 | 至少看到 1 次 "蹲到了新卡 · ..." | ☐ |
| 5.3 | 点通知 | 跳 `localhost:5173?card_id=<id>` · Feed 立刻展示该卡 | ☐ |
| 5.4 | 看卡 P1 内容 | 「你 N 天前在 UP 下蹲的 X · 他 答了 / 上了 / 续了」 | ☐ |
| 5.5 | 情感收束句非空 | P1 底部有收束句 | ☐ |

**R1 判真样本抽查**（挑 5-10 条 creator_actions，人工对比 is_answer 判决）：

```bash
sqlite3 demo/backend/data/dundao.db \
  "SELECT rpid, substr(content,1,30) as content, is_answer, confidence, judge_reason \
   FROM creator_actions WHERE source != 'mock' LIMIT 10"
```

| rpid | content 前 30 字 | is_answer 判 | 你的判断 | 一致？ |
|---|---|---|---|---|
| ... | ... | 0/1 | 0/1 | ☐ |
| ... | ... | 0/1 | 0/1 | ☐ |
| ... | ... | 0/1 | 0/1 | ☐ |
| ... | ... | 0/1 | 0/1 | ☐ |
| ... | ... | 0/1 | 0/1 | ☐ |
| ... | ... | 0/1 | 0/1 | ☐ |
| ... | ... | 0/1 | 0/1 | ☐ |
| ... | ... | 0/1 | 0/1 | ☐ |
| ... | ... | 0/1 | 0/1 | ☐ |
| ... | ... | 0/1 | 0/1 | ☐ |

**不一致的样本**（系统判错的那几条）→ 留给 v0.3.1 R2 LLM 二审做 few-shot 示例：

```
错判 1 · rpid=...  content="..."  系统=1 实际=0  原因猜测：...
错判 2 · ...
```

**5 节结论**：准确率 = ___ / 10 · ☐ 可接受（>60%） ☐ 太糟（< 60% · 需要调 R1 规则）

---

## § 6 · 问题排查

遇到问题填这里。常见故障对照 [`demo/docs/09-ops-runbook.md`](../../09-ops-runbook.md) 故障表。

| 症状 | 已尝试 | 根因 | 修复 |
|---|---|---|---|
| eg. popup 无法倒推 | 重启插件 / 重新登录 B 站 | SESSDATA 域名是 `.bilibili.com` 不是 `www.bilibili.com` | 改 service_worker.js 的 cookie url |
| | | | |

---

## § 7 · 总评 · 下次迭代

- **整体可用性**：☐ 可以每天用 ☐ 可用但有痛点 ☐ 先别用
- **最触动的瞬间**（记录 1-2 条真实的履约卡对你的情感冲击）：
  - ...
- **最想先改的**（优先级高的）：
  1. ...
  2. ...
- **建议写进 v0.3.1 的 issue**：
  - ...

---

## 附：一键命令速查

```bash
# 重启三端
cd demo/backend && lsof -ti :4000 | xargs kill 2>/dev/null; npm run dev &
cd demo/frontend && lsof -ti :5173 | xargs kill 2>/dev/null; npm run dev &

# 跑全部 backend 测试
cd demo/backend && for t in migrate bilibili answerJudge ingest historyBackfill cardBuilder; do
  node src/$t.test.js 2>&1 | tail -2
done

# 清真实数据 · 保留 fixtures
sqlite3 demo/backend/data/dundao.db <<'SQL'
DELETE FROM cards WHERE id NOT LIKE 'mock-%';
DELETE FROM intent_signals WHERE source != 'mock';
DELETE FROM creator_actions WHERE source != 'mock';
SQL

# 完全清零重来
rm demo/backend/data/dundao.db
cd demo/backend && npm run migrate && npm run db:seed

# DB 快速查（看看今天装了啥）
sqlite3 demo/backend/data/dundao.db \
  "SELECT source, count(*) FROM intent_signals GROUP BY source;
   SELECT source, is_answer, count(*) FROM creator_actions GROUP BY source, is_answer;
   SELECT count(*) FROM cards;"

# 插件刷新（代码改后）
# chrome://extensions → 找插件 → ↻ · 关掉 B 站 tab 重开
```
