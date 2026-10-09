import { extractJob, readForm, fillForm, attachFile, formSignal, expandEmployment } from "./pageScripts.js";

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
  $("generate").hidden = true;
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
  $("generate").hidden = false;
  showGenerateLabel();
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
    // Another job: its generated resume isn't this one's. (The same job read again keeps the review open.)
    if (draft && draft.key !== jobKey(job?.url || "")) {
      draft = null;
      $("genCard").hidden = true;
    }
    $("jobSummary").textContent = [job?.title, job?.company].filter(Boolean).join(" · ") || "Job details";
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
  if (tab?.id !== tabId) {
    // Another tab: the last page's autofill results don't belong to it.
    clearAutofillResults();
    lastStep = null;
  }
  tabId = tab?.id;
  if (tab?.url !== pageUrl) pickedByHand = null;
  pageUrl = tab?.url || null;
  const auth = await chrome.runtime.sendMessage({ type: "auth:get" });
  $("who").textContent = auth.signedIn ? auth.email || "Signed in" : "";
  $("signedOut").hidden = auth.signedIn;
  $("openApp").onclick = () => chrome.runtime.sendMessage({ type: "app:open" });
  for (const id of ["jobCard", "applyCard"]) $(id).hidden = !auth.signedIn;
  // Greenhouse's dropdowns ignore extension input, so its applications go through Easy Apply.
  const ghId = auth.signedIn ? greenhouseJobId(tab?.url || "") : null;
  $("easyApplyCard").hidden = !ghId;
  $("openEasyApply").onclick = () => chrome.tabs.create({ url: `${auth.appUrl}?easyApply=${encodeURIComponent(ghId)}` });
  if (auth.signedIn && /^https?:/.test(tab?.url || "")) {
    const loading = loadResumes();
    await layoutForPage();
    await readJob();
    await loading;
    if (document.body.classList.contains("on-application")) await pickGeneratedResume(tab.url);
  } else document.body.classList.remove("on-application");
}

/**
 * Application page → autofill leads and the job details collapse to one line; job page → the
 * match and job details lead, and the autofill card shrinks to a hint to click Apply.
 */
