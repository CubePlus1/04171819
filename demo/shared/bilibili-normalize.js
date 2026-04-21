function toInteger(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : fallback;
}

function toNullableInteger(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : null;
}

function toOptionalString(value, fallback = null) {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : fallback;
}

function toStringOr(value, fallback = '') {
  return toOptionalString(value, fallback);
}

function toIsoString(value, now = () => Date.now()) {
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

  return new Date(now()).toISOString();
}

function pickReplyingToRpid(row, inner) {
  const sourceId = toNullableInteger(row.source_id ?? inner.source_id);
  const replyToReplyId = toNullableInteger(inner.reply_to_reply_id);
  const rootReplyId = toNullableInteger(inner.root_reply_id);

  if (sourceId !== null) {
    return {
      value: sourceId,
      source: row.source_id !== undefined ? 'source_id' : 'inner.source_id',
      replyToReplyId,
      rootReplyId,
    };
  }

  if (replyToReplyId !== null) {
    return {
      value: replyToReplyId,
      source: 'reply_to_reply_id',
      replyToReplyId,
      rootReplyId,
    };
  }

  if (rootReplyId !== null) {
    return {
      value: rootReplyId,
      source: 'root_reply_id',
      replyToReplyId,
      rootReplyId,
    };
  }

  return {
    value: 0,
    source: 'missing',
    replyToReplyId,
    rootReplyId,
  };
}

export function normalizeMsgfeedItem(item, { now = () => Date.now() } = {}) {
  const row = item && typeof item === 'object' ? item : {};
  const inner = row.item && typeof row.item === 'object' ? row.item : {};
  const user = row.user && typeof row.user === 'object' ? row.user : {};
  const replyTarget = pickReplyingToRpid(row, inner);
  const midReplier = toInteger(
    row.mid_replier ??
    row.mid ??
    user.mid ??
    row.user_id,
  );

  return {
    source_id: replyTarget.value,
    source_content: toOptionalString(
      row.source_content ??
      inner.source_content ??
      inner.source_content_text ??
      inner.source_text,
      null,
    ),
    business_id: toInteger(
      row.business_id ??
      inner.business_id ??
      inner.oid ??
      inner.item_id,
    ),
    title: toStringOr(row.title ?? inner.title),
    reply_content: toStringOr(
      row.reply_content ??
      inner.target_reply_content ??
      inner.detail_text ??
      inner.title,
    ),
    mid_replier: midReplier,
    replier_name: toStringOr(
      row.replier_name ??
      user.nickname ??
      user.uname ??
      row.user_name,
      midReplier ? String(midReplier) : '',
    ),
    like_count: toInteger(row.like ?? row.like_count ?? inner.like),
    is_up: Boolean(row.is_up ?? inner.is_up),
    is_top: Boolean(row.is_top ?? inner.is_top),
    rpid: toInteger(
      row.rpid ??
      inner.target_id ??
      inner.id ??
      inner.reply_id,
    ),
    occurred_at: toIsoString(
      row.occurred_at ??
      row.reply_time ??
      row.ctime ??
      inner.ctime,
      now,
    ),
    debug: {
      msgfeed_shape: Object.keys(inner).length > 0 || Object.keys(user).length > 0 ? 'nested' : 'flat',
      replying_to_rpid_source: replyTarget.source,
      root_reply_id: replyTarget.rootReplyId,
      reply_to_reply_id: replyTarget.replyToReplyId,
    },
  };
}
