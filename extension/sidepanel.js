import { extractJob, readForm, fillForm, attachFile } from "./pageScripts.js";

const $ = (id) => document.getElementById(id);
const api = (path, options) => chrome.runtime.sendMessage({ type: "api", path, options });
let tabId = null;

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function runInPage(func, args = []) {
  const [result] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  return result?.result;
}

function status(el, text, kind = "") {
  el.textContent = text;
  el.className = `status ${kind}`;
}

const MATCH_CACHE_DAYS = 7;
let currentMatch = null; // the score shown for the job on this page
let readSeq = 0; // drops results for a job the user has already moved away from

/** One key per role: LinkedIn's job id, else the page address without its query. */
function jobKey(url) {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith("linkedin.com")) {
      const id = u.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d{6,})/)?.[1] || u.searchParams.get("currentJobId");
      if (id) return `linkedin:${id}`;
    }
    return `${u.origin}${u.pathname}`.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

async function cachedMatch(key) {
  const { matches = {} } = await chrome.storage.local.get("matches");
  const hit = matches[key];
  return hit && Date.now() - hit.at < MATCH_CACHE_DAYS * 864e5 ? hit.match : null;
}

async function cacheMatch(key, match) {
  const { matches = {} } = await chrome.storage.local.get("matches");
  matches[key] = { at: Date.now(), match };
  // Keep the newest 300.
  const keep = Object.entries(matches).sort((a, b) => b[1].at - a[1].at).slice(0, 300);
  await chrome.storage.local.set({ matches: Object.fromEntries(keep) });
}

function matchPending(text) {
  $("matchCard").hidden = false;
  $("tailor").hidden = true;
  $("ring").style.setProperty("--pct", 0);
  $("scoreValue").textContent = "…";
  $("scoreLabel").textContent = "Your fit for this role";
  $("scoreSummary").textContent = text;
  $("matchDetails").hidden = true;
  $("rematch").hidden = true;
}

/** Score the job on this page against the profile (cached per job), as soon as it's read. */
async function runMatch(job, { force = false } = {}) {
  const seq = readSeq;
  const key = jobKey(job.url);
  currentMatch = null;
  const cached = !force && key && (await cachedMatch(key));
  if (cached) {
    showMatch(cached);
    return;
  }
  matchPending("Checking your fit…");
  const r = await api("/api/ext/match", { method: "POST", body: { title: job.title, company: job.company, description: job.description } });
  if (seq !== readSeq) return; // the user moved to another job meanwhile
  if (!r.ok) {
    matchPending(r.data.error || "Couldn't check your fit.");
    $("rematch").hidden = false;
    return;
  }
  if (key) await cacheMatch(key, r.data);
  showMatch(r.data);
}

function showMatch(m) {
  currentMatch = m;
  $("matchCard").hidden = false;
  $("matchDetails").hidden = false;
  $("rematch").hidden = true;
  $("tailor").hidden = false;
  status($("tailorStatus"), "");
  const tier = m.score >= 75 ? ["Strong match", "#3F7D6E"] : m.score >= 55 ? ["Moderate match", "#B7862F"] : ["Needs alignment", "#B5534A"];
  $("ring").style.setProperty("--pct", m.score);
  $("ring").style.setProperty("--ring", tier[1]);
  $("scoreValue").textContent = `${m.score}%`;
  $("scoreLabel").textContent = tier[0];
  $("scoreSummary").textContent = m.summary || "";
  $("gaps").replaceChildren(...(m.gaps.length ? m.gaps : ["Nothing major"]).map((g) => Object.assign(document.createElement("li"), { textContent: g })));
  $("matched").replaceChildren(...m.matched.map((g) => Object.assign(document.createElement("li"), { textContent: g })));
}

async function readJob() {
  readSeq += 1;
  $("matchCard").hidden = true;
  currentMatch = null;
  status($("jobStatus"), "");
  $("saveJob").textContent = "Add to ResumeIQ";
  try {
    let job = await runInPage(extractJob);
    // LinkedIn sometimes fills the description in after the job appears: read once more.
    if (job?.title && (job.description || "").length < 150) {
      await new Promise((r) => setTimeout(r, 1500));
      job = (await runInPage(extractJob)) || job;
    }
    for (const key of ["title", "company", "location", "description"]) $(key).value = job?.[key] || "";
    $("jobForm").dataset.url = job?.url || "";
    if (!job?.title) status($("jobStatus"), "No job found on this page – fill in the details to save it anyway.");
    // Enough of a description to judge fit: score it straight away.
    else if ((job.description || "").length >= 150) runMatch(job);
  } catch (err) {
    status($("jobStatus"), `Can't read this page (${err.message})`, "err");
  }
}