async function layoutForPage() {
  let onApplication = false;
  try {
    onApplication = !!(await runInPage(formSignal))?.isApplication;
  } catch {
    onApplication = false; // page not readable (chrome:// pages, the store)
  }
  document.body.classList.toggle("on-application", onApplication);
  $("applyTitle").textContent = onApplication ? "Autofill this application" : "Application form";
  $("applyHint").hidden = onApplication;
  for (const id of ["applyAbout", "autofill"]) $(id).hidden = !onApplication;
  $("jobForm").classList.toggle("collapsed", onApplication);
  $("jobSummary").hidden = !onApplication;
  $("jobSummary").setAttribute("aria-expanded", "false");
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

/** Clear the last page's autofill results (a new page or a new step of the same form). */
function clearAutofillResults() {
  status($("applyStatus"), "");
  $("skipped").replaceChildren();
  $("optional").replaceChildren();
  $("optionalHead").hidden = true;
  $("coverBox").hidden = true;
  status($("coverStatus"), "");
  attached.resume = null;
  attached.cover = null;
  showAttached();
}

$("autofill").addEventListener("click", async () => {
  $("autofill").disabled = true;
  $("skipped").replaceChildren();
  $("optional").replaceChildren();
  $("optionalHead").hidden = true;
  $("coverBox").hidden = true;
  status($("coverStatus"), "");
  attached.resume = null;
  attached.cover = null;
  showAttached();
  try {
    status($("applyStatus"), "Reading the form…");
    let form = await runInPage(readForm);
    // Employment: one block per job in your resume – "Add another" is clicked as needed, then the form is read again.
    const shownJobs = new Set((form?.fields || []).filter((f) => f.entry?.kind === "employment").map((f) => f.entry.index)).size;
    if (shownJobs) {
      const me = await api("/api/ext/me");
      const jobs = me.ok ? me.data.experienceCount || 0 : 0;
      if (jobs > shownJobs) {
        status($("applyStatus"), `Adding your other ${jobs - shownJobs} job${jobs - shownJobs === 1 ? "" : "s"} to the form…`);
        await runInPage(expandEmployment, [jobs]);
        form = await runInPage(readForm);
      }
    }
    if (!form?.fields?.length && !form?.manual) {
      status($("applyStatus"), "No application form found on this page. Open the job's Apply page and try again.", "err");
      return;
    }
    status($("applyStatus"), `Found ${form.fields.length + form.manual} fields. Working out your answers…`);
    const jobInfo = { title: $("title").value, company: $("company").value, description: $("description").value };
    coverFieldId = form.fields.find((f) => f.id === "cover_letter")?.id || form.fields.find((f) => f.id === "documents")?.id || null;
    const [answers, resume, cover] = await Promise.all([
      form.fields.length
        ? api("/api/ext/autofill", { method: "POST", body: { fields: form.fields, job: { title: jobInfo.title, company: jobInfo.company } } })
        : Promise.resolve({ ok: true, data: { answers: {}, needsYou: [] } }),
      form.fields.some((f) => f.id === "resume")
        ? api(`/api/ext/resume${$("resumeSelect").value ? `?id=${encodeURIComponent($("resumeSelect").value)}` : ""}`)
        : Promise.resolve({ ok: true, data: null }),
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
    attached.resume = resume.ok && resume.data && form.fields.some((f) => f.id === "resume") ? { ...resume.data, id: $("resumeSelect").value } : null;
    attached.cover = cover.ok && cover.data && coverFieldId ? { fileName: cover.data.fileName, base64: cover.data.base64, mimeType: "application/pdf" } : null;
    showAttached();
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
/** Saving needs a title and company: point the user at whichever is empty instead of failing. */
function missingJobDetail() {
  const empty = ["title", "company"].find((id) => !$(id).value.trim());
  if (!empty) return false;
  $("jobCard").scrollIntoView({ behavior: "smooth", block: "start" });
  $(empty).focus();
  $(empty).classList.add("needs");
  return empty === "title" ? "Add the job title below, then try again." : "Add the company name below, then try again.";
}

$("tailor").addEventListener("click", async () => {
  const missing = missingJobDetail();
  if (missing) {
    status($("tailorStatus"), missing, "err");
    return;
  }
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

/* ---------- Generate resume: reworded for this job, reviewed and edited here, used for its application ---------- */

let draft = null; // { key, jobId, title, company, resume, changes, realGaps, saved } for the job on this page
const DRAFTS_KEPT = 20;

function jobOnPage() {
  return { url: $("jobForm").dataset.url, title: $("title").value, company: $("company").value, location: $("location").value, description: $("description").value };
}

async function savedDraft(key) {
  const { drafts = {} } = await chrome.storage.local.get("drafts");
  return key ? drafts[key] || null : null;
}

/** Keep the draft (with the user's edits) so closing the panel doesn't lose it. */
async function keepDraft() {
  if (!draft?.key) return;
  const { drafts = {} } = await chrome.storage.local.get("drafts");
  drafts[draft.key] = { ...draft, at: Date.now() };
  const keep = Object.entries(drafts).sort((a, b) => b[1].at - a[1].at).slice(0, DRAFTS_KEPT);
  await chrome.storage.local.set({ drafts: Object.fromEntries(keep) });
}

let keepTimer = null;
function keepDraftSoon() {
  clearTimeout(keepTimer);
  keepTimer = setTimeout(keepDraft, 600);
}

async function showGenerateLabel() {
  const seq = readSeq;
  const saved = await savedDraft(jobKey($("jobForm").dataset.url));
  if (seq === readSeq) $("generate").textContent = saved ? "Open the resume you generated" : "Generate resume for this job";
}

const escapeHtml = (text) => String(text ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Word-level changes from `before` to `after`: [{ kind: "same" | "added" | "removed", text }]. */
function wordDiff(before, after) {
  const a = String(before || "").split(/\s+/).filter(Boolean);
  const b = String(after || "").split(/\s+/).filter(Boolean);
  // Words that differ only in punctuation or case ("nudges," / "nudges") count as unchanged.
  const key = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}%$₹+]/gu, "");
  const same = (x, y) => key(x) === key(y);
  const lcs = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) {
    lcs[i][j] = same(a[i], b[j]) ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  }
  const parts = [];
  const push = (kind, word) => {
    const last = parts[parts.length - 1];
    if (last?.kind === kind) last.text += ` ${word}`;
    else parts.push({ kind, text: word });
  };
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && same(a[i], b[j])) {
      push("same", b[j]); // as it reads now
      i++;
      j++;
    } else if (i < a.length && (j === b.length || lcs[i + 1][j] >= lcs[i][j + 1])) push("removed", a[i++]); // removed words read first
    else push("added", b[j++]);
  }
  return parts;
}

/** Show `el`'s text as track changes against `before`: new words in light blue, removed ones struck through. */
function showChanges(el, before, after) {
  if (before == null || before === after) {
    el.textContent = after;
    return;
  }
  el.replaceChildren();
  wordDiff(before, after).forEach((part, n) => {
    if (n) el.append(" ");
    if (part.kind === "same") el.append(part.text);
    else if (part.kind === "added") el.append(Object.assign(document.createElement("mark"), { className: "chg", textContent: part.text }));
    else {
      const gone = Object.assign(document.createElement("del"), { className: "gone", textContent: part.text });
      gone.contentEditable = "false";
      el.append(gone);
    }
  });
}

/** The line's text as it stands: what's on screen minus the struck-through words. */
function liveText(el) {
  const copy = el.cloneNode(true);
  copy.querySelectorAll("del").forEach((d) => d.remove());
  return copy.textContent.replace(/\s+/g, " ").trim();
}

/**
 * An editable line, shown as changes against `before` (the line in your profile resume; null when
 * unchanged). Plain text in and out: no line breaks, pasted formatting dropped. Changes are
 * redrawn when you leave the line, so your own edits show up too.
 */
function editable(tag, text, onEdit, { before = null } = {}) {
  const el = document.createElement(tag);
  el.contentEditable = "true";
  el.spellcheck = true;
  showChanges(el, before, text);
  el.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); el.blur(); } });
  el.addEventListener("paste", (e) => {
    e.preventDefault();
    document.execCommand("insertText", false, e.clipboardData.getData("text/plain").replace(/\s*\n\s*/g, " "));
  });
  el.addEventListener("input", () => onEdit(liveText(el)));
  el.addEventListener("blur", () => showChanges(el, before, liveText(el)));
  return el;
}

