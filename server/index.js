/**
 * ResumeIQ API server – proxies LinkedIn job search so API keys stay server-side.
 * Run: node server/index.js  (or npm run server)
 * Supports: APIFY_TOKEN (preferred), RAPIDAPI_KEY, or free LinkedIn guest API (no key).
 */
import express from "express";
import cors from "cors";
import { readFileSync, existsSync } from "fs";
import { createHash } from "crypto";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import * as cheerio from "cheerio";
import { saveJobs, findJobs, repositorySize } from "./jobRepository.js";
import { htmlToText, normalizeJob, fetchJobsApify, fetchJobsValig } from "./linkedinJobs.js";
import {
  jobStoreConfigured, toRow, inScope, upsertJobs, findStoredJobs, recordDemand, markDemandCollected, linkedInJobsForQuery,
  userFromToken, recordApplication, updateApplication, getJobById,
  getTailorSession, saveTailorSession, saveTailoredResumeFile, getProfile,
} from "./jobStore.js";
import { normalizeQuery, FRESH_HOURS } from "./searchDemand.js";
import { fetchEasyApplyForm, easyApplyTarget } from "./easyApply.js";
import { fillForm } from "./easyApplyFill.js";
import { rehearse, submit as submitApplication, enterCode } from "./greenhouseSubmit.js";
import { registerExtensionRoutes } from "./extensionApi.js";
import { searchApiSources, adzunaConfigured, loadCompanies } from "./jobSources.js";
import { callLLM, llmProvider, llmModel, LLMUserError } from "./llm.js";

/** Provider errors can leak account details (e.g. Groq org ids); only our own messages reach users. */
function sendLLMError(res, err, tag) {
  console.error(`[${tag}] error:`, err.message, err.cause?.message || "");
  if (err instanceof LLMUserError) return res.status(err.status).json({ error: err.message });
  return res.status(502).json({ error: "The AI service had a problem handling that request. Please try again." });
}
import { runAssistantTurn, listGaps } from "./assistant.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootEnv = resolve(__dirname, "../.env");
const serverEnv = resolve(__dirname, ".env");
const cwdEnv = resolve(process.cwd(), ".env");

const ENV_KEYS = [
  "RAPIDAPI_KEY", "APIFY_TOKEN", "APIFY_API_TOKEN", "RXRESUME_API_KEY", "RXRESUME_URL",
  "GROQ_API_KEY", "GROQ_MODEL", "ANTHROPIC_API_KEY", "VITE_ANTHROPIC_API_KEY", "ANTHROPIC_MODEL", "ANTHROPIC_EFFORT", "GROQ_FALLBACK_MODELS", "LLM_PROVIDER",
  "ADZUNA_APP_ID", "ADZUNA_APP_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
];

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

function getRxResumeKey() {
  if (process.env.RXRESUME_API_KEY) return process.env.RXRESUME_API_KEY;
  loadEnvFile(rootEnv);
  loadEnvFile(serverEnv);
  loadEnvFile(cwdEnv);
  return process.env.RXRESUME_API_KEY || "";
}

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: true }));
// 2 MB: resumes can carry an embedded photo (data URL) when exported to Reactive Resume.
// Resume uploads (up to 10 MB, sent base64) get a larger body limit than everything else.
const jsonDefault = express.json({ limit: "2mb" });
const jsonUpload = express.json({ limit: "15mb" });
app.use((req, res, next) => (req.method === "POST" && req.path === "/api/ext/resumes" ? jsonUpload : jsonDefault)(req, res, next));

