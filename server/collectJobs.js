/**
 * Jobs collector: pulls roles from every source into the Supabase jobs repository.
 *
 *   npm run collect                                  all sources, all queries
 *   npm run collect -- --sources=boards              only company career boards
 *   npm run collect -- --sources=linkedin --queries="Product Manager" --limit=10
 *   npm run collect -- --dry-run                     fetch and count, write nothing
 *
 * Career boards (Greenhouse, Lever, Ashby, Workable) are pulled in full, and roles
 * that leave a board are marked closed. LinkedIn and Adzuna only answer searches, so
 * they run the queries in server/collectQueries.js; their roles close after 14 days unseen.
 */
import { pathToFileURL } from "url";
import { loadCompanies, fetchBoard, searchAdzuna, adzunaConfigured } from "./jobSources.js";
import { searchLinkedInRun } from "./linkedinJobs.js";
import {
  jobStoreConfigured, toRow, upsertJobs, closeMissingFromBoard, closeStale, startRun, finishRun, storeStats,
} from "./jobStore.js";
import { COLLECT_QUERIES, COLLECT_LOCATION, LINKEDIN_PER_QUERY, ADZUNA_PER_QUERY } from "./collectQueries.js";

const BOARD_CONCURRENCY = 6;
// Large boards (Paytm's is ~3 MB) take longer than a live search should wait.
const BOARD_TIMEOUT_MS = 60000;
const SEARCH_STALE_DAYS = 14;
const LINKEDIN_CONCURRENCY = 3;

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

/** Records a run in job_ingest_runs (skipped on dry runs) and returns its start time for last_seen_at. */
async function beginRun(source, dryRun) {
  if (dryRun) return { id: null, started_at: new Date().toISOString() };
  return startRun(source);
}

async function endRun(run, result) {
  if (run.id) await finishRun(run.id, result);
}

/** Every open role on every company career board. */
export async function collectCareerBoards({ dryRun = false } = {}) {
  const run = await beginRun("career_boards", dryRun);
  const companies = loadCompanies();
  const failed = [];
  let fetched = 0;
  let upserted = 0;
  let closed = 0;

  await mapLimit(companies, BOARD_CONCURRENCY, async (company) => {
    try {
      const jobs = await fetchBoard(company, { fresh: true, timeoutMs: BOARD_TIMEOUT_MS });
      fetched += jobs.length;
      if (dryRun) return;
      const rows = jobs.map((job) => toRow(job, { board: company.slug, seenAt: run.started_at }));
      // Boards run in parallel: add each result after its await, or concurrent updates are lost.
      const saved = await upsertJobs(rows);
      upserted += saved;
      // Only a board that answered can tell us which of its roles are gone.
      const gone = await closeMissingFromBoard(company.ats, company.slug, run.started_at);
      closed += gone;
    } catch (e) {
      failed.push(`${company.ats}:${company.slug} (${e.name === "AbortError" ? "timeout" : e.message})`);
    }
  });

  const status = failed.length === 0 ? "ok" : failed.length < companies.length ? "partial" : "failed";
  const result = { status, fetched, upserted, closed, details: { boards: companies.length, failed } };
  await endRun(run, result);
  return result;
}

/** LinkedIn roles for each query (Apify). LinkedIn job ids are stable; generated fallback ids are skipped. */
export async function collectLinkedIn({ queries = COLLECT_QUERIES, limit = LINKEDIN_PER_QUERY, dryRun = false } = {}) {
  const token = process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN;
  if (!token) return { status: "skipped", reason: "APIFY_TOKEN not set" };
  const run = await beginRun("linkedin", dryRun);
  const failed = [];
  const perQuery = {};
  let fetched = 0;
  let upserted = 0;

  await mapLimit(queries, LINKEDIN_CONCURRENCY, async (query) => {
    try {
      const result = await searchLinkedInRun(token, query, COLLECT_LOCATION, limit);
      const jobs = result.jobs.filter((job) => /^\d+$/.test(job.id));
      perQuery[query] = jobs.length;
      fetched += jobs.length;
      if (!dryRun && jobs.length) {
        const saved = await upsertJobs(jobs.map((job) => toRow(job, { query, seenAt: run.started_at })));
        upserted += saved;
      }
    } catch (e) {
      failed.push(`${query} (${e.message})`);
    }
  });

  const closed = dryRun ? 0 : await closeStale("linkedin", SEARCH_STALE_DAYS);
  const status = failed.length === 0 ? "ok" : failed.length < queries.length ? "partial" : "failed";
  const result = { status, fetched, upserted, closed, details: { perQuery, failed } };
  await endRun(run, result);
  return result;
}

