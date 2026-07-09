type RateLimitState = {
  count: number;
  resetAt: number;
};

type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: number;
};

const rateLimitStore = new Map<string, RateLimitState>();

export function takeRateLimitToken(
  key: string,
  {
    now = Date.now(),
    limit = 8,
    windowMs = 60_000,
  }: { now?: number; limit?: number; windowMs?: number } = {},
): RateLimitResult {
  pruneExpiredRateLimits(now);

  const existing = rateLimitStore.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    rateLimitStore.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      limit,
      remaining: Math.max(limit - 1, 0),
      retryAfterSeconds: 0,
      resetAt,
    };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      retryAfterSeconds: Math.max(Math.ceil((existing.resetAt - now) / 1000), 1),
      resetAt: existing.resetAt,
    };
  }

  existing.count += 1;
  rateLimitStore.set(key, existing);
  return {
    allowed: true,
    limit,
    remaining: Math.max(limit - existing.count, 0),
    retryAfterSeconds: 0,
    resetAt: existing.resetAt,
  };
}

export function resetRateLimitStore() {
  rateLimitStore.clear();
}

function pruneExpiredRateLimits(now: number) {
  for (const [key, state] of rateLimitStore.entries()) {
    if (state.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}