/**
 * Each line as it was in the profile resume, worked out from the changes (kept with the draft):
 * the summary, and by position every bullet and skill the generation changed ("" when it was added).
 */
function linesBefore({ resume, changes }) {
  let summary = resume.summary || "";
  for (const c of changes.filter((x) => x.section === "Summary")) {
    summary = c.type === "Addition" ? summary.replace(c.proposed, "").trim() : summary.replace(c.proposed, c.original);
  }
  const bullets = {};
  const skills = {};
  for (const c of changes) {
    if (c.section === "Experience") bullets[`${c.experienceIndex}:${c.bulletIndex}`] = c.type === "Addition" ? "" : c.original;
    if (c.section === "Skills") skills[c.skillIndex] = c.type === "Addition" ? "" : c.original;
  }
  return { summary, bullets, skills };
}

function edited() {
  draft.saved = false;
  status($("genUseStatus"), "");
  keepDraftSoon();
}

/** The reworded resume, laid out like a document: changes in light blue, every line editable. */
function renderDraft() {
  const { resume, changes, realGaps } = draft;
  $("genCard").hidden = false;
  $("genBody").hidden = false;
  status($("genStatus"), "");
  draft.before ||= linesBefore(draft);
  const before = draft.before;
  $("genIntro").innerHTML = changes.length
    ? `ResumeIQ changed ${changes.length} line${changes.length === 1 ? "" : "s"} for this job: new words in <span class="gen-key">light blue</span>, removed words <del class="gone">struck through</del>. Click any line to edit it.`
    : "Your resume already says what this job looks for in its words – there was nothing worth rewording. Click any line to edit it yourself.";
  $("genGapsBox").hidden = !realGaps.length;
  $("genGaps").replaceChildren(...realGaps.map((g) => Object.assign(document.createElement("li"), { textContent: g })));

  const doc = [];
  const head = document.createElement("div");
  head.append(Object.assign(document.createElement("div"), { className: "gen-name", textContent: resume.name || "" }));
  head.append(editable("div", resume.title || "", (t) => { resume.title = t; edited(); }));
  doc.push(head);

  if (resume.summary) {
    doc.push(Object.assign(document.createElement("h4"), { textContent: "Summary" }));
    doc.push(editable("div", resume.summary, (t) => { resume.summary = t; edited(); }, { before: before.summary }));
  }

  if ((resume.experience || []).length) doc.push(Object.assign(document.createElement("h4"), { textContent: "Experience" }));
  (resume.experience || []).forEach((role, i) => {
    const line = document.createElement("div");
    line.className = "gen-role";
    line.innerHTML = `${escapeHtml([role.role, role.company].filter(Boolean).join(" – "))} <span>${escapeHtml(role.period || "")}</span>`;
    const list = document.createElement("ul");
    (role.bullets || []).forEach((bullet, b) => {
      list.append(editable("li", bullet, (t) => { role.bullets[b] = t; edited(); }, { before: before.bullets[`${i}:${b}`] ?? null }));
    });
    doc.push(line, list);
  });

  if ((resume.skills || []).length) {
    doc.push(Object.assign(document.createElement("h4"), { textContent: "Skills" }));
    const skills = document.createElement("div");
    skills.className = "gen-skills";
    resume.skills.forEach((skill, k) => {
      skills.append(editable("span", skill, (t) => { resume.skills[k] = t; edited(); }, { before: before.skills[k] ?? null }));
    });
    doc.push(skills);
  }
  $("genDoc").replaceChildren(...doc);
  if (draft.saved) status($("genUseStatus"), "Saved as this job's resume – autofill attaches it when you apply.", "ok");
}

