import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import express from 'express';
import { runSchema } from './db.js';
import { applyMigrations } from './migrate.js';
import {
  BACKFILL_EVENTS,
  backfillOnce,
  buildHistoryBackfillRouter,
} from './historyBackfill.js';

function runCase(label, fn) {
  return fn()
    .then(() => console.log('✅', label))
    .catch((err) => {
      console.error('❌', label, '\n   →', err.message);
      process.exitCode = 1;
    });
}

function createDeferred() {
  let resolve;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function createMsgfeedClient({ pages, views, viewCalls, fetchCalls }) {
  const pageMap = new Map(
    pages.map((page) => [page.cursor, {
      replies: page.replies,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    }]),
  );

  return {
    async fetchMsgfeedReply({ cursor }) {
      const key = cursor ?? null;
      fetchCalls.push(key);
      const page = pageMap.get(key);
      if (!page) {
        throw new Error(`unexpected cursor: ${String(key)}`);
      }
      return page;
    },
    async fetchVideoView({ aid }) {
      viewCalls.push(aid);
      const view = views.get(aid);
      if (!view) {
        throw new Error(`unexpected aid: ${aid}`);
      }
      return view;
    },
  };
}

function countRows(db, tableName) {
  return db.prepare(`SELECT COUNT(*) AS c FROM ${tableName}`).get().c;
}

async function withDb(run) {
  const tempDir = mkdtempSync(join(tmpdir(), 'dundao-backfill-'));
  const dbPath = join(tempDir, 'backfill.db');
  const db = new Database(dbPath);
  runSchema(db);
  applyMigrations({ db });

  try {
    await run(db);
  } finally {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function withServer(router, run) {
  const app = express();
  app.use(express.json({ limit: '64kb' }));
  app.use('/api', router);

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('failed to resolve server address');
  }

  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

async function waitFor(check, { attempts = 40, delayMs = 10 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await check();
    if (result) {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error('condition not met in time');
}

await runCase('backfillOnce reruns without new rows, progress is monotonic, and duplicate-only pages terminate', async () => {
  await withDb(async (db) => {
    const views = new Map([
      [2001, {
        title: '焦糖褐色外套开箱',
        desc: 'desc-1',
        owner: { mid: 123456, name: '大山', face: 'https://example.com/1.png' },
        pinned_reply: null,
      }],
      [2002, {
        title: '深夜歌单',
        desc: 'desc-2',
        owner: { mid: 987654, name: '歌单号', face: 'https://example.com/2.png' },
        pinned_reply: null,
      }],
    ]);

    const firstRunEvents = [];
    const firstRunViewCalls = [];
    const firstRunFetchCalls = [];
    const firstRunClient = createMsgfeedClient({
      pages: [
        {
          cursor: null,
          replies: [
            {
              source_id: 1001,
              source_content: null,
              business_id: 2001,
              title: '焦糖褐色外套开箱',
              reply_content: '链接上了！https://shop.example/1',
              mid_replier: 123456,
              replier_name: '大山',
              like_count: 42,
              is_up: true,
              is_top: false,
              rpid: 5001,
              occurred_at: '2026-04-21T11:00:00+08:00',
            },
            {
              source_id: 1002,
              source_content: '蹲 BGM',
              business_id: 2002,
              title: '深夜歌单',
              reply_content: 'BGM 是陈粒 - 芳草地',
              mid_replier: 654321,
              replier_name: '网友A',
              like_count: 520,
              is_up: false,
              is_top: false,
              rpid: 5002,
              occurred_at: '2026-04-21T11:05:00+08:00',
            },
          ],
          hasMore: true,
          nextCursor: 'cursor-2',
        },
        {
          cursor: 'cursor-2',
          replies: [
            {
              source_id: 1002,
              source_content: '蹲 BGM',
              business_id: 2002,
              title: '深夜歌单',
              reply_content: 'BGM 是陈粒 - 芳草地',
              mid_replier: 654321,
              replier_name: '网友A',
              like_count: 520,
              is_up: false,
              is_top: false,
              rpid: 5002,
              occurred_at: '2026-04-21T11:05:00+08:00',
            },
          ],
          hasMore: false,
          nextCursor: null,
        },
      ],
      views,
      viewCalls: firstRunViewCalls,
      fetchCalls: firstRunFetchCalls,
    });

    const firstRun = await backfillOnce({
      sessdata: 'SESSDATA_VALUE',
      db,
      client: firstRunClient,
      broadcast: (type, payload) => firstRunEvents.push({ type, payload }),
    });

    assert.equal(firstRun.ok, true);
    assert.equal(firstRun.totalSignals, 2);
    assert.equal(firstRun.totalActions, 2);
    assert.equal(firstRun.totalCards, 0);
    assert.deepEqual(firstRunViewCalls, [2001, 2002]);
    assert.deepEqual(firstRunFetchCalls, [null, 'cursor-2']);
    assert.equal(
      db.prepare('SELECT raw_text FROM intent_signals WHERE rpid = ?').get(1001).raw_text,
      '(待补)',
    );
    assert.equal(
      db.prepare('SELECT COUNT(*) AS c FROM creator_actions WHERE rpid = ?').get(5002).c,
      1,
    );

    const firstProgress = firstRunEvents
      .filter((event) => event.type === BACKFILL_EVENTS.PROGRESS)
      .map((event) => event.payload.current);
    assert.deepEqual(firstProgress, [1, 2]);
    assert.ok(firstProgress.every((current, index, values) => (
      index === 0 || values[index - 1] <= current
    )));
    assert.equal(firstRunEvents.at(-1).type, BACKFILL_EVENTS.DONE);

    const countsAfterFirstRun = {
      signals: countRows(db, 'intent_signals'),
      actions: countRows(db, 'creator_actions'),
    };

    const secondRunEvents = [];
    const secondRunViewCalls = [];
    const secondRunFetchCalls = [];
    const secondRunClient = createMsgfeedClient({
      pages: [
        {
          cursor: null,
          replies: [
            {
              source_id: 1001,
              source_content: null,
              business_id: 2001,
              title: '焦糖褐色外套开箱',
              reply_content: '链接上了！https://shop.example/1',
              mid_replier: 123456,
              replier_name: '大山',
              like_count: 42,
              is_up: true,
              is_top: false,
              rpid: 5001,
              occurred_at: '2026-04-21T11:00:00+08:00',
            },
          ],
          hasMore: true,
          nextCursor: 'cursor-2',
        },
        {
          cursor: 'cursor-2',
          replies: [
            {
              source_id: 1002,
              source_content: '蹲 BGM',
              business_id: 2002,
              title: '深夜歌单',
              reply_content: 'BGM 是陈粒 - 芳草地',
              mid_replier: 654321,
              replier_name: '网友A',
              like_count: 520,
              is_up: false,
              is_top: false,
              rpid: 5002,
              occurred_at: '2026-04-21T11:05:00+08:00',
            },
          ],
          hasMore: true,
          nextCursor: 'cursor-3',
        },
        {
          cursor: 'cursor-3',
          replies: [
            {
              source_id: 9999,
              source_content: '不该被取到',
              business_id: 2002,
              title: '不应继续分页',
              reply_content: '这页不该被访问',
              mid_replier: 654321,
              replier_name: '网友A',
              like_count: 1,
              is_up: false,
              is_top: false,
              rpid: 5999,
              occurred_at: '2026-04-21T11:06:00+08:00',
            },
          ],
          hasMore: false,
          nextCursor: null,
        },
      ],
      views,
      viewCalls: secondRunViewCalls,
      fetchCalls: secondRunFetchCalls,
    });

    const secondRun = await backfillOnce({
      sessdata: 'SESSDATA_VALUE',
      db,
      client: secondRunClient,
      broadcast: (type, payload) => secondRunEvents.push({ type, payload }),
    });

    assert.equal(secondRun.ok, true);
    assert.equal(secondRun.totalSignals, 0);
    assert.equal(secondRun.totalActions, 0);
    assert.deepEqual(secondRunFetchCalls, [null, 'cursor-2']);

    const secondProgress = secondRunEvents
      .filter((event) => event.type === BACKFILL_EVENTS.PROGRESS)
      .map((event) => event.payload.current);
    assert.deepEqual(secondProgress, [1, 2]);
    assert.ok(secondProgress.every((current, index, values) => (
      index === 0 || values[index - 1] <= current
    )));
    assert.equal(secondRunEvents.at(-1).type, BACKFILL_EVENTS.DONE);

    assert.deepEqual(
      {
        signals: countRows(db, 'intent_signals'),
        actions: countRows(db, 'creator_actions'),
      },
      countsAfterFirstRun,
    );
  });
});

await runCase('backfillOnce triggers ambient for newly discovered topics before backfill.done', async () => {
  await withDb(async (db) => {
    const timeline = [];
    const client = createMsgfeedClient({
      pages: [
        {
          cursor: null,
          replies: [
            {
              source_id: 1001,
              source_content: '蹲链接',
              business_id: 2001,
              title: '焦糖褐色外套开箱',
              reply_content: '链接上了！https://shop.example/1',
              mid_replier: 123456,
              replier_name: '大山',
              like_count: 42,
              is_up: true,
              is_top: false,
              rpid: 5001,
              occurred_at: '2026-04-21T11:00:00+08:00',
            },
          ],
          hasMore: false,
          nextCursor: null,
        },
      ],
      views: new Map([
        [2001, {
          title: '焦糖褐色外套开箱',
          desc: 'desc-1',
          owner: { mid: 123456, name: '大山', face: 'https://example.com/1.png' },
          pinned_reply: null,
        }],
      ]),
      viewCalls: [],
      fetchCalls: [],
    });

    const result = await backfillOnce({
      sessdata: 'SESSDATA_VALUE',
      db,
      client,
      broadcast: (type, payload) => timeline.push({ kind: 'broadcast', type, payload }),
      triggerAmbient: ({ userId, topic }) => timeline.push({ kind: 'ambient', userId, topic }),
    });

    assert.equal(result.ok, true);
    const ambientEvent = timeline.find((entry) => entry.kind === 'ambient');
    const doneEvent = timeline.findLast((entry) => entry.kind === 'broadcast' && entry.type === BACKFILL_EVENTS.DONE);
    assert.deepEqual(ambientEvent, {
      kind: 'ambient',
      userId: 'demo-user',
      topic: 'bilibili:aid:2001',
    });
    assert.ok(timeline.indexOf(ambientEvent) < timeline.indexOf(doneEvent));
  });
});

await runCase('POST /api/backfill/start is async, /status reports progress, and concurrent start returns 409', async () => {
  const deferred = createDeferred();
  const events = [];
  let runCalls = 0;

  const router = buildHistoryBackfillRouter({
    db: {},
    createRunId: () => 'backfill-run-1',
    createClient: () => ({}),
    broadcast: (type, payload) => events.push({ type, payload }),
    runBackfill: async ({ sessdata, broadcast }) => {
      runCalls += 1;
      assert.equal(sessdata, 'COOKIE_VALUE');
      broadcast(BACKFILL_EVENTS.PROGRESS, {
        stage: 'fetch_page',
        current: 1,
        total: null,
        hint: 'cursor=start items=2',
      });
      await deferred.promise;
      broadcast(BACKFILL_EVENTS.DONE, {
        total_signals: 2,
        total_actions: 2,
        total_cards: 0,
      });
      return {
        ok: true,
        totalSignals: 2,
        totalActions: 2,
        totalCards: 0,
      };
    },
  });

  await withServer(router, async (baseUrl) => {
    const [firstResponse, secondResponse] = await Promise.all([
      fetch(`${baseUrl}/api/backfill/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessdata: 'COOKIE_VALUE' }),
      }),
      fetch(`${baseUrl}/api/backfill/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessdata: 'COOKIE_VALUE' }),
      }),
    ]);

    const firstJson = await firstResponse.json();
    const secondJson = await secondResponse.json();
    const payloads = [
      { status: firstResponse.status, json: firstJson },
      { status: secondResponse.status, json: secondJson },
    ];

    const success = payloads.find((item) => item.status === 200);
    const conflict = payloads.find((item) => item.status === 409);

    assert.ok(success);
    assert.ok(conflict);
    assert.deepEqual(success.json, { ok: true, runId: 'backfill-run-1' });
    assert.deepEqual(conflict.json, { ok: false, reason: 'backfill_in_progress' });
    assert.equal(runCalls, 1);

    const activeStatusResponse = await fetch(`${baseUrl}/api/backfill/status`);
    assert.equal(activeStatusResponse.status, 200);
    const activeStatus = await activeStatusResponse.json();
    assert.equal(activeStatus.ok, true);
    assert.equal(activeStatus.active, true);
    assert.equal(activeStatus.runId, 'backfill-run-1');
    assert.equal(activeStatus.progress.current, 1);

    deferred.resolve();

    const doneStatus = await waitFor(async () => {
      const response = await fetch(`${baseUrl}/api/backfill/status`);
      const json = await response.json();
      return json.active === false ? json : null;
    });

    assert.equal(doneStatus.runId, 'backfill-run-1');
    assert.equal(doneStatus.result.totalSignals, 2);
    assert.equal(doneStatus.result.totalActions, 2);
    assert.equal(doneStatus.result.totalCards, 0);
    assert.equal(events.at(-1).type, BACKFILL_EVENTS.DONE);
  });
});

if (process.exitCode) {
  console.error('\n🔥 historyBackfill tests failed');
  process.exit(process.exitCode);
} else {
  console.log('\n🎉 historyBackfill tests green');
}