const RAPIDAPI_HOST = "linkedin-job-search-api.p.rapidapi.com";

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
async function fetchJobsGuest(keywords, location, limit, experienceLevels = []) {
  const start = 0;
  const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(keywords || "Product Manager")}&location=${encodeURIComponent(location || "India")}&start=${start}${experienceLevels.length ? `&f_E=${encodeURIComponent(experienceLevels.join(","))}` : ""}`;
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

/**
 * Prompt proxy for the browser – runs on whichever provider llm.js selects.
 * Capped so a deployed server can't be used as an open, unlimited model proxy.
 */
const LLM_MAX_PROMPT_CHARS = 60000;
const LLM_MAX_TOKENS = 4096;

app.post("/api/llm", async (req, res) => {
  const { system, user, maxTokens, json } = req.body || {};
  if (typeof system !== "string" || typeof user !== "string" || !user.trim()) {
    return res.status(400).json({ error: "system and user prompts are required" });
  }
  if (system.length + user.length > LLM_MAX_PROMPT_CHARS) {
    return res.status(413).json({ error: "Prompt is too long." });
  }
  try {
    const text = await callLLM({
      system,
      user,
      maxTokens: Math.min(Number(maxTokens) || 1500, LLM_MAX_TOKENS),
      json: !!json,
    });
    res.json({ text, provider: llmProvider(), model: llmModel() });
  } catch (err) {
    sendLLMError(res, err, `llm:${llmProvider()}`);
  }
});

/**
 * Conversational tailoring assistant – one turn per call. See server/assistant.js
 * for the checks every proposed edit must pass.
 */
const ASSISTANT_MAX_MESSAGES = 40;

app.post("/api/assistant/gaps", async (req, res) => {
  const { resume, job } = req.body || {};
  if (!resume || typeof resume !== "object" || !job?.jd) {
    return res.status(400).json({ error: "resume and job (with jd) are required" });
  }
  try {
    res.json(await listGaps({ resume, job }));
  } catch (err) {
    sendLLMError(res, err, "assistant-gaps");
  }
});

app.post("/api/assistant", async (req, res) => {
  const { resume, job, messages, decisions, focusGaps, questionsOnGap } = req.body || {};
  if (!resume || typeof resume !== "object" || !job?.jd) {
    return res.status(400).json({ error: "resume and job (with jd) are required" });
  }
  const chat = (Array.isArray(messages) ? messages : [])
    .filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  if (chat.length > ASSISTANT_MAX_MESSAGES) {
    return res.status(413).json({ error: "This conversation is too long. Continue to the preview, or start over for this job." });
  }
  try {
    const turn = await runAssistantTurn({
      resume,
      job,
      messages: chat,
      decisions: Array.isArray(decisions) ? decisions.slice(-40) : [],
      focusGaps: (Array.isArray(focusGaps) ? focusGaps : [])
        .filter((g) => g && typeof g.id === "string" && typeof g.title === "string")
        .slice(0, 6)
        .map((g) => ({ id: g.id.slice(0, 8), title: g.title.slice(0, 80), detail: String(g.detail || "").slice(0, 300), kind: g.kind === "real" ? "real" : "wording" })),
      questionsOnGap: Math.max(0, Math.min(10, Number(questionsOnGap) || 0)),
    });
    res.json(turn);
  } catch (err) {
    sendLLMError(res, err, "assistant");
  }
});

/**
 * Saved roles from earlier live searches that match this one – returns
 * instantly so the job grid isn't empty while /api/linkedin-jobs scrapes.
 */
/** One stored role by id – used when the extension opens the app to tailor a resume for it. */
app.get("/api/jobs/by-id", async (req, res) => {
  const id = String(req.query.id || "").slice(0, 200);
  if (!id || !jobStoreConfigured()) return res.status(400).json({ error: "id is required" });
  try {
    const job = await getJobById(id);
    return job ? res.json({ job }) : res.status(404).json({ error: "That job isn't in ResumeIQ" });
  } catch (err) {
    console.warn("[jobs-db] by-id failed:", err.message);
    return res.status(502).json({ error: "Couldn't load the job" });
  }
});

app.get("/api/jobs/saved", async (req, res) => {
  const keywords = (req.query.keywords || "").trim();
  const location = (req.query.location || "").trim();
  const levels = String(req.query.experienceLevel || "")
    .split(",")
    .map((x) => x.trim())
    .filter((x) => /^[1-6]$/.test(x));
  // The Supabase jobs repository (every source) when configured; otherwise the local file.
  if (jobStoreConfigured()) {
    try {
      const jobs = await findStoredJobs({ keywords, location, limit: Math.min(Number(req.query.limit) || 100, 200) });
      return res.json({ jobs, repository: "supabase" });
    } catch (err) {
      console.warn("[jobs-db] saved roles lookup failed, using the local file:", err.message);
    }
  }
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const jobs = findJobs({ keywords, location, levels, limit });
  res.json({ jobs, repositorySize: repositorySize() });
});

const isIndiaSearch = (location) => !location || /^india$/i.test(String(location).trim());

/** Save a live LinkedIn search to the Supabase repository, tagged with its normalised search. */
async function storeLinkedInResults(jobs, keywords, location) {
  if (!jobStoreConfigured() || !isIndiaSearch(location) || !normalizeQuery(keywords)) return;
  const key = normalizeQuery(keywords);
  try {
    const rows = jobs.filter((job) => /^\d+$/.test(job.id)).map((job) => toRow(job, { query: key })).filter(inScope);
    const saved = await upsertJobs(rows);
    await markDemandCollected(key);
    console.log(`[jobs-db] live search "${key}" – ${saved} roles saved`);
  } catch (err) {
    console.warn("[jobs-db] saving live search failed:", err.message);
  }
}

/**
 * Roles from sources with official public APIs: company career boards on Greenhouse,
 * Lever, Ashby and Workable (server/jobBoards.js), plus Adzuna India when keyed.
 * Runs alongside the LinkedIn search; results are saved to the roles repository too.
 */
app.get("/api/jobs/sources", async (req, res) => {
  const keywords = String(req.query.keywords || "").trim().slice(0, 120) || "Product Manager";
  const location = String(req.query.location || "").trim().slice(0, 80) || "India";
  const limit = Math.min(Number(req.query.limit) || 100, 200);
  try {
    const result = await searchApiSources({ keywords, location, limit });
    const { added, total } = saveJobs(result.jobs, { location, levels: parseExperienceLevels(req.query.experienceLevel) });
    console.log(
      `[job-sources] "${keywords}" in ${location} – ${result.jobs.length} roles ` +
        `(boards ${result.sources.companyBoards.boardsOk}/${result.sources.companyBoards.boardsChecked} ok, ` +
        `adzuna ${result.sources.adzuna.configured ? result.sources.adzuna.found : "off"}), ${added} new, ${total} saved`,
    );
    return res.json(result);
  } catch (err) {
    console.warn("[job-sources] search failed:", err.message);
    return res.status(502).json({ error: "Could not search career pages", jobs: [] });
  }
});

/**
 * Live LinkedIn search in three calls, so the UI can show real progress:
 * start an Apify run, poll how many roles it has collected, then fetch the results.
 * GET /api/linkedin-jobs (run-and-wait, with fallbacks) remains the fallback path.
 */
const VALIG_ACTOR = "valig~linkedin-jobs-scraper";
const APIFY_ID = /^[A-Za-z0-9]{8,32}$/;

function parseExperienceLevels(value) {
  return String(value || "")
    .split(",")
    .map((x) => x.trim())
    .filter((x) => /^[1-6]$/.test(x));
}

async function apifyJson(path, token, options = {}) {
  const response = await fetch(`https://api.apify.com/v2${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `Apify ${response.status}`);
  return data;
}

