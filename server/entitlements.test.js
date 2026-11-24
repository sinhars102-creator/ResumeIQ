import { test } from "node:test";
import assert from "node:assert/strict";
import { DOWNLOAD_PLANS, DAY_MS, entitlementRow, chooseEntitlement, statusOf, completeDownload } from "./entitlements.js";

const NOW = new Date("2026-12-01T00:00:00Z");
const ent = (plan, extra = {}) => ({ id: `e_${plan}`, ...entitlementRow({ userId: "u1", plan, paymentId: `p_${plan}`, now: NOW }), ...extra });

/** In-memory store with the same interface the routes use. */
function memStore(entitlements = []) {
  const rows = entitlements.map((e) => ({ ...e }));
  const logs = [];
  return {
    rows, logs,
    list: async () => rows.map((r) => ({ ...r })),
    hasLog: async (u, d) => logs.some((l) => l.user_id === u && l.download_id === d),
    increment: async (e) => {
      const r = rows.find((x) => x.id === e.id);
      if (!r || r.downloads_used !== e.downloads_used) return false;
      r.downloads_used += 1;
      return true;
    },
    addLog: async (l) => void logs.push(l),
  };
}

test("plans: prices and limits as decided", () => {
  assert.equal(DOWNLOAD_PLANS.dl1.amount, 7900);
  assert.equal(DOWNLOAD_PLANS.dl10.amount, 39900);
  assert.equal(DOWNLOAD_PLANS.dlunlimited.amount, 79900);
  assert.equal(DOWNLOAD_PLANS.dl10.downloads, 10);
  assert.equal(DOWNLOAD_PLANS.dlunlimited.downloads, null);
});

test("entitlementRow: single never expires; the monthly plans expire in 30 days", () => {
  assert.equal(ent("dl1").expires_at, null);
  assert.equal(ent("dl10").expires_at, new Date(NOW.getTime() + 30 * DAY_MS).toISOString());
  assert.equal(ent("dlunlimited").downloads_total, null);
  assert.throws(() => entitlementRow({ userId: "u", plan: "nope", paymentId: "p" }));
});

test("nothing bought means not allowed", () => {
  assert.deepEqual(statusOf([], NOW), { allowed: false, plan: null, remaining: 0, unlimited: false, expiresAt: null });
});

test("a single download is used once, then the paywall returns", async () => {
  const store = memStore([ent("dl1")]);
  assert.equal(statusOf(await store.list(), NOW).remaining, 1);
  const r = await completeDownload({ store, userId: "u1", downloadId: "d1", now: NOW });
  assert.equal(r.counted, true);
  assert.equal(r.status.allowed, false);
  const again = await completeDownload({ store, userId: "u1", downloadId: "d2", now: NOW });
  assert.equal(again.counted, false);
  assert.equal(again.reason, "not_entitled");
});

test("the same downloadId is never counted twice", async () => {
  const store = memStore([ent("dl10")]);
  await completeDownload({ store, userId: "u1", downloadId: "d1", now: NOW });
  const dup = await completeDownload({ store, userId: "u1", downloadId: "d1", now: NOW });
  assert.equal(dup.alreadyCounted, true);
  assert.equal(store.rows[0].downloads_used, 1);
  assert.equal(dup.status.remaining, 9);
});

test("the ten-pack runs out after ten distinct downloads", async () => {
  const store = memStore([ent("dl10")]);
  for (let i = 0; i < 10; i++) assert.equal((await completeDownload({ store, userId: "u1", downloadId: `d${i}`, now: NOW })).counted, true);
  assert.equal((await completeDownload({ store, userId: "u1", downloadId: "d10", now: NOW })).counted, false);
});

test("an expired pack is not usable; unlimited never runs out within its month", async () => {
  const later = new Date(NOW.getTime() + 31 * DAY_MS);
  assert.equal(statusOf([ent("dl10")], later).allowed, false);
  const store = memStore([ent("dlunlimited")]);
  for (let i = 0; i < 50; i++) await completeDownload({ store, userId: "u1", downloadId: `d${i}`, now: NOW });
  const s = statusOf(await store.list(), NOW);
  assert.equal(s.allowed, true);
  assert.equal(s.unlimited, true);
  assert.equal(s.remaining, null);
  assert.equal(statusOf(await store.list(), later).allowed, false);
});

test("unlimited is used before a pack, so a pack isn't spent while unlimited is active", () => {
  const picked = chooseEntitlement([ent("dl10"), ent("dlunlimited"), ent("dl1")], NOW);
  assert.equal(picked.plan, "dlunlimited");
});

test("a pack that expires sooner is used before one with no expiry", () => {
  assert.equal(chooseEntitlement([ent("dl1"), ent("dl10")], NOW).plan, "dl10");
});

test("a missing downloadId is refused", async () => {
  const r = await completeDownload({ store: memStore([ent("dl1")]), userId: "u1", downloadId: "", now: NOW });
  assert.equal(r.counted, false);
  assert.equal(r.reason, "missing_download_id");
});

test("a lost race is retried once, then reported", async () => {
  const store = memStore([ent("dl1")]);
  let calls = 0;
  const realIncrement = store.increment;
  store.increment = async (e) => (++calls === 1 ? false : realIncrement(e));
  assert.equal((await completeDownload({ store, userId: "u1", downloadId: "d1", now: NOW })).counted, true);
  const always = { ...memStore([ent("dl1")]), increment: async () => false };
  assert.equal((await completeDownload({ store: always, userId: "u1", downloadId: "d9", now: NOW })).reason, "busy");
});
