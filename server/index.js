/**
 * ResumeIQ API server – proxies LinkedIn job search so API keys stay server-side.
 * Run: node server/index.js  (or npm run server)
 * Supports: APIFY_TOKEN (preferred), RAPIDAPI_KEY, or free LinkedIn guest API (no key).
 */
import express from "express";
import cors from "cors";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import * as cheerio from "cheerio";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootEnv = resolve(__dirname, "../.env");
const serverEnv = resolve(__dirname, ".env");
const cwdEnv = resolve(process.cwd(), ".env");

const ENV_KEYS = ["RAPIDAPI_KEY", "APIFY_TOKEN", "APIFY_API_TOKEN"];

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return false;
  let content = readFileSync(filePath, "utf8");
  content = content.replace(/^\uFEFF/, ""); // strip BOM
  let found = false;
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.replace(/\r$/, "").trim();
    for (const key of ENV_KEYS) {
      const m = trimmed.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`));
      if (m) {
        let value = (m[1] || "").replace(/\s#.*$/, "").trim();
        value = value.replace(/^["']|["']$/g, "").replace(/\r$/, "").trim();
        if (value) {
          if (key === "APIFY_API_TOKEN") process.env.APIFY_TOKEN = process.env.APIFY_TOKEN || value;
          else process.env[key] = value;
          found = true;
        }
        break;
      }
    }
  });
  return found;
}

const tried = [
  [rootEnv, loadEnvFile(rootEnv)],
  [serverEnv, loadEnvFile(serverEnv)],
  [cwdEnv, loadEnvFile(cwdEnv)],
];

function getRapidApiKey() {
  if (process.env.RAPIDAPI_KEY) return process.env.RAPIDAPI_KEY;
  loadEnvFile(rootEnv);
  loadEnvFile(serverEnv);
  loadEnvFile(cwdEnv);
  return process.env.RAPIDAPI_KEY || "";
}

function getApifyToken() {
  if (process.env.APIFY_TOKEN) return process.env.APIFY_TOKEN;
  loadEnvFile(rootEnv);
  loadEnvFile(serverEnv);
  loadEnvFile(cwdEnv);
  return process.env.APIFY_TOKEN || "";
}

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: true }));
app.use(express.json());

const RAPIDAPI_HOST = "linkedin-job-search-api.p.rapidapi.com";

/** Strip HTML to plain text. */
function htmlToText(html) {
  if (typeof html !== "string" || !html.trim()) return "";
  try {
    const $ = cheerio.load(html);
    return $.text().replace(/\s+/g, " ").trim();
  } catch {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
}

/** Get job description from raw object (multiple possible keys, strip HTML). */
function getJd(raw) {
  const candidates = [
    raw.description,
    raw.jobDescription,
    raw.jd,
    raw.jobDescriptionText,
    raw.fullDescription,
    raw.snippet,
    raw.content,
    raw.body,
    raw.details?.description,
    raw.jobData?.description,
    raw.descriptionHtml,
    raw.jobDescriptionHtml,
  ].filter(Boolean);
  for (const v of candidates) {
    const str = typeof v === "string" ? v : (v && typeof v === "object" && (v.text ?? v.content) ? (v.text ?? v.content) : "");
    if (typeof str === "string" && str.trim().length > 0) {
      return /<[a-z][\s\S]*>/i.test(str) ? htmlToText(str) : str.trim();
    }
  }
  // Fallback: longest string value that looks like prose (likely the JD)
  if (raw && typeof raw === "object") {
    let best = "";
    for (const value of Object.values(raw)) {
      const s = typeof value === "string" ? value : (value?.text ?? value?.content);
      if (typeof s === "string" && s.length > best.length && s.length > 80 && /\s/.test(s)) {
        best = /<[a-z][\s\S]*>/i.test(s) ? htmlToText(s) : s.trim();
      }
    }
    if (best) return best;
  }
  return "";
}

/** Normalize third-party job shape to ResumeIQ job shape (RapidAPI + Apify).
 * practicaltools/linkedin-jobs returns: jobId, title, company, location, datePosted, url, labels, logo, extractedAt, source, discoveredAt — no description field. */
function normalizeJob(raw, index) {
  const id = raw.jobId ?? raw.id ?? raw.urn ?? raw.link?.match(/-(\d+)\?/)?.[1] ?? `linkedin-${index}-${Date.now()}`;
  const company =
    (typeof raw.company === "string" ? raw.company : null) ??
    raw.company?.name ??
    raw.companyName ??
    raw.employer ??
    raw.organization ??
    (typeof raw.company === "object" && raw.company !== null ? raw.company.name || raw.company.title : null) ??
    "Company";
  const locationStr =
    (typeof raw.location === "string" ? raw.location : null) ??
    raw.locationName ??
    raw.place ??
    raw.jobLocation ??
    (raw.locationDetails ? [raw.locationDetails.city, raw.locationDetails.country].filter(Boolean).join(", ") : "") ??
    "";
  const jd = getJd(raw);
  const salary = raw.salary ?? raw.compensation ?? (raw.salaryInfo?.raw ?? "") ?? raw.salaryRange ?? "";
  const role =
    raw.title ??
    raw.jobTitle ??
    raw.position ??
    raw.positionTitle ??
    raw.name ??
    "Role";
  return {
    id: String(id).replace(/\s/g, "-"),
    company: typeof company === "string" ? company : "Company",
    role: typeof role === "string" ? role : "Role",
    location: locationStr || "",
    salary: salary || "",
    badge: raw.badge ?? null,
    source: "linkedin",
    jd: jd || "",
    url: raw.url ?? raw.jobUrl ?? raw.link ?? "",
  };
}

/** Fetch jobs via Apify LinkedIn Jobs Scraper. Returns { jobs } or { error: string } on failure. */
async function fetchJobsApify(token, keywords, location, limit) {
  const requested = Math.min(Number(limit) || 25, 150);
  const maxPages = Math.min(Math.ceil(requested / 10), 15); // 10 jobs per page, cap 15 pages (150 jobs)
  const url = `https://api.apify.com/v2/acts/practicaltools~linkedin-jobs/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=180&format=json`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      keywords: keywords || "Product Manager",
      location: location || "India",
      maxPages,
      maxRequestsPerCrawl: Math.min(maxPages * 12, 200),
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    let detail = text.slice(0, 200);
    try {
      const err = JSON.parse(text);
      if (err.error && err.error.message) detail = err.error.message;
      else if (err.message) detail = err.message;
    } catch (_) {}
    console.error("[linkedin-jobs] Apify error", response.status, detail);
    return { error: `Apify ${response.status}: ${detail}` };
  }
  let rawList;
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      rawList = parsed;
    } else if (parsed && typeof parsed === "object") {
      rawList = parsed.data ?? parsed.items ?? parsed.results ?? parsed.jobs ?? (parsed.content && Array.isArray(parsed.content) ? parsed.content : null);
      if (!Array.isArray(rawList)) {
        const keys = Object.keys(parsed).join(", ");
        console.warn("[linkedin-jobs] Apify response not an array, top-level keys:", keys);
        return { jobs: [] };
      }
    } else {
      rawList = [];
    }
  } catch {
    console.error("[linkedin-jobs] Apify response not valid JSON");
    return { error: "Apify returned invalid JSON" };
  }
  if (!Array.isArray(rawList) || rawList.length === 0) {
    console.log("[linkedin-jobs] Apify – no items in response");
    return { jobs: [] };
  }
  // Apify practicaltools/linkedin-jobs returns items like { scrapedAt, total, jobs: [...] }. Flatten.
  const flatRaw = [];
  for (const item of rawList) {
    if (item && typeof item === "object" && Array.isArray(item.jobs)) {
      flatRaw.push(...item.jobs);
    } else if (item && typeof item === "object" && (item.title || item.jobTitle || item.company || item.companyName)) {
      flatRaw.push(item);
    }
  }
  const toNormalize = flatRaw.length ? flatRaw : rawList;
  if (toNormalize.length > 0 && toNormalize[0] && typeof toNormalize[0] === "object") {
    const first = toNormalize[0];
    console.log("[linkedin-jobs] Apify job keys:", Object.keys(first).join(", "));
    const firstNormalized = normalizeJob(first, 0);
    console.log("[linkedin-jobs] Apify first job JD length:", firstNormalized.jd?.length ?? 0);
    if (!firstNormalized.jd && first && typeof first === "object") {
      const descKeys = ["description", "jobDescription", "jd", "snippet", "content", "body", "fullDescription", "jobDescriptionText"];
      const found = descKeys.find((k) => first[k] && typeof first[k] === "string");
      console.log("[linkedin-jobs] JD missing – checked keys present:", found ? found : "none (actor may not return full descriptions in list output)");
    }
  }
  const jobs = toNormalize.map((raw, i) => normalizeJob(raw, i));
  console.log("[linkedin-jobs] Apify 200 – jobs count:", jobs.length);
  return { jobs };
}

