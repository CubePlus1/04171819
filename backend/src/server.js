import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';

import { DB_PATH, getDb, runSchema, closeDb } from './db.js';
import { createBroadcaster } from './events.js';
import { runWorkflow, newRunId } from './workflow.js';
import { createLogger } from './logger.js';
import { seed } from './seed.js';

const log = createLogger('server');
const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = resolve(__dirname, '../data/fixtures.json');

const PORT = Number(process.env.PORT ?? 4000);
const DEMO_USER_ID = 'demo-user';

// 仅本机可触发破坏性操作（reset）；部署到真机/云端时可通过 env 显式放开
const LOCAL_ONLY_HOSTS = new Set(['127.0.0.1', '::1', 'localhost', '::ffff:127.0.0.1']);

function isLocalRequest(req) {
  if (process.env.ALLOW_REMOTE_RESET === '1') return true;
  const ip = req.ip || req.socket?.remoteAddress || '';
  return LOCAL_ONLY_HOSTS.has(ip);
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

function createApp(broadcast) {
  const app = express();
  app.set('trust proxy', 'loopback');
  app.use(cors());
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, ts: Date.now() });
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
      .prepare('SELECT * FROM cards WHERE user_id = ? ORDER BY created_at DESC')
      .all(DEMO_USER_ID)
      .map((row) => ({ ...row, pages: JSON.parse(row.pages_json) }));

    res.json({
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
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    const rawUserId = req.body?.userId;
    const userId = typeof rawUserId === 'string' && rawUserId ? rawUserId : DEMO_USER_ID;
    if (!text) {
      return res.status(400).json({ ok: false, error: 'text required' });
    }
    if (text.length > 140) {
      return res.status(400).json({ ok: false, error: 'text too long (max 140)' });
    }

    const runId = newRunId();
    broadcast('workflow.begin', { run_id: runId, text, userId });
    try {
      const result = await runWorkflow({
        comment: text,
        userId,
        runId,
        onStep: (frame) => broadcast('workflow.step', frame),
      });
      if (result.ok) {
        broadcast('card.generated', { run_id: runId, card: result.card });
        broadcast('workflow.end', { run_id: runId, ok: true, cardId: result.card.id });
      } else {
        broadcast('workflow.end', { run_id: runId, ok: false, reason: result.reason });
      }
      res.json({
        ok: result.ok,
        runId,
        ...(result.ok ? { cardId: result.card.id } : { reason: result.reason }),
      });
    } catch (err) {
      log.error('workflow failed', { run_id: runId, err: err.message, stack: err.stack });
      broadcast('workflow.end', { run_id: runId, ok: false, reason: 'server-error' });
      res.status(500).json({ ok: false, runId, error: 'internal' });
    }
  });

  app.post('/api/reset', (req, res) => {
    if (!isLocalRequest(req)) {
      log.warn('reset rejected (non-local)', { ip: req.ip });
      return res.status(403).json({ ok: false, error: 'reset is local-only' });
    }
    log.info('reset requested');
    closeDb();
    seed();
    broadcast('demo.reset', {});
    res.json({ ok: true });
  });

  // 兜底：任何未命中的 API 返回 404 JSON（不要返回 html）
  app.use('/api', (_req, res) => res.status(404).json({ ok: false, error: 'not found' }));

  return app;
}

function main() {
  ensureDb();
  const httpServer = createServer();
  const { wss, broadcast } = createBroadcaster(httpServer, { path: '/ws' });
  const app = createApp(broadcast);
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
    const farewell = JSON.stringify({ type: 'server.shutdown', ts: Date.now() });
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
