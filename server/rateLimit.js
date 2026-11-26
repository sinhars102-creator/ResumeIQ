/**
 * Module M8 – abuse guard for the routes that spend AI money (/api/llm, /api/tailor/*).
 *
 * Not a product limit: the numbers are far above normal use (a whole resume session is about 30 calls) and
 * only stop one address or account from running up the AI bill. Anonymous callers are limited per IP address,
 * signed-in callers per account. The tailor routes also require sign-in whenever accounts are set up.
 *
 * Counts are kept in this server process's memory: they reset when it restarts, and on a serverless host each
 * instance counts separately. That is enough to stop accidents and simple scripts; a shared store (Redis or a
 * database table) is the next step if abuse ever needs a harder stop.
 */

/** A sliding-window counter: at most `max` hits per key within `windowMs`. */
export function createLimiter({ windowMs, max, now = () => Date.now() }) {
  const hits = new Map();
  const prune = (t) => {
    for (const [key, list] of hits) if (!list.length || t - list[list.length - 1] >= windowMs) hits.delete(key);
  };
  return {
    hit(key) {
      const t = now();
      const recent = (hits.get(key) || []).filter((x) => t - x < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return { ok: false, retryAfterSec: Math.max(1, Math.ceil((windowMs - (t - recent[0])) / 1000)) };
      }
      recent.push(t);
      hits.set(key, recent);
      if (hits.size > 5000) prune(t);
      return { ok: true, remaining: max - recent.length };
    },
    size: () => hits.size,
  };
}

/** The caller's address, behind a proxy or not. */
export function clientIp(req) {
  const forwarded = String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.socket?.remoteAddress || req.ip || "unknown";
}

/** Look up the signed-in user once per token for `ttlMs`, so each AI call doesn't also call the auth service. */
export function cachedUser(lookup, { ttlMs = 60_000, now = () => Date.now() } = {}) {
  const cache = new Map();
  return async (req) => {
    const token = String(req.headers?.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return null;
    const hit = cache.get(token);
    if (hit && now() - hit.at < ttlMs) return hit.user;
    const user = await lookup(req);
    cache.set(token, { user, at: now() });
    if (cache.size > 2000) for (const [k, v] of cache) if (now() - v.at >= ttlMs) cache.delete(k);
    return user;
  };
}

/**
 * Express middleware. `getUser(req)` -> the signed-in user or null. `requireSignIn` may be a boolean or a function
 * (checked per request, so it can follow whether accounts are configured).
 */
export function aiGuard({ getUser, anon = { windowMs: 600_000, max: 30 }, signedIn = { windowMs: 600_000, max: 120 }, requireSignIn = false, anonDailyCap = 0, now = () => Date.now() }) {
  const anonLimiter = createLimiter({ ...anon, now });
  const userLimiter = createLimiter({ ...signedIn, now });
  // A circuit breaker for signed-out visitors: when this server has handled `anonDailyCap` signed-out calls today, further
  // signed-out calls are asked to sign in (signed-in users are never affected). Kept in memory, so it counts per server instance.
  const day = { key: "", n: 0 };
  const today = () => new Date(now()).toISOString().slice(0, 10);
  return async (req, res, next) => {
    if (req.method === "OPTIONS") return next();
    let user = null;
    try {
      user = await getUser(req);
    } catch {
      user = null;
    }
    const need = typeof requireSignIn === "function" ? requireSignIn() : requireSignIn;
    if (!user && need) return res.status(401).json({ error: "Sign in to continue", code: "sign_in_required" });
    const result = user ? userLimiter.hit(`u:${user.id}`) : anonLimiter.hit(`ip:${clientIp(req)}`);
    if (!result.ok) {
      res.set("Retry-After", String(result.retryAfterSec));
      // Signed-in accounts get a higher allowance, so a signed-out visitor who hits the limit is invited to sign in.
      return res.status(429).json({ error: `You're going a little fast. Please try again in ${result.retryAfterSec} seconds.`, code: "rate_limited", signIn: !user });
    }
    if (!user && anonDailyCap > 0) {
      if (day.key !== today()) Object.assign(day, { key: today(), n: 0 });
      if (day.n >= anonDailyCap) return res.status(429).json({ error: "We're very busy right now. Please sign in to keep going.", code: "sign_in_required", signIn: true });
      day.n += 1;
    }
    return next();
  };
}
