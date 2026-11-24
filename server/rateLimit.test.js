import { test } from "node:test";
import assert from "node:assert/strict";
import { createLimiter, clientIp, cachedUser, aiGuard } from "./rateLimit.js";

test("limiter: allows max hits per window, then blocks with a wait time, then recovers", () => {
  let t = 0;
  const l = createLimiter({ windowMs: 1000, max: 3, now: () => t });
  assert.ok(l.hit("a").ok && l.hit("a").ok && l.hit("a").ok);
  const blocked = l.hit("a");
  assert.equal(blocked.ok, false);
  assert.equal(blocked.retryAfterSec, 1);
  assert.ok(l.hit("b").ok); // another key is unaffected
  t = 1001;
  assert.ok(l.hit("a").ok);
});

test("clientIp prefers the first forwarded address", () => {
  assert.equal(clientIp({ headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" }, socket: { remoteAddress: "9.9.9.9" } }), "1.2.3.4");
  assert.equal(clientIp({ headers: {}, socket: { remoteAddress: "9.9.9.9" } }), "9.9.9.9");
});

test("cachedUser looks a token up once within the cache time", async () => {
  let t = 0, calls = 0;
  const get = cachedUser(async () => (calls++, { id: "u1" }), { ttlMs: 1000, now: () => t });
  const req = { headers: { authorization: "Bearer abc" } };
  await get(req); await get(req);
  assert.equal(calls, 1);
  t = 1500; await get(req);
  assert.equal(calls, 2);
  assert.equal(await get({ headers: {} }), null);
});

function run(mw, req) {
  return new Promise((resolve) => {
    const res = { headers: {}, set(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { resolve({ code: this.code, body: b, headers: this.headers }); } };
    mw({ method: "POST", headers: {}, socket: { remoteAddress: "5.5.5.5" }, ...req }, res, () => resolve({ code: 200 }));
  });
}

test("guard: anonymous callers are limited per IP", async () => {
  const mw = aiGuard({ getUser: async () => null, anon: { windowMs: 1000, max: 2 }, now: () => 0 });
  assert.equal((await run(mw, {})).code, 200);
  assert.equal((await run(mw, {})).code, 200);
  const third = await run(mw, {});
  assert.equal(third.code, 429);
  assert.ok(Number(third.headers["Retry-After"]) >= 1);
  assert.equal((await run(mw, { socket: { remoteAddress: "6.6.6.6" } })).code, 200);
});

test("guard: signed-in callers are limited per account, not per IP", async () => {
  const mw = aiGuard({ getUser: async (req) => ({ id: req.headers.who }), signedIn: { windowMs: 1000, max: 1 }, now: () => 0 });
  assert.equal((await run(mw, { headers: { who: "u1" } })).code, 200);
  assert.equal((await run(mw, { headers: { who: "u1" } })).code, 429);
  assert.equal((await run(mw, { headers: { who: "u2" } })).code, 200);
});

test("guard: requireSignIn (boolean or function) turns anonymous callers away with 401", async () => {
  const off = aiGuard({ getUser: async () => null, requireSignIn: () => false });
  assert.equal((await run(off, {})).code, 200);
  const on = aiGuard({ getUser: async () => null, requireSignIn: () => true });
  const r = await run(on, {});
  assert.equal(r.code, 401);
  assert.equal((await run(aiGuard({ getUser: async () => ({ id: "x" }), requireSignIn: true }), {})).code, 200);
});

test("guard: a failing user lookup counts as anonymous instead of crashing", async () => {
  const mw = aiGuard({ getUser: async () => { throw new Error("auth down"); }, requireSignIn: false });
  assert.equal((await run(mw, {})).code, 200);
});
