import { DWSClient } from './ws_client.js';

const BACKEND_URL = 'http://localhost:4000';
const FRONTEND_URL = 'http://localhost:5173';
const BILI_API = 'https://api.bilibili.com';
const RATE_LIMIT_MS = 1000;
const MSGFEED_ALARM = 'msgfeed-poll';
const TOP_REPLY_ALARM = 'top-reply-poll';
const WS_URL = 'ws://localhost:4000/ws';
const DEFAULT_NOTIFICATION_MESSAGE = '点击查看详情';

let lastBiliRequestAt = 0;
let biliRequestQueue = Promise.resolve();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toInteger(value, fallback = null) {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : fallback;
}

function toStringOr(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function toIsoString(value) {
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const millis = value > 1e12 ? value : value * 1000;
    return new Date(millis).toISOString();
  }

  return new Date().toISOString();
}

function scheduleBiliRequest(task) {
  const run = biliRequestQueue
    .catch(() => {})
    .then(async () => {
      const elapsed = Date.now() - lastBiliRequestAt;
      if (lastBiliRequestAt !== 0 && elapsed < RATE_LIMIT_MS) {
        await sleep(RATE_LIMIT_MS - elapsed);
      }

      lastBiliRequestAt = Date.now();
      return task();
    });

  biliRequestQueue = run.catch(() => {});
  return run;
}

async function fetchBiliJson(url) {
  return scheduleBiliRequest(async () => {
    const response = await fetch(url, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }

    return response.json();
  });
}

async function postJson(path, payload) {
  const response = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const isJson = (response.headers.get('content-type') || '').includes('application/json');
  const body = isJson ? await response.json() : null;
  if (response.ok || response.status === 409) {
    return {
      ok: response.ok,
      duplicate: response.status === 409,
      body,
    };
  }

  throw new Error(body?.reason || body?.error || `HTTP ${response.status}`);
}

async function getSessData() {
  const cookie = await chrome.cookies.get({
    url: 'https://www.bilibili.com',
    name: 'SESSDATA',
  });

  return cookie?.value ?? null;
}

function normalizeMsgfeedItem(item) {
  const row = item && typeof item === 'object' ? item : {};
  const inner = row.item && typeof row.item === 'object' ? row.item : {};
  const user = row.user && typeof row.user === 'object' ? row.user : {};

  const replyingToRpid = toInteger(
    row.source_id ??
    inner.source_id ??
    inner.root_reply_id ??
    inner.reply_to_reply_id,
  );
  const rpid = toInteger(
    row.rpid ??
    inner.target_id ??
    inner.id ??
    inner.reply_id,
  );
  const aid = toInteger(
    row.business_id ??
    inner.business_id ??
    inner.oid ??
    inner.item_id,
  );
  const replierMid = toInteger(
    row.mid_replier ??
    row.mid ??
    user.mid ??
    row.user_id,
  );
  const replierName = toStringOr(
    row.replier_name ??
    user.nickname ??
    user.uname ??
    row.user_name,
    replierMid ? String(replierMid) : '',
  );
  const content = toStringOr(
    row.reply_content ??
    inner.target_reply_content ??
    inner.detail_text ??
    inner.title,
    '(待补)',
  );

  return {
    source: 'L1',
    replying_to_rpid: replyingToRpid,
    rpid,
    replier_mid: replierMid,
    replier_name: replierName,
    content,
    like_count: Number(row.like ?? row.like_count ?? inner.like ?? 0) || 0,
    is_up: Boolean(row.is_up ?? inner.is_up),
    is_top: Boolean(row.is_top ?? inner.is_top),
    aid,
    occurred_at: toIsoString(row.occurred_at ?? row.reply_time ?? row.ctime ?? inner.ctime),
  };
}

function normalizeTopReplyItem(item, upperMid) {
  const row = item && typeof item === 'object' ? item : {};
  const replyMid = toInteger(row.mid ?? row.member?.mid ?? row.mid_replier);
  const content = toStringOr(row.content?.message ?? row.reply_content, '');

  return {
    rpid: toInteger(row.rpid),
    replier_mid: replyMid,
    replier_name: toStringOr(row.member?.uname ?? row.replier_name, replyMid ? String(replyMid) : ''),
    content,
    like_count: Number(row.like ?? row.like_count ?? 0) || 0,
    is_up: upperMid !== null && replyMid === upperMid,
    is_top: Boolean(row.top ?? row.is_top),
    occurred_at: toIsoString(row.occurred_at ?? row.ctime),
  };
}

