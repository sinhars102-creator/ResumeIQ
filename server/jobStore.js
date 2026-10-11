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
 * ("lever-fampay-<id>", "gh-truecaller-<id>", "adzuna-<id>", "naukri-<id>"); LinkedIn's are bare.
 */
export function sourceJobId(job, board = null) {
  const id = String(job.id || "");
  const prefix = { greenhouse: "gh", lever: "lever", ashby: "ashby", workable: "workable", adzuna: "adzuna", naukri: "naukri", glassdoor: "glassdoor" }[job.source];
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
    .eq("pinned", false) // roles users saved stay, whatever their location
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

/* ---------- Reading roles back for the app ---------- */

const ID_PREFIX = { greenhouse: "gh", lever: "lever", ashby: "ashby", workable: "workable", adzuna: "adzuna", naukri: "naukri", glassdoor: "glassdoor" };

/** jobs table row → ResumeIQ job, with the same id the source's live search would give it. */
export function fromRow(row) {
  const prefix = ID_PREFIX[row.source];
  const id = !prefix ? row.source_job_id : row.source_board ? `${prefix}-${row.source_board}-${row.source_job_id}` : `${prefix}-${row.source_job_id}`;
  return {
    id,
    company: row.company,
    role: row.title,
    location: row.location || "",
    salary: row.salary || "",
    badge: null,
    source: row.source,
    jd: row.description || "",
    url: row.source_url || "",
    postedAt: row.posted_at,
    lastSeenAt: row.last_seen_at ? Date.parse(row.last_seen_at) : null,
  };
}

const READ_COLUMNS = "id, source, source_job_id, source_board, source_url, company, title, location, salary, description, posted_at, last_seen_at";

/**
 * Open roles whose title (or company) contains every word of the search, newest first.
 * The repository is India-only, so "India" needs no location filter; a city narrows it.
 */
export async function findStoredJobs({ keywords = "", location = "", limit = 60 } = {}) {
  const words = String(keywords).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);
  if (!words.length) return [];
  let q = db()
    .from("jobs")
    .select(READ_COLUMNS)
    .is("closed_at", null)
    .textSearch("search_text", words.join(" & "), { config: "simple" })
    .order("last_seen_at", { ascending: false })
    .limit(limit);
  const place = String(location).trim();
  if (place && !/^india$/i.test(place)) q = q.ilike("location", `%${place.replace(/[%_]/g, "")}%`);
  const { data, error } = await q;
  if (error) throw new Error(`reading stored roles failed: ${error.message}`);
  return (data || []).map(fromRow);
}

/* ---------- Search demand (public.search_demand) ---------- */

/** Count one user asking for a search; returns its demand row (with last_collected_at). */
export async function recordDemand(queryKey, query) {
  const { data, error } = await db().rpc("record_search_demand", { p_key: queryKey, p_query: query });
  if (error) throw new Error(`recording search demand failed: ${error.message}`);
  return Array.isArray(data) ? data[0] : data;
}

export async function markDemandCollected(queryKey, at = new Date().toISOString()) {
  const { error } = await db().from("search_demand").update({ last_collected_at: at }).eq("query_key", queryKey);
  if (error) console.warn(`[jobs-db] could not mark ${queryKey} collected: ${error.message}`);
}

/** LinkedIn roles stored for a search, open and newest first. */
export async function linkedInJobsForQuery(queryKey, limit = 150) {
  const { data, error } = await db()
    .from("jobs")
    .select(READ_COLUMNS)
    .eq("source", "linkedin")
    .is("closed_at", null)
    .contains("source_query", [queryKey])
    .order("last_seen_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`reading LinkedIn roles failed: ${error.message}`);
  return (data || []).map(fromRow);
}

/** Searches someone asked for in the last `days` days, as the wording last typed. */
export async function demandedQueries(days) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db()
    .from("search_demand")
    .select("query_key, query")
    .gte("last_asked_at", since)
    .order("ask_count", { ascending: false });
  if (error) throw new Error(`reading search demand failed: ${error.message}`);
  return data || [];
}

