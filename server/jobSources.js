/**
 * Job sources with official, public APIs.
 *
 *  - Company career pages on Greenhouse, Lever, Ashby and Workable: public job-board
 *    endpoints, no key needed, full job descriptions included.
 *  - Adzuna (aggregator, supports India): free App ID/Key from developer.adzuna.com.
 *
 * Every connector returns jobs in ResumeIQ's shape:
 *   { id, company, role, location, salary, badge, source, jd, url, postedAt }
 * A connector that fails (404, timeout, bad JSON) returns [] and logs a warning, so one
 * broken company board never breaks a search.
 */
import * as cheerio from "cheerio";
import JOB_BOARDS from "./jobBoards.js";

const FETCH_TIMEOUT_MS = 10000;
const BOARD_CACHE_MS = 3 * 60 * 60 * 1000; // company boards change slowly; refetch every 3 hours
const BOARD_CONCURRENCY = 8;

export const ATS_TYPES = ["greenhouse", "lever", "ashby", "workable"];

/* ------------------------------------------------------------------ helpers */

/** HTML (possibly entity-encoded, as Greenhouse sends it) → plain text with paragraph breaks. */
export function htmlToPlain(html) {
  if (typeof html !== "string" || !html.trim()) return "";
  let source = html;
  // Greenhouse returns HTML-escaped HTML ("&lt;p&gt;…"); decode once first.
  if (/&lt;[a-z/]/i.test(source) && !/<[a-z/]/i.test(source)) {
    source = cheerio.load(`<textarea>${source}</textarea>`)("textarea").text();
  }
  const $ = cheerio.load(source);
  $("br").replaceWith("\n");
  $("p, li, h1, h2, h3, h4, div").each((_, el) => {
    $(el).append("\n");
  });
  $("li").each((_, el) => {
    $(el).prepend("• ");
  });
  return $.root()
    .text()
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .replace(/ *\n */g, "\n")
    .trim();
}

