# 09 · Ops Runbook

展台运维手册 · 常见操作 + 故障排查。

## 启动

### 第一次
```bash
cd demo
npm run setup          # 装依赖 + 初始化 db
npm run dev            # 启动前后端
```

浏览器打开 http://localhost:5173

### 日常
```bash
cd demo
npm run dev
```

## 停止

### 正常
`Ctrl+C` · 后端会按顺序关闭（WS clients → wss → httpServer → closeDb）。
正常情况下 < 1 秒退出。

### 异常挂起
如果 5 秒没退出：
```bash
# 查进程
lsof -nP -i:4000
# 或
ps aux | grep "server.js"

# 杀
kill -9 <pid>
```

然后检查 `demo/backend/data/dundao.db-wal` 是否存在异常（通常 SQLite 启动时自动 recover · 很少出问题）。

## 重置 Demo 状态

### 方法 1 · 保持服务运行
```bash
curl -X POST http://localhost:4000/api/reset
```

后端会：
1. 等 in-flight tick 排空（最多 3s）
2. closeDb → seed → 重新初始化
3. WS 广播 `demo.reset` → 所有标签页重新 bootstrap

### 方法 2 · 重启服务（更彻底）
```bash
# stop
Ctrl+C

cd demo/backend
rm -f data/dundao.db*   # 删库

# start
cd ..
npm run dev
```

### 方法 3 · 命令行一键 seed
```bash
cd demo/backend
npm run db:seed
```

不需要重启服务（但正在运行的 server 仍持有旧的 cached 状态 · 真的要彻底干净还是方法 2）。

## 检查状态

### 后端健康
```bash
curl http://localhost:4000/api/health
# { "ok": true, "ts": ... }
```

### 当前 pending 状态
```bash
curl http://localhost:4000/api/bootstrap | jq '.pending, (.cards | length)'
# true 或 false
# 0 到 30（最近卡片数）
```

### 当前 epoch
```bash
curl http://localhost:4000/api/epoch
# { "ok": true, "epoch": "mX3pZqK" }
```

### 实时日志
```bash
# 如果后端通过 npm run dev 启动的 · 日志直接在 terminal
# 如果通过 background 启动 · 看：
tail -f /tmp/dundao-server.log
```

## 手动触发一条 tick

```bash
# 按 topic 精确触发
curl -X POST http://localhost:4000/api/ambient/tick \
  -H "Content-Type: application/json" \
  -d '{"topic": "grandpa-archive"}'

# 自动挑
curl -X POST http://localhost:4000/api/ambient/tick \
  -H "Content-Type: application/json" \
  -d '{}'
```

响应：
```json
{
  "ok": true,
  "runId": "run_xxx",
  "pending": true,
  "cardId": "card_xxx"
}
```

## 故障排查

### 问题 1 · 展台前端空白 / 连接失败
**症状**：浏览器打开 http://localhost:5173 · 显示"无法连接到后端"红色 banner。

**排查**：
```bash
# 后端是否在跑
curl http://localhost:4000/api/health
```

- 返回 200 → 前端 WS 配置问题 · 重启前端 dev server
- 404 / 无响应 → 后端没启 · `npm --prefix demo/backend start`

### 问题 2 · 卡片不浮入
**症状**：AI 5 步演完 · 左面板无新卡片。

**排查**：
1. 看浏览器 console · 有没有 WS 错误
2. 看右面板"已蹲 N" · N 增加了吗？
   - 增加 → 前端状态正确，可能是视觉层问题（滚动 / 布局）
   - 没增加 → 后端没写入 · 看 server 日志

3. 看当前 pending 状态：
   ```bash
   curl http://localhost:4000/api/bootstrap | jq .pending
   ```
   - false → 都接完了 · 需要 reset

### 问题 3 · 自动节奏卡住
**症状**：AmbientPulse 倒计时不走。

**排查**：
- 看右面板 "自动接 · 开/关" 按钮状态 · 关的话开一下
- 打开 browser console · 看有没有 JS 错误
- 看 WS 连接状态（顶栏"WS 已连接"徽章）
- 极端情况 F5 刷新页面

### 问题 4 · 一直返回 429 rate-limited
**症状**：tick POST 返回 `{ ok:false, reason:'rate-limited' }`。

**排查**：
- 最近点过太多次 · 等几秒
- 或调高限额：
  ```bash
  RATE_LIMIT_CAPACITY=100 RATE_LIMIT_REFILL=50 npm start
  ```

### 问题 5 · 数据库损坏
**症状**：server 启动报 `SqliteError: ...corrupt` 或类似。

**修复**：
```bash
cd demo/backend
rm -f data/dundao.db*
npm run db:seed
```

### 问题 6 · 12 主题有的字体没加载
**症状**：某个主题切过去字体变回系统默认（而不是 Noto Serif SC 等 Google Font）。

**原因**：WiFi 弱 · Google Fonts 没加载成功。

**修复**：
- 不是 bug · 字体 fallback 到系统中文字体是预期行为
- 展台前插好网 · 或预先加载页面让字体 cache

### 问题 7 · reset 返回 409
**症状**：`POST /api/reset` 返回 `{ ok:false, error:'in-flight-workflow' }`。

**原因**：当前有 tick 在跑 · reset 等了 3s 没等到。

**修复**：等 10 秒再 reset。

### 问题 8 · reset 返回 403
**症状**：远程调 reset 返回 403 local-only。

**修复**：要么 SSH 到机器上本机 curl · 要么：
```bash
ALLOW_REMOTE_RESET=1 npm start
```
（但这会让任何来源都能 reset · 生产上危险）。

## 展台前检查清单

评委来之前 30 秒执行：

```bash
# 1. 后端健康
curl -s http://localhost:4000/api/health || echo "后端挂了"

# 2. pending 状态
PENDING=$(curl -s http://localhost:4000/api/bootstrap | jq -r .pending)
if [ "$PENDING" = "false" ]; then
  echo "已接完 · reset 一下"
  curl -X POST http://localhost:4000/api/reset
fi

# 3. 刷新浏览器
# (手动 F5 或 Cmd+R)
```

## 录屏 Fallback 流程

如果现场彻底挂了：

1. 打开手机 / 另一台电脑里存好的 `fallback-45s.mp4`
2. 对评委说："今天展台网络/电脑抽风 · 这是一份 45 秒录屏 · 说明我们的 demo 做的事。"
3. 放完补充："跑着正常的话您会看到左边的卡片自己浮进来。"

录屏的信任度比现场崩的演示高 · 不要勉强。

## 日常维护

展台期间每 2 小时：
1. 重启服务一次（防内存慢泄漏）
2. 清 rate limit bucket · 自动（代码里每 64 请求 prune 一次）
3. 备份 fixtures.json（如果你改了 seed）

## 下一步

→ [../studydocs/](../studydocs/) 怎么讲清后端逻辑
→ [../report/](../report/) 赛道三评审结论