/** The resume to render: the draft, with skills or bullets the user emptied left out. */
function reviewedResume() {
  const resume = structuredClone(draft.resume);
  resume.skills = (resume.skills || []).filter((s) => String(s).trim());
  resume.experience = (resume.experience || []).map((e) => ({ ...e, bullets: (e.bullets || []).filter((b) => String(b).trim()) }));
  return resume;
}

async function generate() {
  const missing = missingJobDetail();
  if (missing) {
    status($("tailorStatus"), missing, "err");
    return;
  }
  const seq = readSeq;
  const job = jobOnPage();
  $("generate").disabled = true;
  $("genRedo").disabled = true;
  $("genCard").hidden = false;
  $("genBody").hidden = true;
  status($("genStatus"), "Rewording your resume for this job – this can take up to a minute…");
  $("genCard").scrollIntoView({ behavior: "smooth", block: "start" });
  const r = await api("/api/ext/generate-resume", { method: "POST", body: job });
  $("generate").disabled = false;
  $("genRedo").disabled = false;
  if (seq !== readSeq) return; // the user moved to another job meanwhile
  if (!r.ok) {
    status($("genStatus"), r.status === 0 ? "Couldn't reach ResumeIQ. Check your connection and try again." : r.data.error || "Couldn't generate the resume – please try again.", "err");
    return;
  }
  $("saveJob").textContent = "Saved ✓";
  draft = { key: jobKey(job.url), jobId: r.data.jobId, title: job.title, company: job.company, resume: r.data.resume, changes: r.data.changes, realGaps: r.data.realGaps, saved: false };
  draft.before = linesBefore(draft);
  await keepDraft();
  showGenerateLabel();
  renderDraft();
}

