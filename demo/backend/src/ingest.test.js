import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import express from 'express';
import { runSchema } from './db.js';
import { applyMigrations } from './migrate.js';
import { buildIngestRouter, INGEST_EVENTS } from './ingest.js';

const DEMO_USER_ID = 'demo-user';

function runCase(label, fn) {
  return fn()
    .then(() => console.log('✅', label))
    .catch((err) => {
      console.error('❌', label, '\n   →', err.message);
      process.exitCode = 1;
    });
}

async function withServer(run, routerOptions = {}) {
  const tempDir = mkdtempSync(join(tmpdir(), 'dundao-ingest-'));
  const dbPath = join(tempDir, 'test.db');
  const db = new Database(dbPath);
  const events = [];

  runSchema(db);
  applyMigrations({ db });
  db.prepare(`
    INSERT INTO users (id, nickname, avatar)
    VALUES (?, ?, ?)
  `).run(DEMO_USER_ID, 'Demo User', 'https://example.com/user.png');

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use((err, _req, res, next) => {
    if (err && (err.type === 'entity.parse.failed' || err.type === 'entity.too.large')) {
      const status = err.status || (err.type === 'entity.too.large' ? 413 : 400);
      return res.status(status).json({ ok: false, error: err.type });
    }
    return next(err);
  });
  const resolvedRouterOptions = typeof routerOptions === 'function'
    ? routerOptions({ db, events })
    : routerOptions;

  app.use('/api', buildIngestRouter({
    db,
    broadcast: (type, payload) => events.push({ type, payload }),
    ...resolvedRouterOptions,
  }));

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('failed to resolve server address');
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run({ baseUrl, db, events });
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function postJson(baseUrl, path, body) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function buildCommentPayload(overrides = {}) {
  return {
    aid: 112233445566,
    rpid: 99887766,
    parent_rpid: null,
    content: '蹲链接',
    video_title: '焦糖褐色外套开箱',
    target_creator_mid: 123456,
    target_creator_name: '大山',
    target_creator_avatar: 'https://example.com/avatar.png',
    occurred_at: '2026-04-21T10:30:00+08:00',
    ...overrides,
  };
}

function buildReplyPayload(overrides = {}) {
  return {
    source: 'L1',
    replying_to_rpid: 99887766,
    rpid: 99887800,
    replier_mid: 123456,
    replier_name: '大山',
    content: '链接上了！https://shop.example/item',
    like_count: 42,
    is_up: true,
    is_top: false,
    aid: 112233445566,
    occurred_at: '2026-04-21T11:00:00+08:00',
    ...overrides,
  };
}

await runCase('POST /api/ingest/comment inserts signal and round-trips via /api/my-comments', async () => {
  await withServer(async ({ baseUrl, db, events }) => {
    const response = await postJson(baseUrl, '/api/ingest/comment', buildCommentPayload());

    assert.equal(response.status, 200);
    const json = await response.json();
    assert.equal(json.ok, true);

    const row = db.prepare('SELECT * FROM intent_signals WHERE rpid = ?').get(99887766);
    assert.equal(row.aid, 112233445566);
    assert.equal(row.source, 'hook');
    assert.equal(events[0].type, INGEST_EVENTS.SIGNAL_INGESTED);

    const comments = await fetch(`${baseUrl}/api/my-comments`);
    assert.equal(comments.status, 200);
    const commentsJson = await comments.json();
    assert.equal(commentsJson.total, 1);
    assert.equal(commentsJson.fulfilled, 0);
    assert.equal(commentsJson.pending, 1);
    assert.equal(commentsJson.items[0].video_title, '焦糖褐色外套开箱');
    assert.equal(commentsJson.items[0].content, '蹲链接');
  });
});

await runCase('GET /api/my-comments excludes mock and non-comment signals', async () => {
  await withServer(async ({ baseUrl, db }) => {
    await postJson(baseUrl, '/api/ingest/comment', buildCommentPayload());

    db.prepare(`
      INSERT INTO intent_signals (
        user_id, creator_id, video_id, video_title, signal_type,
        raw_text, topic, occurred_at, fulfilled, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(
      DEMO_USER_ID,
      '123456',
      'video-mock',
      'Mock 视频',
      'comment_intent',
      '旧 mock 信号',
      'bilibili:aid:9988',
      '2026-04-01T00:00:00.000Z',
      'mock',
    );
    db.prepare(`
      INSERT INTO intent_signals (
        user_id, creator_id, video_id, video_title, signal_type,
        raw_text, topic, occurred_at, fulfilled, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(
      DEMO_USER_ID,
      '123456',
      'video-watch',
      '稍后再看视频',
      'watch_later',
      '回头看',
      'bilibili:aid:9989',
      '2026-04-01T00:00:00.000Z',
      'hook',
    );

    const response = await fetch(`${baseUrl}/api/my-comments`);
    assert.equal(response.status, 200);
    const json = await response.json();
    assert.equal(json.total, 1);
    assert.equal(json.items.length, 1);
    assert.equal(json.items[0].content, '蹲链接');
  });
});

await runCase('POST /api/ingest/comment returns 409 on duplicate rpid', async () => {
  await withServer(async ({ baseUrl, db }) => {
    await postJson(baseUrl, '/api/ingest/comment', buildCommentPayload());

    const duplicate = await postJson(baseUrl, '/api/ingest/comment', buildCommentPayload());

    assert.equal(duplicate.status, 409);
    assert.deepEqual(await duplicate.json(), { ok: false, reason: 'duplicate_rpid' });
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM intent_signals WHERE rpid = ?').get(99887766).c, 1);
  });
});

await runCase('POST /api/ingest/comment upgrades backfill placeholder raw_text instead of 409 duplicate', async () => {
  await withServer(async ({ baseUrl, db, events }) => {
    db.prepare(`
      INSERT INTO creators (id, handle, display, avatar, bio)
      VALUES (?, ?, ?, ?, ?)
    `).run('123456', '大山', '大山', 'https://example.com/avatar.png', null);
    const existing = db.prepare(`
      INSERT INTO intent_signals (
        user_id, creator_id, video_id, video_title, signal_type,
        raw_text, topic, occurred_at, fulfilled, aid, rpid, parent_rpid, source
      ) VALUES (?, ?, ?, ?, 'comment_intent', ?, ?, ?, 0, ?, ?, NULL, 'backfill')
    `).run(
      DEMO_USER_ID,
      '123456',
      '112233445566',
      '焦糖褐色外套开箱',
      '(待补)',
      'bilibili:aid:112233445566',
      '2026-04-21T10:20:00+08:00',
      112233445566,
      99887766,
    );

    const response = await postJson(baseUrl, '/api/ingest/comment', buildCommentPayload({
      content: '真实评论补回来了',
    }));

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      signal_id: existing.lastInsertRowid,
      updated: true,
    });
    assert.equal(
      db.prepare('SELECT raw_text FROM intent_signals WHERE rpid = ?').get(99887766).raw_text,
      '真实评论补回来了',
    );
    assert.equal(events.length, 0);
  });
});

await runCase('POST /api/ingest/reply inserts action, judges it, and emits ws event', async () => {
  await withServer(async ({ baseUrl, db, events }) => {
    await postJson(baseUrl, '/api/ingest/comment', buildCommentPayload());

    const response = await postJson(baseUrl, '/api/ingest/reply', buildReplyPayload());

    assert.equal(response.status, 200);
    const json = await response.json();
    assert.equal(json.is_answer, true);
    assert.match(json.judge_reason, /\+up/);

    const row = db.prepare('SELECT * FROM creator_actions WHERE rpid = ?').get(99887800);
    assert.equal(row.source, 'L1');
    assert.equal(row.replying_to_rpid, 99887766);
    assert.equal(row.is_answer, 1);
    assert.equal(row.confidence, json.confidence);
    assert.equal(events.at(-1).type, INGEST_EVENTS.ACTION_INGESTED);
  });
});

await runCase('GET /api/my-comments marks fulfilled by answer state and keeps card_id separate', async () => {
  await withServer(async ({ baseUrl }) => {
    await postJson(baseUrl, '/api/ingest/comment', buildCommentPayload());
    await postJson(baseUrl, '/api/ingest/reply', buildReplyPayload());

    const response = await fetch(`${baseUrl}/api/my-comments?filter=fulfilled`);
    assert.equal(response.status, 200);
    const json = await response.json();
    assert.equal(json.total, 1);
    assert.equal(json.fulfilled, 1);
    assert.equal(json.pending, 0);
    assert.equal(json.items.length, 1);
    assert.equal(json.items[0].fulfilled, 1);
    assert.equal(json.items[0].card_id, null);
    assert.match(json.items[0].top_answer.content, /链接上了/u);
  });
});

await runCase('POST /api/ingest/reply fires ambient for answers and surfaces workflow/card broadcasts', async () => {
  const ambientCalls = [];
  await withServer(async ({ baseUrl, events }) => {
    await postJson(baseUrl, '/api/ingest/comment', buildCommentPayload());

    const response = await postJson(baseUrl, '/api/ingest/reply', buildReplyPayload());

    assert.equal(response.status, 200);
    assert.deepEqual(ambientCalls, [
      { userId: DEMO_USER_ID, topic: 'bilibili:aid:112233445566' },
    ]);
    assert.ok(events.some((event) => event.type === 'workflow.begin'));
    assert.ok(events.some((event) => event.type === 'card.generated'));
  }, ({ events }) => ({
    triggerAmbient: ({ userId, topic }) => {
      ambientCalls.push({ userId, topic });
      events.push({ type: 'workflow.begin', payload: { ambient: true, topic } });
      events.push({ type: 'card.generated', payload: { card: { id: 'card-auto-1' } } });
    },
  }));
});

await runCase('POST /api/ingest/top-reply ingests batch and counts answers', async () => {
  await withServer(async ({ baseUrl, db }) => {
    await postJson(baseUrl, '/api/ingest/comment', buildCommentPayload({ content: '蹲 BGM' }));

    const response = await postJson(baseUrl, '/api/ingest/top-reply', {
      source: 'L2',
      aid: 112233445566,
      batch: [
        {
          rpid: 99887801,
          replier_mid: 654321,
          replier_name: '网友A',
          content: 'BGM 是陈粒 - 芳草地',
          like_count: 520,
          is_up: false,
          is_top: false,
          occurred_at: '2026-04-21T11:05:00+08:00',
        },
        {
          rpid: 99887802,
          replier_mid: 654322,
          replier_name: '网友B',
          content: '+1 蹲',
          like_count: 1,
          is_up: false,
          is_top: false,
          occurred_at: '2026-04-21T11:06:00+08:00',
        },
      ],
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, ingested: 2, answers: 1 });
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM creator_actions').get().c, 2);
  });
});

await runCase('POST /api/ingest/top-reply triggers ambient once per answer topic', async () => {
  const ambientCalls = [];
  await withServer(async ({ baseUrl }) => {
    await postJson(baseUrl, '/api/ingest/comment', buildCommentPayload({ content: '蹲 BGM' }));

    const response = await postJson(baseUrl, '/api/ingest/top-reply', {
      source: 'L2',
      aid: 112233445566,
      batch: [
        {
          rpid: 99887801,
          replier_mid: 654321,
          replier_name: '网友A',
          content: 'BGM 是陈粒 - 芳草地',
          like_count: 520,
          is_up: false,
          is_top: false,
          occurred_at: '2026-04-21T11:05:00+08:00',
        },
        {
          rpid: 99887803,
          replier_mid: 654323,
          replier_name: '网友C',
          content: '这里也有完整歌单',
          like_count: 88,
          is_up: false,
          is_top: false,
          occurred_at: '2026-04-21T11:07:00+08:00',
        },
      ],
    });

    assert.equal(response.status, 200);
    assert.deepEqual(ambientCalls, [
      { userId: DEMO_USER_ID, topic: 'bilibili:aid:112233445566' },
    ]);
  }, {
    triggerAmbient: ({ userId, topic }) => {
      ambientCalls.push({ userId, topic });
    },
  });
});

await runCase('GET /api/marks returns fulfilled and missing comment states', async () => {
  await withServer(async ({ baseUrl, db }) => {
    await postJson(baseUrl, '/api/ingest/comment', buildCommentPayload());
    await postJson(baseUrl, '/api/ingest/reply', buildReplyPayload());

    const signalId = db.prepare('SELECT id FROM intent_signals WHERE rpid = ?').get(99887766).id;
    const actionId = db.prepare('SELECT id FROM creator_actions WHERE rpid = ?').get(99887800).id;
    db.prepare('UPDATE intent_signals SET fulfilled = 1 WHERE id = ?').run(signalId);
    db.prepare(`
      INSERT INTO cards (id, user_id, script_id, intent_signal_id, creator_action_id, pages_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('card_demo_1', DEMO_USER_ID, 'A', signalId, actionId, '[]');

    const marks = await fetch(`${baseUrl}/api/marks?rpids=99887766,99887767`);
    assert.equal(marks.status, 200);
    const marksJson = await marks.json();
    assert.deepEqual(marksJson.marks['99887766'], {
      has_my_comment: true,
      fulfilled: true,
      card_id: 'card_demo_1',
    });
    assert.deepEqual(marksJson.marks['99887767'], {
      has_my_comment: false,
    });
  });
});

await runCase('POST /api/ingest/comment rejects payloads larger than 1MB', async () => {
  await withServer(async ({ baseUrl }) => {
    const largeComment = buildCommentPayload({
      rpid: 99887799,
      content: 'x'.repeat((1024 * 1024) + 64),
    });

    const response = await postJson(baseUrl, '/api/ingest/comment', largeComment);
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { ok: false, error: 'entity.too.large' });
  });
});

if (process.exitCode) {
  console.error('\n🔥 ingest tests failed');
  process.exit(process.exitCode);
} else {
  console.log('\n🎉 ingest tests green');
}