async function fetchJson(url, { timeoutMs = FETCH_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "ResumeIQ job search (+https://resume-iq-seven.vercel.app)" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Format an INR annual range as "₹12–18 LPA"; other currencies/units are passed through as text. */
export function formatLpa(min, max) {
  const toLpa = (n) => {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return null;
    const lpa = v / 100000;
    return lpa >= 10 ? String(Math.round(lpa)) : String(Math.round(lpa * 10) / 10);
  };
  const a = toLpa(min);
  const b = toLpa(max);
  if (a && b && a !== b) return `₹${a}–${b} LPA`;
  if (a || b) return `₹${a || b} LPA`;
  return "";
}

const INDIA_HINTS = [
  "india", "bengaluru", "bangalore", "mumbai", "navi mumbai", "pune", "hyderabad", "chennai", "delhi",
  "new delhi", "gurugram", "gurgaon", "noida", "kolkata", "ahmedabad", "jaipur", "kochi", "indore",
  "chandigarh", "coimbatore", "thiruvananthapuram", "trivandrum", "mysore", "mysuru", "vadodara",
  "bhubaneswar", "lucknow", "nagpur", "visakhapatnam", "goa", "ncr",
];

/** True when a location string is in India (or the role is remote with no country restriction). */
export function isIndiaLocation(location, { allowRemote = true } = {}) {
  const loc = String(location || "").toLowerCase();
  if (!loc) return false;
  if (INDIA_HINTS.some((h) => loc.includes(h))) return true;
  if (allowRemote && /\bremote\b|\banywhere\b/.test(loc) && !/\b(us|usa|united states|uk|europe|emea|canada|americas|latam)\b/.test(loc)) return true;
  return false;
}

const STOP = new Set(["and", "or", "of", "the", "a", "an", "in", "for", "to", "with", "at", "on", "senior", "sr", "jr", "junior", "lead", "ii", "iii", "i"]);
const tokens = (s) => String(s || "").toLowerCase().split(/[^a-z0-9+#]+/).filter((t) => t && !STOP.has(t));

// Searching for a "leader" means a senior level, which titles spell as Head / Director / VP / Group …
const LEADERSHIP_QUERY = new Set(["leader", "leaders", "leadership", "head", "director", "vp"]);
const LEADERSHIP_TITLE = new Set(["head", "director", "vp", "vice", "president", "chief", "principal", "group", "leader", "leadership", "cpo", "gpm"]);
// A title naming another function ("Product Designer", "Product Marketing Manager") is a different job.
const OTHER_FUNCTION = ["designer", "design", "marketing", "marketer", "engineer", "engineering", "developer", "sales", "support", "recruiter"];

/**
 * A role matches when every meaningful keyword appears in its title (e.g. "product manager"), with
 * leadership words matched by level ("Product Leader" ↔ "Director - Product", "Group Product Manager")
 * and titles from another function left out unless the search names that function.
 */
export function titleMatches(role, keywords) {
  const want = tokens(keywords);
  if (!want.length) return true;
  const have = new Set(tokens(role));
  // "PM" / "GPM" in a title stands for product manager.
  if (have.has("pm") || have.has("gpm")) ["product", "manager"].forEach((t) => have.add(t));
  const hasWord = (t) => have.has(t) || have.has(`${t}s`) || (t.endsWith("s") && have.has(t.slice(0, -1)));

  if (OTHER_FUNCTION.some((f) => have.has(f) && !want.some((t) => t.startsWith(f.slice(0, 6))))) return false;
  return want.every((t) =>
    LEADERSHIP_QUERY.has(t) ? [...have].some((h) => LEADERSHIP_TITLE.has(h)) : hasWord(t),
  );
}

/** Key used to drop the same role posted on several sources. */
export function dedupeKey(job) {
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return `${norm(job.company)}|${norm(job.role)}|${norm(String(job.location || "").split(",")[0])}`;
}

export function dedupeJobs(jobs) {
  const byKey = new Map();
  for (const job of jobs) {
    const key = dedupeKey(job);
    const existing = byKey.get(key);
    if (!existing || (job.jd || "").length > (existing.jd || "").length) byKey.set(key, job);
  }
  return [...byKey.values()];
}

/* --------------------------------------------------------------- normalizers */

export function normalizeGreenhouse(raw, company) {
  const offices = (raw.offices || []).map((o) => o?.name).filter(Boolean);
  return {
    id: `gh-${company.slug}-${raw.id}`,
    company: company.name,
    role: raw.title || "Role",
    location: raw.location?.name || offices.join(", ") || "",
    salary: "",
    badge: null,
    source: "greenhouse",
    jd: htmlToPlain(raw.content || ""),
    url: raw.absolute_url || `https://boards.greenhouse.io/${company.slug}/jobs/${raw.id}`,
    postedAt: raw.first_published || raw.updated_at || null,
  };
}

export function normalizeLever(raw, company) {
  const lists = (raw.lists || [])
    .map((l) => `${l.text || ""}\n${htmlToPlain(l.content || "")}`.trim())
    .filter(Boolean)
    .join("\n\n");
  const jd = [raw.descriptionPlain || htmlToPlain(raw.description || ""), lists, raw.additionalPlain || htmlToPlain(raw.additional || "")]
    .filter(Boolean)
    .join("\n\n")
    .trim();
  const sr = raw.salaryRange;
  const salary = sr && /inr/i.test(sr.currency || "") ? formatLpa(sr.min, sr.max) : "";
  const allLocations = raw.categories?.allLocations;
  return {
    id: `lever-${company.slug}-${raw.id}`,
    company: company.name,
    role: raw.text || "Role",
    location: (Array.isArray(allLocations) && allLocations.length ? allLocations.join(", ") : raw.categories?.location) || "",
    salary,
    badge: null,
    source: "lever",
    jd,
    url: raw.hostedUrl || raw.applyUrl || "",
    postedAt: raw.createdAt ? new Date(raw.createdAt).toISOString() : null,
  };
}

export function normalizeAshby(raw, company) {
  const secondary = (raw.secondaryLocations || []).map((l) => l?.location).filter(Boolean);
  const location = [raw.location, ...secondary].filter(Boolean).join(", ") || (raw.isRemote ? "Remote" : "");
  return {
    id: `ashby-${company.slug}-${raw.id}`,
    company: company.name,
    role: raw.title || "Role",
    location,
    salary: raw.compensation?.compensationTierSummary || "",
    badge: null,
    source: "ashby",
    jd: raw.descriptionPlain || htmlToPlain(raw.descriptionHtml || ""),
    url: raw.jobUrl || raw.applyUrl || "",
    postedAt: raw.publishedAt || null,
  };
}

export function normalizeWorkable(raw, company) {
  const locs = (raw.locations || [])
    .map((l) => [l.city, l.region, l.country].filter(Boolean).join(", "))
    .filter(Boolean);
  const location = locs[0] || [raw.city, raw.state, raw.country].filter(Boolean).join(", ") || (raw.telecommuting ? "Remote" : "");
  return {
    id: `workable-${company.slug}-${raw.shortcode || raw.code || raw.id}`,
    company: company.name,
    role: raw.title || "Role",
    location,
    salary: "",
    badge: null,
    source: "workable",
    jd: htmlToPlain(raw.description || ""),
    url: raw.url || raw.shortlink || raw.application_url || "",
    postedAt: raw.published_on || raw.created_at || null,
  };
}

export function normalizeAdzuna(raw) {
  return {
    id: `adzuna-${raw.id}`,
    company: raw.company?.display_name || "Company",
    role: raw.title ? htmlToPlain(raw.title) : "Role",
    location: raw.location?.display_name || "",
    // Adzuna marks estimated salaries with salary_is_predicted = "1"; only show advertised ones.
    salary: String(raw.salary_is_predicted) === "1" ? "" : formatLpa(raw.salary_min, raw.salary_max),
    badge: null,
    source: "adzuna",
    jd: htmlToPlain(raw.description || ""),
    url: raw.redirect_url || "",
    postedAt: raw.created || null,
  };
}

/* ------------------------------------------------------------- company boards */

const BOARD_URL = {
  greenhouse: (slug) => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`,
  lever: (slug) => `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`,
  ashby: (slug) => `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`,
  workable: (slug) => `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(slug)}?details=true`,
};

const NORMALIZE = {
  greenhouse: (data, c) => (data?.jobs || []).map((j) => normalizeGreenhouse(j, c)),
  lever: (data, c) => (Array.isArray(data) ? data : []).map((j) => normalizeLever(j, c)),
  ashby: (data, c) => (data?.jobs || []).filter((j) => j.isListed !== false).map((j) => normalizeAshby(j, c)),
  workable: (data, c) => (data?.jobs || []).map((j) => normalizeWorkable(j, c)),
};

/** Company boards to search (server/jobBoards.js), skipping disabled or malformed entries. */
export function loadCompanies() {
  return JOB_BOARDS.filter((c) => c && c.name && c.slug && ATS_TYPES.includes(c.ats) && c.enabled !== false);
}

const boardCache = new Map(); // `${ats}:${slug}` → { at, jobs }

/** All open roles on one company's board (cached). Throws on network/HTTP errors. */
export async function fetchBoard(company, { fresh = false } = {}) {
  const key = `${company.ats}:${company.slug}`;
  const cached = boardCache.get(key);
  if (!fresh && cached && Date.now() - cached.at < BOARD_CACHE_MS) return cached.jobs;
  const data = await fetchJson(BOARD_URL[company.ats](company.slug));
  const jobs = NORMALIZE[company.ats](data, company);
  boardCache.set(key, { at: Date.now(), jobs });
  return jobs;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Search every company board for roles whose title matches the keywords. */
export async function searchCompanyBoards({ keywords, indiaOnly = true, companies = loadCompanies() }) {
  const stats = { boards: companies.length, ok: 0, failed: [] };
  const perCompany = await mapLimit(companies, BOARD_CONCURRENCY, async (company) => {
    try {
      const jobs = await fetchBoard(company);
      stats.ok += 1;
      return jobs.filter((j) => titleMatches(j.role, keywords) && (!indiaOnly || isIndiaLocation(j.location)));
    } catch (e) {
      stats.failed.push(`${company.ats}:${company.slug} (${e.name === "AbortError" ? "timeout" : e.message})`);
      return [];
    }
  });
  if (stats.failed.length) console.warn(`[job-sources] ${stats.failed.length} board(s) failed:`, stats.failed.join(", "));
  return { jobs: perCompany.flat(), stats };
}

/* -------------------------------------------------------------------- Adzuna */

export function adzunaConfigured() {
  return !!(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY);
}

/** Adzuna India search. Returns [] when keys are missing. */
export async function searchAdzuna({ keywords, location, limit = 50, maxDaysOld = 30 }) {
  if (!adzunaConfigured()) return [];
  const perPage = 50;
  const pages = Math.max(1, Math.min(Math.ceil(limit / perPage), 3));
  const where = location && !/^india$/i.test(location.trim()) ? location.trim() : "";
  const results = [];
  for (let page = 1; page <= pages; page += 1) {
    const url = new URL(`https://api.adzuna.com/v1/api/jobs/in/search/${page}`);
    url.searchParams.set("app_id", process.env.ADZUNA_APP_ID);
    url.searchParams.set("app_key", process.env.ADZUNA_APP_KEY);
    url.searchParams.set("results_per_page", String(perPage));
    url.searchParams.set("what", keywords || "product manager");
    url.searchParams.set("max_days_old", String(maxDaysOld));
    url.searchParams.set("sort_by", "date");
    if (where) url.searchParams.set("where", where);
    try {
      const data = await fetchJson(url.toString());
      const batch = (data?.results || []).map(normalizeAdzuna);
      results.push(...batch);
      if (batch.length < perPage) break;
    } catch (e) {
      console.warn("[job-sources] Adzuna page", page, "failed:", e.message);
      break;
    }
  }
  return results.slice(0, limit);
}

/* --------------------------------------------------------------- combined API */

/**
 * Search all API sources in parallel. Newest first, duplicates removed.
 * Returns { jobs, sources: { companyBoards: {...}, adzuna: {...} } }.
 */
export async function searchApiSources({ keywords, location = "India", limit = 100 }) {
  const indiaOnly = !location || /india/i.test(location);
  const [boards, adzuna] = await Promise.all([
    searchCompanyBoards({ keywords, indiaOnly }).catch((e) => ({ jobs: [], stats: { error: e.message } })),
    searchAdzuna({ keywords, location, limit }).catch(() => []),
  ]);
  const all = dedupeJobs([...boards.jobs, ...adzuna]);
  all.sort((a, b) => (Date.parse(b.postedAt || 0) || 0) - (Date.parse(a.postedAt || 0) || 0));
  return {
    jobs: all.slice(0, limit),
    sources: {
      companyBoards: { found: boards.jobs.length, boardsChecked: boards.stats?.boards ?? 0, boardsOk: boards.stats?.ok ?? 0 },
      adzuna: { configured: adzunaConfigured(), found: adzuna.length },
    },
  };
}
