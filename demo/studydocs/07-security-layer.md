# 07 · 安全层速答 · CORS / origin / rate limit

> 读完这篇，你能答上"这不过是个展台，为什么要做这么多安全？"

## 一句话先

> **"展台也要能插公网 WiFi · 基础设施不到位，现场出事比不做更丢人。"**

而且，这些保护大多是 **10 轮 codex review 揭示出来的真问题** —— 不是凭空加的过度设计。

## 7 层保护 · 快速一览

| 层 | 目的 | 代码位置 |
|---|---|---|
| 1. CORS allowlist | 不明网站不能读你的 API | `server.js:isOriginAllowed` |
| 2. WS origin 校验 | 不明网站不能订阅你的 WS | `events.js:verifyClient` |
| 3. rate limit | 单 IP 刷爆 · 令牌桶限流 | `rateLimit.js` |
| 4. reset 本机限制 | 破坏性操作仅 loopback | `server.js:isLocalRequest` |
| 5. JSON 错误映射 | 无效 body 不返回 HTML，返回 JSON | `server.js:body-parser err middleware` |
| 6. body 大小限制 | `express.json({ limit: '64kb' })` | server.js |
| 7. 原子声明 + UNIQUE | 数据层防重复（见 `05-atomic-claim.md`） | schema.sql / ambient.js |

## 1. CORS allowlist

默认允许：
- `localhost(:任意)` · 本机开发
- `127.0.0.1` · 本机
- `192.168.x.x` · 家里 / 办公室 LAN
- `10.x.x.x` · 其它常见内网段
- `172.16-31.x.x` · Docker bridge 默认

**不在 allowlist 的 origin**：
- 浏览器跨域请求 · CORS 头不返回 · 浏览器自动阻断
- curl / 其他非浏览器 · 因为没 Origin header，默认放行（用于 smoke 测试）

环境变量 `ALLOWED_ORIGINS="https://your-demo.com,https://xxx.com"` 可以追加。

### 为什么不是 `*`

因为 **WebSocket 默认不走 CORS preflight**。如果 ACAO: * 同时 WS 不做 origin 校验，恶意网站能连你的 WS 偷事件流。我们在 WS 层也校验 origin（见下一层），这两层必须对齐。

## 2. WS origin 校验

`events.js:createBroadcaster` 里：

```js
const wss = new WebSocketServer({
  server: httpServer,
  path,
  verifyClient(info, cb) {
    const origin = info.origin || info.req.headers['origin'] || null;
    if (!isOriginAllowed || isOriginAllowed(origin)) return cb(true);
    log.warn('ws rejected (origin)', { origin });
    return cb(false, 403, 'origin not allowed');
  },
});
```

`verifyClient` 在 WebSocket 握手阶段执行 · 不允许的 origin 会收到 403，根本建立不了连接。

## 3. Rate Limit · 令牌桶

`rateLimit.js` 实现：
- 每个 IP 一个 bucket
- 容量 default `12` · 每秒补 `3` 个令牌
- 每次 request 消耗 1 个令牌
- 令牌用完 → 429 + `Retry-After` header + `{ok:false, error:'rate-limited'}`

**桶清理**：每 64 次 tick 运行一次 prune，删除超过 5 分钟没访问的 idle bucket。硬上限 1024 个 bucket · 防止 bucket 无限累积。

### 参数怎么选

- capacity 12 · 允许一小波 burst（评委快速点几下）不被立刻拒
- refill 3/s · 稳态允许每秒 3 条请求 · 够演示用

生产上按 QPS 压测调整。

## 4. Reset 本机限制

`/api/reset` 是**破坏性操作**（清库、重 seed）。如果它对任意 origin 都开放：
- 恶意网站可以一直 reset 让你的展台永远在初态
- 多个评委同时看 demo 时互相干扰

所以：
```js
function isLocalRequest(req) {
  if (process.env.ALLOW_REMOTE_RESET === '1') return true;
  const ip = req.ip || req.socket?.remoteAddress || '';
  return LOCAL_ONLY_HOSTS.has(ip);
}
```

默认只有 `127.0.0.1 / ::1 / localhost` 能 reset。想远程 reset 必须 `ALLOW_REMOTE_RESET=1`（env 显式放开 · 生产默认关）。