/** Fetch jobs with full JDs using Valig LinkedIn Jobs Scraper (returns description in one call). */
async function fetchJobsValig(token, keywords, location, limit) {
  const reqLimit = Math.min(Number(limit) || 50, 100);
  const url = `https://api.apify.com/v2/acts/valig~linkedin-jobs-scraper/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=180&format=json`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body: JSON.stringify({
      title: keywords || "Product Manager",
      location: location || "India",
      limit: reqLimit,
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    console.warn("[linkedin-jobs] Valig Apify error", response.status, text.slice(0, 200));
    return null;
  }
  let rawList = [];
  try {
    const parsed = JSON.parse(text);
    rawList = Array.isArray(parsed) ? parsed : parsed?.data ?? parsed?.items ?? [];
  } catch {
    return null;
  }
  if (rawList.length === 0) return null;
  const jobs = rawList.map((raw, i) => normalizeJob(raw, i));
  console.log("[linkedin-jobs] Valig 200 – jobs count:", jobs.length, "with JDs");
  return { jobs };
}

/** Fetch jobs via RapidAPI LinkedIn Job Search API. Returns { jobs } or null on failure. */
async function fetchJobsRapidAPI(key, keywords, location, limit, offset) {
  const url = new URL(`https://${RAPIDAPI_HOST}/active-jb-1h`);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("start", String(offset));
  url.searchParams.set("description_type", "text");
  if (keywords) url.searchParams.set("keywords", keywords);
  if (location) url.searchParams.set("location", location);
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { "x-rapidapi-host": RAPIDAPI_HOST, "x-rapidapi-key": key },
  });
  const text = await response.text();
  if (!response.ok) {
    console.error("[linkedin-jobs] RapidAPI error", response.status, text.slice(0, 200));
    return null;
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const rawList = Array.isArray(data) ? data : data.data ?? data.jobs ?? data.results ?? data.items ?? [];
  return { jobs: rawList.map((raw, i) => normalizeJob(raw, i)) };
}

