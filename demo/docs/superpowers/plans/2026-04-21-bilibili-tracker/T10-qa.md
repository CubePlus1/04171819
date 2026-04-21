# Bilibili Tracker v0.3.0 · QA Sub-Plan (T10)

> Parent plan: [../2026-04-21-bilibili-tracker.md](../2026-04-21-bilibili-tracker.md)
> Spec reference: [../../specs/2026-04-21-bilibili-tracker-design.md](../../specs/2026-04-21-bilibili-tracker-design.md) §8, §9

## 范围

- 全链路手工 smoke（插件 + backend + frontend + 真实 B 站）
- 更新 `demo/docs/09-ops-runbook.md` · 加 v0.3.0 启停章节
- 更新 `demo/docs/README.md` · 加 plan / spec 交叉链接

**不做**：Puppeteer 自动化、Playwright E2E、Chrome 插件商店发布。

---

## Task T10.1 · 更新 `demo/docs/09-ops-runbook.md`

**Files:**
- Modify: `demo/docs/09-ops-runbook.md`

### Step 1 · 在 ops-runbook 顶部之后加 v0.3.0 小节

在文件现有内容末尾追加一节：

~~~markdown

---

## v0.3.0 · Bilibili Tracker 启停

### 1. 首次安装（三端一起起）

```bash
# Terminal 1 · backend
cd /Users/sevencolor/code/0BKHDD/.worktrees/dundao-bilibili/demo/backend
npm install
npm run migrate            # T1 产物 · 执行 002_bilibili_fields.sql
npm run dev                # 127.0.0.1:4000

# Terminal 2 · frontend
cd /Users/sevencolor/code/0BKHDD/.worktrees/dundao-bilibili/demo/frontend
npm install
npm run dev                # 127.0.0.1:5173

# 3. Chrome 插件
# → 打开 chrome://extensions
# → 右上角开"开发者模式"
# → "加载已解压的扩展程序"
# → 选 /Users/sevencolor/code/0BKHDD/.worktrees/dundao-bilibili/demo/extension
# → 看到 "蹲到了 · Bilibili Tracker v0.3.0" 已激活
```

### 2. 首次使用 · 历史倒推

**前置**：确保你已经在 Chrome 里**登录** `www.bilibili.com`

1. 点击地址栏右侧的 🧩 插件图标 → 选「蹲到了」
2. popup 弹出 · 点 **「开始历史倒推」** 按钮
3. popup 会显示进度："fetching page 3/~30 · signals 47"
4. 通常 1-3 分钟跑完；右下角弹桌面通知：「历史倒推完成 · N 条评论已记」
5. 打开 `localhost:5173` 切到"我的评论" tab · 能看到历史评论列表
6. 信息流 tab 里会浮出一堆"已答"的履约卡（之前未接回来的）

### 3. 日常使用

- **发评论** · 在任何 B 站视频下正常评论；插件 content_script 会自动 hook
- **被答** · 插件每 15 分钟自动拉 `msgfeed/reply`，每 30 分钟拉视频 `sort=2` 高赞；判真后生成履约卡
- **桌面通知** · `chrome.notifications` 弹卡片摘要；点击 → `localhost:5173?card_id=xxx`
- **视频页徽章** · 进 B 站视频，评论区自己那条旁边有 ✅ 已答 / ⏳ 等待中
- **筛选查看** · `localhost:5173` → 我的评论 tab → 全部 / 已答 / 等待中

### 4. 常见故障

| 症状 | 诊断 | 解决 |
|---|---|---|
| popup 点倒推 · 报 `SESSDATA not found` | 未登录 B 站 | 去 `www.bilibili.com` 登录后重试 |
| 视频页无徽章 | content_script 没注入 | chrome://extensions 查插件 ERROR log；若 B 站改 DOM class，改 `demo/extension/content_script.js` 的 selector |
| `localhost:5173` "我的评论" 一直空 | backend migrate 没跑 | `cd demo/backend && npm run migrate` 后重启 dev |
| 桌面通知未弹 | 系统/Chrome 通知权限 | 系统设置 → 通知 → Chrome 允许；chrome://settings/content/notifications 里本地 localhost:5173 允许 |
| `ingest/comment` 返回 409 | rpid 已存在（重复 hook） | 正常 · 插件会去重 |

