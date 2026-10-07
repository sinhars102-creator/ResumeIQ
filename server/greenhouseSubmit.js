/**
 * Easy Apply, phase 2: fill a Greenhouse application page with the applicant's reviewed
 * answers in an automated browser, and submit it only when they ask.
 *
 *   rehearse  – fill the real page and return a screenshot; nothing is submitted
 *   submit    – fill, click "Submit application", report: submitted | code_required | errors
 *   enterCode – finish a submission that stopped for an emailed verification code
 *
 * Field ids on the hosted page match the job board API (first_name, question_123…), so each
 * answer is found by id. Dropdowns are search boxes: type the option, pick it.
 * The page runs Google reCAPTCHA Enterprise; a submission it rejects is reported as an error
 * and the applicant can finish on the company site.
 */
import { chromium } from "playwright-core";
import { randomUUID } from "crypto";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const CHROME_PATH = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PAGE_TIMEOUT_MS = 45000;
const SESSION_TTL_MS = 10 * 60 * 1000; // how long a submission waits for a verification code
const RESULT_WAIT_MS = 20000;
const UPLOAD_WAIT_MS = 30000; // the resume uploads in the background after it's chosen

let browserPromise = null;
const sessions = new Map(); // sessionId → { context, page, dir, timer }

/** The shared automated browser, relaunched if it has closed or crashed since the last use. */
async function browser() {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    if (b?.isConnected()) return b;
    browserPromise = null;
  }
  browserPromise = chromium.launch({ executablePath: CHROME_PATH, headless: process.env.EASY_APPLY_HEADFUL !== "1" });
  const b = await browserPromise;
  b.on("disconnected", () => {
    browserPromise = null;
  });
  return b;
}

const cssId = (id) => `[id="${String(id).replace(/"/g, '\\"')}"]`;
// Greenhouse's embeddable application form: the same form and field ids as the hosted job page,
// but it never redirects to the company's own careers site (e.g. rubrik.com), which can block
// automated browsers with "Access Denied".
const applicationUrl = (board, jobId) =>
  `https://job-boards.greenhouse.io/embed/job_app?for=${encodeURIComponent(board)}&token=${encodeURIComponent(jobId)}`;

/**
 * Pick an option in one of the page's search-box dropdowns by typing its label. Prefers an
 * exact match, then one starting with the label ("India" before "British Indian Ocean
 * Territory"), then any containing it.
 */
async function chooseOption(page, input, label) {
  const want = String(label).trim();
  await input.click();
  await input.fill("");
  await input.type(want.slice(0, 60), { delay: 15 });
  const options = page.getByRole("option");
  try {
    await options.first().waitFor({ timeout: 5000 });
  } catch {
    throw new Error(`option "${want}" not offered`);
  }
  const texts = (await options.allInnerTexts()).map((t) => t.trim().toLowerCase());
  const w = want.toLowerCase();
  let index = texts.findIndex((t) => t === w);
  if (index < 0) index = texts.findIndex((t) => t.startsWith(w));
  if (index < 0) index = texts.findIndex((t) => t.includes(w.slice(0, 40)));
  if (index < 0) throw new Error(`option "${want}" not offered`);
  await options.nth(index).click();
}

