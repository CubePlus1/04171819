// 原生 Node http + SSE —— 不引 Express，不引 ws
// 路由：
//   GET  /api/state  → 当前 seed 状态（用于页面首次加载）
//   POST /api/reset  → 回到初态（局域网内也允许，单机实验）
//   POST /api/echo   → SSE 流：逐条 event，最后 event: end
import { createServer } from 'node:http';
import { runEcho } from './echo.mjs';
import { getState, resetState, relativeTimeCn } from './store.mjs';

const PORT = Number(process.env.PORT ?? 4100);
const MAX_TEXT = 140;
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES ?? 4096);

// 轻量 JSON 读取 + 体积保护。不强制 destroy 连接，让上层能稳定回 413 JSON。
function readJson(req, { limit = MAX_BODY_BYTES } = {}) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let oversize = false;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { oversize = true; return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (oversize) {
        return reject(Object.assign(new Error('payload too large'), { code: 413 }));
      }
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(Object.assign(new Error('invalid json'), { code: 400 }));
      }
    });
    req.on('error', reject);
  });
}

// ===== CORS / origin allowlist =====
const ALLOW_RE = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https?:\/\/\[::1\](:\d+)?$/,
  /^https?:\/\/192\.168\.\d+\.\d+(:\d+)?$/,
  /^https?:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/,
  /^https?:\/\/172\.(1[6-9]|2\d|3[01])\.\d+\.\d+(:\d+)?$/,
];
const EXTRA = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',').map((s) => s.trim()).filter(Boolean);

function isOriginAllowed(origin) {
  if (!origin) return true;  // curl / server-to-server / smoke
  if (EXTRA.includes('*') || EXTRA.includes(origin)) return true;
  return ALLOW_RE.some((re) => re.test(origin));
}

function corsHeaders(origin) {
  const h = {
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (origin && isOriginAllowed(origin)) h['Access-Control-Allow-Origin'] = origin;
  // 无 origin 或不在 allowlist → 不发 ACAO 头（浏览器会阻断，curl 仍可用）
  return h;
}

function json(res, status, body, origin) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    ...corsHeaders(origin),
  });
  res.end(payload);
}

function setSseHeaders(res, origin) {
  res.writeHead(200, {
    'Content-Type':  'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store, no-transform',
    'Connection':    'keep-alive',
    'X-Accel-Buffering': 'no',
    ...corsHeaders(origin),
  });
}

