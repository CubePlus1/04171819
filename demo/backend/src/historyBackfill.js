import express from 'express';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBilibiliClient } from './bilibili.js';
import { getDb } from './db.js';
import { judgeAnswer } from './answerJudge.js';
import { createLogger } from './logger.js';

const log = createLogger('historyBackfill');
const DEMO_USER_ID = 'demo-user';
const DUPLICATE_PAGE_LIMIT = 2;

export const BACKFILL_EVENTS = Object.freeze({
  PROGRESS: 'backfill.progress',
  DONE: 'backfill.done',
});

function topicFromAid(aid) {
  return `bilibili:aid:${aid}`;
}

function createRunId() {
  return `backfill_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeSignalText(text) {
  return typeof text === 'string' && text.trim() ? text.trim() : '(待补)';
}

function normalizeDisplayName(value, fallback) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return fallback;
}

function inferActionType(content) {
  if (/教程|做法|怎么做|怎么弄/u.test(content)) return 'reply_tutorial';
  if (/后续|下集|更新/u.test(content)) return 'post_sequel';
  if (/系列|合集|更完了|完结/u.test(content)) return 'series_completed';
  return 'post_link';
}

function ensureDemoUser(db) {
  db.prepare(`
    INSERT OR IGNORE INTO users (id, nickname, avatar)
    VALUES (?, ?, ?)
  `).run(DEMO_USER_ID, 'Demo User', null);
}

function ensureCreator(db, { id, name, avatar = null, bio = null }) {
  const display = normalizeDisplayName(name, String(id));
  db.prepare(`
    INSERT OR IGNORE INTO creators (id, handle, display, avatar, bio)
    VALUES (@id, @handle, @display, @avatar, @bio)
  `).run({
    id: String(id),
    handle: `@${display}`,
    display,
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

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function serializeStatus(activeRun, lastRun) {
  if (activeRun) {
    return {
      ok: true,
      active: true,
      status: 'running',
      runId: activeRun.runId,
      startedAt: activeRun.startedAt,
      finishedAt: null,
      progress: activeRun.progress,
      result: null,
      error: null,
    };
  }

  return {
    ok: true,
    active: false,
    status: lastRun ? (lastRun.error ? 'error' : 'done') : 'idle',
    runId: lastRun?.runId ?? null,
    startedAt: lastRun?.startedAt ?? null,
    finishedAt: lastRun?.finishedAt ?? null,
    progress: lastRun?.progress ?? null,
    result: lastRun?.result ?? null,
    error: lastRun?.error ?? null,
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

  ensureDemoUser(db);

  const insertSignal = db.prepare(`
    INSERT OR IGNORE INTO intent_signals (
      user_id, creator_id, video_id, video_title, signal_type,
      raw_text, topic, occurred_at, fulfilled, aid, rpid, parent_rpid, source
    ) VALUES (
      @user_id, @creator_id, @video_id, @video_title, @signal_type,
      @raw_text, @topic, @occurred_at, 0, @aid, @rpid, NULL, @source
    )
  `);

  const insertAction = db.prepare(`
    INSERT OR IGNORE INTO creator_actions (
      creator_id, action_type, payload_json, topic, occurred_at, rpid,
      replying_to_rpid, is_answer, confidence, judge_reason, source
    ) VALUES (
      @creator_id, @action_type, @payload_json, @topic, @occurred_at, @rpid,
      @replying_to_rpid, @is_answer, @confidence, @judge_reason, @source
    )
  `);

  const countCards = db.prepare('SELECT COUNT(*) AS c FROM cards WHERE user_id = ?');
  const viewCache = new Map();
  let cursor = null;
  let page = 0;
  let totalSignals = 0;
  let totalActions = 0;
  let duplicateOnlyPages = 0;

  while (true) {
    const batch = await client.fetchMsgfeedReply({ sessdata, cursor, ps: 20 });
    const replies = Array.isArray(batch?.replies) ? batch.replies : [];
    page += 1;

    let insertsThisPage = 0;

    for (const item of replies) {
      const aid = Number(item.business_id);
      const signalRpid = Number(item.source_id);
      const actionRpid = Number(item.rpid);

      if (!isPositiveInteger(aid) || !isPositiveInteger(signalRpid) || !isPositiveInteger(actionRpid)) {
        log.warn('skip malformed msgfeed item', {
          aid,
          signal_rpid: signalRpid,
          action_rpid: actionRpid,
        });
        continue;
      }

      let view = viewCache.get(aid);
      if (!view) {
        view = await client.fetchVideoView({ aid });
        viewCache.set(aid, view);
      }

      const ownerMid = Number(view?.owner?.mid);
      const creatorMid = isPositiveInteger(ownerMid) ? ownerMid : Number(item.mid_replier);
      const creatorId = isPositiveInteger(creatorMid) ? String(creatorMid) : '0';
      const videoTitle = normalizeDisplayName(item.title, normalizeDisplayName(view?.title, 'Bilibili 评论区'));

      ensureCreator(db, {
        id: creatorId,
        name: normalizeDisplayName(view?.owner?.name, creatorId),
        avatar: view?.owner?.face ?? null,
        bio: view?.desc ?? null,
      });

      const signalInsert = insertSignal.run({
        user_id: DEMO_USER_ID,
        creator_id: creatorId,
        video_id: String(aid),
        video_title: videoTitle,
        signal_type: 'comment_intent',
        raw_text: normalizeSignalText(item.source_content),
        topic: topicFromAid(aid),
        occurred_at: item.occurred_at,
        aid,
        rpid: signalRpid,
        source: 'backfill',
      });

      if (signalInsert.changes === 1) {
        totalSignals += 1;
        insertsThisPage += 1;
      }

      const replierMid = Number(item.mid_replier);
      const replierId = isPositiveInteger(replierMid) ? String(replierMid) : creatorId;
      const replierName = normalizeDisplayName(item.replier_name, replierId);

      ensureCreator(db, {
        id: replierId,
        name: replierName,
      });

      const replyContent = normalizeDisplayName(item.reply_content, '');
      const verdict = judgeAnswer({
        reply: {
          replier_mid: Number(replierId),
          content: replyContent,
          like_count: Number(item.like_count ?? 0),
          is_top: Boolean(item.is_top),
        },
        targetCreatorMid: isPositiveInteger(ownerMid) ? ownerMid : null,
        videoTotalReplies: replies.length,
      });

      const actionInsert = insertAction.run({
        creator_id: replierId,
        action_type: inferActionType(replyContent),
        payload_json: JSON.stringify(buildActionPayload({
          aid,
          videoTitle,
          reply: {
            ...item,
            reply_content: replyContent,
            replier_name: replierName,
          },
        })),
        topic: topicFromAid(aid),
        occurred_at: item.occurred_at,
        rpid: actionRpid,
        replying_to_rpid: signalRpid,
        is_answer: verdict.is_answer ? 1 : 0,
        confidence: verdict.confidence,
        judge_reason: verdict.judge_reason,
        source: 'backfill',
      });

      if (actionInsert.changes === 1) {
        totalActions += 1;
        insertsThisPage += 1;
      }
    }

    broadcast(BACKFILL_EVENTS.PROGRESS, {
      stage: 'fetch_page',
      current: page,
      total: null,
      hint: `cursor=${cursor ?? 'start'} items=${replies.length} inserted=${insertsThisPage}`,
    });

    duplicateOnlyPages = insertsThisPage === 0 ? duplicateOnlyPages + 1 : 0;

    if (!batch?.hasMore || !batch?.nextCursor) {
      break;
    }

    if (duplicateOnlyPages >= DUPLICATE_PAGE_LIMIT) {
      log.info('stop on duplicate-only pages', { page, duplicate_only_pages: duplicateOnlyPages });
      break;
    }

    cursor = batch.nextCursor;
  }

  const totalCards = countCards.get(DEMO_USER_ID).c;
  const donePayload = {
    total_signals: totalSignals,
    total_actions: totalActions,
    total_cards: totalCards,
  };

  broadcast(BACKFILL_EVENTS.DONE, donePayload);
  log.info('backfill done', { totalSignals, totalActions, totalCards });

  return {
    ok: true,
    totalSignals,
    totalActions,
    totalCards,
  };
}

export function buildHistoryBackfillRouter({
  db = getDb(),
  createClient = () => createBilibiliClient(),
  broadcast = () => {},
  runBackfill = backfillOnce,
  createRunId: createId = createRunId,
  now = () => new Date().toISOString(),
} = {}) {
  const router = express.Router();
  let activeRun = null;
  let lastRun = null;

  router.post('/backfill/start', (req, res) => {
    const sessdata = typeof req.body?.sessdata === 'string' ? req.body.sessdata.trim() : '';
    if (!sessdata) {
      return res.status(400).json({ ok: false, reason: 'sessdata_required' });
    }

    if (activeRun) {
      return res.status(409).json({ ok: false, reason: 'backfill_in_progress' });
    }

    const runState = {
      runId: createId(),
      startedAt: now(),
      progress: null,
    };
    activeRun = runState;

    const forwardEvent = (type, payload) => {
      if (type === BACKFILL_EVENTS.PROGRESS) {
        runState.progress = payload;
      }
      broadcast(type, payload);
    };

    void Promise.resolve()
      .then(async () => {
        const result = await runBackfill({
          sessdata,
          db,
          client: createClient(),
          broadcast: forwardEvent,
        });

        lastRun = {
          runId: runState.runId,
          startedAt: runState.startedAt,
          finishedAt: now(),
          progress: runState.progress,
          result,
          error: null,
        };
        if (activeRun === runState) {
          activeRun = null;
        }
      })
      .catch((err) => {
        log.error('backfill failed', { err: err.message, stack: err.stack });
        lastRun = {
          runId: runState.runId,
          startedAt: runState.startedAt,
          finishedAt: now(),
          progress: runState.progress,
          result: null,
          error: err.message,
        };
        if (activeRun === runState) {
          activeRun = null;
        }
      });

    return res.json({ ok: true, runId: runState.runId });
  });

  router.get('/backfill/status', (_req, res) => {
    return res.json(serializeStatus(activeRun, lastRun));
  });

  return router;
}

async function main() {
  const { sessdata } = parseCliArgs(process.argv.slice(2));
  const result = await backfillOnce({ sessdata });
  log.info('cli finished', result);
}

const isMain = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((err) => {
    log.error('backfill failed', { err: err.message, stack: err.stack });
    process.exitCode = 1;
  });
}