async function ensureAlarm(name, periodInMinutes) {
  const existing = await chrome.alarms.get(name);
  if (!existing) {
    chrome.alarms.create(name, { periodInMinutes });
  }
}

async function ensureAlarms() {
  await ensureAlarm(MSGFEED_ALARM, 15);
  await ensureAlarm(TOP_REPLY_ALARM, 30);
  console.log('[Dundao] alarms ready');
}

export async function pollMsgfeed() {
  const sessdata = await getSessData();
  if (!sessdata) {
    console.warn('[Dundao] msgfeed skipped: SESSDATA missing');
    return { ok: false, reason: 'sessdata_missing' };
  }

  try {
    const data = await fetchBiliJson(`${BILI_API}/x/msgfeed/reply?platform=web&ps=20`);
    if (data?.code !== 0) {
      console.warn('[Dundao] msgfeed returned code', data?.code, data?.message);
      return { ok: false, reason: 'bilibili_error' };
    }

    const items = Array.isArray(data?.data?.items) ? data.data.items : [];
    let ingested = 0;

    for (const item of items) {
      const payload = normalizeMsgfeedItem(item);
      if (!payload.replying_to_rpid || !payload.rpid || !payload.replier_mid || !payload.replier_name || !payload.aid) {
        console.warn('[Dundao] msgfeed skipped malformed item', payload);
        continue;
      }

      try {
        const result = await postJson('/api/ingest/reply', payload);
        if (!result.duplicate) {
          ingested += 1;
        }
      } catch (error) {
        console.warn('[Dundao] ingest/reply failed', error);
      }
    }

    console.log('[Dundao] msgfeed poll done', { total: items.length, ingested });
    return { ok: true, total: items.length, ingested };
  } catch (error) {
    console.error('[Dundao] msgfeed poll failed', error);
    return { ok: false, reason: error.message };
  }
}

export async function pollTopReplies() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/my-comments?filter=pending`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for pending comments`);
    }

    const data = await response.json();
    const aids = Array.from(new Set(
      (Array.isArray(data?.items) ? data.items : [])
        .map((item) => toInteger(item?.aid))
        .filter(Boolean),
    )).slice(0, 10);

    let processed = 0;
    for (const aid of aids) {
      try {
        const replyData = await fetchBiliJson(`${BILI_API}/x/v2/reply?type=1&oid=${aid}&sort=2&ps=20`);
        if (replyData?.code !== 0) {
          console.warn('[Dundao] top-reply returned code', { aid, code: replyData?.code, message: replyData?.message });
          continue;
        }

        const upperMid = toInteger(replyData?.data?.upper?.mid);
        const batch = (Array.isArray(replyData?.data?.replies) ? replyData.data.replies : [])
          .map((item) => normalizeTopReplyItem(item, upperMid))
          .filter((item) => item.rpid && item.replier_mid && item.replier_name && item.content);

        await postJson('/api/ingest/top-reply', {
          source: 'L2',
          aid,
          batch,
        });
        processed += 1;
      } catch (error) {
        console.warn('[Dundao] top-reply fetch failed', { aid, error });
      }
    }

    console.log('[Dundao] top-reply poll done', { aids: aids.length, processed });
    return { ok: true, aids: aids.length, processed };
  } catch (error) {
    console.error('[Dundao] top-reply poll failed', error);
    return { ok: false, reason: error.message };
  }
}

const wsClient = new DWSClient(WS_URL);

wsClient.onCardGenerated = (payload) => {
  const card = payload?.card;
  if (!card?.id) {
    return;
  }

  chrome.notifications.create(`card-${card.id}`, {
    type: 'basic',
    iconUrl: 'icon.png',
    title: '蹲到了新卡',
    message: toStringOr(card.pages?.[0]?.context_line, DEFAULT_NOTIFICATION_MESSAGE),
    priority: 2,
  });
};

chrome.notifications.onClicked.addListener((notificationId) => {
  if (!notificationId.startsWith('card-')) {
    return;
  }

  const cardId = notificationId.slice('card-'.length);
  chrome.tabs.create({ url: `${FRONTEND_URL}?card_id=${encodeURIComponent(cardId)}` });
});

chrome.runtime.onInstalled.addListener(() => {
  void ensureAlarms();
});

chrome.runtime.onStartup.addListener(() => {
  void ensureAlarms();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === MSGFEED_ALARM) {
    void pollMsgfeed();
  }

  if (alarm.name === TOP_REPLY_ALARM) {
    void pollTopReplies();
  }
});

void ensureAlarms();
wsClient.connect();

globalThis.pollMsgfeed = pollMsgfeed;
globalThis.pollTopReplies = pollTopReplies;