app.post("/api/linkedin-jobs/start", async (req, res) => {
  const token = getApifyToken();
  if (!token) return res.status(400).json({ error: "Live search not configured", fallback: true });
  const { keywords, location, limit, experienceLevel } = req.body || {};
  const levels = parseExperienceLevels(experienceLevel);
  // Demand-driven: count the ask, and serve a search collected in the last FRESH_HOURS
  // from the repository instead of paying for another live run.
  const key = normalizeQuery(keywords);
  if (jobStoreConfigured() && key && isIndiaSearch(location)) {
    try {
      const demand = await recordDemand(key, String(keywords).trim());
      const collected = demand?.last_collected_at ? Date.parse(demand.last_collected_at) : 0;
      if (Date.now() - collected < FRESH_HOURS * 60 * 60 * 1000) {
        const jobs = await linkedInJobsForQuery(key);
        if (jobs.length) {
          console.log(`[jobs-db] "${key}" served from repository – ${jobs.length} roles, no live run`);
          return res.json({ cached: true, jobs });
        }
      }
    } catch (err) {
      console.warn("[jobs-db] demand/cache check failed, searching live:", err.message);
    }
  }
  try {
    const { data } = await apifyJson(`/acts/${VALIG_ACTOR}/runs?timeout=180`, token, {
      method: "POST",
      body: JSON.stringify({
        keywords: String(keywords || "").trim() || "Product Manager",
        location: String(location || "").trim() || "India",
        limit: Math.min(Number(limit) || 50, 100),
        ...(levels.length ? { urlParam: [{ key: "f_E", value: levels.join(",") }] } : {}),
      }),
    });
    return res.json({ runId: data.id, datasetId: data.defaultDatasetId });
  } catch (err) {
    console.warn("[linkedin-jobs] start failed:", err.message);
    return res.status(502).json({ error: "Could not start live search", fallback: true });
  }
});

