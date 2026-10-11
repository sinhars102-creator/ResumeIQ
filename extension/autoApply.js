/**
 * Auto apply (RES-54): the application for a job, filled and – when ResumeIQ is sure – submitted in a
 * background tab of the user's own Chrome (their logins, their browser), started from the website.
 *
 * Sure = every required question answered from the profile, the resume or a saved answer (never an
 * AI guess), the resume attached, and nothing left for the user. Optional questions only the AI could
 * answer are left blank rather than guessed. Otherwise it stops with the form filled and says what to
 * check; the user finishes in that tab.
 *
 * Greenhouse, Lever and Ashby for now: single-page forms without site accounts.
 */
import { readForm, fillForm, formSignal, submitApplication, applicationOutcome } from "./pageScripts.js";

export const SUPPORTED_SITES = "Greenhouse, Lever and Ashby";
const FORM_WAIT_MS = 30000;
const CONFIRM_WAIT_MS = 45000;

/** The application form's address for a job page on a supported site, else null. */
export function applicationUrl(jobUrl) {
  let u;
  try {
    u = new URL(jobUrl);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");
  let m;
  if (/(^|\.)greenhouse\.io$/.test(host) && (m = u.pathname.match(/^\/(?:embed\/job_app)?\/?([\w-]+)\/jobs\/(\d+)/))) {
    return `https://job-boards.greenhouse.io/${m[1]}/jobs/${m[2]}`;
  }
  if (u.searchParams.get("gh_jid") && u.searchParams.get("for")) {
    return `https://job-boards.greenhouse.io/${u.searchParams.get("for")}/jobs/${u.searchParams.get("gh_jid")}`;
  }
  if (host === "jobs.lever.co" && (m = u.pathname.match(/^\/([\w.-]+)\/([0-9a-f-]{36})/))) return `https://jobs.lever.co/${m[1]}/${m[2]}/apply`;
  if (host === "jobs.ashbyhq.com" && (m = u.pathname.match(/^\/([\w.%-]+)\/([0-9a-f-]{36})/))) return `https://jobs.ashbyhq.com/${m[1]}/${m[2]}/application`;
  return null;
}

/**
 * The application form's address from a ResumeIQ job id ("gh-airbnb-8146630", "lever-paytm-<uuid>",
 * "ashby-snowflake-<uuid>"): collected Greenhouse jobs often link to the company's careers page,
 * which doesn't name the board.
 */
export function applicationUrlFromId(jobId) {
  const id = String(jobId || "").replace(/^(greenhouse|lever|ashby):/, "");
  let m;
  if ((m = id.match(/^gh-(.+)-(\d+)$/))) return `https://job-boards.greenhouse.io/${m[1]}/jobs/${m[2]}`;
  if ((m = id.match(/^lever-(.+)-([0-9a-f-]{36})$/))) return `https://jobs.lever.co/${m[1]}/${m[2]}/apply`;
  if ((m = id.match(/^ashby-(.+)-([0-9a-f-]{36})$/))) return `https://jobs.ashbyhq.com/${m[1]}/${m[2]}/application`;
  return null;
}

/** greenhouse | lever | ashby, from the application address. */
function siteOf(url) {
  return /greenhouse\.io/.test(url) ? "greenhouse" : /lever\.co/.test(url) ? "lever" : /ashbyhq\.com/.test(url) ? "ashby" : "web";
}

/**
 * Which answers to fill: AI guesses are dropped for optional questions (left blank) and kept – to be
 * checked – for required ones. Returns { kept, guessed: [label] }.
 */
export function planAnswers(fields, answers) {
  const labelOf = (id) => fields.find((f) => f.id === id)?.label || id;
  const required = new Set(fields.filter((f) => f.required).map((f) => f.id));
  const kept = {};
  const guessed = [];
  for (const [id, answer] of Object.entries(answers || {})) {
    if (answer?.source === "ai") {
      if (!required.has(id)) continue;
      guessed.push(labelOf(id));
    }
    kept[id] = answer;
  }
  return { kept, guessed };
}

/** What's left for the user after filling; empty = sure enough to submit. */
export function checksAfterFill({ guessed, skipped, resumeRequired, resumeAttached, coverRequired, coverAttached }) {
  const checks = [
    ...guessed.map((label) => `Check the answer to “${label}” – suggested by AI`),
    ...skipped.map((label) => `Answer “${label}”`),
  ];
  if (resumeRequired && !resumeAttached) checks.push("Attach your resume");
  if (coverRequired) checks.push(coverAttached ? "Read the cover letter ResumeIQ wrote and attached" : "Attach a cover letter");
  return checks;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function inTab(tabId, func, args = []) {
  const [result] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  return result?.result;
}

/** Wait for the application form to show (sites render it after load). */
async function waitForForm(tabId) {
  const end = Date.now() + FORM_WAIT_MS;
  while (Date.now() < end) {
    const signal = await inTab(tabId, formSignal).catch(() => null);
    if (signal?.isApplication && signal.fields >= 3) return true;
    await sleep(1000);
  }
  return false;
}

/** After Submit: wait for the site's confirmation, its errors, or a CAPTCHA. */
async function waitForOutcome(tabId) {
  const end = Date.now() + CONFIRM_WAIT_MS;
  let outcome = null;
  while (Date.now() < end) {
    await sleep(1500);
    // The page may be navigating to its confirmation; a failed read just means "not yet".
    outcome = (await inTab(tabId, applicationOutcome).catch(() => null)) || outcome;
    if (outcome?.submitted || outcome?.captcha || outcome?.errors?.length) break;
  }
  return outcome;
}

/**
 * Run auto apply for one job. `job`: { jobId, url, company, title, description, resumeFileId }.
 * `api(path, options)` calls the ResumeIQ API; `update(state)` reports progress:
 * { status: "running", step } then one of
 * { status: "submitted" } · { status: "needs_review", message, checks: [text], tabId } ·
 * { status: "unsupported", message } · { status: "failed", message, tabId? }.
 * Every finished run is recorded in the user's applications.
 */
export async function autoApply(job, { api, update }) {
  const url = applicationUrl(job.url) || applicationUrlFromId(job.jobId);
  if (!url) {
    update({ status: "unsupported", message: `Auto apply works on ${SUPPORTED_SITES} jobs for now. Your resume is saved for this job – open the application and the extension attaches it.` });
    return;
  }
  const record = (status, details = {}) =>
    api("/api/ext/applications", { method: "POST", body: { jobId: job.jobId, source: siteOf(url), company: job.company, title: job.title, applyUrl: url, status, details } })
      .catch(() => null);
  update({ status: "running", step: "Opening the application…" });
  const tab = await chrome.tabs.create({ url, active: false });
  const stop = async (state) => {
    update({ ...state, tabId: tab.id });
    await record(state.status, { checks: state.checks || [], message: state.message || "" });
  };
  try {
    if (!(await waitForForm(tab.id))) {
      return stop({ status: "needs_review", message: "The application form didn't load.", checks: ["Open the application and check it's still accepting applications"] });
    }
    update({ status: "running", step: "Reading the form…" });
    const form = await inTab(tab.id, readForm);
    const resumeField = form.fields.find((f) => f.id === "resume");
    const coverField = form.fields.find((f) => (f.id === "cover_letter" || f.id === "documents") && f.required);

    update({ status: "running", step: "Working out your answers…" });
    const [answers, resume, cover] = await Promise.all([
      api("/api/ext/autofill", { method: "POST", body: { fields: form.fields, job: { title: job.title, company: job.company } } }),
      resumeField ? api(`/api/ext/resume${job.resumeFileId ? `?id=${encodeURIComponent(job.resumeFileId)}` : ""}`) : Promise.resolve({ ok: true, data: null }),
      // Only a required cover letter is written (it's AI-written, so it's then left for the user to read).
      coverField ? api("/api/ext/cover-letter", { method: "POST", body: { title: job.title, company: job.company, description: job.description || "" } }) : Promise.resolve({ ok: true, data: null }),
    ]);
    if (!answers.ok) throw new Error(answers.data?.error || "Couldn't work out your answers");

    const { kept, guessed } = planAnswers(form.fields, answers.data.answers);

    update({ status: "running", step: "Filling the form…" });
    const result = await inTab(tab.id, fillForm, [{
      fields: form.fields, answers: kept, needsYou: answers.data.needsYou || [],
      resume: resume.ok ? resume.data : null, coverLetter: cover.ok ? cover.data : null,
    }]);

    const checks = checksAfterFill({
      guessed, skipped: result.skipped,
      resumeRequired: !!resumeField?.required, resumeAttached: !!(resume.ok && resume.data),
      coverRequired: !!coverField, coverAttached: !!(cover.ok && cover.data),
    });
    if (checks.length) {
      return stop({ status: "needs_review", message: "The form is filled, but a few things need you before it's sent.", checks });
    }

    update({ status: "running", step: "Submitting…" });
    const clicked = await inTab(tab.id, submitApplication);
    if (!clicked) return stop({ status: "needs_review", message: "The form is filled, but its Submit button wasn't found.", checks: ["Submit it on the page"] });
    const outcome = await waitForOutcome(tab.id);
    if (outcome?.submitted) {
      await stop({ status: "submitted", message: "Application submitted." });
      chrome.tabs.remove(tab.id).catch(() => {});
      return;
    }
    if (outcome?.captcha) return stop({ status: "needs_review", message: "The site asked for a CAPTCHA.", checks: ["Solve the CAPTCHA on the page, then submit"] });
    if (outcome?.errors?.length) return stop({ status: "needs_review", message: "The site didn't accept the form yet.", checks: outcome.errors.map((e) => `Fix: ${e}`) });
    return stop({ status: "needs_review", message: "Submit was clicked, but the site didn't confirm it.", checks: ["Check the page – it may still be sending, or need something"] });
  } catch (err) {
    return stop({ status: "failed", message: `Auto apply stopped: ${err.message}`, checks: ["Finish the application on the page"] });
  }
}
