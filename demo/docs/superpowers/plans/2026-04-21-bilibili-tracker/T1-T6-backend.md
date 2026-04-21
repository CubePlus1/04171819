# Bilibili Tracker v0.3.0 · Backend Sub-Plan (T1-T6)

> Parent plan: ../2026-04-21-bilibili-tracker.md
> Spec reference: ../../specs/2026-04-21-bilibili-tracker-design.md §5.2, §5.4, §6, §7.1

## Task T1: DB migration infrastructure + 002_bilibili_fields.sql
- Create: `demo/backend/data/migrations/001_initial.sql`
- Create: `demo/backend/data/migrations/002_bilibili_fields.sql`
- Create: `demo/backend/src/migrate.js`
- Create: `demo/backend/src/migrate.test.js`
- Modify: `demo/backend/package.json` (add `"migrate"` script)

- [ ] Step 1 Write failing test (`demo/backend/src/migrate.test.js`)

```js
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

runCase('listMigrationFiles sorts 001 -> 002', () => {
  const files = listMigrationFiles(MIGRATIONS_DIR);
  assert.deepEqual(
    files.map((item) => item.filename),
    ['001_initial.sql', '002_bilibili_fields.sql'],
  );
});

runCase('applyMigrations upgrades a fresh db to user_version 2', () => {
  withTempDb((dbPath) => {
    const result = applyMigrations({ dbPath, migrationsDir: MIGRATIONS_DIR });
    assert.equal(result.currentVersion, 0);
    assert.deepEqual(result.applied, ['001_initial.sql', '002_bilibili_fields.sql']);

    const db = new Database(dbPath, { readonly: true });
    try {
      assert.equal(db.pragma('user_version', { simple: true }), 2);

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
    } finally {
      db.close();
    }
  });
});

runCase('applyMigrations is idempotent after user_version 2', () => {
  withTempDb((dbPath) => {
    applyMigrations({ dbPath, migrationsDir: MIGRATIONS_DIR });
    const rerun = applyMigrations({ dbPath, migrationsDir: MIGRATIONS_DIR });
    assert.equal(rerun.currentVersion, 2);
    assert.deepEqual(rerun.applied, []);
  });
});

if (process.exitCode) {
  console.error('\n🔥 migrate tests failed');
  process.exit(process.exitCode);
} else {
  console.log('\n🎉 migrate tests green');
}
```

- [ ] Step 2 Run, expect fail

```bash
node demo/backend/src/migrate.test.js
```

Expected stderr:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/Users/sevencolor/code/0BKHDD/.worktrees/dundao-bilibili/demo/backend/src/migrate.js' imported from /Users/sevencolor/code/0BKHDD/.worktrees/dundao-bilibili/demo/backend/src/migrate.test.js
```

- [ ] Step 3 Write `demo/backend/data/migrations/001_initial.sql` (snapshot + `PRAGMA user_version = 1`)

```sql
-- 蹲到了 Demo · SQLite schema
-- 单演示用户 + 博主 + 信号 + 博主新动作 + 已生成卡片

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  nickname     TEXT NOT NULL,
  avatar       TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS creators (
  id           TEXT PRIMARY KEY,
  handle       TEXT NOT NULL,
  display      TEXT NOT NULL,
  avatar       TEXT,
  bio          TEXT
);

CREATE TABLE IF NOT EXISTS intent_signals (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT NOT NULL,
  creator_id      TEXT NOT NULL,
  video_id        TEXT NOT NULL,
  video_title     TEXT NOT NULL,
  signal_type     TEXT NOT NULL CHECK (signal_type IN (
    'comment_intent','watch_later','unfinished_save',
    'unsatisfied_search','passive_interest'
  )),
  raw_text        TEXT,
  topic           TEXT NOT NULL,
  occurred_at     TEXT NOT NULL,
  fulfilled       INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (creator_id) REFERENCES creators(id)
);

CREATE INDEX IF NOT EXISTS idx_intent_signals_user_topic
  ON intent_signals(user_id, topic, fulfilled, occurred_at);

CREATE TABLE IF NOT EXISTS creator_actions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  creator_id      TEXT NOT NULL,
  action_type     TEXT NOT NULL CHECK (action_type IN (
    'post_link','post_sequel','series_completed','reply_tutorial'
  )),
  payload_json    TEXT NOT NULL,
  topic           TEXT NOT NULL,
  occurred_at     TEXT NOT NULL,
  FOREIGN KEY (creator_id) REFERENCES creators(id)
);

