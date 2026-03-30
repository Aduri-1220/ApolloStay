const buckets = new Map();

function getClientIp(request) {
  const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || request.socket?.remoteAddress || "unknown";
}

function buildKey(request, scope, userId = "") {
  return `${scope}:${userId || getClientIp(request)}`;
}

function enforceRateLimit({ request, scope, limit, windowMs, userId = "" }) {
  const key = buildKey(request, scope, userId);
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    const next = {
      count: 1,
      resetAt: now + windowMs
    };
    buckets.set(key, next);
    return {
      allowed: true,
      remaining: Math.max(0, limit - next.count),
      retryAfterMs: windowMs
    };
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: current.resetAt - now
    };
  }

  current.count += 1;
  buckets.set(key, current);
  return {
    allowed: true,
    remaining: Math.max(0, limit - current.count),
    retryAfterMs: current.resetAt - now
  };
}

module.exports = {
  enforceRateLimit,
  getClientIp
};