app.get("/api/linkedin-jobs/progress", async (req, res) => {
  const token = getApifyToken();
  const { runId, datasetId } = req.query;
  if (!token || !APIFY_ID.test(runId || "") || !APIFY_ID.test(datasetId || "")) {
    return res.status(400).json({ error: "runId and datasetId are required" });
  }
  try {
    // The dataset's itemCount lags; the items endpoint's pagination total is exact.
    const [run, items] = await Promise.all([
      apifyJson(`/actor-runs/${runId}`, token),
      fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?limit=0&clean=true`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);
    const found = Number(items.headers.get("x-apify-pagination-total")) || 0;
    return res.json({ status: run.data?.status, found });
  } catch (err) {
    return res.status(502).json({ error: "Could not read search progress" });
  }
});

app.get("/api/linkedin-jobs/results", async (req, res) => {
  const token = getApifyToken();
  const { datasetId, location } = req.query;
  if (!token || !APIFY_ID.test(datasetId || "")) return res.status(400).json({ error: "datasetId is required" });
  try {
    const response = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?format=json&clean=true`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const items = await response.json().catch(() => []);
    if (!response.ok || !Array.isArray(items)) throw new Error(`Apify ${response.status}`);
    const jobs = items.map((raw, i) => normalizeJob(raw, i));
    const { added, total } = saveJobs(jobs, {
      location: String(location || "").trim() || "India",
      levels: parseExperienceLevels(req.query.experienceLevel),
    });
    console.log(`[jobs-repo] live search – ${jobs.length} roles, ${added} new, ${total} in repository`);
    await storeLinkedInResults(jobs, req.query.keywords, location);
    return res.json({ jobs });
  } catch (err) {
    console.warn("[linkedin-jobs] results failed:", err.message);
    return res.status(502).json({ error: "Could not load search results" });
  }
});

app.get("/api/linkedin-jobs", async (req, res) => {
  const apifyToken = getApifyToken();
  const rapidKey = getRapidApiKey();
  const keywords = (req.query.keywords || "").trim() || "Product Manager";
  const location = (req.query.location || "").trim() || "India";
  const limit = Math.min(Number(req.query.limit) || 50, 150);
  const offset = Number(req.query.offset) || 0;
  // LinkedIn experience-level codes (f_E): 1 Internship, 2 Entry, 3 Associate, 4 Mid-Senior, 5 Director, 6 Executive.
  const experienceLevels = String(req.query.experienceLevel || "")
    .split(",")
    .map((x) => x.trim())
    .filter((x) => /^[1-6]$/.test(x));

  const respondWithJobs = async (result) => {
    const { added, total } = saveJobs(result.jobs, { location, levels: experienceLevels });
    console.log(`[jobs-repo] saved search – ${added} new roles, ${total} in repository`);
    await storeLinkedInResults(result.jobs, keywords, location);
    return res.json(result);
  };

  console.log("[linkedin-jobs] request – Apify:", !!apifyToken, "RapidAPI:", !!rapidKey, "keywords:", keywords, "experienceLevel:", experienceLevels.join(",") || "any");

  try {
    let lastError = null;
    const fetchDescriptions = req.query.fetchDescriptions !== "0" && req.query.fetchDescriptions !== "false";
    if (apifyToken) {
      if (fetchDescriptions) {
        const valigResult = await fetchJobsValig(apifyToken, keywords, location, limit, experienceLevels);
        if (valigResult && valigResult.jobs && valigResult.jobs.length > 0) {
          return respondWithJobs(valigResult);
        }
      }
      const result = await fetchJobsApify(apifyToken, keywords, location, limit, experienceLevels);
      if (result.jobs && result.jobs.length > 0) {
        return respondWithJobs(result);
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
        return respondWithJobs(result);
      }
    }

    const guestResult = await fetchJobsGuest(keywords, location, limit, experienceLevels);
    if (guestResult && guestResult.jobs && guestResult.jobs.length > 0) {
      return respondWithJobs(guestResult);
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

/**
 * Reactive Resume (rxresu.me) integration – generates AI-tailored bullet
 * suggestions via Reactive Resume's hosted AI instead of calling Claude
 * directly. The account API key stays server-side (same reasoning as
 * APIFY_TOKEN above): it can read/write the whole Reactive Resume account,
 * not just make one inference call.
 */
// Reactive Resume instance: the hosted rxresu.me by default, or a self-hosted
// copy (e.g. http://localhost:3000) whose builder can be embedded in ResumeIQ.
const RX_APP_URL = (process.env.RXRESUME_URL || "https://rxresu.me").replace(/\/$/, "");
const RX_BASE = `${RX_APP_URL}/api/openapi`;

async function rxFetch(path, options = {}) {
  const key = getRxResumeKey();
  const response = await fetch(`${RX_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: response.ok, status: response.status, data };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function htmlEscape(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function bulletsToHtml(bullets) {
  const items = (bullets || [])
    .filter((b) => typeof b === "string" && b.trim())
    .map((b) => `<li>${htmlEscape(b.trim())}</li>`)
    .join("");
  return items ? `<ul>${items}</ul>` : "";
}

/** Extract <li> text from a Reactive Resume HTML description; falls back to plain text. */
function htmlToListItems(html) {
  if (typeof html !== "string" || !html.trim()) return [];
  try {
    const $ = cheerio.load(html);
    const items = [];
    $("li").each((_, el) => {
      const t = $(el).text().replace(/\s+/g, " ").trim();
      if (t) items.push(t);
    });
    if (items.length) return items;
    const t = htmlToText(html);
    return t ? [t] : [];
  } catch {
    return [];
  }
}

const RX_EMPTY_WEBSITE = { url: "", label: "", inlineLink: false };

function rxEmptySection(title) {
  return { title, icon: "", columns: 1, hidden: false, keepTogether: false, startOnNewPage: false, items: [] };
}

const RX_TEMPLATES = [
  "azurill", "bronzor", "chikorita", "ditgar", "ditto",
  "gengar", "glalie", "kakuna", "lapras", "leafish",
  "meowth", "onyx", "pikachu", "rhyhorn", "scizor",
];

function rxMetadataForTemplate(template) {
  return {
    template: RX_TEMPLATES.includes(template) ? template : "azurill",
    layout: {
      sidebarWidth: 30,
      pages: [
        {
          fullWidth: false,
          main: ["summary", "experience", "education"],
          sidebar: ["skills", "languages", "interests", "references"],
        },
      ],
    },
    page: { gapX: 12, gapY: 8, marginX: 16, marginY: 16, format: "a4", locale: "en-US", hideLinkUnderline: false, hideIcons: false, hideSectionIcons: false },
    design: { level: { icon: "star", type: "icon" }, colors: { primary: "rgba(0, 132, 209, 1)", text: "rgba(0, 0, 0, 1)", background: "rgba(255, 255, 255, 1)" } },
    typography: {
      body: { fontFamily: "IBM Plex Serif", fontWeights: ["400", "600"], fontSize: 10, lineHeight: 1.5 },
      heading: { fontFamily: "Fira Sans Condensed", fontWeights: ["500"], fontSize: 12, lineHeight: 1.5 },
    },
    notes: "",
  };
}

/**
 * Parsed resumes come from an LLM, so fields can arrive as numbers (e.g. year: 2019),
 * objects or null. Reactive Resume's schema requires plain strings everywhere.
 */
function rxText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(rxText).filter(Boolean).join(", ");
  if (typeof value === "object") return rxText(value.name ?? value.language ?? value.title ?? value.text ?? Object.values(value)[0]);
  return String(value);
}
const rxList = (value) => (Array.isArray(value) ? value : []);

/** Only image data URLs or http(s) links are passed on as the resume picture. */
function rxPhotoUrl(photoUrl) {
  if (typeof photoUrl !== "string") return "";
  if (/^data:image\/(png|jpe?g|webp);base64,/i.test(photoUrl) && photoUrl.length < 1_500_000) return photoUrl;
  if (/^https?:\/\//i.test(photoUrl)) return photoUrl;
  return "";
}

/** Map ResumeIQ's resumeData shape into Reactive Resume's ResumeData schema. */
function mapToRxResumeData(resumeData, template = "azurill") {
  const contact = rxText(resumeData.contact);
  const emailMatch = contact.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return {
    // Shown by default: carries over the photo found in the uploaded resume, and pictures added later in
    // the editor appear without the user having to un-hide them. An empty url renders nothing.
    picture: { hidden: false, url: rxPhotoUrl(resumeData.photoUrl), size: 100, rotation: 0, aspectRatio: 1, borderRadius: 0, borderColor: "rgba(0, 0, 0, 0.5)", borderWidth: 0, shadowColor: "rgba(0, 0, 0, 0.5)", shadowWidth: 0 },
    basics: {
      name: rxText(resumeData.name),
      headline: rxText(resumeData.title),
      email: emailMatch ? emailMatch[0] : "",
      phone: "",
      location: "",
      website: RX_EMPTY_WEBSITE,
      customFields: contact ? [{ id: crypto.randomUUID(), icon: "", text: contact }] : [],
    },
    summary: {
      title: "Summary",
      icon: "",
      columns: 1,
      hidden: !rxText(resumeData.summary),
      keepTogether: false,
      startOnNewPage: false,
      content: rxText(resumeData.summary) ? `<p>${htmlEscape(rxText(resumeData.summary))}</p>` : "",
    },
    sections: {
      profiles: rxEmptySection("Profiles"),
      experience: {
        ...rxEmptySection("Experience"),
        items: rxList(resumeData.experience)
          .filter((e) => rxText(e?.company) || rxText(e?.role))
          .map((e) => ({
          id: crypto.randomUUID(),
          hidden: false,
          company: rxText(e?.company) || rxText(e?.role),
          position: rxText(e?.role),
          location: rxText(e?.location),
          period: rxText(e?.period),
          website: RX_EMPTY_WEBSITE,
          description: bulletsToHtml(rxList(e?.bullets).map(rxText)),
          roles: [],
        })),
      },
      education: {
        ...rxEmptySection("Education"),
        items: rxList(resumeData.education)
          .filter((ed) => rxText(ed?.school) || rxText(ed?.degree))
          .map((ed) => ({
          id: crypto.randomUUID(),
          hidden: false,
          school: rxText(ed?.school) || rxText(ed?.degree),
          degree: rxText(ed?.degree),
          area: "",
          grade: "",
          location: "",
          period: rxText(ed?.year),
          website: RX_EMPTY_WEBSITE,
          description: "",
        })),
      },
      projects: rxEmptySection("Projects"),
      skills: {
        ...rxEmptySection("Skills"),
        items: rxList(resumeData.skills).map(rxText).filter(Boolean).map((s) => ({ id: crypto.randomUUID(), hidden: false, icon: "", iconColor: "", name: s, proficiency: "", level: 0 })),
      },
      languages: {
        ...rxEmptySection("Languages"),
        items: rxList(resumeData.languages).map(rxText).filter(Boolean).map((l) => ({ id: crypto.randomUUID(), hidden: false, language: l, fluency: "", level: 0 })),
      },
      interests: {
        ...rxEmptySection("Interests"),
        items: rxList(resumeData.interests).map(rxText).filter(Boolean).map((i) => ({ id: crypto.randomUUID(), hidden: false, icon: "", iconColor: "", name: i, keywords: [] })),
      },
      awards: {
        ...rxEmptySection("Achievements"),
        items: rxList(resumeData.achievements).map(rxText).filter(Boolean).map((title) => ({ id: crypto.randomUUID(), hidden: false, title, awarder: "", date: "", website: RX_EMPTY_WEBSITE, description: "" })),
      },
      certifications: {
        ...rxEmptySection("Certifications"),
        items: rxList(resumeData.certifications).map(rxText).filter(Boolean).map((title) => ({ id: crypto.randomUUID(), hidden: false, title, issuer: "", date: "", website: RX_EMPTY_WEBSITE, description: "" })),
      },
      publications: rxEmptySection("Publications"),
      volunteer: rxEmptySection("Volunteer"),
      references: {
        ...rxEmptySection("References"),
        items: rxList(resumeData.references)
          .filter((r) => rxText(typeof r === "object" && r ? r.name : r))
          .map((r) => ({ id: crypto.randomUUID(), hidden: false, name: rxText(typeof r === "object" && r ? r.name : r), position: rxText(r?.title), website: RX_EMPTY_WEBSITE, phone: "", description: "" })),
      },
    },
    customSections: [],
    metadata: rxMetadataForTemplate(template),
  };
}

/** Import (or re-import) a ResumeIQ resumeData object into the user's Reactive Resume account. Returns the resume id. */
async function importIntoRxResume(resumeData, template = "azurill") {
  const mapped = mapToRxResumeData(resumeData, template);
  const importResult = await rxFetch("/resumes/import", { method: "POST", body: JSON.stringify({ data: mapped }) });
  if (!importResult.ok || typeof importResult.data !== "string") {
    // Surface which fields failed Reactive Resume's schema, not just "Input validation failed".
    const issues = (importResult.data?.data?.issues || [])
      .slice(0, 3)
      .map((i) => `${(i.path || []).slice(1).join(".")}: ${i.message}`);
    const message = importResult.data?.message || "Failed to import resume into Reactive Resume.";
    throw new Error(issues.length ? `${message} — ${issues.join("; ")}` : message);
  }
  return { resumeId: importResult.data, mapped };
}

/** Fetch a binary PDF from Reactive Resume (rxFetch assumes JSON/text, which corrupts binary content). */
async function rxFetchBinary(path) {
  const key = getRxResumeKey();
  const response = await fetch(`${RX_BASE}${path}`, { headers: { "x-api-key": key } });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Reactive Resume PDF request failed (${response.status}): ${text.slice(0, 200)}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function listRxResumeIds() {
  const { ok, data } = await rxFetch("/resumes", { method: "GET" });
  if (ok && Array.isArray(data)) return new Set(data.map((r) => r.id));
  return new Set();
}

/**
 * Reactive Resume's edge gateway times out (HTTP 520) on AI calls that take
 * longer than ~30s, even though the origin keeps working and the result
 * still lands. tailor-resume has no persisted status endpoint to poll, so on
 * a 520 we fall back to diffing the account's resume list for a new ID.
 */
async function triggerTailorResume(applicationId) {
  const before = await listRxResumeIds();
  const { ok, data } = await rxFetch(`/applications/${applicationId}/ai/tailor-resume`, { method: "POST" });
  if (ok && data && data.resumeId) return data.resumeId;

  const start = Date.now();
  const maxWaitMs = 120000;
  while (Date.now() - start < maxWaitMs) {
    await sleep(4000);
    const after = await listRxResumeIds();
    for (const id of after) {
      if (!before.has(id)) return id;
    }
  }
  throw new Error("Reactive Resume tailoring timed out. Try again.");
}

/** Best-effort positional diff of two bullet lists into Rewrite/Addition/Removal suggestions. */
function diffBullets(originalBullets, tailoredBullets, experienceIndex, label) {
  const origRemaining = [];
  const origSet = [...originalBullets];
  const tailRemaining = [];
  for (const t of tailoredBullets) {
    const idx = origSet.indexOf(t);
    if (idx !== -1) origSet.splice(idx, 1);
    else tailRemaining.push(t);
  }
  origRemaining.push(...origSet);

  const suggestions = [];
  const pairs = Math.min(origRemaining.length, tailRemaining.length);
  for (let i = 0; i < pairs; i++) {
    suggestions.push({
      section: "Experience",
      type: "Rewrite",
      title: `${label}: sharper phrasing`,
      original: origRemaining[i],
      proposed: tailRemaining[i],
      why: "Reactive Resume's AI tailored this bullet to better match the target job.",
      experienceIndex,
    });
  }
  for (let i = pairs; i < tailRemaining.length; i++) {
    suggestions.push({
      section: "Experience",
      type: "Addition",
      title: `${label}: new bullet`,
      original: "",
      proposed: tailRemaining[i],
      why: "Reactive Resume's AI added this to strengthen alignment with the job.",
      experienceIndex,
    });
  }
  for (let i = pairs; i < origRemaining.length; i++) {
    suggestions.push({
      section: "Experience",
      type: "Removal",
      title: `${label}: low-value bullet`,
      original: origRemaining[i],
      proposed: "",
      why: "Reactive Resume's AI flagged this as redundant or low-impact for the target job.",
      experienceIndex,
    });
  }
  return suggestions;
}

function buildSuggestionsFromDiff(originalRx, tailoredRx) {
  const suggestions = [];
  let counter = 1;
  const nextId = () => `rx-${counter++}`;

  const origSummary = htmlToText(originalRx.summary?.content);
  const tailSummary = htmlToText(tailoredRx.summary?.content);
  if (tailSummary && tailSummary !== origSummary) {
    suggestions.push({
      id: nextId(),
      section: "Summary",
      type: "Rewrite",
      title: "Sharper, job-aligned summary",
      original: origSummary,
      proposed: tailSummary,
      why: "Reactive Resume's AI rewrote your summary to better match this job's language and priorities.",
      experienceIndex: 0,
    });
  }

  const origExp = originalRx.sections?.experience?.items || [];
  const tailExp = tailoredRx.sections?.experience?.items || [];
  origExp.forEach((origItem, i) => {
    const tailItem = tailExp[i];
    if (!tailItem) return;
    const origBullets = htmlToListItems(origItem.description);
    const tailBullets = htmlToListItems(tailItem.description);
    const label = origItem.company || `Role ${i + 1}`;
    diffBullets(origBullets, tailBullets, i, label).forEach((s) => suggestions.push({ id: nextId(), ...s }));
  });

  const origSkills = (originalRx.sections?.skills?.items || []).map((s) => s.name);
  const tailSkills = (tailoredRx.sections?.skills?.items || []).map((s) => s.name);
  const addedSkills = tailSkills.filter((s) => !origSkills.includes(s));
  if (addedSkills.length) {
    suggestions.push({
      id: nextId(),
      section: "Skills",
      type: "Addition",
      title: "Add job-relevant skills",
      original: "",
      proposed: addedSkills.join(", "),
      why: "These skills appear in the tailored version and better match the job's keyword requirements.",
      experienceIndex: 0,
    });
  }

  return suggestions;
}

app.post("/api/rxresume/tailor-suggestions", async (req, res) => {
  const key = getRxResumeKey();
  if (!key) {
    return res.status(400).json({ error: "RXRESUME_API_KEY not configured on the server (.env)." });
  }
  const { resumeData, job, userContext } = req.body || {};
  if (!resumeData || !job || !job.jd) {
    return res.status(400).json({ error: "resumeData and job (with jd) are required." });
  }
  try {
    const { resumeId, mapped } = await importIntoRxResume(resumeData);

    const jobDescription = userContext && String(userContext).trim()
      ? `${job.jd}\n\nAdditional candidate emphasis to weave in: ${String(userContext).trim()}`
      : job.jd;
    const appResult = await rxFetch("/applications", {
      method: "POST",
      body: JSON.stringify({
        company: job.company || "Unknown",
        role: job.role || "Role",
        jobDescription: jobDescription.slice(0, 20000),
        resumeId,
      }),
    });
    if (!appResult.ok || typeof appResult.data !== "string") {
      throw new Error(appResult.data?.message || "Failed to create Reactive Resume application.");
    }
    const applicationId = appResult.data;

    const tailoredResumeId = await triggerTailorResume(applicationId);
    const tailoredResult = await rxFetch(`/resumes/${tailoredResumeId}`, { method: "GET" });
    if (!tailoredResult.ok) {
      throw new Error("Failed to fetch tailored resume from Reactive Resume.");
    }
    const tailoredRx = tailoredResult.data.data;

    const suggestions = buildSuggestionsFromDiff(mapped, tailoredRx);
    return res.json({ suggestions });
  } catch (err) {
    console.error("Reactive Resume tailoring error:", err);
    return res.status(502).json({ error: "Reactive Resume tailoring failed", details: err.message });
  }
});

/**
 * Push the current ResumeIQ resume into the user's Reactive Resume account and
 * hand back a link to their real builder — template gallery, drag-drop, live
 * WYSIWYG editing, PDF export. We don't reimplement any of that; we just import
 * the data and point the user at Reactive Resume's own editor for it.
 */
/** The signed-in ResumeIQ user from the request's bearer token, or null (signed out / no job store). */
async function optionalUser(req) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token || !jobStoreConfigured()) return null;
  return userFromToken(token).catch(() => null);
}

const builderReply = (resumeId, extra = {}) => ({
  resumeId, builderUrl: `${RX_APP_URL}/builder/${resumeId}`, embeddable: RX_APP_URL !== "https://rxresu.me", ...extra,
});

/**
 * Open the resume in the design editor. Signed in and tailoring a job: the editor resume made for
 * that job before is reopened, so what the user changed in the editor stays. When ResumeIQ's copy has
 * changed since (new accepted edits), the reply says so; with `refresh` the editor resume's content is
 * replaced and its template and styling kept. Otherwise a new editor resume is made.
 */
app.post("/api/rxresume/open-in-builder", async (req, res) => {
  const key = getRxResumeKey();
  if (!key) {
    return res.status(400).json({ error: "RXRESUME_API_KEY not configured on the server (.env)." });
  }
  const { resumeData, name, jobId, refresh } = req.body || {};
  if (!resumeData) {
    return res.status(400).json({ error: "resumeData is required." });
  }
  try {
    const user = jobId ? await optionalUser(req) : null;
    const contentHash = createHash("sha256").update(JSON.stringify(resumeData)).digest("hex");
    const session = user ? await getTailorSession(user.id, String(jobId)).catch((err) => (console.warn("[tailor] session lookup:", err.message), null)) : null;
    if (session) {
      const existing = await rxFetch(`/resumes/${session.rx_resume_id}`, { method: "GET" });
      if (existing.ok && existing.data?.data) {
        const changed = session.content_hash !== contentHash;
        if (!changed || !refresh) return res.json(builderReply(session.rx_resume_id, { reused: true, contentChanged: changed }));
        // New edits from ResumeIQ: replace the content, keep the template, layout and styling chosen in the editor.
        const design = existing.data.data.metadata;
        const data = { ...mapToRxResumeData(resumeData, design?.template), ...(design ? { metadata: design } : {}) };
        const updated = await rxFetch(`/resumes/${session.rx_resume_id}`, { method: "PUT", body: JSON.stringify({ data }) });
        if (!updated.ok) throw new Error(updated.data?.message || `Updating the editor resume failed (${updated.status})`);
        await saveTailorSession(user.id, String(jobId), { rxResumeId: session.rx_resume_id, contentHash });
        return res.json(builderReply(session.rx_resume_id, { reused: true, updated: true }));
      }
      // The editor resume was deleted in the editor: make a new one below.
    }
    const { resumeId } = await importIntoRxResume(resumeData);
    // Imports get a random name ("Alone Brown Vulture"); label it after the candidate and job.
    const label = rxText(name).trim().slice(0, 120);
    if (label) {
      const renamed = await rxFetch(`/resumes/${resumeId}`, { method: "PUT", body: JSON.stringify({ name: label }) });
      if (!renamed.ok) console.warn("Reactive Resume rename failed:", renamed.status, renamed.data?.message);
    }
    if (user) {
      await saveTailorSession(user.id, String(jobId), { rxResumeId: resumeId, contentHash })
        .catch((err) => console.warn("[tailor] saving the session failed:", err.message)); // the editor still opens
    }
    return res.json(builderReply(resumeId, { reused: false }));
  } catch (err) {
    console.error("Reactive Resume open-in-builder error:", err);
    return res.status(502).json({ error: "Failed to open resume in Reactive Resume", details: err.message });
  }
});

/**
 * "Use this resume for applying": the PDF of the job's editor resume, exactly as the editor renders it,
 * saved as the user's tailored resume for that job (replacing the previous one). The Chrome extension
 * attaches it on that job's application.
 */
app.post("/api/tailored/use", async (req, res) => {
  const user = await optionalUser(req);
  if (!user) return res.status(401).json({ error: "Sign in to ResumeIQ to save this resume for applying" });
  const jobId = String(req.body?.jobId || "");
  if (!jobId) return res.status(400).json({ error: "Which job is this resume for?" });
  try {
    const session = await getTailorSession(user.id, jobId);
    if (!session) return res.status(404).json({ error: "Open this job's resume in the editor first" });
    const pdf = await rxFetchBinary(`/resumes/${session.rx_resume_id}/pdf`);
    if (pdf.subarray(0, 5).toString() !== "%PDF-") throw new Error("the editor didn't return a PDF");
    const [job, profile] = await Promise.all([getJobById(jobId).catch(() => null), getProfile(user.id).catch(() => null)]);
    const label = [job?.company, job?.role].filter(Boolean).join(" – ") || "Tailored resume";
    const person = [profile?.first_name, profile?.last_name].filter(Boolean).join("_") || "Resume";
    const fileName = `${person}_${job?.company || "tailored"}`.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/_+/g, "_").slice(0, 80) + ".pdf";
    const resume = await saveTailoredResumeFile(user.id, { jobId, rxResumeId: session.rx_resume_id, name: `${label} (tailored)`.slice(0, 90), fileName, bytes: pdf });
    return res.json({ resume, jobUrl: job?.url || null });
  } catch (err) {
    console.error("[tailor] saving the tailored resume failed:", err.message);
    return res.status(502).json({ error: "Couldn't save the resume from the editor – please try again", details: err.message });
  }
});

app.get("/api/rxresume/templates", (_req, res) => res.json({ templates: RX_TEMPLATES }));

/**
 * Renders the resume with Reactive Resume's actual template engine and
 * streams back the PDF, so the design can be previewed inside ResumeIQ
 * without sending the user to rxresu.me.
 */
app.post("/api/rxresume/render-pdf", async (req, res) => {
  const key = getRxResumeKey();
  if (!key) {
    return res.status(400).json({ error: "RXRESUME_API_KEY not configured on the server (.env)." });
  }
  const { resumeData, template } = req.body || {};
  if (!resumeData) {
    return res.status(400).json({ error: "resumeData is required." });
  }
  try {
    const { resumeId } = await importIntoRxResume(resumeData, template);
    const pdfBuffer = await rxFetchBinary(`/resumes/${resumeId}/pdf`);
    res.set("Content-Type", "application/pdf");
    return res.send(pdfBuffer);
  } catch (err) {
    console.error("Reactive Resume render-pdf error:", err);
    return res.status(502).json({ error: "Failed to render resume PDF", details: err.message });
  }
});

// Health check for dev/proxy
/**
 * Easy Apply, phase 1 (nothing is submitted): the employer's real form for a job, and an
 * autofill of it from the applicant's profile and resume for them to review.
 */
app.get("/api/easy-apply/form", async (req, res) => {
  const jobId = String(req.query.jobId || "");
  if (!easyApplyTarget(jobId)) return res.status(400).json({ error: "Easy Apply isn't available for this job yet" });
  try {
    return res.json(await fetchEasyApplyForm(jobId));
  } catch (err) {
    console.warn("[easy-apply] form fetch failed:", err.message);
    return res.status(502).json({ error: "Could not load this application form" });
  }
});

app.post("/api/easy-apply/fill", async (req, res) => {
  const { fields, profile, resume, job } = req.body || {};
  if (!Array.isArray(fields) || !fields.length) return res.status(400).json({ error: "fields are required" });
  try {
    return res.json(await fillForm({ fields: fields.slice(0, 80), profile: profile || {}, resume: resume || null, job: job || {} }));
  } catch (err) {
    return sendLLMError(res, err, "easy-apply");
  }
});

/* Easy Apply, phase 2: fill the employer's real page and submit it – only when the signed-in applicant asks. */

const easyApplySessions = new Map(); // verification-code sessionId → { userId, applicationId }

async function easyApplyUser(req, res) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const user = jobStoreConfigured() ? await userFromToken(token) : null;
  if (!user) res.status(401).json({ error: "Please sign in to apply" });
  return user;
}

registerExtensionRoutes(app, {
  userFromRequest: async (req) =>
    jobStoreConfigured() ? userFromToken(String(req.headers.authorization || "").replace(/^Bearer\s+/i, "")) : null,
});

/** The form is fetched again here rather than trusted from the browser; answers are keyed by its field ids. */
async function easyApplyInput(body) {
  const target = easyApplyTarget(body.jobId);
  if (!target) throw Object.assign(new Error("Easy Apply isn't available for this job yet"), { status: 400 });
  const form = await fetchEasyApplyForm(body.jobId);
  return {
    form,
    input: {
      board: target.board,
      jobId: target.jobId,
      fields: form.fields,
      values: body.values && typeof body.values === "object" ? body.values : {},
      country: String(body.country || "India").slice(0, 60),
      resumePdfBase64: typeof body.resumePdf === "string" ? body.resumePdf : null,
    },
  };
}

app.post("/api/easy-apply/rehearse", async (req, res) => {
  if (!(await easyApplyUser(req, res))) return;
  try {
    const { input } = await easyApplyInput(req.body || {});
    return res.json(await rehearse(input));
  } catch (err) {
    console.warn("[easy-apply] rehearsal failed:", err.message);
    return res.status(err.status || 502).json({ error: err.status ? err.message : "Couldn't open the application page" });
  }
});

app.post("/api/easy-apply/submit", async (req, res) => {
  const user = await easyApplyUser(req, res);
  if (!user) return;
  let applicationId = null;
  try {
    const { form, input } = await easyApplyInput(req.body || {});
    if (!input.resumePdfBase64) return res.status(400).json({ error: "Your resume PDF is missing" });
    const result = await submitApplication(input);
    const status = result.status === "submitted" ? "submitted" : result.status === "code_required" ? "code_required" : "failed";
    applicationId = await recordApplication({
      user_id: user.id, job_id: req.body.jobId, source: form.ats, company: form.job.company, title: form.job.title,
      apply_url: form.applyUrl, status, details: { outcome: result.status, errors: result.errors, problems: result.problems },
      submitted_at: status === "submitted" ? new Date().toISOString() : null,
    });
    if (result.sessionId) easyApplySessions.set(result.sessionId, { userId: user.id, applicationId });
    console.log(`[easy-apply] ${form.job.company} – ${form.job.title}: ${result.status}`);
    return res.json({ ...result, applicationId });
  } catch (err) {
    console.warn("[easy-apply] submit failed:", err.message);
    if (applicationId) await updateApplication(applicationId, { status: "failed", details: { error: err.message } });
    return res.status(err.status || 502).json({ error: err.status ? err.message : "Couldn't submit on the application page" });
  }
});

app.post("/api/easy-apply/code", async (req, res) => {
  const user = await easyApplyUser(req, res);
  if (!user) return;
  const { sessionId, code } = req.body || {};
  const session = easyApplySessions.get(sessionId);
  if (!session || session.userId !== user.id) return res.status(404).json({ status: "expired", error: "This application timed out – please submit again" });
  try {
    const result = await enterCode(sessionId, String(code || "").slice(0, 20));
    if (result.status === "submitted") {
      await updateApplication(session.applicationId, { status: "submitted", submitted_at: new Date().toISOString() });
      easyApplySessions.delete(sessionId);
    } else if (result.status !== "code_required") {
      easyApplySessions.delete(sessionId);
      await updateApplication(session.applicationId, { status: "failed", details: { outcome: result.status, errors: result.errors } });
    }
    return res.json(result);
  } catch (err) {
    console.warn("[easy-apply] code entry failed:", err.message);
    return res.status(502).json({ error: "Couldn't enter the code on the application page" });
  }
});

app.get("/api/health", (_, res) =>
  res.json({
    ok: true,
    linkedinConfigured: !!getApifyToken() || !!getRapidApiKey(),
    llm: llmProvider() ? `${llmProvider()} (${llmModel()})` : null,
    apify: !!getApifyToken(),
    rapidapi: !!getRapidApiKey(),
    rxresume: !!getRxResumeKey(),
    adzuna: adzunaConfigured(),
    careerBoards: loadCompanies().length,
  })
);

// On Vercel the app runs as a serverless function (api/index.js); locally it listens on PORT.
if (!process.env.VERCEL) app.listen(PORT, () => {
  const apify = getApifyToken();
  const rapid = getRapidApiKey();
  const rxresume = getRxResumeKey();
  console.log(`ResumeIQ API server running at http://localhost:${PORT}`);
  tried.forEach(([path]) => {
    const exists = existsSync(path);
    console.log(`  .env: ${path} (exists: ${exists})`);
  });
  if (apify) console.log("  APIFY_TOKEN: loaded (Apify LinkedIn Jobs – preferred)");
  if (rapid) console.log("  RAPIDAPI_KEY: loaded (fallback)");
  if (!apify && !rapid) console.log("  No API keys – will use free LinkedIn guest API when job search runs");
  console.log(`  LLM: ${llmProvider() ? `${llmProvider()} – ${llmModel()}` : "not configured – set GROQ_API_KEY or ANTHROPIC_API_KEY"}`);
  console.log(`  Career boards: ${loadCompanies().length} companies (server/jobBoards.js)`);
  console.log(`  Adzuna India: ${adzunaConfigured() ? "configured" : "off – set ADZUNA_APP_ID and ADZUNA_APP_KEY"}`);
  if (rxresume) console.log("  RXRESUME_API_KEY: loaded (Reactive Resume AI tailoring)");
  else console.log("  RXRESUME_API_KEY: not set – suggestion generation will fail until it's configured");
});

export default app;
