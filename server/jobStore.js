/**
 * Jobs repository in Supabase (table public.jobs, see supabase/migrations/).
 * Every role is stored once per source as "<source>:<source_job_id>", with the
 * source's link and record kept for reference. Server-side only: it uses the
 * service role key, which must never reach the browser.
 */
import { createClient } from "@supabase/supabase-js";
import { isIndiaLocation, isRemoteAnywhere } from "./jobSources.js";

const UPSERT_BATCH = 500;
// Existing rows are looked up by id in the request URL; long ids (Lever UUIDs) overflow it past ~100.
const LOOKUP_BATCH = 100;

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
    remote_anywhere: isRemoteAnywhere(job.location),
    salary: job.salary || null,
    description: job.jd || null,
    posted_at: job.postedAt || null,
    raw,
    last_seen_at: seenAt,
    closed_at: null,
  };
}

/** The repository is India-only: India roles plus remote roles that name no country. */
export function inScope(row) {
  return row.is_india || row.remote_anywhere;
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
    const known = new Map();
    for (let j = 0; j < batch.length; j += LOOKUP_BATCH) {
      const { data: existing, error: readErr } = await db()
        .from("jobs")
        .select("id, description, source_query")
        .in("id", batch.slice(j, j + LOOKUP_BATCH).map((r) => r.id));
      if (readErr) throw new Error(`read before upsert failed: ${readErr.message}`);
      for (const r of existing || []) known.set(r.id, r);
    }
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

/** Remove stored roles outside the India-only scope (e.g. from runs before the scope was set). */
export async function deleteOutOfScope() {
  const { data, error } = await db()
    .from("jobs")
    .delete()
    .eq("is_india", false)
    .eq("remote_anywhere", false)
    .select("id");
  if (error) throw new Error(`removing out-of-scope roles failed: ${error.message}`);
  return (data || []).length;
}

/* ---------- Company registry (public.companies) ---------- */

/** Normalised company name used to avoid duplicates ("Razorpay Software Pvt. Ltd." → "razorpay software"). */
export function companyKey(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(private|pvt|limited|ltd|llp|inc|llc|corp|corporation|co|company|plc|gmbh)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export async function listCompanies({ status } = {}) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = db().from("companies").select("*").order("id").range(from, from + 999);
    if (status) q = Array.isArray(status) ? q.in("status", status) : q.eq("status", status);
    const { data, error } = await q;
    if (error) throw new Error(`listing companies failed: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

/** Add companies we don't know yet (by name_key); existing rows are left alone. Returns how many were new. */
export async function addCompanies(companies) {
  const rows = [...new Map(
    // Every row carries every column: in a bulk insert, a missing key becomes null, not the column default.
    companies.filter((c) => companyKey(c.name)).map((c) => [companyKey(c.name), {
      name: c.name, name_key: companyKey(c.name), ats: c.ats || null, slug: c.slug || null,
      origin: c.origin || "curated", status: c.status || "unprobed",
    }]),
  ).values()];
  let added = 0;
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const { data, error } = await db()
      .from("companies")
      .upsert(rows.slice(i, i + UPSERT_BATCH), { onConflict: "name_key", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(`adding companies failed: ${error.message}`);
    added += (data || []).length;
  }
  return added;
}

export async function updateCompany(id, patch) {
  const { error } = await db().from("companies").update(patch).eq("id", id);
  if (error) throw new Error(`updating company ${id} failed: ${error.message}`);
}

/** Distinct company names on roles from search-based sources, for board discovery. */
export async function companyNamesFromJobs(sources = ["linkedin", "adzuna"]) {
  const names = new Set();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db().from("jobs").select("company").in("source", sources).order("id").range(from, from + 999);
    if (error) throw new Error(`reading company names failed: ${error.message}`);
    for (const r of data) if (r.company && r.company !== "Company") names.add(r.company.trim());
    if (data.length < 1000) return [...names];
  }
}