$("generate").addEventListener("click", async () => {
  const saved = await savedDraft(jobKey($("jobForm").dataset.url));
  if (!saved) return generate();
  draft = saved;
  renderDraft();
  $("genCard").scrollIntoView({ behavior: "smooth", block: "start" });
});

$("genRedo").addEventListener("click", () => {
  // Generating again replaces the draft and your edits: confirm with a second click.
  if ($("genRedo").dataset.armed !== "1") {
    $("genRedo").dataset.armed = "1";
    $("genRedo").textContent = "Click again – this replaces your edits";
    setTimeout(() => {
      delete $("genRedo").dataset.armed;
      $("genRedo").textContent = "Generate again";
    }, 4000);
    return;
  }
  delete $("genRedo").dataset.armed;
  $("genRedo").textContent = "Generate again";
  generate();
});

$("genClose").addEventListener("click", () => { $("genCard").hidden = true; });
$("genAssistant").addEventListener("click", () => $("tailor").click());

function generatedBody() {
  return { jobId: draft.jobId, title: draft.title, company: draft.company, resume: reviewedResume() };
}

$("genPreview").addEventListener("click", async () => {
  $("genPreview").disabled = true;
  status($("genUseStatus"), "Making the PDF…");
  const r = await api("/api/ext/generated-resume/pdf", { method: "POST", body: generatedBody() });
  $("genPreview").disabled = false;
  if (!r.ok) {
    status($("genUseStatus"), resumeError("make the PDF", r), "err");
    return;
  }
  status($("genUseStatus"), "");
  viewFile(r.data);
});

$("genUse").addEventListener("click", async () => {
  $("genUse").disabled = true;
  status($("genUseStatus"), "Saving it as this job's resume…");
  const r = await api("/api/ext/generated-resume/use", { method: "POST", body: generatedBody() });
  $("genUse").disabled = false;
  if (!r.ok) {
    status($("genUseStatus"), resumeError("save it as this job's resume", r), "err");
    return;
  }
  // Remembered so this job's application picks it, here or on the company's own site.
  const { generated = [] } = await chrome.storage.local.get("generated");
  const entry = { fileId: r.data.resume.id, jobKey: draft.key, company: draft.company, title: draft.title, at: Date.now() };
  await chrome.storage.local.set({ generated: [entry, ...generated.filter((g) => g.jobKey !== draft.key)].slice(0, 50) });
  draft.saved = true;
  await keepDraft();
  await loadResumes(false);
  $("resumeSelect").value = entry.fileId;
  updateResumeActions();
  status($("genUseStatus"), "Saved as this job's resume – autofill attaches it when you apply.", "ok");
});

/* On an application page: preselect the resume generated for this job, unless the user picked one here. */

let pageUrl = null; // the page the panel is showing
let pickedByHand = null; // the page where the user chose a resume themselves

const companyKey = (name) => String(name || "").toLowerCase()
  .replace(/\b(private|pvt|limited|ltd|inc|llc|corp|corporation|technologies|technology|labs|india)\b/g, "")
  .replace(/[^a-z0-9]/g, "");

