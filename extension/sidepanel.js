import { extractJob, readForm, fillForm } from "./pageScripts.js";

const $ = (id) => document.getElementById(id);
const api = (path, options) => chrome.runtime.sendMessage({ type: "api", path, options });
let tabId = null;
let savedJobId = null;

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

function showMatch(m) {
  $("matchCard").hidden = false;
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
  $("matchCard").hidden = true;
  savedJobId = null;
  status($("jobStatus"), "");
  $("saveJob").textContent = "Add to ResumeIQ";
  try {
    const job = await runInPage(extractJob);
    for (const key of ["title", "company", "location", "description"]) $(key).value = job?.[key] || "";
    $("jobForm").dataset.url = job?.url || "";
    if (!job?.title) status($("jobStatus"), "No job found on this page – fill in the details to save it anyway.");
  } catch (err) {
    status($("jobStatus"), `Can't read this page (${err.message})`, "err");
  }
}

async function refresh() {
  const tab = await activeTab();
  tabId = tab?.id;
  const auth = await chrome.runtime.sendMessage({ type: "auth:get" });
  $("who").textContent = auth.signedIn ? auth.email || "Signed in" : "";
  $("signedOut").hidden = auth.signedIn;
  $("openApp").onclick = () => chrome.tabs.create({ url: auth.appUrl });
  for (const id of ["jobCard", "applyCard"]) $(id).hidden = !auth.signedIn;
  if (auth.signedIn && /^https?:/.test(tab?.url || "")) await readJob();
}

$("jobForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("saveJob").disabled = true;
  status($("jobStatus"), "Saving…");
  const job = { url: $("jobForm").dataset.url, title: $("title").value, company: $("company").value, location: $("location").value, description: $("description").value };
  const saved = await api("/api/ext/jobs", { method: "POST", body: job });
  if (!saved.ok) {
    status($("jobStatus"), saved.data.error || "Couldn't save", "err");
    $("saveJob").disabled = false;
    return;
  }
  savedJobId = saved.data.jobId;
  status($("jobStatus"), "Saved to your ResumeIQ jobs. Checking your fit…", "ok");
  $("saveJob").textContent = "Saved ✓";
  const match = await api("/api/ext/match", { method: "POST", body: { jobId: savedJobId, ...job } });
  $("saveJob").disabled = false;
  if (match.ok) {
    showMatch(match.data);
    status($("jobStatus"), "Saved to your ResumeIQ jobs.", "ok");
  } else status($("jobStatus"), `Saved. Match score unavailable: ${match.data.error || "try again"}`, "err");
});

$("autofill").addEventListener("click", async () => {
  $("autofill").disabled = true;
  $("skipped").replaceChildren();
  try {
    status($("applyStatus"), "Reading the form…");
    const form = await runInPage(readForm);
    if (!form?.fields?.length) {
      status($("applyStatus"), "No application form found on this page. Open the job's Apply page and try again.", "err");
      return;
    }
    status($("applyStatus"), `Found ${form.fields.length} fields. Working out your answers…`);
    const [answers, resume] = await Promise.all([
      api("/api/ext/autofill", { method: "POST", body: { fields: form.fields, job: { title: $("title").value, company: $("company").value } } }),
      form.fields.some((f) => f.id === "resume") ? api("/api/ext/resume") : Promise.resolve({ ok: true, data: null }),
    ]);
    if (!answers.ok) {
      status($("applyStatus"), answers.data.error || "Couldn't work out answers", "err");
      return;
    }
    status($("applyStatus"), "Filling the form…");
    const result = await runInPage(fillForm, [{ fields: form.fields, answers: answers.data.answers, needsYou: answers.data.needsYou, resume: resume.ok ? resume.data : null }]);
    const left = result.skipped.length;
    status($("applyStatus"), `Filled ${result.filled} field${result.filled === 1 ? "" : "s"}${left ? ` · ${left} left for you (outlined in amber on the page)` : ""}. Review the page, then submit it yourself.`, "ok");
    $("skipped").replaceChildren(...result.skipped.map((s) => Object.assign(document.createElement("li"), { textContent: s })));
  } catch (err) {
    status($("applyStatus"), `Couldn't fill this page (${err.message})`, "err");
  } finally {
    $("autofill").disabled = false;
  }
});

$("rescan").addEventListener("click", readJob);
chrome.tabs.onActivated.addListener(refresh);
chrome.tabs.onUpdated.addListener((id, info) => { if (id === tabId && info.status === "complete") refresh(); });
chrome.runtime.onMessage.addListener((msg) => { if (msg.type === "auth:changed") refresh(); });
refresh();