/* ---------- Easy Apply: who is asking, and what they sent ---------- */

/** The signed-in user behind a Supabase access token (from the app's Authorization header), or null. */
export async function userFromToken(token) {
  if (!token) return null;
  const { data, error } = await db().auth.getUser(token);
  return error ? null : data.user;
}

export async function recordApplication(row) {
  const { data, error } = await db().from("applications").insert(row).select("id").single();
  if (error) throw new Error(`recording application failed: ${error.message}`);
  return data.id;
}

export async function updateApplication(id, patch) {
  const { error } = await db().from("applications").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) console.warn(`[easy-apply] could not update application ${id}: ${error.message}`);
}

/* ---------- Chrome extension: saved jobs and the applicant's own data ---------- */

export async function getProfile(userId) {
  const { data, error } = await db().from("applicant_profiles").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`reading profile failed: ${error.message}`);
  return data;
}

/** Save a role for a user: the role into public.jobs (pinned), and the link into user_jobs. */
export async function saveUserJob(userId, row, { addedFrom = null } = {}) {
  const { error: jobErr } = await db().from("jobs").upsert({ ...row, pinned: true }, { onConflict: "id" });
  if (jobErr) throw new Error(`saving the role failed: ${jobErr.message}`);
  const { error } = await db()
    .from("user_jobs")
    .upsert({ user_id: userId, job_id: row.id, added_from: addedFrom, updated_at: new Date().toISOString() }, { onConflict: "user_id,job_id" });
  if (error) throw new Error(`adding it to your jobs failed: ${error.message}`);
  return row.id;
}

