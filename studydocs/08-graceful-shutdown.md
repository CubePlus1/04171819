# 08 · 优雅关闭 · 为什么 SIGTERM 要按顺序

> 读完这篇，你能答上"Ctrl+C 的时候后端发生了什么？"

## 一句话先

> **"先告别 WS 客户端 · 再关 WS server · 再关 HTTP server · 最后关数据库。顺序错了进程会挂 5 秒再强退。"**

这是 round 1 codex 审查发现的 **High** 级问题，修过了，现在有 smoke 覆盖。

## Bug 历史 · Round 1 codex 发现

**问题**：SIGTERM 到达时，代码只调用 `httpServer.close()` 然后等它回调里关数据库。

```js
// 有问题的旧版本
function shutdown(signal) {
  httpServer.close(() => {
    closeDb();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}
```

**错误在哪**：`httpServer.close()` 的回调**只有在所有连接关闭后才触发**。但 WebSocket 客户端还连着，HTTP server 不知道 WS 其实已经把连接升级了，就一直等 —— 结果 5 秒超时，进程强制退出，`closeDb()` 根本没跑。

**实测**：codex 实际跑了这个场景，SIGTERM 后 5 秒才退出（1 退出码 · 不是 0）。数据库没关 · 生产上可能导致 WAL 文件损坏。

## 修复 · 严格关闭顺序

```js
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info(`received ${signal}, shutting down`);

  // 1. 告别所有 WS 客户端（发 server.shutdown 事件）
  const farewell = JSON.stringify({ type: WS_EVENTS.SERVER_SHUTDOWN, ts: Date.now() });
  for (const client of wss.clients) {
    try { if (client.readyState === client.OPEN) client.send(farewell); } catch {}
    try { client.terminate(); } catch {}
  }
  // 兜底 5 秒强退 timer
  const forceTimer = setTimeout(() => {
    log.warn('force exit after 5s timeout');
    process.exit(1);
  }, 5000);
  forceTimer.unref();

  // 2. 关 WS server（不再接受新 upgrade）
  wss.close(() => {
    // 3. 关 HTTP server
    httpServer.close(() => {
      clearTimeout(forceTimer);
      closeDb();      // 4. 关数据库
      process.exit(0);
    });
  });
}
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
```

## 为什么这个顺序

### ① 告别 WS 客户端

发 `server.shutdown` 事件给所有打开的 WS（前端可以显示 toast "服务端下线了"）。然后 `terminate()` 强制断开。

**为什么不是 `close()`？** `close()` 会等 pong · `terminate()` 立即切连接。shutdown 路径里我们要快。

### ② 关 WS server

`wss.close()` 停止接受新的 upgrade 请求 · 回调在所有 existing 连接都关了后触发。因为 ① 我们已经手动 terminate 了所有 client，`wss.close` 的回调很快就触发。

### ③ 关 HTTP server

`httpServer.close()` 停止接受新 HTTP 连接 · 回调在所有 inflight request 完成后触发。对于快速请求（如 /api/bootstrap）一两秒内会完成。

### ④ 关数据库

`closeDb()` = `db.close()` · SQLite 把 WAL flush 回 main db file · 清理资源。

### 兜底 · 5 秒强退

如果哪一步意外卡住（比如某个 slow request 永不返回），`forceTimer` 兜底让进程 5 秒后强制退出。但正常流程不会触发它（`clearTimeout` 在 httpServer 回调里清掉）。

## 有 smoke 回归吗

有！`dundao-echo` 那边有专门的 `caps.test.mjs` 里：

```js
await runCase('SIGTERM 活跃流下仍能快速退出', async () => {
  const { child, base } = startServer({});
  try {
    await waitForReady(child);
    // 开一条活跃 SSE
    const active = fetch(`${base}/api/ambient`, { signal });
    const resp = await active;
    const reader = resp.body.getReader();
    await reader.read();
    const t0 = Date.now();
    child.kill('SIGTERM');
    await once(child, 'exit');
    const elapsed = Date.now() - t0;
    assert.ok(elapsed < 3000, `SIGTERM exit in <3s, got ${elapsed}ms`);
  } finally {
    if (!child.killed) child.kill('SIGKILL');
  }
});
```

主 demo 还没独立覆盖 SIGTERM case · 但逻辑是一样的。

## 展台上为什么要关心

**场景**：评委试完你的 demo，你按 Ctrl+C 关 demo 准备下台。如果进程挂 5 秒再退：
- Terminal 阻塞 5 秒 · 尴尬
- 数据库 WAL 没 flush · 下次重启可能要 recover · 偶尔会丢一两条最近的写

**现在**：Ctrl+C 立刻 0 退出 · 干净利落 · 下次启动也干净。

## 展台讲

**简短版**：
> "Graceful shutdown 按严格顺序：先告别所有 WS 客户端，再关 WS server，再关 HTTP server，最后关数据库。Round 1 codex review 发现旧版顺序错会导致 5 秒强退，修过了。"

**被追问**：
> "这个顺序对应'先停止接收新连接、再等已有连接优雅断开、最后释放资源'的通用模式。SQLite 的 WAL 需要被正确 flush，不然重启可能 recover。"

## 一句话版本（背下来）

> **"shutdown 顺序 · WS 客户端 → wss → httpServer → closeDb · 顺序错了进程会强退 5 秒、数据库没关。Round 1 codex 的真问题。"**

## 常见问答

**Q："为什么不直接 `process.exit(0)`？"**
A：那就是 kill -9 自己 · 所有 inflight 都被切 · 数据库 WAL 可能损坏。优雅关闭的关键就是**让已有工作完成后再退出**。

**Q："5 秒兜底会不会太激进？"**
A：5 秒对 ambient 场景足够（每个 tick 最多 2.5 秒 · 两个 tick 都能跑完）。生产上可以调成 30 秒（允许长 request 完成）。

**Q："SIGKILL 怎么办？"**
A：SIGKILL（kill -9）内核直接切进程 · shutdown handler 根本不跑。这时候 SQLite 重启时会看到 WAL 没正常关，启动时做 recovery —— 大多数情况下数据不丢。万一丢也是极端情况。想完全避免 → 用 fsync + 每次 write 后 checkpoint，但性能代价大。

**Q："如果 shutdown 过程中收到第二个 SIGTERM 呢？"**
A：`shuttingDown` flag 防重入 · 只会响应第一次。第二次被忽略。这避免"连按两次 Ctrl+C 搞出更糟的状态"。