/** ResumeIQ's id for a Greenhouse role from its page address, or null ("gh-<board>-<id>"). */
function greenhouseJobId(url) {
  try {
    const u = new URL(url);
    if (u.searchParams.get("gh_jid") && u.searchParams.get("for")) return `gh-${u.searchParams.get("for")}-${u.searchParams.get("gh_jid")}`;
    if (u.hostname.endsWith("greenhouse.io")) {
      const m = u.pathname.match(/^\/(?:embed\/job_app)?\/?([\w-]+)\/jobs\/(\d+)/);
      if (m) return `gh-${m[1]}-${m[2]}`;
      if (u.searchParams.get("token") && u.searchParams.get("for")) return `gh-${u.searchParams.get("for")}-${u.searchParams.get("token")}`;
    }
  } catch {
    // not a URL
  }
  return null;
}

async function refresh() {
  const tab = await activeTab();
  tabId = tab?.id;
  const auth = await chrome.runtime.sendMessage({ type: "auth:get" });
  $("who").textContent = auth.signedIn ? auth.email || "Signed in" : "";
  $("signedOut").hidden = auth.signedIn;
  $("openApp").onclick = () => chrome.tabs.create({ url: auth.appUrl });
  for (const id of ["jobCard", "applyCard"]) $(id).hidden = !auth.signedIn;
  // Greenhouse's dropdowns ignore extension input, so its applications go through Easy Apply.
  const ghId = auth.signedIn ? greenhouseJobId(tab?.url || "") : null;
  $("easyApplyCard").hidden = !ghId;
  $("openEasyApply").onclick = () => chrome.tabs.create({ url: `${auth.appUrl}?easyApply=${encodeURIComponent(ghId)}` });
  if (auth.signedIn && /^https?:/.test(tab?.url || "")) await readJob();
}

$("jobForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("saveJob").disabled = true;
  status($("jobStatus"), "Saving…");
  const job = { url: $("jobForm").dataset.url, title: $("title").value, company: $("company").value, location: $("location").value, description: $("description").value };
  const saved = await api("/api/ext/jobs", { method: "POST", body: { ...job, match: currentMatch } });
  if (!saved.ok) {
    status($("jobStatus"), saved.data.error || "Couldn't save", "err");
    $("saveJob").disabled = false;
    return;
  }
  $("saveJob").textContent = "Saved ✓";
  $("saveJob").disabled = false;
  status($("jobStatus"), "Saved to your ResumeIQ jobs.", "ok");
  // Not scored yet (short description, or the check failed): score it now, with what was saved.
  if (!currentMatch && job.description.length >= 50) runMatch(job);
});

