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
  if (nullable && (value === null || value === undefined)) {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isInteger(numeric)) {
    throw new Error(`${fieldName} must be an integer`);
  }

  return numeric;
}

function toStringValue(value, fieldName, { nullable = false } = {}) {
  if (nullable && (value === null || value === undefined)) {
    return null;
  }

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
  if (/教程|做法|怎么做|怎么弄/u.test(content)) {
    return 'reply_tutorial';
  }
  if (/后续|下集|更新/u.test(content)) {
    return 'post_sequel';
  }
  if (/系列|合集|更完了|完结/u.test(content)) {
    return 'series_completed';
  }
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
    if (row) {
      return row;
    }
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

function parsePayloadJson(payloadJson) {
  try {
    return JSON.parse(payloadJson);
  } catch {
    return {};
  }
}

function findTopAnswerForSignal(db, signal) {
  return db.prepare(`
    SELECT ca.*
      FROM creator_actions ca
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
  `).get(signal.rpid, signal.topic);
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
      if (filter === 'fulfilled') {
        return item.fulfilled === 1;
      }
      if (filter === 'pending') {
        return item.fulfilled === 0;
      }
      return true;
    }),
  };
}

function duplicateResponse(res) {
  return res.status(409).json({ ok: false, reason: 'duplicate_rpid' });
}

function fireAmbientTrigger(triggerAmbient, payload) {
  if (typeof triggerAmbient !== 'function' || !payload?.topic) {
    return;
  }

  try {
    const pending = triggerAmbient(payload);
    if (pending && typeof pending.catch === 'function') {
      pending.catch((err) => {
        log.warn('ambient trigger failed', { topic: payload.topic, err: err.message });
      });
    }
  } catch (err) {
    log.warn('ambient trigger failed', { topic: payload.topic, err: err.message });
  }
}

export function buildIngestRouter({ db = getDb(), broadcast = () => {}, triggerAmbient = null } = {}) {
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

      broadcast(INGEST_EVENTS.SIGNAL_INGESTED, {
        signal_id: result.lastInsertRowid,
        aid,
        rpid,
      });

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

      if (verdict.is_answer) {
        fireAmbientTrigger(triggerAmbient, {
          userId: DEMO_USER_ID,
          topic,
        });
      }

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
      const answerTopics = new Set();

      for (const item of batch) {
        const rpid = toNumber(item?.rpid, 'batch.rpid');
        const replierMid = toNumber(item?.replier_mid, 'batch.replier_mid');
        const replierName = toStringValue(item?.replier_name, 'batch.replier_name');
        const content = toStringValue(item?.content, 'batch.content');
        const likeCount = Number(item?.like_count ?? 0);
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
          if (verdict.is_answer) {
            answers += 1;
            answerTopics.add(topic);
          }
          broadcast(INGEST_EVENTS.ACTION_INGESTED, {
            action_id: result.lastInsertRowid,
            aid,
            rpid,
            source,
            is_answer: verdict.is_answer,
          });
        }
      }

      for (const answerTopic of answerTopics) {
        fireAmbientTrigger(triggerAmbient, {
          userId: DEMO_USER_ID,
          topic: answerTopic,
        });
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
    const rows = stmt.all(...rpids);

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