/** The generated resume for the job on this page: same page as the job, else the same company (by name or in the address). */
async function generatedForPage(url) {
  const { generated = [] } = await chrome.storage.local.get("generated");
  const live = generated.filter((g) => resumes.some((f) => f.id === g.fileId));
  const exact = live.find((g) => g.jobKey === jobKey(url));
  if (exact) return exact;
  const company = companyKey($("company").value);
  let address = "";
  try {
    const u = new URL(url);
    address = companyKey(u.hostname + u.pathname);
  } catch {
    // not a URL
  }
  return live
    .filter((g) => companyKey(g.company).length >= 3 && (companyKey(g.company) === company || address.includes(companyKey(g.company))))
    .sort((a, b) => b.at - a.at)[0] || null;
}

async function pickGeneratedResume(url) {
  if (pickedByHand === url) return;
  const match = await generatedForPage(url);
  if (!match || $("resumeSelect").value === match.fileId) return;
  $("resumeSelect").value = match.fileId;
  updateResumeActions();
  status($("resumeStatus"), `Using the resume you generated for ${[match.company, match.title].filter(Boolean).join(" – ")}.`, "ok");
}

let coverFieldId = null; // the upload the cover letter went to on this page

/* ---------- What was attached on this page (shown after autofill, viewable) ---------- */

const attached = { resume: null, cover: null };

/** Open an attached file in a new tab – exactly the bytes that went into the form. */
function viewFile(file) {
  if (!file?.base64) return;
  const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: file.mimeType || "application/pdf" }));
  chrome.tabs.create({ url });
}

function showAttached() {
  const r = attached.resume;
  const c = attached.cover;
  $("attachedBox").hidden = !r && !c;
  if (r) {
    const label = resumes.find((f) => f.id === r.id)?.name;
    $("attachedResume").textContent = r.uploaded === false
      ? `generated from your profile · ${r.fileName}`
      : [label, r.fileName].filter(Boolean).join(" · ");
  }
  $("viewResume").hidden = !r;
  $("attachedCoverRow").hidden = !c;
  if (c) $("attachedCover").textContent = c.fileName;
}

$("viewResume").addEventListener("click", () => viewFile(attached.resume));
$("viewCover").addEventListener("click", () => viewFile(attached.cover));

/* ---------- Your resumes: uploaded files, the one to attach ---------- */

let resumes = [];
const GENERATED = ""; // the select's value for "generated from your profile"

/** What went wrong with a resume action, in words that say what failed and what to do. */
function resumeError(action, r) {
  if (r.status === 0) return `Couldn't ${action}: ResumeIQ can't be reached. Check your connection and try again.`;
  if (r.status === 400 || r.status === 401 || r.status === 409) return r.data.error || `Couldn't ${action}.`;
  return `Couldn't ${action}: something failed on ResumeIQ's side. Please try again in a minute.`;
}

async function loadResumes(keepSelection = true) {
  const r = await api("/api/ext/resumes");
  resumes = r.ok ? r.data.resumes : [];
  if (!r.ok) status($("resumeStatus"), `${resumeError("load your uploaded resumes", r)} Until then, autofill attaches the resume generated from your profile.`, "err");
  else if ($("resumeStatus").classList.contains("err")) status($("resumeStatus"), "");
  const previous = keepSelection ? $("resumeSelect").value : null;
  const options = resumes.map((f) => {
    const o = document.createElement("option");
    o.value = f.id;
    o.textContent = `${f.name}${f.is_default ? " (default)" : ""} – ${f.file_name}`;
    return o;
  });
  if (!resumes.length) options.push(Object.assign(document.createElement("option"), { value: GENERATED, textContent: "Generated from your ResumeIQ profile (upload yours for best results)" }));
  $("resumeSelect").replaceChildren(...options);
  const fallback = resumes.find((f) => f.is_default)?.id ?? GENERATED;
  $("resumeSelect").value = previous && resumes.some((f) => f.id === previous) ? previous : fallback;
  updateResumeActions();
}

function updateResumeActions() {
  const chosen = resumes.find((f) => f.id === $("resumeSelect").value);
  $("makeDefault").hidden = !chosen || chosen.is_default;
  $("removeResume").hidden = !chosen;
}

