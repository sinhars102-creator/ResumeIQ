/**
 * API for the ResumeIQ Chrome extension (extension/). Every route needs the signed-in user's
 * Supabase token, which the extension picks up from the ResumeIQ website.
 *
 *   POST /api/ext/jobs      save the role on the page to "My jobs" (and the shared jobs table)
 *   POST /api/ext/match     fit score for a role, with what's holding it back
 *   POST /api/ext/autofill  answers for an application form read off any page
 *   GET  /api/ext/resume    the applicant's resume as a PDF (base64) to attach
 *   GET  /api/ext/me        who is signed in and whether their profile is ready
 */
import { createHash } from "crypto";
import { callLLM } from "./llm.js";
import { fillForm } from "./easyApplyFill.js";
import { buildResumePdf } from "../src/resumePdf.js";
import { toRow, saveUserJob, setUserJobMatch, getProfile, listUserJobs } from "./jobStore.js";

/**
 * Which source a job page belongs to, and the role's id there, from its URL. Ids follow the
 * rest of ResumeIQ ("gh-<board>-<id>", bare LinkedIn ids) so a role saved from its page and the
 * same role collected from its board are one row.
 */
export function jobIdentity(pageUrl) {
  let u;
  try {
    u = new URL(pageUrl);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");
  const path = u.pathname;
  let m;
  if (host.endsWith("linkedin.com")) {
    const id = path.match(/\/jobs\/view\/(?:[^/]*-)?(\d{6,})/)?.[1] || u.searchParams.get("currentJobId");
    if (id) return { source: "linkedin", sourceJobId: id, board: null, id, url: `https://www.linkedin.com/jobs/view/${id}/` };
  }
  if (/greenhouse\.io$/.test(host) && (m = path.match(/^\/(?:embed\/job_app)?\/?([\w-]+)\/jobs\/(\d+)/))) {
    return { source: "greenhouse", sourceJobId: m[2], board: m[1], id: `gh-${m[1]}-${m[2]}`, url: pageUrl };
  }
  if (u.searchParams.get("gh_jid") && u.searchParams.get("for")) {
    const board = u.searchParams.get("for");
    return { source: "greenhouse", sourceJobId: u.searchParams.get("gh_jid"), board, id: `gh-${board}-${u.searchParams.get("gh_jid")}`, url: pageUrl };
  }
  if (host === "jobs.lever.co" && (m = path.match(/^\/([\w-]+)\/([0-9a-f-]{36})/))) {
    return { source: "lever", sourceJobId: m[2], board: m[1], id: `lever-${m[1]}-${m[2]}`, url: `https://jobs.lever.co/${m[1]}/${m[2]}` };
  }
  if (host === "jobs.ashbyhq.com" && (m = path.match(/^\/([\w.%-]+)\/([0-9a-f-]{36})/))) {
    return { source: "ashby", sourceJobId: m[2], board: m[1], id: `ashby-${m[1]}-${m[2]}`, url: `https://jobs.ashbyhq.com/${m[1]}/${m[2]}` };
  }
  if (host.endsWith("naukri.com") && (m = path.match(/-(\d{6,})(?:$|[/?])/))) {
    return { source: "naukri", sourceJobId: m[1], board: null, id: `naukri-${m[1]}`, url: pageUrl };
  }
  // Any other page: identified by its address without tracking parameters.
  const clean = `${u.origin}${path}`.replace(/\/+$/, "");
  const hash = createHash("sha1").update(clean).digest("hex").slice(0, 16);
  return { source: "web", sourceJobId: hash, board: host, id: `web-${hash}`, url: pageUrl };
}

const MATCH_PROMPT = `You compare a candidate's resume with a job and say how well they fit.
Use only facts in the resume and the job description. Return JSON:
{"score": <0-100>, "summary": "<one sentence>", "matched": ["<strength that fits>", ...up to 5],
 "gaps": ["<specific thing holding the match back, e.g. 'Asks 8+ years, you have 5' or 'No Kafka in your resume'>", ...up to 5]}`;

function resumeText(resume) {
  if (!resume) return "";
  const out = [resume.name, resume.title, resume.summary];
  for (const e of resume.experience || []) out.push(`${e.role} — ${e.company} (${e.period})`, ...(e.bullets || []));
  for (const e of resume.education || []) out.push(typeof e === "string" ? e : [e.degree, e.school, e.period].filter(Boolean).join(", "));
  if (resume.skills) out.push(`Skills: ${[].concat(resume.skills).join(", ")}`);
  return out.filter(Boolean).join("\n").slice(0, 10000);
}

export function registerExtensionRoutes(app, { userFromRequest }) {
  const withUser = (handler) => async (req, res) => {
    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ error: "Sign in on ResumeIQ to use the extension" });
    try {
      return await handler(req, res, user);
    } catch (err) {
      console.warn(`[ext] ${req.path} failed:`, err.message);
      return res.status(err.status || 500).json({ error: err.status ? err.message : "Something went wrong – please try again" });
    }
  };

  app.get("/api/ext/me", withUser(async (req, res, user) => {
    const profile = await getProfile(user.id);
    return res.json({ email: user.email, profileReady: !!(profile?.first_name && profile?.email), hasResume: !!profile?.resume });
  }));

  app.post("/api/ext/jobs", withUser(async (req, res, user) => {
    const { url, title, company, location, description } = req.body || {};
    const who = jobIdentity(url);
    if (!who) return res.status(400).json({ error: "This page has no usable address" });
    if (!String(title || "").trim() || !String(company || "").trim()) return res.status(400).json({ error: "Job title and company are required" });
    const row = toRow(
      { id: who.id, source: who.source, role: String(title).trim().slice(0, 200), company: String(company).trim().slice(0, 200), location: String(location || "").slice(0, 200), jd: String(description || "").slice(0, 30000), url: who.url },
      { board: who.board, raw: { savedBy: "extension", page: url } },
    );
    await saveUserJob(user.id, row, { addedFrom: url });
    return res.json({ jobId: row.id, source: who.source });
  }));

  app.post("/api/ext/match", withUser(async (req, res, user) => {
    const { jobId, title, company, description } = req.body || {};
    const profile = await getProfile(user.id);
    if (!profile?.resume) return res.status(409).json({ error: "Upload your resume in ResumeIQ first" });
    const raw = await callLLM({
      system: MATCH_PROMPT,
      user: JSON.stringify({ job: { title, company, description: String(description || "").slice(0, 12000) }, resume: resumeText(profile.resume) }),
      maxTokens: 900,
      json: true,
    });
    const parsed = JSON.parse(String(raw).replace(/```json|```/g, "").trim());
    const match = {
      score: Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0))),
      summary: String(parsed.summary || ""),
      matched: [].concat(parsed.matched || []).slice(0, 5).map(String),
      gaps: [].concat(parsed.gaps || []).slice(0, 5).map(String),
    };
    if (jobId) await setUserJobMatch(user.id, jobId, match);
    return res.json(match);
  }));

  app.post("/api/ext/autofill", withUser(async (req, res, user) => {
    const { fields, job } = req.body || {};
    if (!Array.isArray(fields) || !fields.length) return res.status(400).json({ error: "No form fields found on this page" });
    const profile = await getProfile(user.id);
    if (!profile) return res.status(409).json({ error: "Set up your application profile in ResumeIQ first" });
    return res.json(await fillForm({ fields: fields.slice(0, 120), profile, resume: profile.resume, job: job || {} }));
  }));

  app.get("/api/ext/resume", withUser(async (req, res, user) => {
    const profile = await getProfile(user.id);
    if (!profile?.resume) return res.status(409).json({ error: "Upload your resume in ResumeIQ first" });
    const doc = buildResumePdf(profile.resume, null);
    const name = [profile.first_name, profile.last_name].filter(Boolean).join("_").replace(/[^A-Za-z0-9_-]+/g, "") || "Resume";
    return res.json({ fileName: `${name}_Resume.pdf`, base64: Buffer.from(doc.output("arraybuffer")).toString("base64") });
  }));

  app.get("/api/ext/jobs", withUser(async (req, res, user) => res.json({ jobs: await listUserJobs(user.id) })));
}
