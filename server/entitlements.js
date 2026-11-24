/**
 * Module M4 – what a user has paid to download, and counting downloads.
 *
 * Plans (price in paise):
 *   dl1          ₹79   one download, no expiry
 *   dl10         ₹399  10 downloads within 30 days
 *   dlunlimited  ₹799  unlimited downloads within 30 days
 * A download is counted only when the PDF download has completed (the page calls /api/downloads/complete).
 *
 * This file is plain logic with no database or network, so it can be tested with an in-memory store:
 *   store = { list(userId), hasLog(userId, downloadId), increment(entitlement), addLog(row) }
 */

export const DAY_MS = 86_400_000;

export const DOWNLOAD_PLANS = {
  dl1: { id: "dl1", amount: 7900, name: "1 resume download", downloads: 1, days: null, blurb: "One PDF download" },
  dl10: { id: "dl10", amount: 39900, name: "10 downloads / month", downloads: 10, days: 30, blurb: "10 PDF downloads in 30 days" },
  dlunlimited: { id: "dlunlimited", amount: 79900, name: "Unlimited downloads / month", downloads: null, days: 30, blurb: "Unlimited PDF downloads for 30 days" },
};

export const isDownloadPlan = (id) => Object.prototype.hasOwnProperty.call(DOWNLOAD_PLANS, id);

/** The row to store for a paid plan. */
export function entitlementRow({ userId, plan, paymentId, orderId = null, now = new Date() }) {
  const p = DOWNLOAD_PLANS[plan];
  if (!p) throw new Error(`Unknown download plan: ${plan}`);
  return {
    user_id: userId,
    plan,
    payment_id: paymentId,
    order_id: orderId,
    amount_paise: p.amount,
    downloads_total: p.downloads,
    downloads_used: 0,
    expires_at: p.days ? new Date(now.getTime() + p.days * DAY_MS).toISOString() : null,
  };
}

const expired = (e, now) => !!e.expires_at && new Date(e.expires_at).getTime() <= now.getTime();
const remaining = (e) => (e.downloads_total == null ? Infinity : e.downloads_total - (e.downloads_used || 0));
const usable = (e, now) => !expired(e, now) && remaining(e) > 0;

/**
 * The entitlement the next download should use: unlimited first (it never runs out), then the one that
 * expires soonest (so time-limited packs aren't wasted), then one with no expiry.
 */
export function chooseEntitlement(list, now = new Date()) {
  const open = (list || []).filter((e) => usable(e, now));
  const rank = (e) => (e.downloads_total == null ? 0 : e.expires_at ? 1 : 2);
  return open.sort((a, b) => rank(a) - rank(b) || (new Date(a.expires_at || 8.64e15) - new Date(b.expires_at || 8.64e15)))[0] || null;
}

/** What the page needs: may this user download now, and what's left. */
export function statusOf(list, now = new Date()) {
  const e = chooseEntitlement(list, now);
  if (!e) return { allowed: false, plan: null, remaining: 0, unlimited: false, expiresAt: null };
  const left = remaining(e);
  return { allowed: true, plan: e.plan, remaining: left === Infinity ? null : left, unlimited: left === Infinity, expiresAt: e.expires_at };
}

/**
 * Count one finished download. Safe to call twice with the same downloadId (a retry): the second call changes nothing.
 * Returns { counted, alreadyCounted?, status } or { counted: false, reason: "not_entitled", status }.
 */
export async function completeDownload({ store, userId, downloadId, now = new Date() }) {
  if (!downloadId || typeof downloadId !== "string") return { counted: false, reason: "missing_download_id", status: statusOf(await store.list(userId), now) };
  if (await store.hasLog(userId, downloadId)) return { counted: true, alreadyCounted: true, status: statusOf(await store.list(userId), now) };
  // One retry: another tab may have used the last download between reading and updating.
  for (let attempt = 0; attempt < 2; attempt++) {
    const list = await store.list(userId);
    const e = chooseEntitlement(list, now);
    if (!e) return { counted: false, reason: "not_entitled", status: statusOf(list, now) };
    if (await store.increment(e)) {
      await store.addLog({ user_id: userId, entitlement_id: e.id, download_id: downloadId });
      return { counted: true, status: statusOf(await store.list(userId), now) };
    }
  }
  return { counted: false, reason: "busy", status: statusOf(await store.list(userId), now) };
}
