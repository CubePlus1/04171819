import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { seed } from './seed.js';
import { hasPendingAmbient } from './ambient.js';

function runCase(label, fn) {
  return fn()
    .then(() => console.log('✅', label))
    .catch((err) => {
      console.error('❌', label, '\n   →', err.message);
      process.exitCode = 1;
    });
}

async function withDb(run) {
  const tempDir = mkdtempSync(join(tmpdir(), 'dundao-seed-'));
  const dbPath = join(tempDir, 'seed.db');
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');

  try {
    await run(db);
  } finally {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
}

await runCase('seed migrates fixtures to v3 and keeps mock ambient pending', async () => {
  await withDb(async (db) => {
    seed({ db });

    assert.equal(db.pragma('user_version', { simple: true }), 3);
    const action = db.prepare(`
      SELECT is_answer, source, replying_to_rpid
        FROM creator_actions
       ORDER BY id ASC
       LIMIT 1
    `).get();
    assert.deepEqual(action, {
      is_answer: 1,
      source: 'mock',
      replying_to_rpid: null,
    });
    assert.equal(hasPendingAmbient('demo-user', { db }), true);
  });
});

if (process.exitCode) {
  console.error('\n🔥 seed tests failed');
  process.exit(process.exitCode);
} else {
  console.log('\n🎉 seed tests green');
}
