/**
 * Jobs repository in Supabase (table public.jobs, see supabase/migrations/).
 * Every role is stored once per source as "<source>:<source_job_id>", with the
 * source's link and record kept for reference. Server-side only: it uses the
 * service role key, which must never reach the browser.
 */
import { createClient } from "@supabase/supabase-js";
import { isIndiaLocation } from "./jobSources.js";

const UPSERT_BATCH = 500;

let client = null;

export function jobStoreConfigured() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function db() {
  if (!jobStoreConfigured()) throw new Error("Supabase is not configured – set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  if (!client) {
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

/**
 * The id a role has at its source. ResumeIQ ids carry a source and board prefix
 * ("lever-fampay-<id>", "gh-truecaller-<id>", "adzuna-<id>"); LinkedIn's are bare.
 */
export function sourceJobId(job, board = null) {
  const id = String(job.id || "");
  const prefix = { greenhouse: "gh", lever: "lever", ashby: "ashby", workable: "workable", adzuna: "adzuna" }[job.source];
  if (!prefix) return id;
  const full = board ? `${prefix}-${board}-` : `${prefix}-`;
  return id.startsWith(full) ? id.slice(full.length) : id;
}

/** ResumeIQ job → jobs table row. Search-based sources pass the query that found it. */
export function toRow(job, { board = null, query = null, raw = null, seenAt = new Date().toISOString() } = {}) {
  const source = job.source || "linkedin";
  const sid = sourceJobId({ ...job, source }, board);
  return {
    id: `${source}:${sid}`,
    source,
    source_job_id: sid,
    source_board: board,
    source_url: job.url || null,
    source_query: query ? [query] : [],
    company: job.company || "Company",
    title: job.role || "Role",
    location: job.location || null,
    is_india: isIndiaLocation(job.location, { allowRemote: false }),
    salary: job.salary || null,
    description: job.jd || null,
    posted_at: job.postedAt || null,
    raw,
    last_seen_at: seenAt,
    closed_at: null,
  };
}

/**
 * Insert or refresh rows. Existing rows keep first_seen_at; a description is never
 * replaced by an empty one, and search queries accumulate.
 */
export async function upsertJobs(rows) {
  const unique = [...new Map(rows.filter((r) => r.source_job_id).map((r) => [r.id, r])).values()];
  let upserted = 0;
  for (let i = 0; i < unique.length; i += UPSERT_BATCH) {
    const batch = unique.slice(i, i + UPSERT_BATCH);
    const { data: existing, error: readErr } = await db()
      .from("jobs")
      .select("id, description, source_query")
      .in("id", batch.map((r) => r.id));
    if (readErr) throw new Error(`read before upsert failed: ${readErr.message}`);
    const known = new Map((existing || []).map((r) => [r.id, r]));
    const merged = batch.map((row) => {
      const prev = known.get(row.id);
      if (!prev) return row;
      return {
        ...row,
        description: row.description || prev.description,
        source_query: [...new Set([...(prev.source_query || []), ...row.source_query])],
      };
    });
    const { error } = await db().from("jobs").upsert(merged, { onConflict: "id" });
    if (error) throw new Error(`upsert failed: ${error.message}`);
    upserted += merged.length;
  }
  return upserted;
}

/**
 * A career board lists every open role, so anything from that board not refreshed by
 * this run (last_seen_at before the run started) has closed. Rows written in a run use
 * the run's database start time as last_seen_at, so clock differences can't close them.
 */
export async function closeMissingFromBoard(source, board, runStartedAt) {
  const { data, error } = await db()
    .from("jobs")
    .update({ closed_at: new Date().toISOString() })
    .eq("source", source)
    .eq("source_board", board)
    .is("closed_at", null)
    .lt("last_seen_at", runStartedAt)
    .select("id");
  if (error) throw new Error(`closing roles for ${source}:${board} failed: ${error.message}`);
  return (data || []).length;
}

/** Search-based sources can't prove a role closed; treat ones unseen for `days` as closed. */
export async function closeStale(source, days) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db()
    .from("jobs")
    .update({ closed_at: new Date().toISOString() })
    .eq("source", source)
    .is("closed_at", null)
    .lt("last_seen_at", cutoff)
    .select("id");
  if (error) throw new Error(`closing stale ${source} roles failed: ${error.message}`);
  return (data || []).length;
}

export async function startRun(source) {
  const { data, error } = await db().from("job_ingest_runs").insert({ source }).select("id, started_at").single();
  if (error) throw new Error(`could not record run start: ${error.message}`);
  return data;
}

export async function finishRun(id, { status, fetched = 0, upserted = 0, closed = 0, details = null }) {
  const { error } = await db()
    .from("job_ingest_runs")
    .update({ status, fetched, upserted, closed, details, finished_at: new Date().toISOString() })
    .eq("id", id);
  if (error) console.warn(`[jobs-db] could not record run finish: ${error.message}`);
}

/** Row counts for a quick health check. */
export async function storeStats() {
  const count = async (q) => (await q).count ?? 0;
  const base = () => db().from("jobs").select("id", { count: "exact", head: true });
  return {
    total: await count(base()),
    open: await count(base().is("closed_at", null)),
    openIndia: await count(base().is("closed_at", null).eq("is_india", true)),
  };
}