function sseWrite(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ===== rate limiter =====
function makeLimiter({ capacity = 6, refillPerSec = 2, maxIdleMs = 5 * 60_000, maxBuckets = 1024 } = {}) {
  const buckets = new Map();

  function prune(now = Date.now()) {
    if (buckets.size < maxBuckets / 2) return;
    for (const [k, b] of buckets) {
      if (now - b.ts > maxIdleMs) buckets.delete(k);
    }
    if (buckets.size > maxBuckets) {
      // 硬盖：丢弃最早的一半
      const toDrop = buckets.size - Math.floor(maxBuckets / 2);
      let i = 0;
      for (const k of buckets.keys()) {
        if (i++ >= toDrop) break;
        buckets.delete(k);
      }
    }
  }

  let callCount = 0;
  return {
    take(key) {
      if (++callCount % 64 === 0) prune();
      const now = Date.now();
      let b = buckets.get(key);
      if (!b) { b = { tokens: capacity, ts: now }; buckets.set(key, b); }
      const elapsed = (now - b.ts) / 1000;
      b.tokens = Math.min(capacity, b.tokens + elapsed * refillPerSec);
      b.ts = now;
      if (b.tokens >= 1) { b.tokens -= 1; return { ok: true }; }
      return { ok: false, retryAfter: ((1 - b.tokens) / refillPerSec).toFixed(2) };
    },
    size: () => buckets.size,
    prune,
  };
}

const echoLimit = makeLimiter({
  capacity: Number(process.env.RL_CAP ?? 8),
  refillPerSec: Number(process.env.RL_REFILL ?? 2),
});

// 并发 SSE 流上限（按 IP + 全局）
const MAX_STREAMS_PER_IP = Number(process.env.MAX_STREAMS_PER_IP ?? 3);
const MAX_STREAMS_GLOBAL = Number(process.env.MAX_STREAMS_GLOBAL ?? 32);
const streamsByIp = new Map();

// ===== server =====
const activeStreams = new Set();

const server = createServer(async (req, res) => {
  const origin = req.headers.origin ?? null;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(origin));
    res.end();
    return;
  }

  // 浏览器来了不在 allowlist 的 origin → 直接 403 JSON（不再靠 wildcard 兜底）
  if (origin && !isOriginAllowed(origin)) {
    return json(res, 403, { ok: false, error: 'origin not allowed' }, origin);
  }

  const remoteIp = req.socket.remoteAddress ?? '?';
  const isLocalhost = remoteIp === '127.0.0.1' || remoteIp === '::1' || remoteIp === '::ffff:127.0.0.1';

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/api/state' && req.method === 'GET') {
      const s = getState();
      return json(res, 200, {
        user: s.user,
        presets: [
          { id: 'A', text: '蹲链接姐妹们 上衣链接求！' },
          { id: 'B', text: '一个月前按稍后再看 忘了看' },
          { id: 'C', text: '蹲后续 爷爷真帅' },
        ],
        memories: s.signals.map((sig) => ({
          id: sig.id,
          text: sig.text,
          creator: s.creators[sig.creator]?.display ?? sig.creator,
          relative: relativeTimeCn(sig.occurred_at),
          fulfilled: sig.fulfilled,
        })),
      }, origin);
    }

    if (url.pathname === '/api/reset' && req.method === 'POST') {
      // 破坏性操作：非 loopback 默认拒绝，可用 ALLOW_REMOTE_RESET=1 显式开
      if (!isLocalhost && process.env.ALLOW_REMOTE_RESET !== '1') {
        return json(res, 403, { ok: false, error: 'reset is local-only' }, origin);
      }
      resetState();
      return json(res, 200, { ok: true }, origin);
    }

    if (url.pathname === '/api/echo' && req.method === 'POST') {
      const ip = remoteIp;
      const rl = echoLimit.take(ip);
      if (!rl.ok) return json(res, 429, { ok: false, error: 'rate-limited', retry_after: rl.retryAfter }, origin);

      // 并发流上限
      const perIp = streamsByIp.get(ip) ?? 0;
      if (perIp >= MAX_STREAMS_PER_IP) {
        return json(res, 429, { ok: false, error: 'too-many-streams', scope: 'ip' }, origin);
      }
      if (activeStreams.size >= MAX_STREAMS_GLOBAL) {
        return json(res, 503, { ok: false, error: 'too-many-streams', scope: 'global' }, origin);
      }

      let body;
      try {
        body = await readJson(req);
      } catch (err) {
        return json(res, err.code ?? 400, { ok: false, error: err.message }, origin);
      }
      const text = typeof body.text === 'string' ? body.text.trim() : '';
      if (!text)                         return json(res, 400, { ok: false, error: 'text required' }, origin);
      if ([...text].length > MAX_TEXT)   return json(res, 400, { ok: false, error: 'too long' }, origin);

      // AbortController 贯穿取消语义：断连 / shutdown 都能让生成器立即停止，避免履约副作用
      const abortCtrl = new AbortController();
      const stream = { res, abortCtrl, ip };
      activeStreams.add(stream);
      streamsByIp.set(ip, perIp + 1);
      const closeHandler = () => {
        if (!abortCtrl.signal.aborted) abortCtrl.abort();
        if (activeStreams.delete(stream)) {
          const n = (streamsByIp.get(ip) ?? 1) - 1;
          if (n <= 0) streamsByIp.delete(ip);
          else streamsByIp.set(ip, n);
        }
      };
      req.on('close', closeHandler);
      res.on('close', closeHandler);

      setSseHeaders(res, origin);
      const keepAlive = setInterval(() => {
        if (!res.writableEnded) res.write(': keep-alive\n\n');
      }, 15000);

      try {
        for await (const event of runEcho({ text, signal: abortCtrl.signal })) {
          if (abortCtrl.signal.aborted) break;
          sseWrite(res, event.type, event.payload);
          if (event.type === 'end') break;
        }
      } catch (err) {
        if (err.name !== 'AbortError' && !res.writableEnded) {
          sseWrite(res, 'end', { ok: false, reason: 'server-error' });
        }
      } finally {
        clearInterval(keepAlive);
        closeHandler();
        req.off('close', closeHandler);
        res.off('close', closeHandler);
        if (!res.writableEnded) res.end();
      }
      return;
    }

    return json(res, 404, { ok: false, error: 'not found' }, origin);
  } catch {
    return json(res, 500, { ok: false, error: 'internal' }, origin);
  }
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[echo] received ${signal}, closing...`);
  // 先取消所有活跃 SSE 的生成器 + 关流，避免进程被 keep-alive 拖住
  for (const s of activeStreams) {
    try { s.abortCtrl.abort(); } catch {/* ignore */}
    try { s.res.end(); } catch {/* ignore */}
  }
  activeStreams.clear();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000).unref();
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

server.listen(PORT, () => {
  console.log(`[echo] listening on http://localhost:${PORT}`);
  console.log(`[echo] sse endpoint POST /api/echo {"text":"..."}`);
});