/** Fill one field. Returns null when done, or a short reason when it couldn't be filled. */
async function fillField(page, field, value, files) {
  if (field.type === "file") {
    const path = field.id === "resume" ? files.resume : null;
    if (!path) return null;
    const input = page.locator(cssId(field.id));
    if (!(await input.count())) return "upload box not found";
    // Watch Greenhouse's file storage answer, so a rejected upload is reported precisely.
    const upload = page
      .waitForResponse((r) => /amazonaws\.com/.test(r.url()) && r.request().method() === "POST", { timeout: UPLOAD_WAIT_MS })
      .then((r) => ({ status: r.status() }))
      .catch((err) => ({ error: err.message.split("\n")[0] }));
    await input.setInputFiles(path);
    const answer = await upload;
    console.log(`[easy-apply] resume upload (${files.resumeKb} KB):`, JSON.stringify(answer));
    if (answer.status && answer.status >= 300) return `Greenhouse rejected the resume upload (HTTP ${answer.status})`;
    return (await resumeAttached(page, files.resumeName, UPLOAD_WAIT_MS)) ? null : "the resume didn't finish uploading";
  }
  if (value == null || value === "" || (Array.isArray(value) && !value.length)) return null;

  if (field.id === "location") {
    const input = page.locator("#candidate-location");
    if (!(await input.count())) return "location box not found";
    await input.click();
    await input.fill("");
    await input.type(String(value), { delay: 20 });
    const first = page.getByRole("option").first();
    try {
      await first.waitFor({ timeout: 6000 });
      await first.click();
    } catch {
      return "no matching city suggested";
    }
    return null;
  }

  const input = page.locator(cssId(field.id)).first();
  if (!(await input.count())) return "field not found on the page";

  if (field.type === "select") {
    const option = field.options.find((o) => o.value === String(value));
    if (!option) return "answer isn't one of the options";
    await chooseOption(page, input, option.label);
    return null;
  }
  if (field.type === "multiselect" || field.type === "checkbox") {
    const labels = [].concat(value).map((v) => field.options.find((o) => o.value === String(v))?.label).filter(Boolean);
    for (const label of labels) {
      const box = page.getByRole("checkbox", { name: label, exact: true }).first();
      if (await box.count()) await box.check();
      else await chooseOption(page, input, label);
    }
    return null;
  }
  await input.fill(String(value));
  return null;
}

/**
 * Greenhouse uploads a chosen file in the background: the upload box disappears and the file's
 * name shows once it's stored. Submitting before that fails with "Resume/CV is required".
 */
async function resumeAttached(page, fileName, waitMs) {
  try {
    await page.waitForFunction(
      (name) => {
        const text = document.body.innerText;
        const at = text.indexOf("Resume/CV");
        return at >= 0 && text.slice(at, at + 400).includes(name);
      },
      fileName,
      { timeout: waitMs },
    );
    return true;
  } catch {
    return false;
  }
}

/** Phone needs its country picked first (the page's dial-code selector). */
async function fillCountry(page, country) {
  const input = page.locator("#country");
  if (!country || !(await input.count())) return null;
  try {
    await chooseOption(page, input, country);
    return null;
  } catch (err) {
    return err.message;
  }
}

async function openAndFill({ board, jobId, fields, values, country, resumePdfBase64 }) {
  const dir = mkdtempSync(join(tmpdir(), "rq-apply-"));
  const files = {};
  if (resumePdfBase64) {
    const who = [values.first_name, values.last_name].filter(Boolean).join("_").replace(/[^A-Za-z0-9_-]+/g, "") || "Applicant";
    files.resumeName = `${who}_Resume.pdf`;
    files.resume = join(dir, files.resumeName);
    const bytes = Buffer.from(String(resumePdfBase64).replace(/^data:[^,]*,/, ""), "base64");
    writeFileSync(files.resume, bytes);
    files.resumeKb = Math.round(bytes.length / 1024);
    if (bytes.subarray(0, 5).toString() !== "%PDF-") console.warn("[easy-apply] resume file doesn't look like a PDF");
  }
  const context = await (await browser()).newContext({ locale: "en-IN", viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  await page.goto(applicationUrl(board, jobId), { waitUntil: "networkidle", timeout: PAGE_TIMEOUT_MS });

  const problems = [];
  const countryProblem = await fillCountry(page, country);
  if (countryProblem) problems.push({ id: "country", label: "Country", reason: countryProblem });
  for (const field of fields) {
    try {
      const reason = await fillField(page, field, values[field.id], files);
      if (reason) problems.push({ id: field.id, label: field.label, reason });
    } catch (err) {
      problems.push({ id: field.id, label: field.label, reason: err.message.split("\n")[0].slice(0, 120) });
    }
  }
  return { context, page, dir, problems, files };
}

function closeSession(id) {
  const s = sessions.get(id);
  if (!s) return;
  clearTimeout(s.timer);
  sessions.delete(id);
  s.context.close().catch(() => {});
  rmSync(s.dir, { recursive: true, force: true });
}

/** Fill the real page and return a screenshot of it. Nothing is submitted. */
export async function rehearse(input) {
  const { context, page, dir, problems } = await openAndFill(input);
  try {
    const form = page.locator("form").first();
    const shot = (await form.count()) ? await form.screenshot({ type: "jpeg", quality: 70 }) : await page.screenshot({ type: "jpeg", quality: 70, fullPage: true });
    return { status: "rehearsed", problems, screenshot: `data:image/jpeg;base64,${shot.toString("base64")}` };
  } finally {
    await context.close().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  }
}

/** What the page shows after a submit click. */
async function readOutcome(page) {
  const deadline = Date.now() + RESULT_WAIT_MS;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      if (/\/confirmation\b/.test(location.pathname) || /thank you for applying|application (has been )?(received|submitted)/.test(text)) return { status: "submitted" };
      if (/security code|verification code|enter the code|code (was )?sent to/.test(text)) return { status: "code_required" };
      const errors = [...document.querySelectorAll('[aria-invalid="true"], .helper-text--error, [class*="error"]')]
        .map((el) => (el.closest("[class*=field], .select, fieldset")?.querySelector("label")?.textContent || el.textContent || "").trim())
        .filter(Boolean);
      if (errors.length) return { status: "errors", errors: [...new Set(errors)].slice(0, 10) };
      return null;
    });
    if (state) return state;
    await page.waitForTimeout(800);
  }
  return { status: "unknown" };
}

