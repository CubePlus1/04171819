import { createLogger } from './logger.js';

const log = createLogger('bilibili');

export const RATE_LIMIT_MS = 1000;
export const MAX_RETRIES = 3;

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toNumber(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function toStringOr(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function isoAt(now) {
  return new Date(now()).toISOString();
}

function normalizeMsgfeedItem(item, now) {
  const row = item && typeof item === 'object' ? item : {};
  const midReplier = toNumber(row.mid_replier);

  return {
    source_id: toNumber(row.source_id),
    source_content: row.source_content ?? null,
    business_id: toNumber(row.business_id),
    title: toStringOr(row.title),
    reply_content: toStringOr(row.reply_content),
    mid_replier: midReplier,
    replier_name: toStringOr(row.replier_name, midReplier ? String(midReplier) : ''),
    like_count: toNumber(row.like ?? row.like_count),
    is_up: Boolean(row.is_up),
    is_top: Boolean(row.is_top),
    rpid: toNumber(row.rpid),
    occurred_at: typeof row.occurred_at === 'string' ? row.occurred_at : isoAt(now),
  };
}

function normalizeVideoReply(item, now) {
  const row = item && typeof item === 'object' ? item : {};

  return {
    rpid: toNumber(row.rpid),
    replier_mid: toNumber(row.member?.mid ?? row.mid_replier),
    replier_name: toStringOr(row.member?.uname ?? row.replier_name),
    content: toStringOr(row.content?.message ?? row.reply_content),
    like_count: toNumber(row.like ?? row.like_count),
    is_up: Boolean(row.is_up ?? row.member?.is_up),
    is_top: Boolean(row.is_top),
    occurred_at: typeof row.occurred_at === 'string' ? row.occurred_at : isoAt(now),
  };
}

function normalizePinnedReply(item) {
  if (!item || typeof item !== 'object') {
    return null;
  }

  return {
    rpid: toNumber(item.rpid),
    replier_mid: toNumber(item.member?.mid),
    replier_name: toStringOr(item.member?.uname),
    content: toStringOr(item.content?.message),
  };
}

function assertBilibiliJson(json, url) {
  if (!json || typeof json !== 'object') {
    throw new Error(`bilibili returned non-object json for ${url}`);
  }

  if (json.code !== 0) {
    throw new Error(`bilibili api error for ${url}: ${json.message ?? json.code}`);
  }

  return json.data && typeof json.data === 'object' ? json.data : {};
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
      const elapsed = now() - lastAt;
      if (elapsed < rateLimitMs) {
        await sleepImpl(rateLimitMs - elapsed);
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

        const response = await fetchImpl(String(url), { headers });
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
        log.warn('request failed, retrying', {
          endpoint: endpointKey,
          attempt,
          backoff,
          err: err.message,
        });
        await sleepImpl(backoff);
      }
    }

    throw new Error(`unreachable retry loop for ${url}`);
  }

  async function fetchMsgfeedReply({ sessdata, cursor = null, ps = 20 }) {
    const url = new URL('https://api.bilibili.com/x/msgfeed/reply');
    url.searchParams.set('ps', String(ps));

    if (cursor !== null && cursor !== undefined && cursor !== '') {
      url.searchParams.set('cursor', String(cursor));
    }

    const data = await requestJson('msgfeed.reply', url, { sessdata });
    const cursorInfo = data.cursor && typeof data.cursor === 'object' ? data.cursor : {};

    return {
      replies: Array.isArray(data.items)
        ? data.items.map((item) => normalizeMsgfeedItem(item, now))
        : [],
      hasMore: !Boolean(cursorInfo.is_end),
      nextCursor: cursorInfo.next === undefined || cursorInfo.next === null
        ? null
        : String(cursorInfo.next),
    };
  }

  async function fetchVideoReplies({ aid, sort = 2, ps = 20 }) {
    const url = new URL('https://api.bilibili.com/x/v2/reply');
    url.searchParams.set('type', '1');
    url.searchParams.set('oid', String(aid));
    url.searchParams.set('sort', String(sort));
    url.searchParams.set('ps', String(ps));

    const data = await requestJson('video.replies', url);

    return {
      replies: Array.isArray(data.replies)
        ? data.replies.map((item) => normalizeVideoReply(item, now))
        : [],
      page: {
        num: toNumber(data.page?.num, 1),
        size: toNumber(data.page?.size, ps),
      },
    };
  }

  async function fetchVideoView({ aid }) {
    const url = new URL('https://api.bilibili.com/x/web-interface/view');
    url.searchParams.set('aid', String(aid));

    const data = await requestJson('video.view', url);

    return {
      title: toStringOr(data.title),
      desc: toStringOr(data.desc),
      owner: {
        mid: toNumber(data.owner?.mid),
        name: toStringOr(data.owner?.name),
        face: toStringOr(data.owner?.face),
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

export async function fetchMsgfeedReply(params) {
  return defaultClient.fetchMsgfeedReply(params);
}

export async function fetchVideoReplies(params) {
  return defaultClient.fetchVideoReplies(params);
}

export async function fetchVideoView(params) {
  return defaultClient.fetchVideoView(params);
}
