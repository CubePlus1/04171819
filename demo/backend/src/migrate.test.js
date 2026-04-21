import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { applyMigrations, listMigrationFiles } from './migrate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '../data/migrations');

function withTempDb(run) {
  const tempDir = mkdtempSync(join(tmpdir(), 'dundao-migrate-'));
  const dbPath = join(tempDir, 'test.db');
  try {
    run(dbPath);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function tableColumns(db, tableName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all().map((row) => row.name);
}

function indexNames(db, tableName) {
  return db.prepare(`PRAGMA index_list(${tableName})`).all().map((row) => row.name);
}

function runCase(label, fn) {
  try {
    fn();
    console.log('✅', label);
  } catch (err) {
    console.error('❌', label, '\n   →', err.message);
    process.exitCode = 1;
  }
}

runCase('listMigrationFiles sorts 001 -> 003', () => {
  const files = listMigrationFiles(MIGRATIONS_DIR);
  assert.deepEqual(
    files.map((item) => item.filename),
    ['001_initial.sql', '002_bilibili_fields.sql', '003_topic_unique.sql'],
  );
});

runCase('applyMigrations upgrades a fresh db to user_version 3', () => {
  withTempDb((dbPath) => {
    const result = applyMigrations({ dbPath, migrationsDir: MIGRATIONS_DIR });
    assert.equal(result.currentVersion, 0);
    assert.deepEqual(result.applied, ['001_initial.sql', '002_bilibili_fields.sql', '003_topic_unique.sql']);

    const db = new Database(dbPath, { readonly: true });
    try {
      assert.equal(db.pragma('user_version', { simple: true }), 3);

      const intentColumns = tableColumns(db, 'intent_signals');
      assert.ok(intentColumns.includes('aid'));
      assert.ok(intentColumns.includes('rpid'));
      assert.ok(intentColumns.includes('parent_rpid'));
      assert.ok(intentColumns.includes('source'));

      const actionColumns = tableColumns(db, 'creator_actions');
      assert.ok(actionColumns.includes('rpid'));
      assert.ok(actionColumns.includes('replying_to_rpid'));
      assert.ok(actionColumns.includes('is_answer'));
      assert.ok(actionColumns.includes('confidence'));
      assert.ok(actionColumns.includes('judge_reason'));
      assert.ok(actionColumns.includes('source'));

      assert.ok(indexNames(db, 'intent_signals').includes('idx_intent_rpid'));
      assert.ok(indexNames(db, 'creator_actions').includes('idx_action_rpid'));
      assert.ok(tableColumns(db, 'cards').includes('topic'));
      assert.ok(indexNames(db, 'cards').includes('idx_cards_user_topic'));
    } finally {
      db.close();
    }
  });
});

runCase('applyMigrations is idempotent after user_version 3', () => {
  withTempDb((dbPath) => {
    applyMigrations({ dbPath, migrationsDir: MIGRATIONS_DIR });
    const rerun = applyMigrations({ dbPath, migrationsDir: MIGRATIONS_DIR });
    assert.equal(rerun.currentVersion, 3);
    assert.deepEqual(rerun.applied, []);
  });
});

if (process.exitCode) {
  console.error('\n🔥 migrate tests failed');
  process.exit(process.exitCode);
} else {
  console.log('\n🎉 migrate tests green');
}