### 5. 重置 / 清库

```bash
# 清真实数据 · 保留 fixtures mock
cd /Users/sevencolor/code/0BKHDD/.worktrees/dundao-bilibili/demo/backend
sqlite3 data/dundao.db <<'SQL'
DELETE FROM cards WHERE user_id='demo-user' AND id NOT LIKE 'mock-%';
DELETE FROM intent_signals WHERE source != 'mock';
DELETE FROM creator_actions WHERE source != 'mock';
DELETE FROM creators WHERE id NOT IN (SELECT DISTINCT creator_id FROM creator_actions);
SQL

# 完全重置（回到空库 + fixtures）
rm data/dundao.db
npm run migrate
npm run db:seed
```

### 6. 升级插件（代码变更后）

1. chrome://extensions → 找到插件卡片 → 点 **↻ 刷新**
2. 关掉已开的 B 站 tab · 重开（content_script 在页面加载时注入）
3. service_worker 变更需要插件完全禁用 → 重新启用 · 或手动 kill service worker（devtools → Service Worker → 停止）
~~~

### Step 2 · Commit

```bash
cd /Users/sevencolor/code/0BKHDD/.worktrees/dundao-bilibili
git add demo/docs/09-ops-runbook.md
git commit -m "$(cat <<'EOF'
docs(bilibili): T10.1·ops-runbook 加 v0.3.0 启停/倒推/故障章节

覆盖三端安装、历史倒推流程、日常使用、故障表、重置/升级。
首次装机能照着从 0 跑起来。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task T10.2 · 更新 `demo/docs/README.md` 索引

**Files:**
- Modify: `demo/docs/README.md`

### Step 1 · 在文档清单表末尾加两行

找到文档清单表（`| 文档 | 主题 |` 开头那张表），在最后一行（`| [竞品.md](./竞品.md) |` 之后）加：

```markdown
| [superpowers/specs/2026-04-21-bilibili-tracker-design.md](./superpowers/specs/2026-04-21-bilibili-tracker-design.md) | v0.3.0 真实 B 站抓取 · 设计提案 |
| [superpowers/plans/2026-04-21-bilibili-tracker.md](./superpowers/plans/2026-04-21-bilibili-tracker.md) | v0.3.0 实施计划 · 多文件索引 (T1-T10) |
```

在 `## 快速入口` 末尾追加：

```markdown

### 我想把 demo 升级到真实 B 站抓取
→ [09-ops-runbook.md · v0.3.0 Bilibili Tracker 启停](./09-ops-runbook.md#v030--bilibili-tracker-启停)
→ [plans/2026-04-21-bilibili-tracker.md](./superpowers/plans/2026-04-21-bilibili-tracker.md) · 跟着 T1-T10 实施
```

### Step 2 · Commit

```bash
cd /Users/sevencolor/code/0BKHDD/.worktrees/dundao-bilibili
git add demo/docs/README.md
git commit -m "$(cat <<'EOF'
docs(bilibili): T10.2·README 加 spec/plan 交叉索引

在文档清单补两行入口，快速入口加"升级到真实 B 站抓取"路径。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task T10.3 · 全链路手工 smoke checklist

**Files:**
- 无新文件（运行 checklist）

### Step 1 · 启动三端

按 T10.1 章节步骤启 backend + frontend + 装插件。

### Step 2 · 历史倒推 smoke

- [ ] 点插件 popup "开始历史倒推"
- [ ] 进度条从 0% 走到 100%
- [ ] `demo/backend/data/dundao.db` 的 `intent_signals` 表 `source='backfill'` 行数 > 0
- [ ] `localhost:5173` → 我的评论 tab 显示历史评论数与表行数一致
- [ ] 信息流 tab 有履约卡自动浮现（若有历史 answer）

### Step 3 · 增量 hook smoke

- [ ] 打开任意 B 站视频（推荐你最近刷的）
- [ ] 评论区写一条测试评论（比如"蹲 smoke 测试"）
- [ ] 30s 内 `demo/backend` 日志有 `[ingest] comment` log
- [ ] `dundao.db` `intent_signals` 表有新行，`source='hook'`，`content='蹲 smoke 测试'`
- [ ] `localhost:5173` 我的评论 tab 有新行（等待中）
- [ ] 回到 B 站该视频 reply 区，刷新页面，自己这条旁边有 ⏳ 徽章

### Step 4 · 定时拉取 smoke（长周期 · 可跳过）

- [ ] 等 15 分钟（或 `chrome://extensions` 找到 service worker → devtools → console `chrome.alarms.getAll()` 看有 msgfeed-poll）
- [ ] 手动触发：`chrome.alarms.get('msgfeed-poll', a => chrome.runtime.sendMessage({type:'fire-alarm', alarm:'msgfeed-poll'}))` 或在 alarms listener 里加 runtime message handler
- [ ] 日志有 `[ingest] reply` / `[ingest] top-reply` log（若你真有 recent 回复）

