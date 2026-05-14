import { Redis } from "@upstash/redis";

// Tiny fixed-window rate limiter built on the existing Upstash Redis
// instance. No new dependency. Each window key holds an INCR'd counter
// with a TTL equal to the window length; once the limit is reached
// further requests are rejected until the window expires.
//
// Used by /api/auth/request-link to defend against email-bombing.

let cached: Redis | null = null;
function client(): Redis | null {
  if (cached) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cached = new Redis({ url, token });
  return cached;
}

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/**
 * Increment a counter at `key` and return whether the request is within
 * the limit. If Redis is unconfigured the call is allowed (fail-open) —
 * the route is responsible for surfacing a config error elsewhere if
 * Redis is required.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const redis = client();
  if (!redis) {
    return { ok: true, remaining: limit, retryAfterSeconds: 0 };
  }
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, windowSeconds);
  }
  const remaining = Math.max(0, limit - count);
  const ok = count <= limit;
  return {
    ok,
    remaining,
    retryAfterSeconds: ok ? 0 : windowSeconds,
  };
}

/**
 * Best-effort client IP extraction. Trusts `x-forwarded-for` (set by
 * Vercel / proxies); falls back to a literal "unknown" so the rate
 * limit still has a per-deployment ceiling on unattributable traffic.
 */
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
