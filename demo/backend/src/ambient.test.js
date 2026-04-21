import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { runSchema } from './db.js';
import { applyMigrations } from './migrate.js';
import { runAmbient } from './ambient.js';

function runCase(label, fn) {
  return fn()
    .then(() => console.log('✅', label))
    .catch((err) => {
      console.error('❌', label, '\n   →', err.message);
      process.exitCode = 1;
    });
}

async function withDb(run) {
  const tempDir = mkdtempSync(join(tmpdir(), 'dundao-ambient-'));
  const dbPath = join(tempDir, 'ambient.db');
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  runSchema(db);
  applyMigrations({ db });

  try {
    await run(db);
  } finally {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
}

await runCase('concurrent runAmbient dedupes cards at topic level across different signals', async () => {
  await withDb(async (db) => {
    db.prepare(`
      INSERT INTO users (id, nickname, avatar)
      VALUES ('demo-user', 'Demo User', NULL)
    `).run();
    db.prepare(`
      INSERT INTO creators (id, handle, display, avatar, bio)
      VALUES ('123456', '大山', '大山', NULL, NULL)
    `).run();

    const insertSignal = db.prepare(`
      INSERT INTO intent_signals (
        user_id, creator_id, video_id, video_title, signal_type,
        raw_text, topic, occurred_at, fulfilled, aid, rpid, source
      ) VALUES (?, ?, ?, ?, 'comment_intent', ?, ?, ?, 0, ?, ?, 'hook')
    `);
    const signalA = insertSignal.run(
      'demo-user',
      '123456',
      'video-a',
      '视频 A',
      '蹲链接 A',
      'bilibili:aid:112233',
      '2026-04-21T10:00:00+08:00',
      112233,
      7001,
    ).lastInsertRowid;
    const signalB = insertSignal.run(
      'demo-user',
      '123456',
      'video-b',
      '视频 B',
      '蹲链接 B',
      'bilibili:aid:112233',
      '2026-04-21T10:01:00+08:00',
      112233,
      7002,
    ).lastInsertRowid;

    db.prepare(`
      INSERT INTO creator_actions (
        creator_id, action_type, payload_json, topic, occurred_at, rpid,
        replying_to_rpid, is_answer, confidence, judge_reason, source
      ) VALUES (?, 'post_link', ?, ?, ?, ?, NULL, 1, 0.99, 'mock answer', 'mock')
    `).run(
      '123456',
      JSON.stringify({
        video_id: '112233',
        title: '链接来了',
        cover: null,
        summary: '你蹲的链接来了',
        headline: '我 {time} 蹲的那个收纳箱 · 它来了',
        emotional_close: '这次替你接住了',
      }),
      'bilibili:aid:112233',
      '2026-04-21T11:00:00+08:00',
      8001,
    );

    const [first, second] = await Promise.all([
      runAmbient({ db, userId: 'demo-user', signalId: Number(signalA), stepDelayMs: 0 }),
      runAmbient({ db, userId: 'demo-user', signalId: Number(signalB), stepDelayMs: 0 }),
    ]);

    const results = [first, second];
    assert.equal(results.filter((entry) => entry.ok).length, 1);
    assert.ok(results.some((entry) => entry.reason === 'signal-already-fulfilled'));
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM cards').get().c, 1);
  });
});

if (process.exitCode) {
  console.error('\n🔥 ambient tests failed');
  process.exit(process.exitCode);
} else {
  console.log('\n🎉 ambient tests green');
}
