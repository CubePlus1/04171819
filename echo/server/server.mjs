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

// 轻量 JSON 读取 + 体积保护
function readJson(req, { limit = 4096 } = {}) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('payload too large'), { code: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(Object.assign(new Error('invalid json'), { code: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function json(res, status, body, extra = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    ...extra,
  });
  res.end(payload);
}

function setSseHeaders(res) {
  res.writeHead(200, {
    'Content-Type':  'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store, no-transform',
    'Connection':    'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*',
  });
}

function sseWrite(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// 极简 per-IP 令牌桶
function makeLimiter({ capacity = 6, refillPerSec = 2 } = {}) {
  const buckets = new Map();
  return function take(key) {
    const now = Date.now();
    let b = buckets.get(key);
    if (!b) { b = { tokens: capacity, ts: now }; buckets.set(key, b); }
    const elapsed = (now - b.ts) / 1000;
    b.tokens = Math.min(capacity, b.tokens + elapsed * refillPerSec);
    b.ts = now;
    if (b.tokens >= 1) { b.tokens -= 1; return { ok: true }; }
    return { ok: false, retryAfter: ((1 - b.tokens) / refillPerSec).toFixed(2) };
  };
}

const echoLimit = makeLimiter({ capacity: 8, refillPerSec: 2 });

function normalizeOrigin(origin) {
  if (!origin) return null;
  const allow = [
    /^https?:\/\/localhost(:\d+)?$/,
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
    /^https?:\/\/192\.168\.\d+\.\d+(:\d+)?$/,
    /^https?:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/,
  ];
  return allow.some((re) => re.test(origin)) ? origin : null;
}

function applyCors(req, res) {
  const o = req.headers.origin;
  const allowed = normalizeOrigin(o);
  if (allowed) res.setHeader('Access-Control-Allow-Origin', allowed);
  else if (!o) res.setHeader('Access-Control-Allow-Origin', '*'); // curl / smoke
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
}

const server = createServer(async (req, res) => {
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

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
      });
    }

    if (url.pathname === '/api/reset' && req.method === 'POST') {
      resetState();
      return json(res, 200, { ok: true });
    }

    if (url.pathname === '/api/echo' && req.method === 'POST') {
      const ip = req.socket.remoteAddress ?? '?';
      const rl = echoLimit(ip);
      if (!rl.ok) return json(res, 429, { ok: false, error: 'rate-limited', retry_after: rl.retryAfter });

      let body;
      try {
        body = await readJson(req);
      } catch (err) {
        return json(res, err.code ?? 400, { ok: false, error: err.message });
      }
      const text = typeof body.text === 'string' ? body.text.trim() : '';
      if (!text)                         return json(res, 400, { ok: false, error: 'text required' });
      if ([...text].length > MAX_TEXT)   return json(res, 400, { ok: false, error: 'too long' });

      setSseHeaders(res);
      const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), 15000);
      req.on('close', () => clearInterval(keepAlive));

      try {
        for await (const event of runEcho({ text })) {
          sseWrite(res, event.type, event.payload);
          if (event.type === 'end') break;
        }
      } catch (err) {
        sseWrite(res, 'end', { ok: false, reason: 'server-error' });
      } finally {
        clearInterval(keepAlive);
        res.end();
      }
      return;
    }

    return json(res, 404, { ok: false, error: 'not found' });
  } catch (err) {
    return json(res, 500, { ok: false, error: 'internal' });
  }
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[echo] received ${signal}, closing...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000).unref();
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

server.listen(PORT, () => {
  console.log(`[echo] listening on http://localhost:${PORT}`);
  console.log(`[echo] sse endpoint POST /api/echo {"text":"..."}`);
});
