# 07 · 测试矩阵

## 测试层级

```
┌─────────────────────────────────────────┐
│  Unit Tests (demo/backend)               │
│  npm test · node src/cardBuilder.test.js │
│  ~0.5s · 5 cases                         │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│  Smoke (E2E)                             │
│  npm run smoke                           │
│  ~30s · 需要 server 已启动               │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│  Frontend Build                          │
│  cd frontend && npm run build            │
│  ~1s · vite 构建 · 不跑浏览器             │
└─────────────────────────────────────────┘
```

## Unit Tests (cardBuilder.test.js)

**范围**：`cardBuilder.js` 的 `buildCard()` 纯函数。

**覆盖用例**：
1. 剧本 A · P1 + P2 · 商品卡 · 主按钮"加到清单"
2. 剧本 B · P1 + P3 · 系列网格 · 情感收束"AI 帮你摘了前情"
3. 剧本 C · P1 + P2 + P3 · 内嵌视频 · 情感收束"爷爷"
4. P1 情景锚点使用相对时间（非绝对日期）
5. buildCard 在 match 缺失时抛错

**跑法**：
```bash
cd demo/backend
npm test
```

**输出**：
```
✅ 剧本 A · P1 + P2 · 商品卡 · 主按钮「加到清单」
✅ 剧本 B · P1 + P3 · 系列网格 · 情感收束「AI 帮你摘了前情」
✅ 剧本 C · P1 + P2 + P3 · 内嵌视频 · 情感收束「爷爷的老战友联系到他了」
✅ P1 情景锚点使用相对时间而非绝对日期
✅ buildCard 在 match 缺失时抛错

🎉 cardBuilder tests green
```

## Smoke Tests (smoke.js)

**范围**：端到端 HTTP + WebSocket 完整流程。

**前置**：server 已启动（`npm start` 或 `npm run dev`）。

**跑法**：
```bash
# 一个 terminal
cd demo/backend
npm start

# 另一个 terminal
cd demo/backend
npm run smoke
```

**覆盖用例**（按组织顺序）：

### Bootstrap
- `/api/reset` 返回 2xx
- `/api/bootstrap` 包含 demo-user
- 包含 3 个剧本触发器
- `pending=true`（初态）
- ≥5 历史信号
- ≥6 填充信息流
- 初始卡片为空

### Ambient Tick (3 剧本)
对每个 topic（`dashan-knit-top` / `30days-series` / `grandpa-archive`）：
- tick 返回 200
- ok=true + runId 符合格式
- 收到 5 个 workflow.step（step=1..5）
- 所有 step 带 `ambient=true`
- **每个 step 的 mind.phase 顺序正确**：`scan / recall / match / seal / emit`
- step 1 的 `mind.nodes` 完整非空
- step 3 的 `mind.focus_signal_id` / `focus_action_id` 格式正确
- card.generated 事件带对应 run_id
- 卡片 `script_id` 匹配剧本
- 卡片 `pages` 符合预期
- P1 情景锚点以 "你" 开头

### 主题聚合
- 3 剧本接完后 `pending=false`
- `/api/bootstrap` 返回 3 张卡片

### 边界
- ambient 无可接时 → ok=false + reason=no-match
- reset 后无参 tick 能挑到下一条
- 响应含 `pending` 字段

### 并发去重
- 同 topic 两条并发 tick · 只 1 条成功
- 失败方 reason=signal-already-fulfilled

### 安全层
- 非法 JSON body → 400 + `application/json`（不是 HTML）
- `Origin: evil.example.com` → 被拒（500 或 403）· ACAO 头不含 evil

### 遗留路径
- `/api/comment` 路径仍可用（reset 后触发爷爷剧本）

**跑完输出**：
```
🎉 smoke all green
```

## Frontend Build

**跑法**：
```bash
cd demo/frontend
npm run build
```

**验证**：
- 所有 `.jsx` 编译通过
- vite 构建无警告
- bundle 大小在可接受范围（~310 KB JS）

**失败模式**：
- `import` 路径错误（比如 shared/contracts.js 改名）
- Tailwind class 名不识别
- Missing ref / missing prop

## 一键全绿回归

**完整回归序列**（每次大改动后跑）：

```bash
cd demo/backend
rm -f data/dundao.db data/dundao.db-shm data/dundao.db-wal
node src/server.js > /tmp/srv.log 2>&1 &
SRV=$!
sleep 2

# 1. Unit tests
npm test

# 2. Smoke
npm run smoke

# 3. Frontend build
cd ../frontend
npm run build

kill $SRV 2>/dev/null
wait $SRV 2>/dev/null
```

三个都通过才算回归绿。

## 持续集成

当前项目没有 CI workflow（展台 demo 范畴 · 手动回归就够）。
想加 CI：
- GitHub Actions / any CI runner
- 装 Node 20+
- 跑 `npm run setup && npm run lint && npm test && npm run smoke && npm run build`

## 添加新测试的原则

### 什么时候加 unit test
- 新纯函数 · 输入-输出稳定可断言
- cardBuilder 增加剧本 D → 对应单测

### 什么时候加 smoke test
- 新 HTTP endpoint
- 新 WS event 类型
- 新业务场景（如 in-flight reset）

### 不加测试的选择
- 前端 UI（主观判断为主 · E2E 测试维护成本高）
- 视觉主题（手眼验证）
- 动画（framer-motion 内部行为）

## 历史回归保护

过去 10 轮 codex review 每轮发现的问题都变成了 smoke 用例。保留这些断言：

| 断言 | Round | 保护的什么 |
|---|---|---|
| 并发去重 · 仅 1 条成功 | 1 | 原子声明 |
| `/api/reset` 需要 in-flight drain | 3 | shutdown 正确性 |
| `Origin: evil.example.com` 被拒 | 3 | CORS allowlist |
| 非法 JSON → JSON 响应 | 3 | body-parser 错误中间件 |
| mind.phase 序列正确 | (本轮) | MindCanvas 契约 |

**删掉任何一个断言前**，先搞清楚它保护什么 · 别因为"这条过不了了"就删。

## 下一步

→ [08-config-env.md](./08-config-env.md)
→ [09-ops-runbook.md](./09-ops-runbook.md)
