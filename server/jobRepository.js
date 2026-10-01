/**
 * Roles repository – every live LinkedIn search is saved here so the next
 * user searching for a similar role sees listings instantly while a fresh
 * scrape (30–180s) runs in the background.
 *
 * Stored as a JSON file (server/data/jobs-repository.json, or JOBS_REPO_PATH).
 * On hosts with an ephemeral disk (e.g. Render's free tier) it resets on each
 * deploy and refills from live searches.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_PATH = process.env.JOBS_REPO_PATH || resolve(__dirname, "data/jobs-repository.json");

const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // drop roles not seen in a live search for 30 days
const SERVE_MAX_AGE_MS = 21 * 24 * 60 * 60 * 1000; // only serve roles seen in the last 3 weeks
const MAX_ENTRIES = 5000;
const SAVE_DEBOUNCE_MS = 2000;

const STOP_WORDS = new Set(["and", "or", "of", "the", "a", "an", "in", "for", "to", "with", "at", "on", "-", "&", "/"]);

/** id → { job, firstSeenAt, lastSeenAt, levels: string[], locations: string[] } */
const entries = new Map();
let saveTimer = null;

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter((t) => t && !STOP_WORDS.has(t));
}

function load() {
  if (!existsSync(REPO_PATH)) return;
  try {
    const data = JSON.parse(readFileSync(REPO_PATH, "utf8"));
    for (const entry of data.entries || []) {
      if (entry?.job?.id) entries.set(entry.job.id, entry);
    }
    prune();
    console.log(`[jobs-repo] loaded ${entries.size} roles from ${REPO_PATH}`);
  } catch (e) {
    console.warn("[jobs-repo] could not read repository, starting empty:", e.message);
  }
}

function prune() {
  const cutoff = Date.now() - MAX_AGE_MS;
  for (const [id, entry] of entries) {
    if (entry.lastSeenAt < cutoff) entries.delete(id);
  }
  if (entries.size > MAX_ENTRIES) {
    const oldestFirst = [...entries.values()].sort((a, b) => a.lastSeenAt - b.lastSeenAt);
    for (const entry of oldestFirst.slice(0, entries.size - MAX_ENTRIES)) entries.delete(entry.job.id);
  }
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      mkdirSync(dirname(REPO_PATH), { recursive: true });
      const tmp = `${REPO_PATH}.tmp`;
      writeFileSync(tmp, JSON.stringify({ savedAt: Date.now(), entries: [...entries.values()] }));
      renameSync(tmp, REPO_PATH);
    } catch (e) {
      console.warn("[jobs-repo] save failed:", e.message);
    }
  }, SAVE_DEBOUNCE_MS);
}

/** Jobs without a real LinkedIn id get a generated one per request; caching those would create duplicates. */
function hasStableId(job) {
  return job?.id && !/^linkedin-\d+-\d+$/.test(job.id) && !/^guest-\d+$/.test(job.id);
}

/**
 * Save the results of a live search. `levels` are the LinkedIn experience-level
 * codes the search was filtered to; they're remembered per role so a later
 * search for a different seniority doesn't get served these.
 */
export function saveJobs(jobs, { location = "", levels = [] } = {}) {
  const now = Date.now();
  let added = 0;
  for (const job of jobs || []) {
    if (!hasStableId(job)) continue;
    const existing = entries.get(job.id);
    if (existing) {
      existing.job = { ...existing.job, ...job, jd: job.jd || existing.job.jd };
      existing.lastSeenAt = now;
      existing.levels = [...new Set([...existing.levels, ...levels])];
      if (location && !existing.locations.includes(location)) existing.locations.push(location);
    } else {
      entries.set(job.id, { job, firstSeenAt: now, lastSeenAt: now, levels: [...levels], locations: location ? [location] : [] });
      added++;
    }
  }
  prune();
  scheduleSave();
  return { added, total: entries.size };
}

/**
 * Saved roles similar to a search: most of the keyword tokens appear in the
 * title, the location matches, and the seniority overlaps (roles saved from an
 * unfiltered search are allowed). Best title match first, then most recent.
 */
export function findJobs({ keywords = "", location = "", levels = [], limit = 30 } = {}) {
  const queryTokens = tokenize(keywords);
  if (!queryTokens.length) return [];
  const locationLower = location.trim().toLowerCase();
  const servedAfter = Date.now() - SERVE_MAX_AGE_MS;
  const results = [];

  for (const entry of entries.values()) {
    if (entry.lastSeenAt < servedAfter) continue;
    if (levels.length && entry.levels.length && !entry.levels.some((l) => levels.includes(l))) continue;
    if (locationLower) {
      // Trust the role's own location; scrapers sometimes return roles outside the searched area.
      const inLocation = entry.job.location
        ? entry.job.location.toLowerCase().includes(locationLower)
        : entry.locations.some((l) => l.toLowerCase() === locationLower);
      if (!inLocation) continue;
    }
    const titleTokens = new Set(tokenize(entry.job.role));
    const hits = queryTokens.filter((t) => titleTokens.has(t)).length;
    const score = hits / queryTokens.length;
    if (score < 0.6) continue;
    results.push({ entry, score });
  }

  results.sort((a, b) => b.score - a.score || b.entry.lastSeenAt - a.entry.lastSeenAt);
  return results.slice(0, limit).map(({ entry }) => ({ ...entry.job, lastSeenAt: entry.lastSeenAt }));
}

export function repositorySize() {
  return entries.size;
}

load();
