/**
 * Company tiers for ranking the job board: 1 = the most wanted employers, 2 = large established
 * ones, null = everyone else (see server/seed/top-companies.csv). Blocked companies (re-posters,
 * staffing agencies, job boards) are dropped from results altogether.
 */
import { companyKey, listCompanyTiers } from "./jobStore.js";

const REFRESH_MS = 10 * 60 * 1000;
let cache = { at: 0, byKey: new Map(), loading: null };

/** Keys a company name may be stored under: as given, and without "India" / "in India" style suffixes. */
function keysOf(name) {
  const key = companyKey(name);
  const short = key.replace(/\b(in india|india|global tech|technologies|technology|r and d institute|r and d|gcc)\b/g, " ").replace(/\s+/g, " ").trim();
  const beforeBracket = companyKey(String(name).replace(/\(.*\)\s*$/, ""));
  return [...new Set([key, short, beforeBracket].filter(Boolean))];
}

async function load() {
  const rows = await listCompanyTiers();
  const byKey = new Map();
  for (const row of rows) {
    const info = { tier: row.tier ?? null, blocked: row.status === "blocked" };
    for (const k of keysOf(row.name)) {
      const known = byKey.get(k);
      // Two companies sharing a short form (e.g. "X" and "X India"): keep the better-known one.
      if (!known || info.blocked || (info.tier && (!known.tier || info.tier < known.tier))) byKey.set(k, info);
    }
  }
  cache = { at: Date.now(), byKey, loading: null };
}

async function tiers() {
  if (Date.now() - cache.at > REFRESH_MS) {
    cache.loading ||= load().catch((err) => {
      console.warn("[tiers] loading company tiers failed:", err.message);
      // Try again in a minute; meanwhile jobs simply have no tier.
      cache = { ...cache, at: Date.now() - REFRESH_MS + 60_000, loading: null };
    });
    if (!cache.at) await cache.loading; // first use waits; later refreshes happen in the background
  }
  return cache.byKey;
}

// Staffing agencies and job portals by name (careful: only unambiguous words, so "Keka HR" stays).
const AGENCY_NAME = /\b(staffing|placements?|manpower|recruit(ment|ers|ing)?|hr (consultan(cy|ts?)|services|solutions)|job ?portal|jobs? (hub|board|portal))\b/i;

/** The tier and blocked flag for a company name. */
export async function companyInfo(name) {
  if (AGENCY_NAME.test(String(name || ""))) return { tier: null, blocked: true };
  const byKey = await tiers();
  for (const k of keysOf(name)) {
    const info = byKey.get(k);
    if (info) return info;
  }
  return { tier: null, blocked: false };
}

/** Jobs with `tier` set and blocked companies' jobs removed. */
export async function withTiers(jobs) {
  const out = [];
  for (const job of jobs || []) {
    const info = await companyInfo(job.company);
    if (!info.blocked) out.push({ ...job, tier: info.tier });
  }
  return out;
}

/** Board order: company tier first (1, 2, then the rest), then the most recently posted. */
export function byTierThenNewest(a, b) {
  const ta = a.tier ?? 3;
  const tb = b.tier ?? 3;
  if (ta !== tb) return ta - tb;
  const da = Date.parse(a.postedAt || 0) || a.firstSeenAt || 0;
  const db = Date.parse(b.postedAt || 0) || b.firstSeenAt || 0;
  return db - da;
}