/** Fetch jobs via LinkedIn guest API (no key, unofficial). Returns { jobs } or null. */
async function fetchJobsGuest(keywords, location, limit) {
  const start = 0;
  const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(keywords || "Product Manager")}&location=${encodeURIComponent(location || "India")}&start=${start}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml",
    },
  });
  if (!response.ok) {
    console.error("[linkedin-jobs] Guest API error", response.status);
    return null;
  }
  const html = await response.text();
  const $ = cheerio.load(html);
  const jobs = [];
  $("li").each((i, el) => {
    const $el = $(el);
    const $card = $el.find(".base-card").first();
    if (!$card.length) return;
    const title = $card.find("[class*=_title]").first().text().trim();
    const company = $card.find("[class*=_subtitle]").first().text().trim();
    const loc = $card.find("[class*=_location]").first().text().trim();
    const link = $card.find("a[class*=_full-link]").attr("href") || "";
    const jobId = (link.match(/-(\d+)\?/) || [])[1] || `guest-${i}`;
    if (!title) return;
    jobs.push(normalizeJob({
      id: jobId,
      title,
      companyName: company,
      location: loc,
      description: "",
    }, i));
  });
  console.log("[linkedin-jobs] Guest API – jobs count:", jobs.length);
  return jobs.length ? { jobs } : null;
}

app.get("/api/linkedin-jobs", async (req, res) => {
  const apifyToken = getApifyToken();
  const rapidKey = getRapidApiKey();
  const keywords = (req.query.keywords || "").trim() || "Product Manager";
  const location = (req.query.location || "").trim() || "India";
  const limit = Math.min(Number(req.query.limit) || 50, 150);
  const offset = Number(req.query.offset) || 0;

  console.log("[linkedin-jobs] request – Apify:", !!apifyToken, "RapidAPI:", !!rapidKey, "keywords:", keywords);

  try {
    let lastError = null;
    const fetchDescriptions = req.query.fetchDescriptions !== "0" && req.query.fetchDescriptions !== "false";
    if (apifyToken) {
      if (fetchDescriptions) {
        const valigResult = await fetchJobsValig(apifyToken, keywords, location, limit);
        if (valigResult && valigResult.jobs && valigResult.jobs.length > 0) {
          return res.json(valigResult);
        }
      }
      const result = await fetchJobsApify(apifyToken, keywords, location, limit);
      if (result.jobs && result.jobs.length > 0) {
        return res.json(result);
      }
      if (result.jobs && result.jobs.length === 0) {
        return res.json(result);
      }
      if (result.error) lastError = result.error;
      console.log("[linkedin-jobs] Apify failed or empty, trying fallbacks");
    }

    if (rapidKey) {
      const result = await fetchJobsRapidAPI(rapidKey, keywords, location, limit, offset);
      if (result && result.jobs && result.jobs.length > 0) {
        return res.json(result);
      }
    }

    const guestResult = await fetchJobsGuest(keywords, location, limit);
    if (guestResult && guestResult.jobs && guestResult.jobs.length > 0) {
      return res.json(guestResult);
    }

    const details = lastError || "No jobs returned. Try Apify (apify.com/practicaltools/linkedin-jobs) for more results.";
    return res.status(502).json({
      error: "LinkedIn job search failed",
      details,
    });
  } catch (err) {
    console.error("LinkedIn jobs proxy error:", err);
    return res.status(500).json({
      error: "LinkedIn job search failed",
      details: err.message,
    });
  }
});

// Health check for dev/proxy
app.get("/api/health", (_, res) =>
  res.json({
    ok: true,
    linkedinConfigured: !!getApifyToken() || !!getRapidApiKey(),
    apify: !!getApifyToken(),
    rapidapi: !!getRapidApiKey(),
  })
);

app.listen(PORT, () => {
  const apify = getApifyToken();
  const rapid = getRapidApiKey();
  console.log(`ResumeIQ API server running at http://localhost:${PORT}`);
  tried.forEach(([path]) => {
    const exists = existsSync(path);
    console.log(`  .env: ${path} (exists: ${exists})`);
  });
  if (apify) console.log("  APIFY_TOKEN: loaded (Apify LinkedIn Jobs – preferred)");
  if (rapid) console.log("  RAPIDAPI_KEY: loaded (fallback)");
  if (!apify && !rapid) console.log("  No API keys – will use free LinkedIn guest API when job search runs");
});
