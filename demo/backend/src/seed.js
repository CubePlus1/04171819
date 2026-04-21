import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DB_PATH, getDb, runSchema, closeDb } from './db.js';
import { applyMigrations } from './migrate.js';
import { createLogger } from './logger.js';

const log = createLogger('seed');
const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = resolve(__dirname, '../data/fixtures.json');

function daysAgoIso(days) {
  const d = new Date(Date.now() - days * 86400_000);
  return d.toISOString();
}

function hoursAgoIso(hours) {
  const d = new Date(Date.now() - hours * 3600_000);
  return d.toISOString();
}

export function seed({ db = getDb(), fixturesPath = FIXTURES_PATH } = {}) {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  runSchema(db);
  applyMigrations({ db });

  const fixtures = JSON.parse(readFileSync(fixturesPath, 'utf8'));

  const tx = db.transaction(() => {
    db.exec(`
      DELETE FROM cards;
      DELETE FROM creator_actions;
      DELETE FROM intent_signals;
      DELETE FROM creators;
      DELETE FROM users;
    `);

    const insertUser = db.prepare(`
      INSERT INTO users (id, nickname, avatar)
      VALUES (@id, @nickname, @avatar)
    `);
    for (const u of fixtures.users) insertUser.run(u);

    const insertCreator = db.prepare(`
      INSERT INTO creators (id, handle, display, avatar, bio)
      VALUES (@id, @handle, @display, @avatar, @bio)
    `);
    for (const c of fixtures.creators) insertCreator.run(c);

    const insertSignal = db.prepare(`
      INSERT INTO intent_signals
        (user_id, creator_id, video_id, video_title,
         signal_type, raw_text, topic, occurred_at, fulfilled)
      VALUES
        (@user_id, @creator_id, @video_id, @video_title,
         @signal_type, @raw_text, @topic, @occurred_at, 0)
    `);
    for (const s of fixtures.intent_signals) {
      insertSignal.run({
        ...s,
        occurred_at: daysAgoIso(s.days_ago),
      });
    }

    const insertAction = db.prepare(`
      INSERT INTO creator_actions
        (creator_id, action_type, payload_json, topic, occurred_at, replying_to_rpid, is_answer, source)
      VALUES
        (@creator_id, @action_type, @payload_json, @topic, @occurred_at, @replying_to_rpid, @is_answer, @source)
    `);
    for (const a of fixtures.creator_actions) {
      insertAction.run({
        creator_id: a.creator_id,
        action_type: a.action_type,
        payload_json: JSON.stringify(a.payload),
        topic: a.topic,
        occurred_at: hoursAgoIso(a.hours_ago),
        replying_to_rpid: a.replying_to_rpid ?? null,
        is_answer: a.is_answer ?? 1,
        source: a.source ?? 'mock',
      });
    }
  });

  tx();

  const stats = {
    users:       db.prepare('SELECT COUNT(*) AS c FROM users').get().c,
    creators:    db.prepare('SELECT COUNT(*) AS c FROM creators').get().c,
    signals:     db.prepare('SELECT COUNT(*) AS c FROM intent_signals').get().c,
    actions:     db.prepare('SELECT COUNT(*) AS c FROM creator_actions').get().c,
  };
  log.info('seed complete', stats);
  return stats;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    seed();
  } finally {
    closeDb();
  }
}
