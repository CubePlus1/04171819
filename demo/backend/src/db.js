import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { createLogger } from './logger.js';

const log = createLogger('db');
const __dirname = dirname(fileURLToPath(import.meta.url));

export const DB_PATH = resolve(__dirname, '../data/dundao.db');
const SCHEMA_PATH = resolve(__dirname, '../data/schema.sql');

let dbInstance = null;

export function getDb() {
  if (dbInstance) return dbInstance;
  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  dbInstance = db;
  return db;
}

export function runSchema(db = getDb()) {
  const sql = readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(sql);
  log.info('schema applied', { path: SCHEMA_PATH });
}

export function closeDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