/** Adzuna India roles for each query (needs ADZUNA_APP_ID / ADZUNA_APP_KEY). */
export async function collectAdzuna({ queries = COLLECT_QUERIES, limit = ADZUNA_PER_QUERY, dryRun = false } = {}) {
  if (!adzunaConfigured()) return { status: "skipped", reason: "ADZUNA_APP_ID / ADZUNA_APP_KEY not set" };
  const run = await beginRun("adzuna", dryRun);
  const perQuery = {};
  let fetched = 0;
  let upserted = 0;

  for (const query of queries) {
    const jobs = await searchAdzuna({ keywords: query, location: COLLECT_LOCATION, limit });
    perQuery[query] = jobs.length;
    fetched += jobs.length;
    if (!dryRun && jobs.length) {
      upserted += await upsertJobs(jobs.map((job) => toRow(job, { query, seenAt: run.started_at })));
    }
  }

  const closed = dryRun ? 0 : await closeStale("adzuna", SEARCH_STALE_DAYS);
  const result = { status: "ok", fetched, upserted, closed, details: { perQuery } };
  await endRun(run, result);
  return result;
}

const COLLECTORS = { boards: collectCareerBoards, linkedin: collectLinkedIn, adzuna: collectAdzuna };

/** Runs the chosen collectors one after another; one failing never stops the others. */
export async function collectAll({ sources = Object.keys(COLLECTORS), queries, limit, dryRun = false } = {}) {
  if (!dryRun && !jobStoreConfigured()) {
    throw new Error("Supabase is not configured – set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or use --dry-run)");
  }
  const results = {};
  for (const source of sources) {
    const started = Date.now();
    try {
      results[source] = await COLLECTORS[source]({ queries, limit, dryRun });
    } catch (e) {
      results[source] = { status: "failed", error: e.message };
    }
    results[source].seconds = Math.round((Date.now() - started) / 1000);
    console.log(`[collect] ${source}:`, JSON.stringify(results[source]));
  }
  return results;
}

function parseArgs(argv) {
  const args = Object.fromEntries(
    argv.filter((a) => a.startsWith("--")).map((a) => {
      const [key, ...rest] = a.slice(2).split("=");
      return [key, rest.length ? rest.join("=") : true];
    }),
  );
  const list = (v) => String(v).split(",").map((s) => s.trim()).filter(Boolean);
  const sources = args.sources ? list(args.sources) : undefined;
  const unknown = (sources || []).filter((s) => !COLLECTORS[s]);
  if (unknown.length) throw new Error(`unknown source(s): ${unknown.join(", ")} – use ${Object.keys(COLLECTORS).join(", ")}`);
  return {
    sources,
    queries: args.queries ? list(args.queries) : undefined,
    limit: args.limit ? Number(args.limit) : undefined,
    dryRun: !!args["dry-run"],
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  try {
    const options = parseArgs(process.argv.slice(2));
    console.log(`[collect] ${options.dryRun ? "dry run – nothing will be written" : "writing to Supabase"}`);
    const results = await collectAll(options);
    if (!options.dryRun) console.log("[collect] repository:", JSON.stringify(await storeStats()));
    process.exitCode = Object.values(results).some((r) => r.status === "failed") ? 1 : 0;
  } catch (e) {
    console.error("[collect]", e.message);
    process.exitCode = 1;
  }
}
