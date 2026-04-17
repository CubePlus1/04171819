import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';

import { DB_PATH, getDb, runSchema, closeDb } from './db.js';
import { createBroadcaster } from './events.js';
import { runWorkflow, newRunId } from './workflow.js';
import { createRateLimiter } from './rateLimit.js';
import { createLogger } from './logger.js';
import { seed } from './seed.js';
import { WS_EVENTS, REASON_CODES, MAX_COMMENT_GRAPHEMES, graphemeLength } from '../../shared/contracts.js';

// 服务器实例 epoch：每次进程启动或 reset 时递增，帮助前端发现「后端重启了 → 清掉本地 stale 卡片」
let SERVER_EPOCH = Date.now().toString(36);

const log = createLogger('server');
const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = resolve(__dirname, '../data/fixtures.json');

const PORT = Number(process.env.PORT ?? 4000);
const DEMO_USER_ID = 'demo-user';
const BOOTSTRAP_CARDS_LIMIT = Number(process.env.BOOTSTRAP_CARDS_LIMIT ?? 30);

// 仅本机可触发破坏性操作（reset）；部署到真机/云端时可通过 env 显式放开
const LOCAL_ONLY_HOSTS = new Set(['127.0.0.1', '::1', 'localhost', '::ffff:127.0.0.1']);

function isLocalRequest(req) {
  if (process.env.ALLOW_REMOTE_RESET === '1') return true;
  const ip = req.ip || req.socket?.remoteAddress || '';
  return LOCAL_ONLY_HOSTS.has(ip);
}

// CORS & WS origin：默认只信 localhost / 本机网络；可通过 env 追加
const DEFAULT_ALLOWED_ORIGINS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https?:\/\/\[::1\](:\d+)?$/,
  /^https?:\/\/192\.168\.\d+\.\d+(:\d+)?$/,
  /^https?:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/,
  /^https?:\/\/172\.(1[6-9]|2\d|3[01])\.\d+\.\d+(:\d+)?$/,
];
const EXTRA_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export function isOriginAllowed(origin) {
  if (!origin) return true; // curl / smoke / server-to-server
  if (EXTRA_ORIGINS.includes(origin) || EXTRA_ORIGINS.includes('*')) return true;
  return DEFAULT_ALLOWED_ORIGINS.some((re) => re.test(origin));
}

function ensureDb() {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const fresh = !existsSync(DB_PATH);
  const db = getDb();
  runSchema(db);
  if (fresh || db.prepare('SELECT COUNT(*) AS c FROM users').get().c === 0) {
    log.info('empty db detected, running seed');
    seed();
  }
}

function loadFixtures() {
  return JSON.parse(readFileSync(FIXTURES_PATH, 'utf8'));
}