CREATE INDEX IF NOT EXISTS idx_creator_actions_topic
  ON creator_actions(topic, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_creator_actions_type_time
  ON creator_actions(action_type, occurred_at DESC);

CREATE TABLE IF NOT EXISTS cards (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL,
  script_id         TEXT NOT NULL CHECK (script_id IN ('A','B','C')),
  intent_signal_id  INTEGER,
  creator_action_id INTEGER,
  pages_json        TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (intent_signal_id) REFERENCES intent_signals(id),
  FOREIGN KEY (creator_action_id) REFERENCES creator_actions(id)
);

CREATE INDEX IF NOT EXISTS idx_cards_user_created
  ON cards(user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_unique_signal
  ON cards(intent_signal_id);

PRAGMA user_version = 1;
```

- [ ] Step 4 Write `demo/backend/data/migrations/002_bilibili_fields.sql`

```sql
ALTER TABLE intent_signals ADD COLUMN aid INTEGER;
ALTER TABLE intent_signals ADD COLUMN rpid INTEGER;
ALTER TABLE intent_signals ADD COLUMN parent_rpid INTEGER;
ALTER TABLE intent_signals ADD COLUMN source TEXT DEFAULT 'mock';

CREATE UNIQUE INDEX IF NOT EXISTS idx_intent_rpid
  ON intent_signals(rpid)
  WHERE rpid IS NOT NULL;

ALTER TABLE creator_actions ADD COLUMN rpid INTEGER;
ALTER TABLE creator_actions ADD COLUMN replying_to_rpid INTEGER;
ALTER TABLE creator_actions ADD COLUMN is_answer INTEGER DEFAULT 0;
ALTER TABLE creator_actions ADD COLUMN confidence REAL DEFAULT 0;
ALTER TABLE creator_actions ADD COLUMN judge_reason TEXT;
ALTER TABLE creator_actions ADD COLUMN source TEXT DEFAULT 'mock';

CREATE UNIQUE INDEX IF NOT EXISTS idx_action_rpid
  ON creator_actions(rpid)
  WHERE rpid IS NOT NULL;

PRAGMA user_version = 2;
```

- [ ] Step 5 Write `demo/backend/src/migrate.js` (sorted migrations + `user_version` + atomic transaction)

```js
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
```

- [ ] Step 6 Add `"migrate"` script to `demo/backend/package.json`

```json
{
  "name": "dundao-backend",
  "version": "0.2.0",
  "private": true,
  "type": "module",
  "description": "蹲到了 Demo 后端：评论入栈 → 意图识别 → 匹配历史 → 入库 → 生成卡片",
  "main": "src/server.js",
  "scripts": {
    "dev": "DEMO_LOOP=1 node --watch src/server.js",
    "start": "node src/server.js",
    "start:loop": "DEMO_LOOP=1 node src/server.js",
    "db:seed": "node src/seed.js",
    "migrate": "node src/migrate.js",
    "smoke": "node src/smoke.js",
    "test": "node src/cardBuilder.test.js"
  },
  "dependencies": {
    "better-sqlite3": "^11.3.0",
    "cors": "^2.8.5",
    "express": "^4.21.0",
    "ws": "^8.18.0"
  }
}
```

- [ ] Step 7 Run test, expect pass

```bash
node demo/backend/src/migrate.test.js
```

Expected stdout:

```text
✅ listMigrationFiles sorts 001 -> 002
✅ applyMigrations upgrades a fresh db to user_version 2
✅ applyMigrations is idempotent after user_version 2

🎉 migrate tests green
```

- [ ] Step 8 Commit with HEREDOC subject + footer

```bash
git add \
  demo/backend/data/migrations/001_initial.sql \
  demo/backend/data/migrations/002_bilibili_fields.sql \
  demo/backend/src/migrate.js \
  demo/backend/src/migrate.test.js \
  demo/backend/package.json
git commit -F - <<'EOF'
feat(bilibili): T1·migrate DB 迁移基础设施 + 002_bilibili_fields.sql

建立 SQLite migration 基础设施，补上 001 schema snapshot、002 bilibili 字段扩展，
并通过 user_version 驱动幂等升级。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
```

## Task T2: `src/bilibili.js` (B 站 API client)
- Create: `demo/backend/src/bilibili.js`
- Create: `demo/backend/src/bilibili.test.js`

- [ ] Step 1 Write failing test (`demo/backend/src/bilibili.test.js`)

```js
import { strict as assert } from 'node:assert';
import { createBilibiliClient, RATE_LIMIT_MS } from './bilibili.js';

function createClock(start = 0) {
  let nowValue = start;
  const sleeps = [];
  return {
    now: () => nowValue,
    sleep: async (ms) => {
      sleeps.push(ms);
      nowValue += ms;
    },
    sleeps,
  };
}

function createResponse(json, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() {
      return json;
    },
  };
}

async function runCase(label, fn) {
  try {
    await fn();
    console.log('✅', label);
  } catch (err) {
    console.error('❌', label, '\n   →', err.message);
    process.exitCode = 1;
  }
}

await runCase('fetchMsgfeedReply sends SESSDATA cookie and normalizes cursor payload', async () => {
  const calls = [];
  const clock = createClock();
  const client = createBilibiliClient({
    fetchImpl: async (url, init) => {
      calls.push({ url, init, at: clock.now() });
      return createResponse({
        code: 0,
        data: {
          cursor: { is_end: false, next: 'cursor-2' },
          items: [{
            source_id: 99887766,
            source_content: '蹲 BGM',
            business_id: 112233,
            title: '深夜歌单',
            reply_content: 'BGM 是陈粒 - 芳草地',
            mid_replier: 654321,
            replier_name: '路人甲',
            like: 520,
            is_up: false,
            is_top: false,
            rpid: 900001,
            occurred_at: '2026-04-21T11:00:00+08:00',
          }],
        },
      });
    },
    now: clock.now,
    sleepImpl: clock.sleep,
  });

  const result = await client.fetchMsgfeedReply({ sessdata: 'COOKIE_VALUE', cursor: 'cursor-1', ps: 20 });
  assert.match(calls[0].url, /\/x\/msgfeed\/reply\?/);
  assert.match(calls[0].url, /cursor=cursor-1/);
  assert.equal(calls[0].init.headers.Cookie, 'SESSDATA=COOKIE_VALUE');
  assert.equal(result.hasMore, true);
  assert.equal(result.nextCursor, 'cursor-2');
  assert.equal(result.replies[0].source_id, 99887766);
  assert.equal(result.replies[0].like_count, 520);
});

await runCase('fetchVideoReplies normalizes hot replies', async () => {
  const client = createBilibiliClient({
    fetchImpl: async () => createResponse({
      code: 0,
      data: {
        page: { num: 1, size: 20 },
        replies: [{
          rpid: 700001,
          member: { mid: '123456', uname: '大山' },
          content: { message: '链接：旗舰店在这里' },
          like: 42,
          is_top: false,
          is_up: true,
          occurred_at: '2026-04-21T11:10:00+08:00',
        }],
      },
    }),
  });

  const result = await client.fetchVideoReplies({ aid: 112233, sort: 2, ps: 20 });
  assert.equal(result.page.num, 1);
  assert.equal(result.page.size, 20);
  assert.equal(result.replies[0].rpid, 700001);
  assert.equal(result.replies[0].replier_mid, 123456);
  assert.equal(result.replies[0].content, '链接：旗舰店在这里');
});

await runCase('fetchVideoView normalizes owner and pinned reply', async () => {
  const client = createBilibiliClient({
    fetchImpl: async () => createResponse({
      code: 0,
      data: {
        title: '焦糖褐色外套开箱',
        desc: '春装合集',
        owner: { mid: 123456, name: '大山', face: 'https://face.example/avatar.png' },
        top_reply: {
          rpid: 777001,
          member: { mid: 123456, uname: '大山' },
          content: { message: '置顶答案在这里' },
        },
      },
    }),
  });

  const result = await client.fetchVideoView({ aid: 112233 });
  assert.equal(result.title, '焦糖褐色外套开箱');
  assert.equal(result.owner.mid, 123456);
  assert.equal(result.owner.name, '大山');
  assert.equal(result.pinned_reply.rpid, 777001);
  assert.equal(result.pinned_reply.content, '置顶答案在这里');
});

await runCase('client retries 3x with exponential backoff', async () => {
  let attempts = 0;
  const clock = createClock();
  const client = createBilibiliClient({
    fetchImpl: async () => {
      attempts += 1;
      if (attempts < 3) {
        return createResponse({ code: -1, message: 'temporary error' }, { ok: false, status: 503 });
      }
      return createResponse({
        code: 0,
        data: {
          title: '补货视频',
          desc: '',
          owner: { mid: 1, name: 'UP', face: '' },
          top_reply: null,
        },
      });
    },
    now: clock.now,
    sleepImpl: clock.sleep,
  });

  const result = await client.fetchVideoView({ aid: 9988 });
  assert.equal(attempts, 3);
  assert.deepEqual(clock.sleeps, [RATE_LIMIT_MS, RATE_LIMIT_MS * 2]);
  assert.equal(result.owner.name, 'UP');
});

await runCase('rate limit is 1000ms per endpoint but not shared across endpoints', async () => {
  const clock = createClock();
  const calls = [];
  const client = createBilibiliClient({
    fetchImpl: async (url) => {
      calls.push({ url, at: clock.now() });
      if (String(url).includes('/x/v2/reply?')) {
        return createResponse({ code: 0, data: { page: { num: 1, size: 20 }, replies: [] } });
      }
      return createResponse({
        code: 0,
        data: {
          title: '标题',
          desc: '',
          owner: { mid: 1, name: 'UP', face: '' },
          top_reply: null,
        },
      });
    },
    now: clock.now,
    sleepImpl: clock.sleep,
  });

  await client.fetchVideoReplies({ aid: 1 });
  await client.fetchVideoReplies({ aid: 1 });
  await client.fetchVideoView({ aid: 1 });

  assert.deepEqual(clock.sleeps, [RATE_LIMIT_MS]);
  assert.equal(calls[0].at, 0);
  assert.equal(calls[1].at, RATE_LIMIT_MS);
  assert.equal(calls[2].at, RATE_LIMIT_MS);
});

if (process.exitCode) {
  console.error('\n🔥 bilibili tests failed');
  process.exit(process.exitCode);
} else {
  console.log('\n🎉 bilibili tests green');
}
```

- [ ] Step 2 Run, expect fail

```bash
node demo/backend/src/bilibili.test.js
```

Expected stderr:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/Users/sevencolor/code/0BKHDD/.worktrees/dundao-bilibili/demo/backend/src/bilibili.js' imported from /Users/sevencolor/code/0BKHDD/.worktrees/dundao-bilibili/demo/backend/src/bilibili.test.js
```

- [ ] Step 3 Write `demo/backend/src/bilibili.js`

```js
import { createLogger } from './logger.js';

const log = createLogger('bilibili');

export const RATE_LIMIT_MS = 1000;
export const MAX_RETRIES = 3;

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeMsgfeedItem(item) {
  return {
    source_id: Number(item.source_id),
    source_content: item.source_content ?? null,
    business_id: Number(item.business_id),
    title: item.title ?? '',
    reply_content: item.reply_content ?? '',
    mid_replier: Number(item.mid_replier),
    replier_name: item.replier_name ?? String(item.mid_replier ?? ''),
    like_count: Number(item.like ?? item.like_count ?? 0),
    is_up: Boolean(item.is_up),
    is_top: Boolean(item.is_top),
    rpid: Number(item.rpid),
    occurred_at: item.occurred_at ?? new Date().toISOString(),
  };
}

function normalizeVideoReply(item) {
  return {
    rpid: Number(item.rpid),
    replier_mid: Number(item.member?.mid ?? item.mid_replier ?? 0),
    replier_name: item.member?.uname ?? item.replier_name ?? '',
    content: item.content?.message ?? item.reply_content ?? '',
    like_count: Number(item.like ?? item.like_count ?? 0),
    is_up: Boolean(item.is_up ?? item.member?.is_up),
    is_top: Boolean(item.is_top),
    occurred_at: item.occurred_at ?? new Date().toISOString(),
  };
}

function normalizePinnedReply(item) {
  if (!item) return null;
  return {
    rpid: Number(item.rpid),
    replier_mid: Number(item.member?.mid ?? 0),
    replier_name: item.member?.uname ?? '',
    content: item.content?.message ?? '',
  };
}

function assertBilibiliJson(json, url) {
  if (!json || typeof json !== 'object') {
    throw new Error(`bilibili returned non-object json for ${url}`);
  }
  if (json.code !== 0) {
    throw new Error(`bilibili api error for ${url}: ${json.message ?? json.code}`);
  }
  return json.data ?? {};
}

export function createBilibiliClient({
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  sleepImpl = defaultSleep,
  rateLimitMs = RATE_LIMIT_MS,
  maxRetries = MAX_RETRIES,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('createBilibiliClient: fetchImpl must be a function');
  }

  const lastStartedAt = new Map();

  async function waitForRateLimit(endpointKey) {
    const lastAt = lastStartedAt.get(endpointKey);
    if (typeof lastAt === 'number') {
      const diff = now() - lastAt;
      if (diff < rateLimitMs) {
        await sleepImpl(rateLimitMs - diff);
      }
    }
    lastStartedAt.set(endpointKey, now());
  }

  async function requestJson(endpointKey, url, { sessdata = null } = {}) {
    let attempt = 0;

    while (attempt < maxRetries) {
      await waitForRateLimit(endpointKey);
      try {
        const headers = { Accept: 'application/json' };
        if (sessdata) {
          headers.Cookie = `SESSDATA=${sessdata}`;
        }
        const response = await fetchImpl(url, {
          headers,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const json = await response.json();
        return assertBilibiliJson(json, url);
      } catch (err) {
        attempt += 1;
        if (attempt >= maxRetries) {
          throw err;
        }
        const backoff = rateLimitMs * (2 ** (attempt - 1));
        log.warn('request failed, retrying', { endpoint: endpointKey, attempt, backoff, err: err.message });
        await sleepImpl(backoff);
      }
    }

    throw new Error(`unreachable retry loop for ${url}`);
  }

  /**
   * @param {{ sessdata: string, cursor?: string|number|null, ps?: number }} params
   * @returns {Promise<{ replies: Array<object>, hasMore: boolean, nextCursor: string|null }>}
   */
  async function fetchMsgfeedReply({ sessdata, cursor = null, ps = 20 }) {
    const url = new URL('https://api.bilibili.com/x/msgfeed/reply');
    url.searchParams.set('ps', String(ps));
    if (cursor !== null && cursor !== undefined && cursor !== '') {
      url.searchParams.set('cursor', String(cursor));
    }

    const data = await requestJson('msgfeed.reply', url, { sessdata });
    const replies = Array.isArray(data.items) ? data.items.map(normalizeMsgfeedItem) : [];
    const cursorInfo = data.cursor ?? {};

    return {
      replies,
      hasMore: !Boolean(cursorInfo.is_end),
      nextCursor: cursorInfo.next === undefined || cursorInfo.next === null ? null : String(cursorInfo.next),
    };
  }

  /**
   * @param {{ aid: number, sort?: number, ps?: number }} params
   * @returns {Promise<{ replies: Array<object>, page: { num: number, size: number } }>}
   */
  async function fetchVideoReplies({ aid, sort = 2, ps = 20 }) {
    const url = new URL('https://api.bilibili.com/x/v2/reply');
    url.searchParams.set('type', '1');
    url.searchParams.set('oid', String(aid));
    url.searchParams.set('sort', String(sort));
    url.searchParams.set('ps', String(ps));

    const data = await requestJson('video.replies', url);
    return {
      replies: Array.isArray(data.replies) ? data.replies.map(normalizeVideoReply) : [],
      page: {
        num: Number(data.page?.num ?? 1),
        size: Number(data.page?.size ?? ps),
      },
    };
  }

  /**
   * @param {{ aid: number }} params
   * @returns {Promise<{ title: string, desc: string, owner: { mid: number, name: string, face: string }, pinned_reply: object|null }>}
   */
  async function fetchVideoView({ aid }) {
    const url = new URL('https://api.bilibili.com/x/web-interface/view');
    url.searchParams.set('aid', String(aid));

    const data = await requestJson('video.view', url);
    return {
      title: data.title ?? '',
      desc: data.desc ?? '',
      owner: {
        mid: Number(data.owner?.mid ?? 0),
        name: data.owner?.name ?? '',
        face: data.owner?.face ?? '',
      },
      pinned_reply: normalizePinnedReply(data.top_reply ?? data.reply_control?.top ?? null),
    };
  }

  return {
    fetchMsgfeedReply,
    fetchVideoReplies,
    fetchVideoView,
  };
}

const defaultClient = createBilibiliClient();

/**
 * @param {{ sessdata: string, cursor?: string|number|null, ps?: number }} params
 * @returns {Promise<{ replies: Array<object>, hasMore: boolean, nextCursor: string|null }>}
 */
export async function fetchMsgfeedReply(params) {
  return defaultClient.fetchMsgfeedReply(params);
}

/**
 * @param {{ aid: number, sort?: number, ps?: number }} params
 * @returns {Promise<{ replies: Array<object>, page: { num: number, size: number } }>}
 */
export async function fetchVideoReplies(params) {
  return defaultClient.fetchVideoReplies(params);
}

/**
 * @param {{ aid: number }} params
 * @returns {Promise<{ title: string, desc: string, owner: { mid: number, name: string, face: string }, pinned_reply: object|null }>}
 */
export async function fetchVideoView(params) {
  return defaultClient.fetchVideoView(params);
}
```

- [ ] Step 4 Run test, expect pass

```bash
node demo/backend/src/bilibili.test.js
```

Expected stdout:

```text
✅ fetchMsgfeedReply sends SESSDATA cookie and normalizes cursor payload
✅ fetchVideoReplies normalizes hot replies
✅ fetchVideoView normalizes owner and pinned reply
✅ client retries 3x with exponential backoff
✅ rate limit is 1000ms per endpoint but not shared across endpoints

🎉 bilibili tests green
```

- [ ] Step 5 Sanity-run the migrate + client bundle in sequence

```bash
node demo/backend/src/migrate.test.js && node demo/backend/src/bilibili.test.js
```

Expected stdout:

```text
🎉 migrate tests green
🎉 bilibili tests green
```

- [ ] Step 6 Commit with HEREDOC subject + footer

```bash
git add \
  demo/backend/src/bilibili.js \
  demo/backend/src/bilibili.test.js
git commit -F - <<'EOF'
feat(bilibili): T2·api B 站 API client + retry/rate-limit

新增 bilibili API client，覆盖 msgfeed/reply、视频高赞评论、视频元数据，
并用 1s 端点限流 + 3 次指数退避保护抓取。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
```

## Task T3: `src/answerJudge.js` (R1 rule-based judge)
- Create: `demo/backend/src/answerJudge.js`
- Create: `demo/backend/src/answerJudge.test.js`

- [ ] Step 1 Write failing test (`demo/backend/src/answerJudge.test.js`)

```js
import { strict as assert } from 'node:assert';
import { judgeAnswer, JUDGE_THRESHOLD } from './answerJudge.js';

function runCase(label, fn) {
  try {
    fn();
    console.log('✅', label);
  } catch (err) {
    console.error('❌', label, '\n   →', err.message);
    process.exitCode = 1;
  }
}

function reply(overrides) {
  return Object.assign({
    replier_mid: 900001,
    content: '',
    like_count: 0,
    is_top: false,
  }, overrides);
}

const samples = [
  { label: 'UP 主直接贴链接', input: reply({ replier_mid: 123456, content: '链接上了！https://shop.example/item', like_count: 42 }), targetCreatorMid: 123456, total: 80, answer: true, reason: /\+up/ },
  { label: '高赞路人答 BGM', input: reply({ content: 'BGM 是陈粒 - 芳草地', like_count: 520 }), targetCreatorMid: 123456, total: 1000, answer: true, reason: /\+answer_named/ },
  { label: '+1 蹲是噪声', input: reply({ content: '+1 蹲', like_count: 2 }), targetCreatorMid: 123456, total: 200, answer: false, reason: /-noise_plus_one/ },
  { label: '同蹲是噪声', input: reply({ content: '同蹲', like_count: 1 }), targetCreatorMid: 123456, total: 20, answer: false, reason: /-noise_same_squat/ },
  { label: '楼上好看即使置顶也不算答案', input: reply({ content: '楼上好看', like_count: 8, is_top: true }), targetCreatorMid: 123456, total: 20, answer: false, reason: /-noise_floor/ },
  { label: '答案前缀算答案', input: reply({ content: '答案：无印良品软壳包', like_count: 3 }), targetCreatorMid: 123456, total: 60, answer: true, reason: /\+answer_prefix/ },
  { label: '叫《某首歌》算答案', input: reply({ content: '叫《Back to Friends》', like_count: 1 }), targetCreatorMid: 123456, total: 20, answer: true, reason: /\+answer_named/ },
  { label: '淘口令算答案', input: reply({ content: '淘口令 ￥ABCD1234￥ 复制打开', like_count: 5 }), targetCreatorMid: 123456, total: 50, answer: true, reason: /\+answer_ecom/ },
  { label: '点淘宝算答案', input: reply({ content: '点淘宝搜店名就有', like_count: 12 }), targetCreatorMid: 123456, total: 80, answer: true, reason: /\+answer_ecom/ },
  { label: '教程：CapCut 里搜冻结帧', input: reply({ content: '教程：CapCut 里搜冻结帧', like_count: 15 }), targetCreatorMid: 123456, total: 100, answer: true, reason: /\+answer_prefix/ },
  { label: '后续今晚更新 + UP 主身份即可过线', input: reply({ replier_mid: 123456, content: '后续今晚更新', like_count: 0 }), targetCreatorMid: 123456, total: 30, answer: true, reason: /\+up/ },
  { label: '链接明天补 + UP 主身份可过线', input: reply({ replier_mid: 123456, content: '链接明天补', like_count: 0 }), targetCreatorMid: 123456, total: 30, answer: true, reason: /\+up/ },
  { label: 'BGM? 只是追问不是答案', input: reply({ content: 'BGM?', like_count: 1 }), targetCreatorMid: 123456, total: 30, answer: false, reason: /neutral/ },
  { label: '哈哈哈哈不是答案', input: reply({ content: '哈哈哈哈哈哈', like_count: 20 }), targetCreatorMid: 123456, total: 80, answer: false, reason: /-noise_laugh/ },
  { label: '笑死也不是答案', input: reply({ content: '笑死我了', like_count: 25 }), targetCreatorMid: 123456, total: 80, answer: false, reason: /-noise_laugh/ },
  { label: '前排不是答案', input: reply({ content: '前排', like_count: 100, is_top: true }), targetCreatorMid: 123456, total: 800, answer: false, reason: /-noise_floor/ },
  { label: '后排不是答案', input: reply({ content: '后排', like_count: 0 }), targetCreatorMid: 123456, total: 50, answer: false, reason: /-noise_floor/ },
  { label: '楼下说得对不是答案', input: reply({ content: '楼下说得对', like_count: 0 }), targetCreatorMid: 123456, total: 50, answer: false, reason: /-noise_floor/ },
  { label: 'BGM 是 + URL 双命中仍只加一次 answer 分', input: reply({ content: 'BGM 是告五人 - 唯一 https://music.example/1', like_count: 3 }), targetCreatorMid: 123456, total: 60, answer: true, reason: /\+answer_named/ },
  { label: '是《芳草地》主页歌单也有', input: reply({ content: '是《芳草地》 主页歌单也有', like_count: 9 }), targetCreatorMid: 123456, total: 70, answer: true, reason: /\+answer_named/ },
  { label: '蹲一个后续不是答案', input: reply({ content: '蹲一个后续', like_count: 3 }), targetCreatorMid: 123456, total: 100, answer: false, reason: /neutral/ },
  { label: 'UP 主回复但同时是噪声时仍可因身份过线', input: reply({ replier_mid: 123456, content: '哈哈哈哈', like_count: 0 }), targetCreatorMid: 123456, total: 10, answer: true, reason: /\+up/ },
];

runCase('judgeAnswer uses threshold 0.3 from shared plan', () => {
  assert.equal(JUDGE_THRESHOLD, 0.3);
});

runCase('judgeAnswer scores 20+ realistic bilibili samples', () => {
  for (const sample of samples) {
    const result = judgeAnswer({
      reply: sample.input,
      targetCreatorMid: sample.targetCreatorMid,
      videoTotalReplies: sample.total,
    });
    assert.equal(result.is_answer, sample.answer, sample.label);
    assert.match(result.judge_reason, sample.reason, sample.label);
    assert.equal(typeof result.confidence, 'number', sample.label);
  }
});

runCase('judgeAnswer falls back to error result when rule evaluation throws', () => {
  const badReply = {};
  Object.defineProperty(badReply, 'content', {
    get() {
      throw new Error('boom');
    },
  });

  const result = judgeAnswer({
    reply: badReply,
    targetCreatorMid: 123456,
    videoTotalReplies: 10,
  });

  assert.equal(result.is_answer, false);
  assert.equal(result.confidence, 0);
  assert.match(result.judge_reason, /^error:/);
});

if (process.exitCode) {
  console.error('\n🔥 answerJudge tests failed');
  process.exit(process.exitCode);
} else {
  console.log('\n🎉 answerJudge tests green');
}
```

- [ ] Step 2 Run, expect fail

```bash
node demo/backend/src/answerJudge.test.js
```

Expected stderr:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/Users/sevencolor/code/0BKHDD/.worktrees/dundao-bilibili/demo/backend/src/answerJudge.js' imported from /Users/sevencolor/code/0BKHDD/.worktrees/dundao-bilibili/demo/backend/src/answerJudge.test.js
```

- [ ] Step 3 Write `demo/backend/src/answerJudge.js`

```js
export const JUDGE_THRESHOLD = 0.3;

const ANSWER_PATTERNS = [
  { reason: 'answer_prefix', regex: /^(是|答案|bgm|BGM|链接)[:：]/u },
  { reason: 'answer_named', regex: /(是|叫)\s?[《「"]?[^》」"\n]{1,40}[》」"]?/u },
  { reason: 'answer_url', regex: /https?:\/\/\S+/iu },
  { reason: 'answer_ecom', regex: /淘口令|复制打开|点淘宝/u },
];

const NOISE_PATTERNS = [
  { reason: 'noise_plus_one', regex: /^[+＋]1\s*蹲/u },
  { reason: 'noise_same_squat', regex: /^同蹲/u },
  { reason: 'noise_floor', regex: /^(楼上|楼下|前排|后排)/u },
  { reason: 'noise_laugh', regex: /^(哈哈+|233+|笑死|好看)/u },
];

function normalizeMid(mid) {
  return String(mid ?? '');
}

function normalizeContent(content) {
  return typeof content === 'string' ? content.trim() : '';
}

function findPattern(content, patterns) {
  return patterns.find((item) => item.regex.test(content)) ?? null;
}

export function judgeAnswer({ reply, targetCreatorMid, videoTotalReplies = 0 }) {
  try {
    const content = normalizeContent(reply.content);
    const reasons = [];
    let score = 0;

    if (normalizeMid(reply.replier_mid) === normalizeMid(targetCreatorMid)) {
      score += 0.5;
      reasons.push('+up');
    }

    if (reply.is_top) {
      score += 0.3;
      reasons.push('+top');
    }

    const likeThreshold = Math.max(10, Number(videoTotalReplies || 0) * 0.05);
    if (Number(reply.like_count ?? 0) >= likeThreshold) {
      score += 0.2;
      reasons.push('+likes');
    }

    const answerHit = findPattern(content, ANSWER_PATTERNS);
    if (answerHit) {
      score += 0.3;
      reasons.push(`+${answerHit.reason}`);
    }

    const noiseHit = findPattern(content, NOISE_PATTERNS);
    if (noiseHit) {
      score -= 0.5;
      reasons.push(`-${noiseHit.reason}`);
    }

    return {
      is_answer: score >= JUDGE_THRESHOLD,
      confidence: Number(score.toFixed(2)),
      judge_reason: reasons.join(' ') || 'neutral',
    };
  } catch (err) {
    return {
      is_answer: false,
      confidence: 0,
      judge_reason: `error: ${err.message}`,
    };
  }
}
```

- [ ] Step 4 Run test, expect pass

```bash
node demo/backend/src/answerJudge.test.js
```

Expected stdout:

```text
✅ judgeAnswer uses threshold 0.3 from shared plan
✅ judgeAnswer scores 20+ realistic bilibili samples
✅ judgeAnswer falls back to error result when rule evaluation throws

🎉 answerJudge tests green
```

- [ ] Step 5 Run the backend rule stack together

```bash
node demo/backend/src/migrate.test.js && node demo/backend/src/bilibili.test.js && node demo/backend/src/answerJudge.test.js
```

Expected stdout:

```text
🎉 migrate tests green
🎉 bilibili tests green
🎉 answerJudge tests green
```

- [ ] Step 6 Commit with HEREDOC subject + footer

```bash
git add \
  demo/backend/src/answerJudge.js \
  demo/backend/src/answerJudge.test.js
git commit -F - <<'EOF'
feat(bilibili): T3·judge R1 规则判真 + 样本测试

落地 R1 规则判真，覆盖 20+ 条真实 B 站评论样本，
统一输出 is_answer / confidence / judge_reason 三字段。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
```

## Task T4: `src/ingest.js` (摄入 HTTP 端点) + `server.js` mount
- Create: `demo/backend/src/ingest.js`
- Create: `demo/backend/src/ingest.test.js`
- Modify: `demo/backend/src/server.js`

- [ ] Step 1 Write failing integration test (`demo/backend/src/ingest.test.js`)

```js
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

function runCase(label, fn) {
  return fn()
    .then(() => console.log('✅', label))
    .catch((err) => {
      console.error('❌', label, '\n   →', err.message);
      process.exitCode = 1;
    });
}

async function withServer(run) {
  const tempDir = mkdtempSync(join(tmpdir(), 'dundao-ingest-'));
  const dbPath = join(tempDir, 'test.db');
  const db = new Database(dbPath);
  const events = [];

  runSchema(db);
  applyMigrations({ db });

  const app = express();
  app.use(express.json());
  app.use('/api', buildIngestRouter({
    db,
    broadcast: (type, payload) => events.push({ type, payload }),
  }));

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await run({ baseUrl, db, events });
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
}

await runCase('POST /api/ingest/comment inserts signal and emits ws event', async () => {
  await withServer(async ({ baseUrl, db, events }) => {
    const response = await fetch(`${baseUrl}/api/ingest/comment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        aid: 112233445566,
        rpid: 99887766,
        parent_rpid: null,
        content: '蹲链接',
        video_title: '焦糖褐色外套开箱',
        target_creator_mid: 123456,
        target_creator_name: '大山',
        target_creator_avatar: 'https://example.com/avatar.png',
        occurred_at: '2026-04-21T10:30:00+08:00',
      }),
    });

    assert.equal(response.status, 200);
    const json = await response.json();
    assert.equal(json.ok, true);

    const row = db.prepare('SELECT * FROM intent_signals WHERE rpid = ?').get(99887766);
    assert.equal(row.aid, 112233445566);
    assert.equal(row.source, 'hook');
    assert.equal(events[0].type, INGEST_EVENTS.SIGNAL_INGESTED);
  });
});

await runCase('POST /api/ingest/comment returns 409 on duplicate rpid', async () => {
  await withServer(async ({ baseUrl }) => {
    const payload = {
      aid: 112233445566,
      rpid: 99887766,
      parent_rpid: null,
      content: '蹲链接',
      video_title: '焦糖褐色外套开箱',
      target_creator_mid: 123456,
      target_creator_name: '大山',
      target_creator_avatar: 'https://example.com/avatar.png',
      occurred_at: '2026-04-21T10:30:00+08:00',
    };

    await fetch(`${baseUrl}/api/ingest/comment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const duplicate = await fetch(`${baseUrl}/api/ingest/comment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    assert.equal(duplicate.status, 409);
    assert.deepEqual(await duplicate.json(), { ok: false, reason: 'duplicate_rpid' });
  });
});

await runCase('POST /api/ingest/reply inserts action, judges it, and emits ws event', async () => {
  await withServer(async ({ baseUrl, db, events }) => {
    await fetch(`${baseUrl}/api/ingest/comment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        aid: 112233445566,
        rpid: 99887766,
        parent_rpid: null,
        content: '蹲链接',
        video_title: '焦糖褐色外套开箱',
        target_creator_mid: 123456,
        target_creator_name: '大山',
        target_creator_avatar: 'https://example.com/avatar.png',
        occurred_at: '2026-04-21T10:30:00+08:00',
      }),
    });

    const response = await fetch(`${baseUrl}/api/ingest/reply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
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
      }),
    });

    assert.equal(response.status, 200);
    const json = await response.json();
    assert.equal(json.is_answer, true);
    assert.match(json.judge_reason, /\+up/);

    const row = db.prepare('SELECT * FROM creator_actions WHERE rpid = ?').get(99887800);
    assert.equal(row.source, 'L1');
    assert.equal(row.replying_to_rpid, 99887766);
    assert.equal(row.is_answer, 1);
    assert.equal(events.at(-1).type, INGEST_EVENTS.ACTION_INGESTED);
  });
});

await runCase('POST /api/ingest/top-reply ingests batch and counts answers', async () => {
  await withServer(async ({ baseUrl, db }) => {
    await fetch(`${baseUrl}/api/ingest/comment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        aid: 112233445566,
        rpid: 99887766,
        parent_rpid: null,
        content: '蹲 BGM',
        video_title: '焦糖褐色外套开箱',
        target_creator_mid: 123456,
        target_creator_name: '大山',
        target_creator_avatar: 'https://example.com/avatar.png',
        occurred_at: '2026-04-21T10:30:00+08:00',
      }),
    });

    const response = await fetch(`${baseUrl}/api/ingest/top-reply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
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
          }
        ],
      }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, ingested: 2, answers: 1 });
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM creator_actions').get().c, 2);
  });
});

await runCase('GET /api/my-comments and /api/marks return spec-shaped payloads', async () => {
  await withServer(async ({ baseUrl, db }) => {
    await fetch(`${baseUrl}/api/ingest/comment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        aid: 112233445566,
        rpid: 99887766,
        parent_rpid: null,
        content: '蹲链接',
        video_title: '焦糖褐色外套开箱',
        target_creator_mid: 123456,
        target_creator_name: '大山',
        target_creator_avatar: 'https://example.com/avatar.png',
        occurred_at: '2026-04-21T10:30:00+08:00',
      }),
    });

    await fetch(`${baseUrl}/api/ingest/reply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
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
      }),
    });

    const signalId = db.prepare('SELECT id FROM intent_signals WHERE rpid = ?').get(99887766).id;
    const actionId = db.prepare('SELECT id FROM creator_actions WHERE rpid = ?').get(99887800).id;
    db.prepare('UPDATE intent_signals SET fulfilled = 1 WHERE id = ?').run(signalId);
    db.prepare(`
      INSERT INTO cards (id, user_id, script_id, intent_signal_id, creator_action_id, pages_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('card_demo_1', 'demo-user', 'A', signalId, actionId, '[]');

    const comments = await fetch(`${baseUrl}/api/my-comments?filter=fulfilled`);
    const commentsJson = await comments.json();
    assert.equal(commentsJson.total, 1);
    assert.equal(commentsJson.fulfilled, 1);
    assert.equal(commentsJson.pending, 0);
    assert.equal(commentsJson.items[0].card_id, 'card_demo_1');
    assert.equal(commentsJson.items[0].top_answer.content, '链接上了！https://shop.example/item');

    const marks = await fetch(`${baseUrl}/api/marks?rpids=99887766,99887767`);
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

if (process.exitCode) {
  console.error('\n🔥 ingest tests failed');
  process.exit(process.exitCode);
} else {
  console.log('\n🎉 ingest tests green');
}
```

- [ ] Step 2 Run, expect fail

```bash
node demo/backend/src/ingest.test.js
```

Expected stderr:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/Users/sevencolor/code/0BKHDD/.worktrees/dundao-bilibili/demo/backend/src/ingest.js' imported from /Users/sevencolor/code/0BKHDD/.worktrees/dundao-bilibili/demo/backend/src/ingest.test.js
```

- [ ] Step 3 Write `demo/backend/src/ingest.js`

```js
import express from 'express';
import { getDb } from './db.js';
import { judgeAnswer } from './answerJudge.js';
import { createLogger } from './logger.js';

const log = createLogger('ingest');
const DEMO_USER_ID = 'demo-user';

export const INGEST_EVENTS = Object.freeze({
  SIGNAL_INGESTED: 'ingest.signal',
  ACTION_INGESTED: 'ingest.action',
});

function topicFromAid(aid) {
  return `bilibili:aid:${aid}`;
}

function toNumber(value, fieldName, { nullable = false } = {}) {
  if (nullable && (value === null || value === undefined)) return null;
  const num = Number(value);
  if (!Number.isInteger(num)) {
    throw new Error(`${fieldName} must be an integer`);
  }
  return num;
}

function toStringValue(value, fieldName, { nullable = false } = {}) {
  if (nullable && (value === null || value === undefined)) return null;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
  return value.trim();
}

function toIsoString(value, fieldName) {
  const iso = toStringValue(value, fieldName);
  const ts = new Date(iso);
  if (Number.isNaN(ts.getTime())) {
    throw new Error(`${fieldName} must be a valid ISO timestamp`);
  }
  return iso;
}

function inferActionType(content) {
  if (/教程|做法|怎么做|怎么弄/u.test(content)) return 'reply_tutorial';
  if (/后续|下集|更新/u.test(content)) return 'post_sequel';
  if (/系列|合集|更完了|完结/u.test(content)) return 'series_completed';
  return 'post_link';
}

function ensureCreator(db, { id, handle, display, avatar = null, bio = null }) {
  db.prepare(`
    INSERT OR IGNORE INTO creators (id, handle, display, avatar, bio)
    VALUES (@id, @handle, @display, @avatar, @bio)
  `).run({ id, handle, display, avatar, bio });
}

function pickSignalContext(db, { replyingToRpid = null, aid = null }) {
  if (replyingToRpid !== null) {
    const row = db.prepare(`
      SELECT creator_id, topic, video_title
        FROM intent_signals
       WHERE rpid = ?
       LIMIT 1
    `).get(replyingToRpid);
    if (row) return row;
  }

  if (aid !== null) {
    return db.prepare(`
      SELECT creator_id, topic, video_title
        FROM intent_signals
       WHERE aid = ?
       ORDER BY occurred_at DESC
       LIMIT 1
    `).get(aid) ?? null;
  }

  return null;
}

function buildActionPayload({ aid, videoTitle, content, replierName, rpid, replyingToRpid }) {
  return {
    video_id: String(aid),
    title: videoTitle,
    cover: null,
    summary: content,
    headline: '我 {time} 蹲的那件事 · 评论区有人接住了',
    emotional_close: '你留过的那句，这次有人接住了',
    cta: {
      primary: [
        { id: 'open_video', label: '打开视频' },
        { id: 'view_reply', label: '看回复' },
      ],
    },
    reply: {
      rpid,
      replying_to_rpid: replyingToRpid,
      replier_name: replierName,
      content,
    },
  };
}

function findTopAnswerForSignal(db, signal) {
  return db.prepare(`
    SELECT ca.*, cd.id AS card_id
      FROM creator_actions ca
      LEFT JOIN cards cd ON cd.intent_signal_id = ?
     WHERE ca.is_answer = 1
       AND (
         ca.replying_to_rpid = ?
         OR (
           ca.replying_to_rpid IS NULL
           AND ca.source = 'L2'
           AND ca.topic = ?
         )
       )
     ORDER BY ca.confidence DESC, ca.occurred_at DESC
     LIMIT 1
  `).get(signal.id, signal.rpid, signal.topic);
}

function parsePayloadJson(payloadJson) {
  try {
    return JSON.parse(payloadJson);
  } catch {
    return {};
  }
}

function buildMyComments(db, filter) {
  const rows = db.prepare(`
    SELECT s.*, c.display AS creator_name, c.avatar AS creator_avatar
      FROM intent_signals s
      JOIN creators c ON c.id = s.creator_id
     WHERE s.user_id = ?
     ORDER BY s.occurred_at DESC
  `).all(DEMO_USER_ID);

  const items = rows.map((row) => {
    const action = findTopAnswerForSignal(db, row);
    const payload = action ? parsePayloadJson(action.payload_json) : null;
    const cardRow = db.prepare('SELECT id FROM cards WHERE intent_signal_id = ? LIMIT 1').get(row.id);
    const fulfilled = Boolean(cardRow);

    return {
      signal_id: row.id,
      aid: row.aid,
      video_title: row.video_title,
      content: row.raw_text,
      occurred_at: row.occurred_at,
      fulfilled: fulfilled ? 1 : 0,
      card_id: cardRow?.id ?? null,
      creator: {
        mid: Number.isFinite(Number(row.creator_id)) ? Number(row.creator_id) : row.creator_id,
        name: row.creator_name,
        avatar: row.creator_avatar,
      },
      top_answer: action ? {
        content: payload.summary ?? payload.reply?.content ?? '',
        is_up: Boolean(action.judge_reason?.includes('+up')),
      } : null,
    };
  });

  const total = items.length;
  const fulfilled = items.filter((item) => item.fulfilled === 1).length;
  const pending = total - fulfilled;

  return {
    total,
    fulfilled,
    pending,
    items: items.filter((item) => {
      if (filter === 'fulfilled') return item.fulfilled === 1;
      if (filter === 'pending') return item.fulfilled === 0;
      return true;
    }),
  };
}

function duplicateResponse(res) {
  return res.status(409).json({ ok: false, reason: 'duplicate_rpid' });
}

export function buildIngestRouter({ db = getDb(), broadcast = () => {} } = {}) {
  const router = express.Router();

  router.post('/ingest/comment', (req, res) => {
    try {
      const aid = toNumber(req.body?.aid, 'aid');
      const rpid = toNumber(req.body?.rpid, 'rpid');
      const parentRpid = toNumber(req.body?.parent_rpid, 'parent_rpid', { nullable: true });
      const content = toStringValue(req.body?.content, 'content');
      const videoTitle = toStringValue(req.body?.video_title, 'video_title');
      const targetCreatorMid = toNumber(req.body?.target_creator_mid, 'target_creator_mid');
      const targetCreatorName = toStringValue(req.body?.target_creator_name, 'target_creator_name');
      const targetCreatorAvatar = toStringValue(req.body?.target_creator_avatar, 'target_creator_avatar');
      const occurredAt = toIsoString(req.body?.occurred_at, 'occurred_at');

      ensureCreator(db, {
        id: String(targetCreatorMid),
        handle: `@${targetCreatorName}`,
        display: targetCreatorName,
        avatar: targetCreatorAvatar,
      });

      const result = db.prepare(`
        INSERT OR IGNORE INTO intent_signals (
          user_id, creator_id, video_id, video_title, signal_type,
          raw_text, topic, occurred_at, aid, rpid, parent_rpid, source
        ) VALUES (
          @user_id, @creator_id, @video_id, @video_title, @signal_type,
          @raw_text, @topic, @occurred_at, @aid, @rpid, @parent_rpid, @source
        )
      `).run({
        user_id: DEMO_USER_ID,
        creator_id: String(targetCreatorMid),
        video_id: String(aid),
        video_title: videoTitle,
        signal_type: 'comment_intent',
        raw_text: content,
        topic: topicFromAid(aid),
        occurred_at: occurredAt,
        aid,
        rpid,
        parent_rpid: parentRpid,
        source: 'hook',
      });

      if (result.changes !== 1) {
        return duplicateResponse(res);
      }

      broadcast(INGEST_EVENTS.SIGNAL_INGESTED, { signal_id: result.lastInsertRowid, aid, rpid });
      return res.json({ ok: true, signal_id: result.lastInsertRowid });
    } catch (err) {
      log.warn('ingest/comment rejected', { err: err.message });
      return res.status(400).json({ ok: false, reason: err.message });
    }
  });

  router.post('/ingest/reply', (req, res) => {
    try {
      const source = toStringValue(req.body?.source, 'source');
      const replyingToRpid = toNumber(req.body?.replying_to_rpid, 'replying_to_rpid');
      const rpid = toNumber(req.body?.rpid, 'rpid');
      const replierMid = toNumber(req.body?.replier_mid, 'replier_mid');
      const replierName = toStringValue(req.body?.replier_name, 'replier_name');
      const content = toStringValue(req.body?.content, 'content');
      const likeCount = Number(req.body?.like_count ?? 0);
      const isUp = Boolean(req.body?.is_up);
      const isTop = Boolean(req.body?.is_top);
      const aid = toNumber(req.body?.aid, 'aid');
      const occurredAt = toIsoString(req.body?.occurred_at, 'occurred_at');

      const context = pickSignalContext(db, { replyingToRpid, aid });
      const targetCreatorMid = context?.creator_id ?? null;
      const topic = context?.topic ?? topicFromAid(aid);
      const videoTitle = context?.video_title ?? 'Bilibili 评论区';

      ensureCreator(db, {
        id: String(replierMid),
        handle: `@${replierName}`,
        display: replierName,
      });

      const verdict = judgeAnswer({
        reply: {
          replier_mid: replierMid,
          content,
          like_count: likeCount,
          is_top: isTop,
        },
        targetCreatorMid,
        videoTotalReplies: 0,
      });

      const result = db.prepare(`
        INSERT OR IGNORE INTO creator_actions (
          creator_id, action_type, payload_json, topic, occurred_at, rpid,
          replying_to_rpid, is_answer, confidence, judge_reason, source
        ) VALUES (
          @creator_id, @action_type, @payload_json, @topic, @occurred_at, @rpid,
          @replying_to_rpid, @is_answer, @confidence, @judge_reason, @source
        )
      `).run({
        creator_id: String(replierMid),
        action_type: inferActionType(content),
        payload_json: JSON.stringify(buildActionPayload({
          aid,
          videoTitle,
          content,
          replierName,
          rpid,
          replyingToRpid,
        })),
        topic,
        occurred_at: occurredAt,
        rpid,
        replying_to_rpid: replyingToRpid,
        is_answer: verdict.is_answer ? 1 : 0,
        confidence: verdict.confidence,
        judge_reason: verdict.judge_reason,
        source,
      });

      if (result.changes !== 1) {
        return duplicateResponse(res);
      }

      broadcast(INGEST_EVENTS.ACTION_INGESTED, {
        action_id: result.lastInsertRowid,
        aid,
        rpid,
        source,
        is_answer: verdict.is_answer,
      });

      return res.json({
        ok: true,
        action_id: result.lastInsertRowid,
        is_answer: verdict.is_answer,
        confidence: verdict.confidence,
        judge_reason: verdict.judge_reason,
      });
    } catch (err) {
      log.warn('ingest/reply rejected', { err: err.message });
      return res.status(400).json({ ok: false, reason: err.message });
    }
  });

  router.post('/ingest/top-reply', (req, res) => {
    try {
      const source = toStringValue(req.body?.source, 'source');
      const aid = toNumber(req.body?.aid, 'aid');
      const batch = Array.isArray(req.body?.batch) ? req.body.batch : null;
      if (!batch) {
        throw new Error('batch must be an array');
      }

      const context = pickSignalContext(db, { aid });
      const targetCreatorMid = context?.creator_id ?? null;
      const topic = context?.topic ?? topicFromAid(aid);
      const videoTitle = context?.video_title ?? 'Bilibili 评论区';

      let ingested = 0;
      let answers = 0;

      for (const item of batch) {
        const rpid = toNumber(item?.rpid, 'batch.rpid');
        const replierMid = toNumber(item?.replier_mid, 'batch.replier_mid');
        const replierName = toStringValue(item?.replier_name, 'batch.replier_name');
        const content = toStringValue(item?.content, 'batch.content');
        const likeCount = Number(item?.like_count ?? 0);
        const isUp = Boolean(item?.is_up);
        const isTop = Boolean(item?.is_top);
        const occurredAt = toIsoString(item?.occurred_at, 'batch.occurred_at');

        ensureCreator(db, {
          id: String(replierMid),
          handle: `@${replierName}`,
          display: replierName,
        });

        const verdict = judgeAnswer({
          reply: {
            replier_mid: replierMid,
            content,
            like_count: likeCount,
            is_top: isTop,
          },
          targetCreatorMid,
          videoTotalReplies: batch.length,
        });

        const result = db.prepare(`
          INSERT OR IGNORE INTO creator_actions (
            creator_id, action_type, payload_json, topic, occurred_at, rpid,
            replying_to_rpid, is_answer, confidence, judge_reason, source
          ) VALUES (
            @creator_id, @action_type, @payload_json, @topic, @occurred_at, @rpid,
            @replying_to_rpid, @is_answer, @confidence, @judge_reason, @source
          )
        `).run({
          creator_id: String(replierMid),
          action_type: inferActionType(content),
          payload_json: JSON.stringify(buildActionPayload({
            aid,
            videoTitle,
            content,
            replierName,
            rpid,
            replyingToRpid: null,
          })),
          topic,
          occurred_at: occurredAt,
          rpid,
          replying_to_rpid: null,
          is_answer: verdict.is_answer ? 1 : 0,
          confidence: verdict.confidence,
          judge_reason: verdict.judge_reason,
          source,
        });

        if (result.changes === 1) {
          ingested += 1;
          if (verdict.is_answer) answers += 1;
          broadcast(INGEST_EVENTS.ACTION_INGESTED, {
            action_id: result.lastInsertRowid,
            aid,
            rpid,
            source,
            is_answer: verdict.is_answer,
          });
        }
      }

      return res.json({ ok: true, ingested, answers });
    } catch (err) {
      log.warn('ingest/top-reply rejected', { err: err.message });
      return res.status(400).json({ ok: false, reason: err.message });
    }
  });

  router.get('/my-comments', (req, res) => {
    const filter = req.query.filter === 'fulfilled' || req.query.filter === 'pending'
      ? req.query.filter
      : 'all';
    return res.json(buildMyComments(db, filter));
  });

  router.get('/marks', (req, res) => {
    const raw = typeof req.query.rpids === 'string' ? req.query.rpids : '';
    const rpids = raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => Number(value))
      .filter(Number.isInteger);

    const marks = Object.fromEntries(rpids.map((rpid) => [String(rpid), { has_my_comment: false }]));
    if (rpids.length === 0) {
      return res.json({ marks });
    }

    const stmt = db.prepare(`
      SELECT s.rpid, cd.id AS card_id
        FROM intent_signals s
        LEFT JOIN cards cd ON cd.intent_signal_id = s.id
       WHERE s.rpid IN (${rpids.map(() => '?').join(',')})
    `);
    const rows = Function.prototype.apply.call(stmt.all, stmt, rpids);

    for (const row of rows) {
      if (row.card_id) {
        marks[String(row.rpid)] = {
          has_my_comment: true,
          fulfilled: true,
          card_id: row.card_id,
        };
      } else {
        marks[String(row.rpid)] = {
          has_my_comment: true,
          fulfilled: false,
        };
      }
    }

    return res.json({ marks });
  });

  return router;
}
```

- [ ] Step 4 Modify `demo/backend/src/server.js` to mount the ingest router

Replace the import block and the `createApp` router mount with the following contiguous snippets.

FROM:

```js
import { createBroadcaster } from './events.js';
import { runWorkflow, newRunId } from './workflow.js';
import { runAmbient, hasPendingAmbient } from './ambient.js';
import { createRateLimiter } from './rateLimit.js';
import { createLogger } from './logger.js';
import { seed } from './seed.js';
import { WS_EVENTS, REASON_CODES, MAX_COMMENT_GRAPHEMES, graphemeLength } from '../../shared/contracts.js';
```

TO:

```js
import { createBroadcaster } from './events.js';
import { runWorkflow, newRunId } from './workflow.js';
import { runAmbient, hasPendingAmbient } from './ambient.js';
import { buildIngestRouter } from './ingest.js';
import { createRateLimiter } from './rateLimit.js';
import { createLogger } from './logger.js';
import { seed } from './seed.js';
import { WS_EVENTS, REASON_CODES, MAX_COMMENT_GRAPHEMES, graphemeLength } from '../../shared/contracts.js';
```

FROM:

```js
  app.use(express.json({ limit: '64kb' }));

  app.use((err, _req, res, next) => {
    if (err && (err.type === 'entity.parse.failed' || err.type === 'entity.too.large')) {
      const status = err.status || (err.type === 'entity.too.large' ? 413 : 400);
      return res.status(status).json({ ok: false, error: err.type });
    }
    return next(err);
  });
```

TO:

```js
  app.use(express.json({ limit: '64kb' }));

  app.use((err, _req, res, next) => {
    if (err && (err.type === 'entity.parse.failed' || err.type === 'entity.too.large')) {
      const status = err.status || (err.type === 'entity.too.large' ? 413 : 400);
      return res.status(status).json({ ok: false, error: err.type });
    }
    return next(err);
  });

  app.use('/api', buildIngestRouter({ broadcast }));
```

- [ ] Step 5 Run integration test, expect pass

```bash
node demo/backend/src/ingest.test.js
```

Expected stdout:

```text
✅ POST /api/ingest/comment inserts signal and emits ws event
✅ POST /api/ingest/comment returns 409 on duplicate rpid
✅ POST /api/ingest/reply inserts action, judges it, and emits ws event
✅ POST /api/ingest/top-reply ingests batch and counts answers
✅ GET /api/my-comments and /api/marks return spec-shaped payloads

🎉 ingest tests green
```

- [ ] Step 6 Commit with HEREDOC subject + footer

```bash
git add \
  demo/backend/src/ingest.js \
  demo/backend/src/ingest.test.js \
  demo/backend/src/server.js
git commit -F - <<'EOF'
feat(bilibili): T4·ingest 摄入端点 + server 挂载

新增 5 个 B 站摄入/查询端点，补上重复 rpid 幂等保护、
judgeAnswer 接线，以及插入后的 WebSocket 广播。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
```

## Task T5: `src/historyBackfill.js` (一次性倒推)
- Create: `demo/backend/src/historyBackfill.js`
- Create: `demo/backend/src/historyBackfill.test.js`

- [ ] Step 1 Write failing test (`demo/backend/src/historyBackfill.test.js`)

```js
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { runSchema } from './db.js';
import { applyMigrations } from './migrate.js';
import { backfillOnce, BACKFILL_EVENTS } from './historyBackfill.js';

function runCase(label, fn) {
  return fn()
    .then(() => console.log('✅', label))
    .catch((err) => {
      console.error('❌', label, '\n   →', err.message);
      process.exitCode = 1;
    });
}

function withDb(run) {
  const tempDir = mkdtempSync(join(tmpdir(), 'dundao-backfill-'));
  const dbPath = join(tempDir, 'backfill.db');
  const db = new Database(dbPath);
  runSchema(db);
  applyMigrations({ db });

  return Promise.resolve(run(db))
    .finally(() => {
      db.close();
      rmSync(tempDir, { recursive: true, force: true });
    });
}

await runCase('backfillOnce paginates, dedups by rpid, and falls back to (待补)', async () => {
  await withDb(async (db) => {
    const events = [];
    const viewCalls = [];
    const client = {
      async fetchMsgfeedReply({ cursor }) {
        if (!cursor) {
          return {
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
          };
        }

        return {
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
        };
      },
      async fetchVideoView({ aid }) {
        viewCalls.push(aid);
        if (aid === 2001) {
          return {
            title: '焦糖褐色外套开箱',
            desc: 'desc-1',
            owner: { mid: 123456, name: '大山', face: 'https://example.com/1.png' },
            pinned_reply: null,
          };
        }
        return {
          title: '深夜歌单',
          desc: 'desc-2',
          owner: { mid: 987654, name: '歌单号', face: 'https://example.com/2.png' },
          pinned_reply: null,
        };
      },
    };

    const result = await backfillOnce({
      sessdata: 'SESSDATA_VALUE',
      db,
      client,
      broadcast: (type, payload) => events.push({ type, payload }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.totalSignals, 2);
    assert.equal(result.totalActions, 2);
    assert.equal(result.totalCards, 0);
    assert.deepEqual(viewCalls, [2001, 2002]);

    const missingContent = db.prepare('SELECT raw_text FROM intent_signals WHERE rpid = ?').get(1001);
    assert.equal(missingContent.raw_text, '(待补)');

    const duplicateSafe = db.prepare('SELECT COUNT(*) AS c FROM creator_actions WHERE rpid = ?').get(5002);
    assert.equal(duplicateSafe.c, 1);

    assert.equal(events[0].type, BACKFILL_EVENTS.PROGRESS);
    assert.equal(events.at(-1).type, BACKFILL_EVENTS.DONE);
  });
});

if (process.exitCode) {
  console.error('\n🔥 historyBackfill tests failed');
  process.exit(process.exitCode);
} else {
  console.log('\n🎉 historyBackfill tests green');
}
```

- [ ] Step 2 Run, expect fail

```bash
node demo/backend/src/historyBackfill.test.js
```

Expected stderr:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/Users/sevencolor/code/0BKHDD/.worktrees/dundao-bilibili/demo/backend/src/historyBackfill.js' imported from /Users/sevencolor/code/0BKHDD/.worktrees/dundao-bilibili/demo/backend/src/historyBackfill.test.js
```

- [ ] Step 3 Write `demo/backend/src/historyBackfill.js`

```js
import { createBilibiliClient } from './bilibili.js';
import { getDb } from './db.js';
import { judgeAnswer } from './answerJudge.js';
import { createLogger } from './logger.js';

const log = createLogger('historyBackfill');
const DEMO_USER_ID = 'demo-user';

export const BACKFILL_EVENTS = Object.freeze({
  PROGRESS: 'backfill.progress',
  DONE: 'backfill.done',
});

function topicFromAid(aid) {
  return `bilibili:aid:${aid}`;
}

function normalizeSignalText(text) {
  return typeof text === 'string' && text.trim() ? text.trim() : '(待补)';
}

function inferActionType(content) {
  if (/教程|做法|怎么做|怎么弄/u.test(content)) return 'reply_tutorial';
  if (/后续|下集|更新/u.test(content)) return 'post_sequel';
  if (/系列|合集|更完了|完结/u.test(content)) return 'series_completed';
  return 'post_link';
}

function ensureCreator(db, { id, name, avatar = null, bio = null }) {
  db.prepare(`
    INSERT OR IGNORE INTO creators (id, handle, display, avatar, bio)
    VALUES (@id, @handle, @display, @avatar, @bio)
  `).run({
    id,
    handle: `@${name}`,
    display: name,
    avatar,
    bio,
  });
}

function buildActionPayload({ aid, videoTitle, reply }) {
  return {
    video_id: String(aid),
    title: videoTitle,
    cover: null,
    summary: reply.reply_content,
    headline: '我 {time} 蹲的那件事 · 历史回来了',
    emotional_close: '旧评论区里的回音，这次也替你接住了',
    cta: {
      primary: [
        { id: 'open_video', label: '打开视频' },
        { id: 'view_reply', label: '看回复' },
      ],
    },
    reply: {
      rpid: reply.rpid,
      replying_to_rpid: reply.source_id,
      replier_name: reply.replier_name,
      content: reply.reply_content,
    },
  };
}

function parseCliArgs(argv) {
  const pair = argv.find((arg) => arg.startsWith('--sessdata='));
  return {
    sessdata: pair ? pair.slice('--sessdata='.length) : '',
  };
}

export async function backfillOnce({
  sessdata,
  db = getDb(),
  client = createBilibiliClient(),
  broadcast = () => {},
} = {}) {
  if (typeof sessdata !== 'string' || !sessdata.trim()) {
    throw new TypeError('backfillOnce: sessdata is required');
  }

  const viewCache = new Map();
  let cursor = null;
  let page = 0;
  let totalSignals = 0;
  let totalActions = 0;

  while (true) {
    const batch = await client.fetchMsgfeedReply({ sessdata, cursor, ps: 20 });
    page += 1;
    broadcast(BACKFILL_EVENTS.PROGRESS, {
      stage: 'fetch_page',
      current: page,
      total: null,
      hint: `cursor=${cursor ?? 'start'} items=${batch.replies.length}`,
    });

    for (const item of batch.replies) {
      const aid = Number(item.business_id);
      let view = viewCache.get(aid);
      if (!view) {
        view = await client.fetchVideoView({ aid });
        viewCache.set(aid, view);
      }

      ensureCreator(db, {
        id: String(view.owner.mid),
        name: view.owner.name,
        avatar: view.owner.face,
        bio: view.desc,
      });

      const signalInsert = db.prepare(`
        INSERT OR IGNORE INTO intent_signals (
          user_id, creator_id, video_id, video_title, signal_type,
          raw_text, topic, occurred_at, fulfilled, aid, rpid, parent_rpid, source
        ) VALUES (
          @user_id, @creator_id, @video_id, @video_title, @signal_type,
          @raw_text, @topic, @occurred_at, 0, @aid, @rpid, NULL, @source
        )
      `).run({
        user_id: DEMO_USER_ID,
        creator_id: String(view.owner.mid),
        video_id: String(aid),
        video_title: item.title || view.title,
        signal_type: 'comment_intent',
        raw_text: normalizeSignalText(item.source_content),
        topic: topicFromAid(aid),
        occurred_at: item.occurred_at,
        aid,
        rpid: item.source_id,
        source: 'backfill',
      });

      if (signalInsert.changes === 1) {
        totalSignals += 1;
      }

      ensureCreator(db, {
        id: String(item.mid_replier),
        name: item.replier_name,
      });

      const verdict = judgeAnswer({
        reply: {
          replier_mid: item.mid_replier,
          content: item.reply_content,
          like_count: item.like_count,
          is_top: item.is_top,
        },
        targetCreatorMid: view.owner.mid,
        videoTotalReplies: batch.replies.length,
      });

      const actionInsert = db.prepare(`
        INSERT OR IGNORE INTO creator_actions (
          creator_id, action_type, payload_json, topic, occurred_at, rpid,
          replying_to_rpid, is_answer, confidence, judge_reason, source
        ) VALUES (
          @creator_id, @action_type, @payload_json, @topic, @occurred_at, @rpid,
          @replying_to_rpid, @is_answer, @confidence, @judge_reason, @source
        )
      `).run({
        creator_id: String(item.mid_replier),
        action_type: inferActionType(item.reply_content),
        payload_json: JSON.stringify(buildActionPayload({
          aid,
          videoTitle: item.title || view.title,
          reply: item,
        })),
        topic: topicFromAid(aid),
        occurred_at: item.occurred_at,
        rpid: item.rpid,
        replying_to_rpid: item.source_id,
        is_answer: verdict.is_answer ? 1 : 0,
        confidence: verdict.confidence,
        judge_reason: verdict.judge_reason,
        source: 'backfill',
      });

      if (actionInsert.changes === 1) {
        totalActions += 1;
      }
    }

    if (!batch.hasMore || !batch.nextCursor) {
      break;
    }
    cursor = batch.nextCursor;
  }

  const totalCards = db.prepare('SELECT COUNT(*) AS c FROM cards WHERE user_id = ?').get(DEMO_USER_ID).c;
  broadcast(BACKFILL_EVENTS.DONE, {
    total_signals: totalSignals,
    total_actions: totalActions,
    total_cards: totalCards,
  });

  log.info('backfill done', { totalSignals, totalActions, totalCards });
  return {
    ok: true,
    totalSignals,
    totalActions,
    totalCards,
  };
}

async function main() {
  const { sessdata } = parseCliArgs(process.argv.slice(2));
  const result = await backfillOnce({ sessdata });
  log.info('cli finished', result);
}

const isMain = process.argv[1] && process.argv[1].endsWith('/historyBackfill.js');

if (isMain) {
  main().catch((err) => {
    log.error('backfill failed', { err: err.message, stack: err.stack });
    process.exitCode = 1;
  });
}
```

- [ ] Step 4 Run test, expect pass

```bash
node demo/backend/src/historyBackfill.test.js
```

Expected stdout:

```text
✅ backfillOnce paginates, dedups by rpid, and falls back to (待补)

🎉 historyBackfill tests green
```

- [ ] Step 5 Capture the CLI entry shape explicitly

```bash
node demo/backend/src/historyBackfill.js --sessdata=SESSDATA_EXAMPLE
```

Expected: 退出码为 `0`，并打印 `backfill done` / `cli finished` 两条 info log。

- [ ] Step 6 Commit with HEREDOC subject + footer

```bash
git add \
  demo/backend/src/historyBackfill.js \
  demo/backend/src/historyBackfill.test.js
git commit -F - <<'EOF'
feat(bilibili): T5·backfill 历史倒推 CLI + programmatic entry

补上一键历史倒推入口，支持 msgfeed 分页抓取、去重入库、
进度广播，以及 source_content 缺失时的 (待补) 降级。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
```

## Task T6: `ambient.js` adaptation + `cardBuilder` raw_text fallback
- Modify: `demo/backend/src/ambient.js`
- Modify: `demo/backend/src/cardBuilder.js`
- Modify: `demo/backend/src/cardBuilder.test.js`

- [ ] Step 1 Write failing regression test (`demo/backend/src/cardBuilder.test.js`)

```js
import { strict as assert } from 'node:assert';
import { buildCard } from './cardBuilder.js';

function mkMatch({ scriptId, signal_type = 'comment_intent', raw_text = '蹲链接姐妹们', daysAgo = 21, action_type = 'post_link' }) {
  const occurred = new Date(Date.now() - daysAgo * 86400_000).toISOString();
  return {
    signal: {
      id: 1,
      user_id: 'demo-user',
      creator_id: '123456',
      aid: 112233445566,
      rpid: 99887766,
      video_title: '磨毛圆领打底',
      signal_type,
      raw_text,
      topic: 'bilibili:aid:112233445566',
      occurred_at: occurred,
    },
    action: {
      id: 2,
      action_type,
      payload: {
        video_id: 'v-1',
        title: '姐妹们链接来啦',
        cover: 'https://example.com/c.jpg',
        product: { name: '磨毛上衣', price: '¥128', original: '¥189', shop: '大山的好物柜' },
        series_thumbnails: [{ day: 1, cover: 'x', title: 'Day1' }],
        preview_seconds: 10,
        summary: 'summary',
      },
    },
    creator: { id: 'c1', handle: '@大山的穿搭日记', display: '大山的穿搭日记', avatar: 'a', bio: 'b' },
    footprints: [{
      id: 9, occurred_at: occurred, video_title: '别的视频', signal_type: 'passive_interest',
    }],
    scriptId,
  };
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

runCase('剧本 A · P1 + P2 · 商品卡 · 主按钮「加到清单」', () => {
  const card = buildCard({ match: mkMatch({ scriptId: 'A' }), intentResult: {
    intent: 'link_request', label: '蹲链接', confidence: 0.9, rationale: 'r',
  }, userId: 'demo-user' });
  assert.deepEqual(card.pages.map((p) => p.id), ['P1', 'P2']);
  assert.equal(card.pages[0].answer.type, 'product_card');
  assert.equal(card.pages[0].emotional_close, '当时蹲的，这次替你接住了');
  const primaryLabels = card.pages[0].actions.primary.map((a) => a.label);
  assert.ok(primaryLabels.includes('加到清单'), `primary 含「加到清单」：${primaryLabels}`);
  assert.match(card.pages[0].context_line, /^你.+在「大山的穿搭日记」那儿.+「蹲链接姐妹们」$/);
});

runCase('剧本 B · P1 + P3 · 系列网格 · 情感收束「AI 帮你摘了前情」', () => {
  const card = buildCard({
    match: mkMatch({ scriptId: 'B', signal_type: 'watch_later', raw_text: null, action_type: 'series_completed' }),
    intentResult: { intent: 'series_catchup', label: '系列型蹲', confidence: 0.9, rationale: 'r' },
    userId: 'demo-user',
  });
  assert.deepEqual(card.pages.map((p) => p.id), ['P1', 'P3']);
  assert.equal(card.pages[0].answer.type, 'series_grid');
  assert.equal(card.pages[0].emotional_close, '你没来得及追完的，这次替你接上了');
  assert.ok(card.pages[0].actions.primary.some((a) => a.label === '续看'));
});

runCase('剧本 C · P1 + P2 + P3 · 内嵌视频 · 默认情感收束不再写死爷爷', () => {
  const card = buildCard({
    match: mkMatch({
      scriptId: 'C', signal_type: 'comment_intent', raw_text: '蹲后续 爷爷真帅',
      daysAgo: 14, action_type: 'post_sequel',
    }),
    intentResult: { intent: 'sequel_request', label: '蹲后续', confidence: 0.9, rationale: 'r' },
    userId: 'demo-user',
  });
  assert.deepEqual(card.pages.map((p) => p.id), ['P1', 'P2', 'P3']);
  assert.equal(card.pages[0].answer.type, 'inline_video');
  assert.equal(card.pages[0].answer.video.preview_seconds, 10);
  assert.equal(card.pages[0].emotional_close, '你蹲过的那条 · 她替你接回来了');
  assert.ok(!card.pages[0].actions.primary.some((a) => /分享给爷爷/.test(a.label)),
    '非爷爷剧本的默认 CTA 不应含"分享给爷爷"');
  assert.match(card.pages[1].warm_summary, /这件事|回音|惦记/);
  assert.ok(card.pages[2].items.length > 0, 'P3 行为足迹列表非空');
});

runCase('剧本 payload.cta / emotional_close 优先于默认', () => {
  const match = mkMatch({
    scriptId: 'C', signal_type: 'comment_intent', raw_text: '蹲后续 爷爷真帅',
    daysAgo: 14, action_type: 'post_sequel',
  });
  match.action.payload.cta = {
    primary: [
      { id: 'play_sequel', label: '立即观看下集' },
      { id: 'share_grandpa', label: '分享给爷爷' },
    ],
  };
  match.action.payload.emotional_close = '爷爷的老战友联系到他了';
  const card = buildCard({
    match,
    intentResult: { intent: 'sequel_request', label: '蹲后续', confidence: 0.9, rationale: 'r' },
    userId: 'demo-user',
  });
  assert.equal(card.pages[0].emotional_close, '爷爷的老战友联系到他了');
  assert.deepEqual(
    card.pages[0].actions.primary.map((a) => a.label),
    ['立即观看下集', '分享给爷爷'],
  );
});

runCase('P1 情景锚点使用相对时间而非绝对日期', () => {
  const card = buildCard({
    match: mkMatch({ scriptId: 'A', daysAgo: 30 }),
    intentResult: { intent: 'link_request', label: '蹲链接', confidence: 0.9, rationale: 'r' },
    userId: 'demo-user',
  });
  assert.match(card.pages[0].context_line, /(个月前|周前|天前|昨天|今天)/);
});

runCase('raw_text 为空字符串时 P1 my_comment 回退到 video_title', () => {
  const card = buildCard({
    match: mkMatch({ scriptId: 'A', raw_text: '' }),
    intentResult: { intent: 'link_request', label: '蹲链接', confidence: 0.9, rationale: 'r' },
    userId: 'demo-user',
  });
  assert.equal(card.pages[0].my_comment, '磨毛圆领打底');
  assert.match(card.pages[0].context_line, /《磨毛圆领打底》/);
});

runCase('raw_text 为 (待补) 时 P1/P2 都回退到 video_title', () => {
  const card = buildCard({
    match: mkMatch({ scriptId: 'A', raw_text: '(待补)' }),
    intentResult: { intent: 'link_request', label: '蹲链接', confidence: 0.9, rationale: 'r' },
    userId: 'demo-user',
  });
  assert.equal(card.pages[0].my_comment, '磨毛圆领打底');
  assert.match(card.pages[0].context_line, /《磨毛圆领打底》/);
  assert.equal(card.pages[1].trigger_signal, '你评论了《磨毛圆领打底》');
});

runCase('buildCard 在 match 缺失时抛错', () => {
  assert.throws(() => buildCard({ match: null, intentResult: {}, userId: 'u' }),
    /buildCard: match\.signal/);
});

if (process.exitCode) {
  console.error('\n🔥 cardBuilder tests failed');
  process.exit(process.exitCode);
} else {
  console.log('\n🎉 cardBuilder tests green');
}
```

- [ ] Step 2 Run, expect fail

```bash
node demo/backend/src/cardBuilder.test.js
```

Expected stderr:

```text
❌ raw_text 为空字符串时 P1 my_comment 回退到 video_title
   → Expected values to be strictly equal:

'' !== '磨毛圆领打底'

🔥 cardBuilder tests failed
```

- [ ] Step 3 Update `demo/backend/src/ambient.js` candidate selection and loop-mode guard

FROM:

```js
function pickNextCandidate(db, { userId, topic = null, signalId = null }) {
  const NOT_FULFILLED_TOPIC = `
    AND NOT EXISTS (
      SELECT 1 FROM cards cd
        JOIN intent_signals si ON si.id = cd.intent_signal_id
       WHERE cd.user_id = s.user_id AND si.topic = s.topic
    )
  `;
  if (signalId) {
    return db.prepare(`
      SELECT s.*, ca.id AS action_id, ca.action_type, ca.payload_json,
             ca.occurred_at AS action_occurred, c.handle, c.display AS creator_display,
             c.avatar AS creator_avatar, c.bio AS creator_bio
        FROM intent_signals s
        JOIN creator_actions ca ON ca.topic = s.topic
        JOIN creators c ON c.id = s.creator_id
       WHERE s.id = ? AND s.user_id = ? AND s.fulfilled = 0
         ${NOT_FULFILLED_TOPIC}
       ORDER BY ca.occurred_at DESC
       LIMIT 1
    `).get(signalId, userId);
  }
  if (topic) {
    return db.prepare(`
      SELECT s.*, ca.id AS action_id, ca.action_type, ca.payload_json,
             ca.occurred_at AS action_occurred, c.handle, c.display AS creator_display,
             c.avatar AS creator_avatar, c.bio AS creator_bio
        FROM intent_signals s
        JOIN creator_actions ca ON ca.topic = s.topic
        JOIN creators c ON c.id = s.creator_id
       WHERE s.topic = ? AND s.user_id = ? AND s.fulfilled = 0
         ${NOT_FULFILLED_TOPIC}
       ORDER BY s.occurred_at ASC, ca.occurred_at DESC
       LIMIT 1
    `).get(topic, userId);
  }
  return db.prepare(`
    SELECT s.*, ca.id AS action_id, ca.action_type, ca.payload_json,
           ca.occurred_at AS action_occurred, c.handle, c.display AS creator_display,
           c.avatar AS creator_avatar, c.bio AS creator_bio
      FROM intent_signals s
      JOIN creator_actions ca ON ca.topic = s.topic
      JOIN creators c ON c.id = s.creator_id
     WHERE s.user_id = ? AND s.fulfilled = 0
       ${NOT_FULFILLED_TOPIC}
     ORDER BY s.occurred_at ASC, ca.occurred_at DESC
     LIMIT 1
  `).get(userId);
}
```

TO:

```js
function hasRealSignalRows(db, userId) {
  const row = db.prepare(`
    SELECT COUNT(*) AS c
      FROM intent_signals
     WHERE user_id = ?
       AND COALESCE(source, 'mock') != 'mock'
  `).get(userId);
  return row.c > 0;
}

function pickNextCandidate(db, { userId, topic = null, signalId = null }) {
  const BASE_SQL = `
    SELECT s.*, ca.id AS action_id, ca.action_type, ca.payload_json,
           ca.occurred_at AS action_occurred, c.handle, c.display AS creator_display,
           c.avatar AS creator_avatar, c.bio AS creator_bio
      FROM intent_signals s
      JOIN creators c ON c.id = s.creator_id
      JOIN creator_actions ca
        ON ca.is_answer = 1
       AND (
         ca.replying_to_rpid = s.rpid
         OR (
           ca.replying_to_rpid IS NULL
           AND ca.source = 'L2'
           AND ca.topic = s.topic
         )
       )
     WHERE s.user_id = ?
       AND s.fulfilled = 0
       AND NOT EXISTS (
         SELECT 1
           FROM cards cd
          WHERE cd.intent_signal_id = s.id
       )
  `;

  if (signalId) {
    return db.prepare(`
      ${BASE_SQL}
        AND s.id = ?
      ORDER BY ca.confidence DESC, ca.occurred_at DESC
      LIMIT 1
    `).get(userId, signalId);
  }

  if (topic) {
    return db.prepare(`
      ${BASE_SQL}
        AND s.topic = ?
      ORDER BY s.occurred_at ASC, ca.confidence DESC, ca.occurred_at DESC
      LIMIT 1
    `).get(userId, topic);
  }

  return db.prepare(`
    ${BASE_SQL}
    ORDER BY s.occurred_at ASC, ca.confidence DESC, ca.occurred_at DESC
    LIMIT 1
  `).get(userId);
}
```

- [ ] Step 4 Update `demo/backend/src/ambient.js` signal payload, footprints query, and pending logic

FROM:

```js
  let pick = pickNextCandidate(db, { userId, topic, signalId });

  let didLoopReset = false;
  if (!pick && loopMode) {
    softResetForLoop(db);
    didLoopReset = true;
    pick = pickNextCandidate(db, { userId, topic, signalId });
  }

  const signal = {
    id: pick.id,
    user_id: pick.user_id,
    creator_id: pick.creator_id,
    video_id: pick.video_id,
    video_title: pick.video_title,
    signal_type: pick.signal_type,
    raw_text: pick.raw_text,
    topic: pick.topic,
    occurred_at: pick.occurred_at,
    fulfilled: 0,
  };

  const footprints = db
    .prepare(
      `SELECT * FROM intent_signals
        WHERE user_id = ? AND topic = ?
        ORDER BY occurred_at DESC LIMIT 6`,
    )
    .all(userId, signal.topic);

export function hasPendingAmbient(userId, { loopMode = false } = {}) {
  const db = getDb();
  if (loopMode) {
    const row = db.prepare(`
      SELECT COUNT(*) AS c
        FROM intent_signals s
        JOIN creator_actions ca ON ca.topic = s.topic
       WHERE s.user_id = ?
    `).get(userId);
    return row.c > 0;
  }
  const row = db.prepare(`
    SELECT COUNT(DISTINCT s.topic) AS c
      FROM intent_signals s
      JOIN creator_actions ca ON ca.topic = s.topic
     WHERE s.user_id = ?
       AND s.fulfilled = 0
       AND NOT EXISTS (
         SELECT 1 FROM cards cd
           JOIN intent_signals si ON si.id = cd.intent_signal_id
          WHERE cd.user_id = s.user_id AND si.topic = s.topic
       )
  `).get(userId);
  return row.c > 0;
}
```

TO:

```js
  const useLoopReplay = loopMode && !hasRealSignalRows(db, userId);
  let pick = pickNextCandidate(db, { userId, topic, signalId });

  if (!pick && useLoopReplay) {
    softResetForLoop(db);
    pick = pickNextCandidate(db, { userId, topic, signalId });
  }

  const signal = {
    id: pick.id,
    user_id: pick.user_id,
    creator_id: pick.creator_id,
    video_id: pick.video_id,
    video_title: pick.video_title,
    signal_type: pick.signal_type,
    raw_text: pick.raw_text,
    topic: pick.topic,
    occurred_at: pick.occurred_at,
    fulfilled: 0,
    aid: pick.aid ?? null,
    rpid: pick.rpid ?? null,
    parent_rpid: pick.parent_rpid ?? null,
    source: pick.source ?? 'mock',
  };

  const footprints = db
    .prepare(
      `SELECT * FROM intent_signals
        WHERE user_id = ?
          AND (
            rpid = ?
            OR (
              aid IS NOT NULL
              AND aid = ?
            )
          )
        ORDER BY occurred_at DESC LIMIT 6`,
    )
    .all(userId, signal.rpid ?? -1, signal.aid ?? -1);

export function hasPendingAmbient(userId, { loopMode = false } = {}) {
  const db = getDb();
  const useLoopReplay = loopMode && !hasRealSignalRows(db, userId);

  if (useLoopReplay) {
    const row = db.prepare(`
      SELECT COUNT(*) AS c
        FROM intent_signals s
        JOIN creator_actions ca ON ca.topic = s.topic
       WHERE s.user_id = ?
    `).get(userId);
    return row.c > 0;
  }

  const row = db.prepare(`
    SELECT COUNT(*) AS c
      FROM intent_signals s
     WHERE s.user_id = ?
       AND s.fulfilled = 0
       AND NOT EXISTS (
         SELECT 1 FROM cards cd
          WHERE cd.intent_signal_id = s.id
       )
       AND EXISTS (
         SELECT 1
           FROM creator_actions ca
          WHERE ca.is_answer = 1
            AND (
              ca.replying_to_rpid = s.rpid
              OR (
                ca.replying_to_rpid IS NULL
                AND ca.source = 'L2'
                AND ca.topic = s.topic
              )
            )
       )
  `).get(userId);

  return row.c > 0;
}
```

- [ ] Step 5 Update `demo/backend/src/cardBuilder.js` raw-text fallback

FROM:

```js
function buildContextLine({ signal, creator }) {
  const relative = RELATIVE_TIME_CN(signal.occurred_at);
  const verb = ACTION_VERB_BY_SIGNAL[signal.signal_type] ?? '关注过';
  const tail = signal.raw_text
    ? `「${signal.raw_text}」`
    : `《${signal.video_title}》`;
  return `你 ${relative} 在「${creator.display}」那儿${verb} ${tail}`;
}

function buildP2({ intentResult, signal, creator, action }) {
  const triggerSignal = signal.raw_text
    ? `你在《${signal.video_title}》下评论「${signal.raw_text}」`
    : `你${ACTION_VERB_BY_SIGNAL[signal.signal_type] ?? '关注过'}《${signal.video_title}》`;

  return {
    id: 'P2',
    name: '为什么这次会记得你',
    trigger_signal: triggerSignal,
    ai_intent: `${intentResult.label} · 把握度 ${(intentResult.confidence * 100).toFixed(0)}%`,
    rationale: intentResult.rationale,
    matched_basis: matchedBasis,
    warm_summary: `你惦记过的这件事，这次终于有回音了`,
  };
}

const p1 = {
  id: 'P1',
  name: '情景 + 答案',
  my_comment: signal.raw_text ?? '',
  occurred_relative: occurredRelative,
  headline,
  context_line: buildContextLine({ signal, creator }),
  emotional_close: action?.payload?.emotional_close ?? defaultClose,
  answer: buildAnswer({ scriptId, action }),
  actions: buildActionsStrip(scriptId, action),
  creator,
};
```

TO:

```js
function getSignalRawText(signal) {
  const text = typeof signal.raw_text === 'string' ? signal.raw_text.trim() : '';
  if (!text || text === '(待补)') return '';
  return text;
}

function buildContextLine({ signal, creator }) {
  const relative = RELATIVE_TIME_CN(signal.occurred_at);
  const verb = ACTION_VERB_BY_SIGNAL[signal.signal_type] ?? '关注过';
  const rawText = getSignalRawText(signal);
  const tail = rawText
    ? `「${rawText}」`
    : `《${signal.video_title}》`;
  return `你 ${relative} 在「${creator.display}」那儿${verb} ${tail}`;
}

function buildP2({ intentResult, signal, creator, action }) {
  const rawText = getSignalRawText(signal);
  const triggerSignal = rawText
    ? `你在《${signal.video_title}》下评论「${rawText}」`
    : `你${ACTION_VERB_BY_SIGNAL[signal.signal_type] ?? '关注过'}《${signal.video_title}》`;

  return {
    id: 'P2',
    name: '为什么这次会记得你',
    trigger_signal: triggerSignal,
    ai_intent: `${intentResult.label} · 把握度 ${(intentResult.confidence * 100).toFixed(0)}%`,
    rationale: intentResult.rationale,
    matched_basis: matchedBasis,
    warm_summary: `你惦记过的这件事，这次终于有回音了`,
  };
}

const rawText = getSignalRawText(signal);

const p1 = {
  id: 'P1',
  name: '情景 + 答案',
  my_comment: rawText || signal.video_title,
  occurred_relative: occurredRelative,
  headline,
  context_line: buildContextLine({ signal, creator }),
  emotional_close: action?.payload?.emotional_close ?? defaultClose,
  answer: buildAnswer({ scriptId, action }),
  actions: buildActionsStrip(scriptId, action),
  creator,
};
```

- [ ] Step 6 Run regression bundle, expect pass

```bash
node demo/backend/src/cardBuilder.test.js && \
node demo/backend/src/ingest.test.js && \
node demo/backend/src/historyBackfill.test.js
```

Expected stdout:

```text
🎉 cardBuilder tests green
🎉 ingest tests green
🎉 historyBackfill tests green
```

- [ ] Step 7 Commit with HEREDOC subject + footer

```bash
git add \
  demo/backend/src/ambient.js \
  demo/backend/src/cardBuilder.js \
  demo/backend/src/cardBuilder.test.js
git commit -F - <<'EOF'
feat(bilibili): T6·ambient 真实库匹配 + DunCard fallback

关闭真实 B 站数据下的 loop replay 假设，改为按 rpid/L2 topic 匹配答案，
并让 DunCard 在 raw_text 为空或 (待补) 时回退到 video_title。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
```

## Self-Review

### Spec coverage
- T1 覆盖 spec §6 的 migration、`user_version`、`idx_intent_rpid` / `idx_action_rpid`。
- T2 覆盖 spec §5.2 的 `fetchMsgfeedReply` / `fetchVideoReplies` / `fetchVideoView`、`RATE_LIMIT_MS = 1000`、3 次指数退避。
- T3 覆盖 spec §5.4 的 R1 规则链，落到 `is_answer` / `confidence` / `judge_reason` 三字段，并补 20+ 条真实评论样本。
- T4 覆盖 spec §7.1 的 5 个 HTTP 端点、重复 `rpid` 幂等、插入后 WS 广播，以及 `source = hook | L1 | L2` 的入库路径。
- T5 覆盖 spec §4.1 / §7.2 的一次性倒推、分页、`backfill.progress` / `backfill.done`、R8 的 `content = '(待补)'` 降级。
- T6 覆盖 spec §10 的 R7 / R8：真实数据下禁用 loop replay，按 `replying_to_rpid` + `L2 topic` 取答案，且 `DunCard` 在 `raw_text` 缺失时回退到 `video_title`。

### Placeholder scan
- 全文没有 `TODO` / `TBD` / 三连点占位符 / “similar to above”。
- 每个步骤都带完整代码块或完整命令块，创建文件时给出整文件内容，修改现有大文件时给出完整 `FROM` / `TO` 连续片段。
- 每个 task 都有可直接执行的 commit HEREDOC，footer 已写死，不需要补填。

### Type consistency
- 字段名统一使用 `aid`、`rpid`、`parent_rpid`、`replying_to_rpid`、`source`、`is_answer`、`confidence`、`judge_reason`。
- 真实 B 站数据在 `intent_signals` / `creator_actions` 都统一用 `topicFromAid(aid) => "bilibili:aid:<aid>"`，避免 T4 ingest、T5 backfill、T6 ambient 之间 topic 漂移。
- 常量数值统一落死到代码：`JUDGE_THRESHOLD = 0.3`、`RATE_LIMIT_MS = 1000`、`MAX_RETRIES = 3`。
- `cardBuilder` / `ingest` / `historyBackfill` 共用相同 payload 约定：`payload.summary` 保存回复正文，`payload.reply.content` 作为兜底，便于 `GET /api/my-comments` 与卡片渲染复用。