/** Fill and submit. A submission that needs a verification code stays open for enterCode(). */
export async function submit(input) {
  const { context, page, dir, problems, files } = await openAndFill(input);
  const blocking = problems.filter((p) => input.fields.find((f) => f.id === p.id)?.required || p.id === "country");
  if (blocking.length) {
    await context.close().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
    return { status: "not_filled", problems: blocking };
  }
  // Last check: never submit without the resume actually attached.
  if (input.fields.some((f) => f.id === "resume") && files.resume && !(await resumeAttached(page, files.resumeName, 5000))) {
    await context.close().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
    return { status: "not_filled", problems: [{ id: "resume", label: "Resume/CV", reason: "the resume didn't finish uploading" }] };
  }
  await page.getByRole("button", { name: /submit application/i }).first().click();
  const outcome = await readOutcome(page);
  if (outcome.status === "errors" || outcome.status === "unknown") {
    // Kept on this machine only (OS temp folder), to see what the page showed.
    const shot = join(tmpdir(), `rq-apply-failed-${Date.now()}.png`);
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
    console.warn(`[easy-apply] submit outcome ${outcome.status}; page saved to ${shot}`);
  }
  if (outcome.status === "code_required") {
    const sessionId = randomUUID();
    sessions.set(sessionId, { context, page, dir, timer: setTimeout(() => closeSession(sessionId), SESSION_TTL_MS) });
    return { ...outcome, sessionId, problems };
  }
  await context.close().catch(() => {});
  rmSync(dir, { recursive: true, force: true });
  return { ...outcome, problems };
}

/** Type the emailed verification code into a waiting submission and finish it. */
export async function enterCode(sessionId, code) {
  const s = sessions.get(sessionId);
  if (!s) return { status: "expired" };
  const { page } = s;
  const chars = String(code).replace(/\s+/g, "");
  const boxes = page.locator('input[autocomplete="one-time-code"], input[maxlength="1"], input[name*="code" i], input[id*="code" i], input[aria-label*="code" i]');
  const count = await boxes.count();
  if (!count) return { status: "errors", errors: ["Couldn't find the code box on the page"] };
  if (count > 1 && count >= chars.length) {
    for (let i = 0; i < chars.length; i += 1) await boxes.nth(i).fill(chars[i]);
  } else {
    await boxes.first().fill(chars);
  }
  const button = page.getByRole("button", { name: /submit|verify|confirm|continue/i }).first();
  if (await button.count()) await button.click();
  const outcome = await readOutcome(page);
  if (outcome.status !== "code_required") closeSession(sessionId);
  return outcome;
}