export async function setUserJobMatch(userId, jobId, match) {
  const { error } = await db()
    .from("user_jobs")
    .update({ match_score: match.score, match, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("job_id", jobId);
  if (error) console.warn(`[ext] could not store match for ${jobId}: ${error.message}`);
}

/** A user's saved roles, newest first, with their stored match. */
export async function listUserJobs(userId, limit = 200) {
  const { data, error } = await db()
    .from("user_jobs")
    .select(`job_id, status, match_score, match, created_at, job:jobs (${READ_COLUMNS})`)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`reading your jobs failed: ${error.message}`);
  return (data || []).filter((r) => r.job).map((r) => ({ ...fromRow(r.job), savedAt: r.created_at, matchScore: r.match_score, match: r.match, status: r.status }));
}

/** One stored role by its id ("linkedin:4471500043", "greenhouse:7654321"), in the app's job shape. */
export async function getJobById(id) {
  const { data, error } = await db().from("jobs").select(READ_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`reading the role failed: ${error.message}`);
  return data ? fromRow(data) : null;
}

/* ---------- Resume files (private "resumes" bucket + public.resume_files) ---------- */

const RESUME_BUCKET = "resumes";
const RESUME_COLUMNS = "id, name, file_name, mime_type, size_bytes, is_default, created_at, source, job_id";

export async function listResumeFiles(userId) {
  const { data, error } = await db().from("resume_files").select(RESUME_COLUMNS).eq("user_id", userId).order("created_at", { ascending: false });
  if (error) throw new Error(`reading your resumes failed: ${error.message}`);
  return data || [];
}

/** Store an uploaded resume under <user>/<id>.<ext>; the first one becomes the default. */
export async function addResumeFile(userId, { name, fileName, mimeType, bytes, source = "upload", jobId = null, rxResumeId = null }) {
  const id = crypto.randomUUID();
  const ext = mimeType === "application/pdf" ? "pdf" : mimeType === "application/msword" ? "doc" : "docx";
  const path = `${userId}/${id}.${ext}`;
  const { error: upErr } = await db().storage.from(RESUME_BUCKET).upload(path, bytes, { contentType: mimeType, upsert: false });
  if (upErr) throw new Error(`uploading the file failed: ${upErr.message}`);
  const existing = await listResumeFiles(userId);
  const { data, error } = await db()
    .from("resume_files")
    .insert({
      id, user_id: userId, name, file_name: fileName, storage_path: path, mime_type: mimeType, size_bytes: bytes.length, is_default: existing.length === 0,
      // Only uploads carry the new columns' non-default values, so uploads still work before the tailored-resumes migration.
      ...(source !== "upload" ? { source, job_id: jobId, rx_resume_id: rxResumeId } : {}),
    })
    .select(RESUME_COLUMNS)
    .single();
  if (error) {
    await db().storage.from(RESUME_BUCKET).remove([path]);
    throw new Error(`saving the file failed: ${error.message}`);
  }
  return data;
}

export async function setDefaultResumeFile(userId, id) {
  const owned = (await listResumeFiles(userId)).some((f) => f.id === id);
  if (!owned) throw Object.assign(new Error("That resume isn't yours"), { status: 404 });
  const { error: clearErr } = await db().from("resume_files").update({ is_default: false }).eq("user_id", userId).eq("is_default", true);
  if (clearErr) throw new Error(clearErr.message);
  const { error } = await db().from("resume_files").update({ is_default: true }).eq("user_id", userId).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteResumeFile(userId, id) {
  const { data: row } = await db().from("resume_files").select("storage_path, is_default").eq("user_id", userId).eq("id", id).maybeSingle();
  if (!row) throw Object.assign(new Error("That resume isn't yours"), { status: 404 });
  await db().storage.from(RESUME_BUCKET).remove([row.storage_path]);
  await db().from("resume_files").delete().eq("user_id", userId).eq("id", id);
  if (row.is_default) {
    const [next] = await listResumeFiles(userId);
    if (next) await setDefaultResumeFile(userId, next.id);
  }
}

/**
 * Save the PDF made in the design editor as the user's tailored resume for a job, replacing the one
 * saved for that job before (it stays the default if it was).
 */
export async function saveTailoredResumeFile(userId, { jobId, rxResumeId, name, fileName, bytes }) {
  const { data: old } = await db().from("resume_files").select("id, is_default").eq("user_id", userId).eq("source", "tailored").eq("job_id", jobId).maybeSingle();
  if (old) await deleteResumeFile(userId, old.id);
  const saved = await addResumeFile(userId, { name, fileName, mimeType: "application/pdf", bytes, source: "tailored", jobId, rxResumeId });
  if (old?.is_default && !saved.is_default) await setDefaultResumeFile(userId, saved.id);
  return { ...saved, is_default: saved.is_default || !!old?.is_default };
}

/** The design-editor resume a user is tailoring for a job, or null. */
export async function getTailorSession(userId, jobId) {
  const { data, error } = await db().from("tailor_sessions").select("rx_resume_id, content_hash, updated_at").eq("user_id", userId).eq("job_id", jobId).maybeSingle();
  if (error) throw new Error(`reading your tailoring session failed: ${error.message}`);
  return data;
}

export async function saveTailorSession(userId, jobId, { rxResumeId, contentHash }) {
  const { error } = await db().from("tailor_sessions").upsert(
    { user_id: userId, job_id: jobId, rx_resume_id: rxResumeId, content_hash: contentHash, updated_at: new Date().toISOString() },
    { onConflict: "user_id,job_id" },
  );
  if (error) throw new Error(`saving your tailoring session failed: ${error.message}`);
}

/** A user's resume file (the chosen one, else the default) as bytes, or null when they have none. */
export async function getResumeFile(userId, id = null) {
  let q = db().from("resume_files").select("storage_path, file_name, mime_type").eq("user_id", userId);
  q = id ? q.eq("id", id) : q.eq("is_default", true);
  const { data: row } = await q.maybeSingle();
  if (!row) return null;
  const { data, error } = await db().storage.from(RESUME_BUCKET).download(row.storage_path);
  if (error) throw new Error(`downloading your resume failed: ${error.message}`);
  return { fileName: row.file_name, mimeType: row.mime_type, bytes: Buffer.from(await data.arrayBuffer()) };
}