**同时**：reset 前先等 in-flight 请求排空，最长等 3 秒。不排空强制 reset 会导致进行中的事务被切断，返回 500。

```js
if (state.inFlight.size > 0) {
  const deadline = Date.now() + 3000;
  while (state.inFlight.size > 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
  }
  if (state.inFlight.size > 0) {
    return res.status(409).json({ ok: false, error: REASON_CODES.IN_FLIGHT_WORKFLOW });
  }
}
```

**Drain-then-close 模式** · 生产常见做法。

## 5. JSON 错误映射

Express 的默认 body-parser 遇到无效 JSON 会返回 **HTML 错误页**。对 API 来说这是契约破坏 —— 前端期望 JSON，拿到 HTML 不知道怎么解析。

解决：在 express.json() 之后挂一个 error middleware：

```js
app.use((err, _req, res, next) => {
  if (err && (err.type === 'entity.parse.failed' || err.type === 'entity.too.large')) {
    const status = err.status || (err.type === 'entity.too.large' ? 413 : 400);
    return res.status(status).json({ ok: false, error: err.type });
  }
  return next(err);
});
```

现在无效 JSON 返回 400 + `{ok:false, error:'entity.parse.failed'}` · 超大 body 返回 413 + `entity.too.large`。contract 稳定。

## 6. Body 大小限制

```js
app.use(express.json({ limit: '64kb' }));
```

64KB 够任何合理的 API 请求 · 防 payload 吞内存攻击。

## 7. 原子声明 + UNIQUE

见 `05-atomic-claim.md`。在**数据层**防止重复履约。

## 为什么这些保护都是必要的 · codex 审查的证据

Round 3 codex review 原话（稍简化）：

> "CORS 默认 `*` 让任意网站能读你的 API。WebSocket 不校验 origin 意味着同一 host 页面可以订阅事件流。缺少 rate limit 对 /api/comment 让恶意客户端能在 10 秒内刷满日志。reset 端点不限本机让第三方可以重置你的展台状态。 ALL FOUR REQUIRE FIX · 否则仅适合 100% 可控的本机环境。"

上面 7 层里 1-5 都是 round 3 修复的结果。

## 展台讲安全

**简短版**：
> "我们做了 7 层保护：CORS allowlist、WS origin 校验、per-IP 令牌桶限流、reset 本机限制、JSON 错误映射、body 大小限制、数据层原子声明。这些是 codex review 指出来的真问题，不是过度设计。展台可以插公网 WiFi 也不担心。"

**被追问时**：
> "10 轮 codex 审查里 round 3 专门扫了安全面，发现了这些问题，我们逐条修了并加了 smoke 回归 —— 现在 evil origin 请求 smoke 会验证返回 403 且不带 ACAO 头。"

## 一句话版本（背下来）

> **"7 层保护 · CORS 白名单、WS origin 校验、令牌桶限流、reset 本机限制、JSON 错误映射、body 大小、原子声明。都是 codex review 的真发现，不是过度设计。"**

## 常见问答

**Q："你们没有身份认证吗？"**
A：展台是单用户 demo · `demo-user` 是硬编码的。生产上需要 auth · 但那是另一层，这次 scope 内不覆盖。

**Q："rate limit 容量 12 refill 3 合理吗？"**
A：展台场景合理 · 评委最多连点几下然后停。生产需要按实际 QPS 调 · 可以通过环境变量 `RATE_LIMIT_CAPACITY` / `RATE_LIMIT_REFILL` 调整 · 不需要改代码。

**Q："如果 reset 被 in-flight 长时间阻塞会 spinner 无限转吗？"**
A：不会 · 最多等 3 秒，之后返回 409 · 前端收到 409 显示 toast "重置失败，后端有任务在跑，稍后再试"。用户可以等一下再按重置。

**Q："如果我把你们部署到公网，evil origin 能做什么？"**
A：
- `GET /api/bootstrap` · 浏览器端被 CORS 拦，curl 能看到（无敏感数据）
- `POST /api/ambient/tick` · 浏览器端被 CORS 拦
- `POST /api/reset` · 非 loopback 直接 403
- `WS /ws` · verifyClient 直接拒握手

**攻击面趋近于零**。唯一能做的是用 curl 触发匿名 tick，但 rate limit 把它压到 3 QPS。
