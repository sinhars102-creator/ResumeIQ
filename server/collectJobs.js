/**
 * Jobs collector: pulls roles from every source into the Supabase jobs repository.
 *
 *   npm run collect                                  daily run: adzuna, discover, boards (LinkedIn excluded)
 *   npm run collect -- --sources=linkedin            refresh LinkedIn for searches asked in the last 14 days
 *   npm run collect -- --sources=boards              only company career boards
 *   npm run collect -- --sources=discover            only look for new companies' boards
 *   npm run collect -- --sources=linkedin --queries="Product Manager" --limit=10
 *   npm run collect -- --dry-run                     fetch and count, write nothing
 *
 * Career boards (Greenhouse, Lever, Ashby, Workable) are pulled in full, and roles
 * that leave a board are marked closed. LinkedIn is demand-driven and refreshed when a user
 * searches (24h freshness, server/index.js), so the daily run skips it; run it explicitly to
 * refresh the searches users asked for in the last DEMAND_DAYS (public.search_demand). Adzuna runs the queries in
 * server/collectQueries.js. Search-based roles close after 14 days unseen.
 * Discovery looks for boards for companies seen in those postings and in the curated list
 * (server/curatedCompanies.js); boards it finds are collected from then on.
 *
 * The repository is India-only: India roles plus remote roles that name no country.
 */
import { pathToFileURL } from "url";
import { loadCompanies, fetchBoard, searchAdzuna, adzunaConfigured } from "./jobSources.js";
import { probeCompany, countScope } from "./companyDiscovery.js";
import CURATED_COMPANIES from "./curatedCompanies.js";
import { searchLinkedInRun } from "./linkedinJobs.js";
import { normalizeQuery, DEMAND_DAYS } from "./searchDemand.js";
import {
  jobStoreConfigured, toRow, inScope, upsertJobs, closeMissingFromBoard, closeStale, startRun, finishRun, storeStats,
  deleteOutOfScope, listCompanies, addCompanies, updateCompany, companyNamesFromJobs, demandedQueries, markDemandCollected,
} from "./jobStore.js";
import { COLLECT_QUERIES, COLLECT_LOCATION, LINKEDIN_PER_QUERY, ADZUNA_PER_QUERY } from "./collectQueries.js";

const BOARD_CONCURRENCY = 6;
// Large boards (Paytm's is ~3 MB) take longer than a live search should wait.
const BOARD_TIMEOUT_MS = 60000;
const SEARCH_STALE_DAYS = 14;
const LINKEDIN_CONCURRENCY = 3;
const DISCOVER_CONCURRENCY = 8;
const DISCOVER_PER_RUN = 500; // companies probed per run; the rest wait for the next run
const REPROBE_DAYS = 30; // look again for companies with no (India) board after this long

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

/** Every open role on every active company career board (public.companies). */
export async function collectCareerBoards({ dryRun = false } = {}) {
  const run = await beginRun("career_boards", dryRun);
  const companies = await listCompanies({ status: "active" });
  const failed = [];
  let fetched = 0;
  let upserted = 0;
  let closed = 0;

  await mapLimit(companies, BOARD_CONCURRENCY, async (company) => {
    try {
      const jobs = await fetchBoard(company, { fresh: true, timeoutMs: BOARD_TIMEOUT_MS });
      fetched += jobs.length;
      const india = countScope(jobs);
      if (dryRun) return;
      const rows = jobs.map((job) => toRow(job, { board: company.slug, seenAt: run.started_at })).filter(inScope);
      // Boards run in parallel: add each result after its await, or concurrent updates are lost.
      const saved = await upsertJobs(rows);
      upserted += saved;
      // Only a board that answered can tell us which of its roles are gone.
      const gone = await closeMissingFromBoard(company.ats, company.slug, run.started_at);
      closed += gone;
      await updateCompany(company.id, {
        total_open_roles: jobs.length,
        india_open_roles: india,
        last_collected_at: run.started_at,
        ...(india === 0 ? { status: "no_india", last_probed_at: run.started_at } : {}),
      });
    } catch (e) {
      failed.push(`${company.ats}:${company.slug} (${e.name === "AbortError" ? "timeout" : e.message})`);
    }
  });

  const status = failed.length === 0 ? "ok" : failed.length < companies.length ? "partial" : "failed";
  const result = { status, fetched, upserted, closed, details: { boards: companies.length, failed } };
  await endRun(run, result);
  return result;
}

/**
 * Look for career boards for companies we know by name: the seed boards and curated list
 * (added once), companies on collected LinkedIn/Adzuna roles, and companies whose last
 * check found nothing more than REPROBE_DAYS ago.
 */