function createApp(broadcast, state) {
  const app = express();
  app.set('trust proxy', 'loopback');

  app.use(
    cors({
      origin(origin, cb) {
        if (isOriginAllowed(origin)) cb(null, true);
        else cb(new Error(`origin not allowed: ${origin}`));
      },
      credentials: false,
    }),
  );

  app.use(express.json({ limit: '64kb' }));

  // 统一处理 body-parser 错误为 JSON（否则默认 HTML）
  app.use((err, _req, res, next) => {
    if (err && (err.type === 'entity.parse.failed' || err.type === 'entity.too.large')) {
      const status = err.status || (err.type === 'entity.too.large' ? 413 : 400);
      return res.status(status).json({ ok: false, error: err.type });
    }
    return next(err);
  });

  const commentLimiter = createRateLimiter({
    capacity: Number(process.env.RATE_LIMIT_CAPACITY ?? 12),
    refillPerSec: Number(process.env.RATE_LIMIT_REFILL ?? 3),
  });
  let pruneCounter = 0;

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, ts: Date.now() });
  });

  app.get('/api/epoch', (_req, res) => {
    res.json({ ok: true, epoch: SERVER_EPOCH });
  });

  app.get('/api/bootstrap', (_req, res) => {
    const db = getDb();
    const fixtures = loadFixtures();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(DEMO_USER_ID);
    const history = db
      .prepare(`SELECT s.*, c.display AS creator_display, c.avatar AS creator_avatar
                  FROM intent_signals s
                  JOIN creators c ON c.id = s.creator_id
                 WHERE s.user_id = ?
              ORDER BY s.occurred_at DESC`)
      .all(DEMO_USER_ID);
    const cards = db
      .prepare(
        `SELECT * FROM cards
           WHERE user_id = ?
        ORDER BY created_at DESC
           LIMIT ?`,
      )
      .all(DEMO_USER_ID, BOOTSTRAP_CARDS_LIMIT)
      .map((row) => ({ ...row, pages: JSON.parse(row.pages_json) }));

    res.json({
      server_epoch: SERVER_EPOCH,
      user,
      feed: fixtures.feed,
      presets: [
        { id: 'preset-A', text: '蹲链接姐妹们 上衣链接求！', script: 'A' },
        { id: 'preset-B', text: '一个月前按稍后再看 忘了看', script: 'B' },
        { id: 'preset-C', text: '蹲后续 爷爷真帅',          script: 'C' },
        { id: 'preset-tutorial', text: '求教程求教程求教程',  script: 'A' },
        { id: 'preset-plus-one', text: '+1 +1 +1',            script: 'A' },
      ],
      history,
      cards,
    });
  });

  app.post('/api/comment', async (req, res) => {
    const rl = commentLimiter.take(req.ip || 'unknown');
    if (++pruneCounter % 64 === 0) commentLimiter.prune();
    if (!rl.ok) {
      res.set('Retry-After', String(rl.retryAfter));
      return res.status(429).json({ ok: false, error: REASON_CODES.RATE_LIMITED, retry_after: rl.retryAfter });
    }
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    const rawUserId = req.body?.userId;
    const userId = typeof rawUserId === 'string' && rawUserId ? rawUserId : DEMO_USER_ID;
    const rawClientId = req.body?.clientId;
    const clientId = typeof rawClientId === 'string' && rawClientId ? rawClientId : null;
    if (!text) {
      return res.status(400).json({ ok: false, error: 'text required' });
    }
    if (graphemeLength(text) > MAX_COMMENT_GRAPHEMES) {
      return res.status(400).json({ ok: false, error: `text too long (max ${MAX_COMMENT_GRAPHEMES})` });
    }

    const runId = newRunId();
    state.inFlight.add(runId);
    broadcast(WS_EVENTS.WORKFLOW_BEGIN, { run_id: runId, client_id: clientId, text, userId });
    try {
      const result = await runWorkflow({
        comment: text,
        userId,
        runId,
        onStep: (frame) => broadcast(WS_EVENTS.WORKFLOW_STEP, frame),
      });
      if (result.ok) {
        broadcast(WS_EVENTS.CARD_GENERATED, { run_id: runId, client_id: clientId, card: result.card });
        broadcast(WS_EVENTS.WORKFLOW_END, { run_id: runId, client_id: clientId, ok: true, cardId: result.card.id });
      } else {
        broadcast(WS_EVENTS.WORKFLOW_END, { run_id: runId, client_id: clientId, ok: false, reason: result.reason });
      }
      res.json({
        ok: result.ok,
        runId,
        ...(result.ok ? { cardId: result.card.id } : { reason: result.reason }),
      });
    } catch (err) {
      log.error('workflow failed', { run_id: runId, err: err.message, stack: err.stack });
      broadcast(WS_EVENTS.WORKFLOW_END, { run_id: runId, client_id: clientId, ok: false, reason: REASON_CODES.SERVER_ERROR });
      res.status(500).json({ ok: false, runId, error: 'internal' });
    } finally {
      state.inFlight.delete(runId);
    }
  });

  app.post('/api/reset', async (req, res) => {
    if (!isLocalRequest(req)) {
      log.warn('reset rejected (non-local)', { ip: req.ip });
      return res.status(403).json({ ok: false, error: 'reset is local-only' });
    }
    if (state.inFlight.size > 0) {
      // 排空 in-flight：最长等 3 秒
      const deadline = Date.now() + 3000;
      while (state.inFlight.size > 0 && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 50));
      }
      if (state.inFlight.size > 0) {
        log.warn('reset blocked by in-flight workflows', { in_flight: state.inFlight.size });
        return res.status(409).json({ ok: false, error: REASON_CODES.IN_FLIGHT_WORKFLOW });
      }
    }
    log.info('reset requested');
    closeDb();
    seed();
    SERVER_EPOCH = Date.now().toString(36);
    broadcast(WS_EVENTS.DEMO_RESET, { epoch: SERVER_EPOCH });
    res.json({ ok: true, epoch: SERVER_EPOCH });
  });

  // 兜底：任何未命中的 API 返回 404 JSON（不要返回 html）
  app.use('/api', (_req, res) => res.status(404).json({ ok: false, error: 'not found' }));

  return app;
}

function main() {
  ensureDb();
  const httpServer = createServer();
  const { wss, broadcast } = createBroadcaster(httpServer, {
    path: '/ws',
    isOriginAllowed,
  });
  const state = { inFlight: new Set() };
  const app = createApp(broadcast, state);
  httpServer.on('request', app);

  httpServer.listen(PORT, () => {
    log.info(`listening on http://localhost:${PORT}`);
    log.info(`ws endpoint    ws://localhost:${PORT}/ws`);
  });

  let shuttingDown = false;
  function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`received ${signal}, shutting down`);

    // 1. 先告别所有 WS 客户端，让 httpServer.close() 能收到它们的断开事件
    const farewell = JSON.stringify({ type: WS_EVENTS.SERVER_SHUTDOWN, ts: Date.now() });
    for (const client of wss.clients) {
      try { if (client.readyState === client.OPEN) client.send(farewell); } catch {/* ignore */}
      try { client.terminate(); } catch {/* ignore */}
    }
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
        closeDb();
        process.exit(0);
      });
    });
  }
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