$("resumeSelect").addEventListener("change", () => {
  pickedByHand = pageUrl;
  updateResumeActions();
});
$("uploadResume").addEventListener("click", () => $("resumeFile").click());

$("resumeFile").addEventListener("change", async () => {
  const file = $("resumeFile").files[0];
  $("resumeFile").value = "";
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    status($("resumeStatus"), "That file is over 10 MB.", "err");
    return;
  }
  // Named after the file (pop-up prompts aren't reliable in side panels).
  const name = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 60) || "My resume";
  status($("resumeStatus"), "Uploading…");
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const r = await api("/api/ext/resumes", { method: "POST", body: { name, fileName: file.name, mimeType: file.type, base64 } });
  if (!r.ok) {
    status($("resumeStatus"), resumeError(`upload "${file.name}"`, r), "err");
    return;
  }
  await loadResumes(false);
  $("resumeSelect").value = r.data.resume.id;
  updateResumeActions();
  status($("resumeStatus"), `Uploaded "${name}". It will be attached as ${file.name}.`, "ok");
});

$("makeDefault").addEventListener("click", async () => {
  const id = $("resumeSelect").value;
  const r = await api(`/api/ext/resumes/${encodeURIComponent(id)}/default`, { method: "POST", body: {} });
  if (r.ok) await loadResumes();
  status($("resumeStatus"), r.ok ? "Default updated." : resumeError("change the default", r), r.ok ? "ok" : "err");
});

$("removeResume").addEventListener("click", async () => {
  const chosen = resumes.find((f) => f.id === $("resumeSelect").value);
  if (!chosen) return;
  // Confirm with a second click (confirm() dialogs aren't reliable in side panels).
  if ($("removeResume").dataset.armed !== chosen.id) {
    $("removeResume").dataset.armed = chosen.id;
    $("removeResume").textContent = "Click again to remove";
    setTimeout(() => {
      delete $("removeResume").dataset.armed;
      $("removeResume").textContent = "Remove";
    }, 4000);
    return;
  }
  delete $("removeResume").dataset.armed;
  $("removeResume").textContent = "Remove";
  const r = await api(`/api/ext/resumes/${encodeURIComponent(chosen.id)}`, { method: "DELETE" });
  if (r.ok) await loadResumes(false);
  status($("resumeStatus"), r.ok ? "Removed." : resumeError("remove it", r), r.ok ? "ok" : "err");
});

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
  if (ok) {
    attached.cover = { fileName: r.data.fileName, base64: r.data.base64, mimeType: "application/pdf" };
    showAttached();
  }
  status($("coverStatus"), ok ? "Edited letter attached." : "The upload box is gone – autofill the page again.", ok ? "ok" : "err");
});

for (const id of ["title", "company"]) $(id).addEventListener("input", () => $(id).classList.remove("needs"));

$("jobSummary").addEventListener("click", () => {
  const open = $("jobForm").classList.toggle("collapsed") === false;
  $("jobSummary").setAttribute("aria-expanded", String(open));
});

$("rescan").addEventListener("click", async () => {
  await layoutForPage();
  await readJob();
});
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
// Some sites open the form on the same page when Apply is clicked, and multi-page forms (Workday)
// move between steps without a new address: keep checking, and start each new step afresh.
let lastStep = null;
setInterval(async () => {
  if (!tabId || $("jobCard").hidden || document.hidden || $("autofill").disabled) return;
  try {
    const signal = await runInPage(formSignal);
    const onApplication = document.body.classList.contains("on-application");
    if (!!signal?.isApplication !== onApplication) await layoutForPage();
    if (signal?.isApplication && lastStep && signal.step !== lastStep) {
      clearAutofillResults();
      status($("applyStatus"), "New page of the form – click Autofill this application again.");
    }
    lastStep = signal?.isApplication ? signal.step : null;
  } catch {
    // page not readable
  }
}, 2500);
refresh();