### Step 5 · 履约卡生成 smoke

需要一条真实 (signal × answer) 对。最稳定的做法：

- [ ] 选一个你历史上真写过"蹲链接/蹲 BGM/蹲合集"的 B 站视频，且该视频置顶评论/高赞有答
- [ ] 历史倒推完成后，ambient 管线会自己扫到并生成卡
- [ ] 桌面弹 Chrome notification：「蹲到了新卡 · 你 X 天前在 UP 下蹲的 ...」
- [ ] 点通知 → 跳 `localhost:5173?card_id=xxx` · Feed 视口立刻展示该卡

### Step 6 · R1 判真 smoke（抽查 2 条）

- [ ] 去 `demo/backend` 起 repl：`node -e "import('./src/db.js').then(({getDb}) => console.log(getDb().prepare('SELECT rpid, content, is_answer, confidence, judge_reason FROM creator_actions WHERE source != \"mock\" LIMIT 10').all()));"`
- [ ] 挑 2 条人工判断：系统打的 `is_answer` 和你自己认为的是否一致
- [ ] 记下不一致的样本到 `demo/docs/09-ops-runbook.md` 末尾的"R1 误判样本"子节（留给 v0.3.1 R2 LLM 训 few-shot）

### Step 7 · 回滚检验

- [ ] 停 backend、frontend、插件
- [ ] `git status` 干净（除本 task 可能的 ops-runbook 编辑）
- [ ] `rm demo/backend/data/dundao.db && cd demo/backend && npm run migrate && npm run db:seed` 回到 demo v0.2.0 种子
- [ ] `localhost:5173` 以 `VITE_MOCK=1` build → GitHub Pages 静态 demo 仍然工作

### Step 8 · 若出现 Critical issue

- 记录到 `demo/docs/09-ops-runbook.md` 的"R1 误判样本"之后补一个"已知 Bug"列表
- 如影响履约主路径：开 GitHub issue or 在 CLAUDE.md 加 TODO marker · 阻断后续 v0.3.1 启动

### Step 9 · No commit needed

本 task 是 checklist，不产生代码/文档修改。发现问题再单独 commit 修复。

---

## Self-Review

**Spec coverage**：
- [x] spec §8 · 部署/安装流程 — T10.1
- [x] spec §9 · 测试策略（手工 checklist）— T10.3
- [x] spec §10 · 风险 R1-R8 — 在 T10.3 Step 6 捕获 R1 误判样本

**Placeholder scan**：
- [x] 每条 smoke checklist 都有可执行的步骤 / 命令
- [x] 无 "根据情况"/"尝试" 等模糊词
- [x] Step 8 约定了 Critical 路径

**Type consistency**：
- DB 表字段 `is_answer` / `confidence` / `judge_reason` / `source` · 与 T1 migration / T3 answerJudge / T4 ingest 一致
- `ambient` 入口接 T6 改造后的真实 DB，与 T10 smoke 期望一致

**QA gaps**：
- 没有自动化 E2E · 靠手工 checklist；覆盖度依赖你诚实跑完每条
- 定时任务 smoke（T10.3 Step 4）需要 15 分钟等待；若急，建议把 chrome.alarms periodInMinutes 临时改 1，验完改回
