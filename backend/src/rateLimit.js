// 展台级 in-memory 令牌桶：每 IP 每秒 X 次，上限 Y
// 零外部依赖，足够防止评委手滑 spam 与公网恶意压测
export function createRateLimiter({ capacity = 6, refillPerSec = 2 } = {}) {
  const buckets = new Map();

  function take(key, now = Date.now()) {
    let b = buckets.get(key);
    if (!b) {
      b = { tokens: capacity, updatedAt: now };
      buckets.set(key, b);
    }
    const elapsed = (now - b.updatedAt) / 1000;
    b.tokens = Math.min(capacity, b.tokens + elapsed * refillPerSec);
    b.updatedAt = now;
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return { ok: true, remaining: Math.floor(b.tokens) };
    }
    const retryAfter = Math.max(0.1, (1 - b.tokens) / refillPerSec);
    return { ok: false, retryAfter: Number(retryAfter.toFixed(2)) };
  }

  function size() {
    return buckets.size;
  }

  function prune(now = Date.now(), maxIdleMs = 5 * 60_000) {
    for (const [key, b] of buckets) {
      if (now - b.updatedAt > maxIdleMs) buckets.delete(key);
    }
  }

  return { take, size, prune, capacity, refillPerSec };
}