$("autofill").addEventListener("click", async () => {
  $("autofill").disabled = true;
  $("skipped").replaceChildren();
  $("optional").replaceChildren();
  $("optionalHead").hidden = true;
  $("coverBox").hidden = true;
  status($("coverStatus"), "");
  try {
    status($("applyStatus"), "Reading the form…");
    const form = await runInPage(readForm);
    if (!form?.fields?.length) {
      status($("applyStatus"), "No application form found on this page. Open the job's Apply page and try again.", "err");
      return;
    }
    status($("applyStatus"), `Found ${form.fields.length} fields. Working out your answers…`);
    const jobInfo = { title: $("title").value, company: $("company").value, description: $("description").value };
    coverFieldId = form.fields.find((f) => f.id === "cover_letter")?.id || form.fields.find((f) => f.id === "documents")?.id || null;
    const [answers, resume, cover] = await Promise.all([
      api("/api/ext/autofill", { method: "POST", body: { fields: form.fields, job: { title: jobInfo.title, company: jobInfo.company } } }),
      form.fields.some((f) => f.id === "resume") ? api("/api/ext/resume") : Promise.resolve({ ok: true, data: null }),
      coverFieldId ? api("/api/ext/cover-letter", { method: "POST", body: jobInfo }) : Promise.resolve({ ok: true, data: null }),
    ]);
    if (!answers.ok) {
      status($("applyStatus"), answers.data.error || "Couldn't work out answers", "err");
      return;
    }
    status($("applyStatus"), "Filling the form…");
    const result = await runInPage(fillForm, [{
      fields: form.fields, answers: answers.data.answers, needsYou: answers.data.needsYou,
      resume: resume.ok ? resume.data : null, coverLetter: cover.ok ? cover.data : null,
    }]);
    if (cover.ok && cover.data) {
      $("coverText").value = cover.data.text;
      $("coverBox").hidden = false;
    } else if (coverFieldId && !cover.ok) status($("coverStatus"), cover.data.error || "Couldn't write a cover letter", "err");
    const left = result.skipped.length;
    status($("applyStatus"), `Filled ${result.filled} field${result.filled === 1 ? "" : "s"}${left ? ` · ${left} required left for you (outlined in amber on the page)` : ""}. Review the page, then submit it yourself.`, "ok");
    $("skipped").replaceChildren(...result.skipped.map((s) => Object.assign(document.createElement("li"), { textContent: s })));
    $("optional").replaceChildren(...(result.optional || []).map((s) => Object.assign(document.createElement("li"), { textContent: s })));
    $("optionalHead").hidden = !(result.optional || []).length;
  } catch (err) {
    status($("applyStatus"), `Couldn't fill this page (${err.message})`, "err");
  } finally {
    $("autofill").disabled = false;
  }
});

/** Save the job (with its score) and open ResumeIQ's tailoring step for it. */
$("tailor").addEventListener("click", async () => {
  $("tailor").disabled = true;
  status($("tailorStatus"), "Opening ResumeIQ…");
  const job = { url: $("jobForm").dataset.url, title: $("title").value, company: $("company").value, location: $("location").value, description: $("description").value };
  const saved = await api("/api/ext/jobs", { method: "POST", body: { ...job, match: currentMatch } });
  $("tailor").disabled = false;
  if (!saved.ok) {
    status($("tailorStatus"), saved.data.error || "Couldn't save the job", "err");
    return;
  }
  $("saveJob").textContent = "Saved ✓";
  const { appUrl } = await chrome.runtime.sendMessage({ type: "auth:get" });
  chrome.tabs.create({ url: `${appUrl}?tailor=${encodeURIComponent(saved.data.jobId)}` });
  status($("tailorStatus"), "Opened in a new tab – your suggested edits will target the gaps above.", "ok");
});

let coverFieldId = null; // the upload the cover letter went to on this page

$("reattachCover").addEventListener("click", async () => {
  if (!coverFieldId) return;
  $("reattachCover").disabled = true;
  status($("coverStatus"), "Re-attaching…");
  const r = await api("/api/ext/cover-letter", { method: "POST", body: { text: $("coverText").value } });
  $("reattachCover").disabled = false;
  if (!r.ok) {
    status($("coverStatus"), r.data.error || "Couldn't make the PDF", "err");
    return;
  }
  const ok = await runInPage(attachFile, [coverFieldId, { fileName: r.data.fileName, base64: r.data.base64 }]);
  status($("coverStatus"), ok ? "Edited letter attached." : "The upload box is gone – autofill the page again.", ok ? "ok" : "err");
});

$("rescan").addEventListener("click", readJob);
$("rematch").addEventListener("click", () =>
  runMatch({ url: $("jobForm").dataset.url, title: $("title").value, company: $("company").value, description: $("description").value }, { force: true }));
chrome.tabs.onActivated.addListener(refresh);
// LinkedIn switches jobs without loading a new page (only the address changes): re-read after it renders.
let urlTimer = null;
chrome.tabs.onUpdated.addListener((id, info) => {
  if (id !== tabId) return;
  if (info.status === "complete") refresh();
  else if (info.url) {
    clearTimeout(urlTimer);
    urlTimer = setTimeout(refresh, 1500);
  }
});
chrome.runtime.onMessage.addListener((msg) => { if (msg.type === "auth:changed") refresh(); });
refresh();
