import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { DB_PATH } from './db.js';
import { createLogger } from './logger.js';

const log = createLogger('migrate');
const __dirname = dirname(fileURLToPath(import.meta.url));

export const MIGRATIONS_DIR = resolve(__dirname, '../data/migrations');

function parseVersion(filename) {
  const match = /^(\d+)_.*\.sql$/.exec(filename);
  if (!match) {
    throw new Error(`invalid migration filename: ${filename}`);
  }
  return Number(match[1]);
}

export function listMigrationFiles(migrationsDir = MIGRATIONS_DIR) {
  if (!existsSync(migrationsDir)) {
    throw new Error(`migrations directory not found: ${migrationsDir}`);
  }

  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => ({
      filename: entry.name,
      version: parseVersion(entry.name),
      filePath: resolve(migrationsDir, entry.name),
    }))
    .sort((a, b) => a.version - b.version)
    .map((item) => {
      const sql = readFileSync(item.filePath, 'utf8');
      return {
        filename: item.filename,
        version: item.version,
        filePath: item.filePath,
        sql,
      };
    });
}

export function applyMigrations({ dbPath = DB_PATH, migrationsDir = MIGRATIONS_DIR, db = null } = {}) {
  const ownedDb = !db;
  const conn = db ?? new Database(dbPath);
  const applied = [];

  try {
    mkdirSync(dirname(dbPath), { recursive: true });
    conn.pragma('foreign_keys = ON');
    conn.pragma('journal_mode = WAL');

    const currentVersion = Number(conn.pragma('user_version', { simple: true }) ?? 0);
    const pending = listMigrationFiles(migrationsDir).filter((item) => item.version > currentVersion);

    const runPending = conn.transaction((migrations) => {
      for (const migration of migrations) {
        conn.exec(migration.sql);
        const observedVersion = Number(conn.pragma('user_version', { simple: true }) ?? 0);
        if (observedVersion !== migration.version) {
          throw new Error(
            `migration ${migration.filename} did not bump user_version to ${migration.version} (got ${observedVersion})`,
          );
        }
        applied.push(migration.filename);
      }
    });

    runPending(pending);
    log.info('migrations applied', {
      db_path: dbPath,
      from: currentVersion,
      to: Number(conn.pragma('user_version', { simple: true }) ?? 0),
      applied,
    });

    return { dbPath, currentVersion, applied };
  } finally {
    if (ownedDb) {
      conn.close();
    }
  }
}

export function main() {
  const result = applyMigrations();
  log.info('migrate complete', result);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main();
}
