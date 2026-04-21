import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';

import { DB_PATH, getDb, runSchema, closeDb } from './db.js';
import { createBroadcaster } from './events.js';
import { runWorkflow, newRunId } from './workflow.js';
import { runAmbient, hasPendingAmbient } from './ambient.js';
import { buildIngestRouter } from './ingest.js';
import { buildHistoryBackfillRouter } from './historyBackfill.js';
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
export const LISTEN_HOST = '127.0.0.1';
const DEMO_USER_ID = 'demo-user';
const BOOTSTRAP_CARDS_LIMIT = Number(process.env.BOOTSTRAP_CARDS_LIMIT ?? 30);

// 展台循环模式：pending 永远为 true · runAmbient 在剧本接完后软 reset 重演
// 默认关闭（保护 smoke 契约）· npm run dev 会自动设 1 · 生产/测试不设
const LOOP_MODE = process.env.LOOP_MODE === '1' || process.env.DEMO_LOOP === '1';

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
];
const EXTRA_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export function isOriginAllowed(origin) {
  if (!origin) return false;
  if (EXTRA_ORIGINS.includes(origin) || EXTRA_ORIGINS.includes('*')) return true;
  return DEFAULT_ALLOWED_ORIGINS.some((re) => re.test(origin));
}

// WS 是无鉴权 fan-out：workflow.begin / step 只广播最小标识，
// 避免把用户原始评论、历史 raw_text 等内容推给所有监听者。
// 需要完整渲染的数据只保留在 card.generated。
export function buildWorkflowBeginPayload({ runId, userId }) {
  return {
    run_id: runId,
    user_id: userId,
  };
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

  function triggerAmbient({ userId = DEMO_USER_ID, topic }) {
    const runId = newRunId();
    state.inFlight.add(runId);
    broadcast(WS_EVENTS.WORKFLOW_BEGIN, buildWorkflowBeginPayload({ runId, userId }));

    void Promise.resolve()
      .then(() => runAmbient({
        userId,
        runId,
        topic,
        loopMode: LOOP_MODE,
        onStep: (frame) => broadcast(WS_EVENTS.WORKFLOW_STEP, { ...frame, ambient: true, auto: true }),
      }))
      .then((result) => {
        if (result.ok) {
          broadcast(WS_EVENTS.CARD_GENERATED, { run_id: runId, ambient: true, auto: true, card: result.card });
          broadcast(WS_EVENTS.WORKFLOW_END, { run_id: runId, ambient: true, auto: true, ok: true, cardId: result.card.id });
          return;
        }

        broadcast(WS_EVENTS.WORKFLOW_END, {
          run_id: runId,
          ambient: true,
          auto: true,
          ok: false,
          reason: result.reason,
        });
      })
      .catch((err) => {
        log.error('ambient auto-trigger failed', { run_id: runId, topic, err: err.message, stack: err.stack });
        broadcast(WS_EVENTS.WORKFLOW_END, {
          run_id: runId,
          ambient: true,
          auto: true,
          ok: false,
          reason: REASON_CODES.SERVER_ERROR,
        });
      })
      .finally(() => {
        state.inFlight.delete(runId);
      });
  }

  app.use(
    cors({
      origin(origin, cb) {
        if (!origin) return cb(null, true);
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

  app.use('/api', buildIngestRouter({ broadcast, triggerAmbient }));
  app.use('/api', buildHistoryBackfillRouter({ broadcast, triggerAmbient }));

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

    // 「扫描片段」：不是评论输入，而是评委可以挑一类信号让 AI 后台先处理
    //   —— 语义对齐 principle.json 里的"被动刷到即成立"，而不是"让用户输入"
    const triggers = [
      { id: 'trigger-A', label: '收纳好物 · 求链接',     script: 'A', topic: 'storage-haul',       hint: '把我 7 天前蹲的那个露营收纳箱链接接回来' },
      { id: 'trigger-B', label: '男友失联 · 蹲后续',     script: 'B', topic: 'missing-bf',         hint: '把我 5 天前蹲的那条后续接回来' },
      { id: 'trigger-C', label: '剪辑教程 · 求教学',     script: 'C', topic: 'editing-transition', hint: '把我 9 天前求的那份转场教学接回来' },
    ];
    const pending = hasPendingAmbient(DEMO_USER_ID, { loopMode: LOOP_MODE });

    res.json({
      server_epoch: SERVER_EPOCH,
      user,
      feed: fixtures.feed,
      triggers,
      pending,
      loop_mode: LOOP_MODE,
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
    broadcast(WS_EVENTS.WORKFLOW_BEGIN, buildWorkflowBeginPayload({ runId, userId }));
    try {
      const result = await runWorkflow({
        comment: text,
        userId,
        runId,
        onStep: (frame) => broadcast(WS_EVENTS.WORKFLOW_STEP, frame),
      });
      if (result.ok) {
        broadcast(WS_EVENTS.CARD_GENERATED, { run_id: runId, client_id: clientId, card: result.card });
        broadcast(WS_EVENTS.WORKFLOW_END, { run_id: runId, ok: true, cardId: result.card.id });
      } else {
        broadcast(WS_EVENTS.WORKFLOW_END, { run_id: runId, ok: false, reason: result.reason });
      }
      res.json({
        ok: result.ok,
        runId,
        ...(result.ok ? { cardId: result.card.id } : { reason: result.reason }),
      });
    } catch (err) {
      log.error('workflow failed', { run_id: runId, err: err.message, stack: err.stack });
      broadcast(WS_EVENTS.WORKFLOW_END, { run_id: runId, ok: false, reason: REASON_CODES.SERVER_ERROR });
      res.status(500).json({ ok: false, runId, error: 'internal' });
    } finally {
      state.inFlight.delete(runId);
    }
  });

  // Ambient · 不要求评论输入，AI 后台从未履约信号 × 博主新动作里挑下一条
  app.post('/api/ambient/tick', async (req, res) => {
    const rl = commentLimiter.take(req.ip || 'unknown');
    if (++pruneCounter % 64 === 0) commentLimiter.prune();
    if (!rl.ok) {
      res.set('Retry-After', String(rl.retryAfter));
      return res.status(429).json({ ok: false, error: REASON_CODES.RATE_LIMITED, retry_after: rl.retryAfter });
    }

    const body = req.body ?? {};
    const topic   = typeof body.topic === 'string' && body.topic ? body.topic : null;
    const signalId = Number.isInteger(body.signalId) ? body.signalId : null;
    const rawUserId = body.userId;
    const userId = typeof rawUserId === 'string' && rawUserId ? rawUserId : DEMO_USER_ID;
    const rawClientId = body.clientId;
    const clientId = typeof rawClientId === 'string' && rawClientId ? rawClientId : null;

    const runId = newRunId();
    state.inFlight.add(runId);
    broadcast(WS_EVENTS.WORKFLOW_BEGIN, buildWorkflowBeginPayload({ runId, userId }));
    try {
      const result = await runAmbient({
        userId, runId, topic, signalId,
        loopMode: LOOP_MODE,
        onStep: (frame) => broadcast(WS_EVENTS.WORKFLOW_STEP, { ...frame, ambient: true }),
      });
      if (result.ok) {
        broadcast(WS_EVENTS.CARD_GENERATED, { run_id: runId, client_id: clientId, card: result.card });
        broadcast(WS_EVENTS.WORKFLOW_END, { run_id: runId, ambient: true, ok: true, cardId: result.card.id });
      } else {
        broadcast(WS_EVENTS.WORKFLOW_END, { run_id: runId, ambient: true, ok: false, reason: result.reason });
      }
      res.json({
        ok: result.ok,
        runId,
        pending: hasPendingAmbient(userId, { loopMode: LOOP_MODE }),
        ...(result.ok ? { cardId: result.card.id } : { reason: result.reason }),
      });
    } catch (err) {
      log.error('ambient failed', { run_id: runId, err: err.message, stack: err.stack });
      broadcast(WS_EVENTS.WORKFLOW_END, { run_id: runId, ambient: true, ok: false, reason: REASON_CODES.SERVER_ERROR });
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

  httpServer.listen(PORT, LISTEN_HOST, () => {
    log.info(`listening on http://${LISTEN_HOST}:${PORT}`);
    log.info(`ws endpoint    ws://${LISTEN_HOST}:${PORT}/ws`);
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

const isMain = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main();
}