export async function discoverCompanies({ dryRun = false } = {}) {
  const run = await beginRun("discover", dryRun);
  const seeded = await addCompanies([
    ...loadCompanies().map((c) => ({ name: c.name, ats: c.ats, slug: c.slug, origin: "seed", status: "active" })),
    ...CURATED_COMPANIES.map((name) => ({ name, origin: "curated" })),
  ]);
  const learned = await addCompanies((await companyNamesFromJobs()).map((name) => ({ name, origin: "discovered" })));

  const reprobeBefore = Date.now() - REPROBE_DAYS * 24 * 60 * 60 * 1000;
  const due = (await listCompanies({ status: ["unprobed", "no_board", "no_india"] }))
    .filter((c) => c.status === "unprobed" || !c.last_probed_at || Date.parse(c.last_probed_at) < reprobeBefore)
    .sort((a, b) => (a.status === "unprobed" ? 0 : 1) - (b.status === "unprobed" ? 0 : 1))
    .slice(0, DISCOVER_PER_RUN);

  const found = [];
  let errors = 0;
  await mapLimit(due, DISCOVER_CONCURRENCY, async (company) => {
    try {
      const board = await probeCompany(company.name);
      if (board?.india > 0) found.push(`${company.name} → ${board.ats}:${board.slug} (${board.india} India)`);
      if (dryRun) return;
      const patch = board
        ? { ats: board.ats, slug: board.slug, status: board.india > 0 ? "active" : "no_india", total_open_roles: board.total, india_open_roles: board.india }
        : { status: "no_board" };
      try {
        await updateCompany(company.id, { ...patch, last_probed_at: run.started_at });
      } catch {
        // Another company already owns this board (same ats + slug): don't collect it twice.
        await updateCompany(company.id, { status: "no_board", last_probed_at: run.started_at });
      }
    } catch {
      errors += 1;
    }
  });

  const result = {
    status: "ok",
    fetched: due.length,
    upserted: found.length,
    closed: 0,
    details: { seeded, learned, probed: due.length, boardsFound: found.length, errors, found },
  };
  await endRun(run, result);
  return result;
}

/**
 * LinkedIn roles (Apify) for the searches users asked for recently, or for `queries` when
 * given (e.g. --queries on the command line). LinkedIn job ids are stable; generated
 * fallback ids are skipped. Roles are tagged with the normalised search that found them.
 */
export async function collectLinkedIn({ queries, limit = LINKEDIN_PER_QUERY, dryRun = false } = {}) {
  const token = process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN;
  if (!token) return { status: "skipped", reason: "APIFY_TOKEN not set" };
  const searches = queries
    ? queries.map((query) => ({ query, query_key: normalizeQuery(query) }))
    : await demandedQueries(DEMAND_DAYS);
  if (!searches.length) return { status: "skipped", reason: `no searches asked for in the last ${DEMAND_DAYS} days` };
  const run = await beginRun("linkedin", dryRun);
  const failed = [];
  const perQuery = {};
  let fetched = 0;
  let upserted = 0;

  await mapLimit(searches, LINKEDIN_CONCURRENCY, async ({ query, query_key: key }) => {
    try {
      const result = await searchLinkedInRun(token, query, COLLECT_LOCATION, limit);
      const jobs = result.jobs.filter((job) => /^\d+$/.test(job.id));
      perQuery[query] = jobs.length;
      fetched += jobs.length;
      if (!dryRun) {
        const saved = await upsertJobs(jobs.map((job) => toRow(job, { query: key, seenAt: run.started_at })).filter(inScope));
        upserted += saved;
        if (!queries) await markDemandCollected(key, run.started_at);
      }
    } catch (e) {
      failed.push(`${query} (${e.message})`);
    }
  });

  const status = failed.length === 0 ? "ok" : failed.length < searches.length ? "partial" : "failed";
  const result = { status, fetched, upserted, closed: 0, details: { perQuery, failed } };
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
      upserted += await upsertJobs(jobs.map((job) => toRow(job, { query, seenAt: run.started_at })).filter(inScope));
    }
  }

  const closed = dryRun ? 0 : await closeStale("adzuna", SEARCH_STALE_DAYS);
  const result = { status: "ok", fetched, upserted, closed, details: { perQuery } };
  await endRun(run, result);
  return result;
}

// Order matters: search sources first, so discovery sees their companies the same run.
const COLLECTORS = { linkedin: collectLinkedIn, adzuna: collectAdzuna, discover: discoverCompanies, boards: collectCareerBoards };
// LinkedIn is refreshed on demand when users search, so the daily run leaves it out.
const DAILY_SOURCES = ["adzuna", "discover", "boards"];

/** Runs the chosen collectors one after another; one failing never stops the others. */
export async function collectAll({ sources = DAILY_SOURCES, queries, limit, dryRun = false } = {}) {
  if (!dryRun && !jobStoreConfigured()) {
    throw new Error("Supabase is not configured – set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or use --dry-run)");
  }
  const results = {};
  if (!dryRun) {
    const removed = await deleteOutOfScope();
    if (removed) console.log(`[collect] removed ${removed} roles outside the India-only scope`);
    // LinkedIn can't tell us a role closed, so ones unseen for SEARCH_STALE_DAYS are closed here,
    // whether or not this run searched LinkedIn.
    const stale = await closeStale("linkedin", SEARCH_STALE_DAYS);
    if (stale) console.log(`[collect] closed ${stale} LinkedIn roles unseen for ${SEARCH_STALE_DAYS} days`);
  }
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
