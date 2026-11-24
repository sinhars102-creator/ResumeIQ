/**
 * Resume LLM – prototype at /app/resume-llm (not linked from anywhere yet).
 *
 * A chat, Gemini-style: "Where should we start?" -> attach or paste a resume -> sign in right in the chat
 * (so the resume is saved) -> paste a job description -> suggestions arrive ONE AT A TIME as chat messages
 * (before/after, Apply / Skip / Change it); each decision brings the next. Questions ("have you worked
 * with UPI?") are answered by typing, and the answer comes back as an edit. Free-text requests work any time.
 *
 * Layout: phones show only the chat (sidebar behind the menu button, resume full-screen on tap); wide
 * screens show sidebar + chat + the resume panel. Chats are kept in this browser (localStorage).
 *
 * Server side and the honesty checks: server/tailorChat.js. Line ids and edits: src/tailorEdits.js.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase, loadProfile, saveProfile } from "./easyApply/supabaseClient.js";
import { extractResumeFromText, readResumeFileText, downloadResumePdf, SAMPLE_RESUME } from "./ResumeIQ.jsx";
import { finalResume, textAt, applyEdit, matchScore, scoreImpact, captureUndo, applyUndo, lineOrder } from "./tailorEdits.js";
import ResumeWorkspace from "./ResumeWorkspace.jsx";
import { isReady, finalText as finalTextFor } from "./workspaceText.js";
import { tokenizeForMatch } from "./matchScore.js";
import { reviewResume, CATEGORIES, normalizeContactField, setContactField } from "./resumeReview.js";
import { buildResumePdf, DEFAULT_PDF_FORMAT } from "./resumePdf.js";
import { checkRead } from "./readCheck.js";
import DownloadPaywall from "./DownloadPaywall.jsx";
import { limitState, mergeStores } from "./rllmSync.js";
import { track } from "./analytics.js";
import { trackSignUp } from "./googleAds.js";
import "./ResumeLLM.css";

const API_BASE = (import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:3001" : "")).replace(/\/$/, "");
const STORE_KEY = "riq_resume_llm_v1";
const MIN_RESUME_CHARS = 300;
const MIN_JD_CHARS = 200;

const SAMPLE_JD = `Senior Product Manager – Payments (Bengaluru)
We are looking for a Senior Product Manager to own our merchant payments experience. You will define the product roadmap, work closely with engineering and design, and use data to drive decisions.
Requirements:
- 5+ years of product management experience, ideally in fintech or payments
- Strong analytical skills: SQL, experimentation (A/B testing), defining and tracking KPIs
- Experience managing stakeholders across engineering, design, compliance and business teams
- Track record of shipping B2B products and growing adoption and revenue
- Experience with UPI, payment gateways or merchant onboarding is a plus
- Excellent written communication: PRDs, user stories, roadmaps`;

// Sourced: TheLadders eye-tracking study (2018) – about 7.4 seconds on the first screen of a resume.
const TIP = "Recruiters spend about 7 seconds on a first scan of a resume (Ladders eye-tracking study, 2018), so we'll start with what they see first.";

const Icon = {
  plus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>,
  mic: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>,
  send: <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 12 20 4l-4 16-4-7-8-1Z" /></svg>,
  menu: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>,
  newChat: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" /><path d="M17.5 3.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 8.5-8.5Z" /></svg>,
  close: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>,
};

// The editor's PDF: every bullet, and certifications (the job flow's PDF keeps 3 bullets per role).
// No bullet limit: the PDF flows onto more pages instead of silently dropping approved content.
const PDF_FORMAT = { ...DEFAULT_PDF_FORMAT, maxBullets: Infinity, sectionOrder: [...DEFAULT_PDF_FORMAT.sectionOrder, "certifications"] };
const pageCount = (resume) => {
  try {
    return buildResumePdf(finalResume(resume), null, PDF_FORMAT)?.getNumberOfPages() ?? null;
  } catch {
    return null;
  }
};
const GUIDED = ["job", "review"]; // suggestions that come one at a time
const catLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label || "";
const tone = (score) => (score >= 75 ? "good" : score >= 50 ? "ok" : "low");

/** "Kartly · bullet 2", "Summary", … – where on the resume a suggestion lands. */
function whereOf(resume, target, category) {
  const fixed = { C: "Contact details", T: "Headline", S: "Summary", K: "Skills", Z: "Certifications" }[target];
  if (fixed) return fixed;
  const m = /^E(\d+)(?:B(\d+))?$/.exec(target || "");
  if (m) {
    const role = resume?.experience?.[+m[1]] || {};
    const at = role.company || role.role || `Role ${+m[1] + 1}`;
    if (m[2] == null) return `${at} · new bullet`;
    const shown = (role.bullets || []).slice(0, +m[2] + 1).filter((b) => b != null).length;
    return `${at} · bullet ${shown}`;
  }
  return CATEGORIES.find((c) => c.id === category)?.label || "Whole resume";
}

/** Number suggestions top to bottom in reading order (pins), starting after `from`. */
function withPins(list, resume, from = 0) {
  return [...list]
    .sort((a, b) => lineOrder(a.edit?.target || a.target) - lineOrder(b.edit?.target || b.target))
    .map((x, i) => ({ ...x, pin: from + i + 1, where: x.where || whereOf(resume, x.edit?.target || x.target, x.category), status: "pending" }));
}

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const firstName = (r) => String(r?.name || "").trim().split(/\s+/)[0] || "";
const emailIn = (text) => (String(text || "").match(/[^\s@·|,;<>()]+@[^\s@·|,;<>()]+\.[a-z]{2,}/i) || [""])[0];

async function post(path, body) {
  const res = await fetch(`${API_BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function loadStore() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (s && Array.isArray(s.chats)) return s;
  } catch {
    // Unreadable or blocked storage: start fresh.
  }
  return { chats: [], activeId: null };
}
function saveStore(store) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    // Private mode or full storage: the chat still works, it just won't be kept.
  }
}

const newChat = (resume = null) => ({ id: uid(), title: "New chat", resume, jd: "", job: null, baseScore: null, suggestions: {}, queue: [], messages: [], updatedAt: Date.now() });

/** Sign in without leaving the chat: email -> 6-digit code. */
function SignInCard({ initialEmail, onSignedIn }) {
  const [email, setEmail] = useState(initialEmail || "");
  const [stage, setStage] = useState("email");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function sendCode(e) {
    e?.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    setError("");
    const { error: err } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
    setBusy(false);
    track("signin_email_submitted", { where: "resume_llm", result: err ? "error" : "sent" });
    if (err) return setError(/rate|seconds/i.test(err.message) ? "Please wait a moment before asking for another code." : "Couldn't send the code. Check the email and try again.");
    setStage("code");
  }

  async function verify(value) {
    if (busy) return;
    setBusy(true);
    setError("");
    const { data, error: err } = await supabase.auth.verifyOtp({ email: email.trim(), token: value, type: "email" });
    setBusy(false);
    track("signin_code_entered", { where: "resume_llm", result: err || !data?.session ? "wrong_or_expired" : "correct" });
    if (err || !data?.session) return setError("That code didn't work. Check it, or send a new one.");
    trackSignUp(data.session.user);
    onSignedIn(data.session);
  }

  useEffect(() => {
    if (stage !== "code" || busy || code.length < 6) return undefined;
    const t = setTimeout(() => verify(code), code.length >= 8 ? 0 : 700);
    return () => clearTimeout(t);
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="rl-card rl-signin">
      {stage === "email" ? (
        <form onSubmit={sendCode}>
          <label htmlFor="rl-email">Your email</label>
          <div className="rl-row">
            <input id="rl-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            <button type="submit" className="rl-btn rl-btn-primary" disabled={busy}>{busy ? "Sending…" : "Send code"}</button>
          </div>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); if (code.length >= 6) verify(code); }}>
          <label htmlFor="rl-code">Enter the 6-digit code sent to <b>{email}</b></label>
          <div className="rl-row">
            <input id="rl-code" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={8} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" />
            <button type="submit" className="rl-btn rl-btn-primary" disabled={busy || code.length < 6}>{busy ? "Checking…" : "Verify"}</button>
          </div>
          <button type="button" className="rl-link" onClick={() => { setStage("email"); setCode(""); }}>Use a different email</button>
        </form>
      )}
      {error && <p className="rl-error" role="alert">{error}</p>}
    </div>
  );
}

/**
 * The resume as a page. Lines with a recommendation carry its numbered pointer; the open recommendation
 * (`active`) is shown in place – old text struck through, the proposed text highlighted – so it's clear
 * exactly what will change.
 */
function ResumePaper({ resume, markers, flash, onMarker, active }) {
  const r = resume || {};
  const edit = active?.edit || null;
  const at = active ? active.edit?.target || active.target : null;
  const marks = (line) =>
    (markers.get(line) || []).map((s) => (
      <button key={s.id} type="button" className={`rl-marker rl-marker-${s.status === "applied" ? "done" : s.question ? "ask" : s.priority}${active?.id === s.id ? " rl-marker-active" : ""}`} onClick={() => onMarker(s.id)} aria-label={`Recommendation ${s.pin ?? s.n}: ${s.title}`}>
        {s.status === "applied" ? "✓" : s.pin ?? s.n}
      </button>
    ));
  const cls = (line) => {
    const open = (markers.get(line) || []).find((s) => s.status === "pending");
    return `rl-line${open ? ` rl-line-${open.question ? "ask" : open.priority}` : ""}${at === line ? " rl-line-active" : ""}${flash === line ? " rl-line-flash" : ""}`;
  };
  // A line's text, or – when the open recommendation replaces or removes it – the before/after.
  const text = (line, value) => {
    if (!edit || edit.target !== line) return value;
    if (edit.op === "replace") return <><del>{value}</del> <ins>{edit.after}</ins></>;
    if (edit.op === "remove") return <del>{value}</del>;
    return value;
  };
  const skills = () => {
    const list = r.skills || [];
    if (edit?.op === "set_skills") {
      const keep = new Set(edit.skills.map((x) => x.toLowerCase()));
      return list.map((x, i) => <span key={i}>{i ? " · " : ""}{keep.has(String(x).toLowerCase()) ? x : <del>{x}</del>}</span>);
    }
    const added = edit?.op === "add_skills" ? edit.skills : [];
    return <>{list.join(" · ")}{added.map((x) => <span key={x}> · <ins>{x}</ins></span>)}</>;
  };
  const certs = r.certifications || [];
  const addedCerts = edit?.op === "add_certifications" ? edit.items : [];
  return (
    <article className="rl-paper">
      <h1>{r.name}</h1>
      <p data-line="T" className={`${cls("T")} rl-p-title`}>{text("T", r.title) || <span className="rl-p-empty">No headline</span>}{marks("T")}</p>
      {(r.contact || at === "C") && <p data-line="C" className={`${cls("C")} rl-p-contact`}>{text("C", r.contact)}{marks("C")}</p>}
      {(r.summary || at === "S") && (
        <section>
          <h2>Summary</h2>
          <p data-line="S" className={cls("S")}>{r.summary ? text("S", r.summary) : <ins>{edit?.after}</ins>}{marks("S")}</p>
        </section>
      )}
      {(r.experience || []).length > 0 && (
        <section>
          <h2>Experience</h2>
          {r.experience.map((e, i) => (
            <div key={i} className="rl-p-role">
              <div data-line={`E${i}`} className={`${cls(`E${i}`)} rl-p-role-head`}>
                <span><b>{e.role}</b>{e.company ? ` · ${e.company}` : ""}{marks(`E${i}`)}</span>
                <span className="rl-p-period">{e.period}</span>
              </div>
              <ul>
                {(e.bullets || []).map((b, j) => (b == null ? null : <li key={j} data-line={`E${i}B${j}`} className={cls(`E${i}B${j}`)}>{text(`E${i}B${j}`, b)}{marks(`E${i}B${j}`)}</li>))}
                {edit?.op === "add_bullet" && edit.target === `E${i}` && <li className="rl-line rl-line-active"><ins>{edit.after}</ins></li>}
              </ul>
            </div>
          ))}
        </section>
      )}
      {(r.education || []).length > 0 && (
        <section>
          <h2>Education</h2>
          {r.education.map((ed, i) => <p key={i}>{[ed.degree, ed.school, ed.year].filter(Boolean).join(" · ")}</p>)}
        </section>
      )}
      {((r.skills || []).length > 0 || at === "K") && (
        <section>
          <h2>Skills</h2>
          <p data-line="K" className={cls("K")}>{skills()}{marks("K")}</p>
        </section>
      )}
      <section>
        <h2>Certifications</h2>
        <p data-line="Z" className={cls("Z")}>
          {certs.join(" · ")}
          {addedCerts.map((x, i) => <span key={x}>{certs.length || i ? " · " : ""}<ins>{x}</ins></span>)}
          {!certs.length && !addedCerts.length && <span className="rl-p-empty">None added yet</span>}
          {marks("Z")}
        </p>
      </section>
    </article>
  );
}

export default function ResumeLLM() {
  const [store, setStore] = useState(loadStore);
  const [session, setSession] = useState(undefined); // undefined while checking
  const [accountResume, setAccountResume] = useState(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState(null); // { kind: "answer" | "change", sid } – what the next message is for
  const [blankValues, setBlankValues] = useState({});
  const [drawer, setDrawer] = useState(false); // phone: sidebar
  const [resumeOpen, setResumeOpen] = useState(false); // the resume full screen (the pane beside the chat is always there)
  const [flash, setFlash] = useState(null);
  const [download, setDownload] = useState(false);
  const [accountMenu, setAccountMenu] = useState(false);
  const [listening, setListening] = useState(false);
  const fileRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const resumeRef = useRef(null);
  const pendingResumeRef = useRef(null); // a resume read before signing in

  // ---- account ----
  useEffect(() => {
    track("rllm_opened");
    if (!supabase) return void setSession(null);
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session || null);
      if (data.session) setAccountResume((await loadProfile(data.session.user.id).catch(() => null))?.resume || null);
    });
  }, []);

  // ---- chats ----
  const chat = store.chats.find((c) => c.id === store.activeId) || null;
  useEffect(() => saveStore(store), [store]);

  // M3: a signed-in user's chats also live on the server, so their work follows them to another device.
  // On sign-in the saved chats are merged in (the newer copy of a chat wins); after that changes are saved a moment after they stop.
  const syncedRef = useRef(false);
  const accessToken = session?.access_token || "";
  useEffect(() => {
    syncedRef.current = false;
    if (!accessToken) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/rllm/state`, { headers: { Authorization: `Bearer ${accessToken}` } });
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && data.state) setStore((local) => mergeStores(local, data.state));
      } catch {
        // Offline or the server is down: the chats still work from this browser.
      } finally {
        if (!cancelled) syncedRef.current = true;
      }
    })();
    return () => { cancelled = true; };
  }, [accessToken]);
  useEffect(() => {
    if (!accessToken || !syncedRef.current) return undefined;
    const timer = setTimeout(() => {
      fetch(`${API_BASE}/api/rllm/state`, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ state: limitState(store) }) }).catch(() => {});
    }, 2500);
    return () => clearTimeout(timer);
  }, [store, accessToken]);

  /** Change the active chat (creating one on first use). */
  function update(fn) {
    setStore((s) => {
      let current = s.chats.find((c) => c.id === s.activeId);
      let chats = s.chats;
      if (!current) {
        current = newChat(accountResume);
        chats = [current, ...chats];
      }
      const next = { ...fn(current), updatedAt: Date.now() };
      return { chats: chats.map((c) => (c.id === current.id ? next : c)), activeId: current.id };
    });
  }
  const say = (msg) => update((c) => ({ ...c, messages: [...c.messages, { id: uid(), ...msg }] }));

  function startNewChat() {
    const c = newChat(accountResume || chat?.resume || null);
    setStore((s) => ({ chats: [c, ...s.chats.filter((x) => x.messages.length)], activeId: c.id }));
    setDrawer(false);
    setMode(null);
    track("rllm_new_chat");
  }

  const resume = chat?.resume || accountResume || null;
  const jd = chat?.jd || "";
  const job = chat?.job || null;
  const suggestions = useMemo(() => chat?.suggestions || {}, [chat]);
  const messages = useMemo(() => chat?.messages || [], [chat]);
  const score = resume && jd ? matchScore(resume, { title: job?.title, jd }) : null;
  const improving = chat?.mode === "improve";
  const pages = useMemo(() => (resume ? pageCount(resume) : null), [resume]);
  // Live: recomputed from the resume as fixes are applied.
  const review = useMemo(() => (resume ? reviewResume(resume, { pages }) : null), [resume, pages]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, busy]);

  // ---- resume in ----
  async function saveToAccount(parsed, s = session) {
    if (!s || parsed === SAMPLE_RESUME) return;
    try {
      const [first, ...rest] = String(parsed.name || "").trim().split(/\s+/);
      const existing = await loadProfile(s.user.id).catch(() => null);
      await saveProfile(s.user.id, { resume: parsed, email: existing?.email || s.user.email, first_name: existing?.first_name || first || undefined, last_name: existing?.last_name || rest.join(" ") || undefined });
      setAccountResume(parsed);
    } catch (e) {
      console.warn("Couldn't save the resume to the account:", e.message);
    }
  }

  function resumeLoaded(parsed, s = session) {
    update((c) => ({ ...c, resume: parsed }));
    saveToAccount(parsed, s);
    const roles = (parsed.experience || []).length;
    say({ role: "bot", kind: "resume", text: `Got it${firstName(parsed) ? `, ${firstName(parsed)}` : ""}. ${parsed.title || "Your resume"} · ${roles} role${roles === 1 ? "" : "s"} · ${(parsed.skills || []).length} skills${s && parsed !== SAMPLE_RESUME ? " – saved to your account." : "."}` });
    say({ role: "bot", kind: "choose", text: "What would you like to do?" });
  }

  async function readResume(fileOrText) {
    const isText = typeof fileOrText === "string";
    // A new resume starts over: back to the chat, no suggestions for the old one.
    update((c) => ({ ...c, workspace: false, mode: null, suggestions: {}, queue: [], jd: "", job: null }));
    say({ role: "user", ...(isText ? { text: `${fileOrText.slice(0, 160)}${fileOrText.length > 160 ? "…" : ""}`, note: "Pasted resume" } : { file: fileOrText.name }) });
    setBusy(true);
    const started = Date.now();
    track("rllm_upload_started", { pasted: isText, type: isText ? "text" : /\.pdf$/i.test(fileOrText.name || "") ? "pdf" : "other" });
    try {
      const text = isText ? fileOrText : await readResumeFileText(fileOrText);
      const parsed = await extractResumeFromText(text);
      track("rllm_resume_read", { seconds: Math.round((Date.now() - started) / 1000), pasted: isText });
      // M2: compare what the file said with what we kept, and say so when something looks lost.
      const check = checkRead(text, parsed);
      if (!check.ok) {
        track("rllm_read_check_flagged", { emails: check.missing.emails.length, links: check.missing.links.length, phones: check.missing.phones.length, years: check.missing.years.length, numbers: check.missing.numbers.length, lines: check.missing.lines.length });
        say({ role: "bot", text: `Heads-up: I may have missed some of what's in your file – ${check.summary}. Check your resume on the left. You can tell me anything that's missing here in the chat, or paste the text of the resume instead.` });
      }
      if (supabase && !session) {
        pendingResumeRef.current = parsed;
        say({ role: "bot", kind: "signin", text: `I've read your resume${firstName(parsed) ? `, ${firstName(parsed)}` : ""}. Sign in so it's saved – you won't have to upload it again for the next job.`, email: emailIn(parsed.contact) });
        track("signin_wall_shown", { at: "resume_llm" });
      } else {
        resumeLoaded(parsed);
      }
    } catch (e) {
      track("rllm_resume_read_failed", { pasted: isText });
      say({ role: "bot", text: `I couldn't read that resume (${e.message}). Try another file, or paste the text.` });
    } finally {
      setBusy(false);
    }
  }

  function onSignedIn(s) {
    track("rllm_signed_in");
    setSession(s);
    const parsed = pendingResumeRef.current;
    pendingResumeRef.current = null;
    update((c) => ({ ...c, messages: c.messages.map((m) => (m.kind === "signin" ? { ...m, done: true } : m)) }));
    say({ role: "user", text: `Signed in as ${s.user.email}` });
    if (parsed) resumeLoaded(parsed, s);
  }

  // ---- job description -> suggestions, one at a time ----
  async function readJob(text) {
    say({ role: "user", text: `${text.slice(0, 220)}${text.length > 220 ? "…" : ""}`, note: "Job description" });
    setBusy(true);
    const started = Date.now();
    try {
      const data = await post("/api/tailor/suggest", { resume, jd: text });
      const before = matchScore(resume, { title: data.jobTitle, jd: text });
      const all = {};
      const ordered = withPins(data.suggestions.map((s) => ({ ...s, source: "job" })), resume);
      ordered.forEach((s) => (all[s.id] = s));
      const must = ordered.filter((s) => s.priority === "must").length;
      update((c) => ({
        ...c,
        resume: c.resume || resume,
        mode: "tailor",
        jd: text,
        job: { title: data.jobTitle, company: data.company },
        title: [data.jobTitle, data.company].filter(Boolean).join(" · ") || "Tailored resume",
        baseScore: before,
        suggestions: all,
        queue: [],
        pinCount: ordered.length,
        original: c.resume || resume,
        workspace: true,
      }));
      say({ role: "bot", text: `${data.intro || ""}\n\nMatch now: ${before ?? "–"}%. I have ${ordered.length} change${ordered.length === 1 ? "" : "s"}${must ? ` – ${must} must-fix` : ""}. ${TIP}`.trim() });
      track("rllm_suggestions", { count: ordered.length, must, questions: ordered.filter((s) => s.question).length, seconds: Math.round((Date.now() - started) / 100) / 10, score: before });
      track("tailor_viewed", { suggestion_count: ordered.length, base_score: before, mode: "tailor", layout: window.matchMedia("(max-width: 899px)").matches ? "mobile" : "desktop" });
    } catch (e) {
      say({ role: "bot", text: `I couldn't read that job just now (${e.message}). Please try again.` });
    } finally {
      setBusy(false);
    }
  }

  /**
   * Post the next queued job suggestion, or the wrap-up when none are left. Decided inside the state
   * update so it always sees the latest decisions, and never posts a second one while one is open.
   */
  function showNext() {
    update((c) => {
      const list = Object.values(c.suggestions).filter((x) => GUIDED.includes(x.source));
      if (!list.length || list.some((x) => x.status === "pending" || x.status === "requested")) return c;
      const next = c.queue.find((id) => c.suggestions[id]?.status === "queued");
      if (!next) {
        if (c.messages.some((m) => m.kind === "done")) return c;
        return { ...c, messages: [...c.messages, { id: uid(), role: "bot", kind: "done" }] };
      }
      // Improve mode: a short header when moving into a new category.
      const cat = c.suggestions[next].category;
      const header = cat && cat !== c.lastCategory ? [{ id: uid(), role: "bot", kind: "category", category: cat }] : [];
      // Each recommendation gets the pointer number shown on the resume when it appears.
      const pin = (c.pinCount || 0) + 1;
      return {
        ...c,
        pinCount: pin,
        lastCategory: cat || c.lastCategory,
        suggestions: { ...c.suggestions, [next]: { ...c.suggestions[next], status: "pending", pin } },
        messages: [...c.messages, ...header, { id: uid(), role: "bot", kind: "suggestion", sid: next }],
      };
    });
  }

  function filled(s) {
    const values = blankValues[s.id] || [];
    let i = 0;
    return s.edit.after.replace(/\[number\]/g, () => (values[i++] || "").trim() || "[number]");
  }

  function decide(s, action) {
    if (s.status !== "pending") return;
    if (action === "apply") {
      if (s.edit.op !== "add_skills" && textAt(resume, s.edit.target) == null) return;
      const after = s.edit.after != null ? filled(s) : undefined;
      if (after?.includes("[number]")) return;
      const was = score;
      const nextResume = applyEdit(resume, s.edit, after);
      const now = jd ? matchScore(nextResume, { title: job?.title, jd }) : null;
      const strengthNow = improving ? reviewResume(nextResume, { pages: pageCount(nextResume) }).overall : null;
      const strengthWas = improving ? review?.overall : null;
      update((c) => ({ ...c, resume: nextResume, suggestions: { ...c.suggestions, [s.id]: { ...s, status: "applied" } } }));
      say({ role: "user", text: "Apply", small: true });
      say({ role: "bot", text: `✓ Applied${now != null && was != null && now !== was ? ` · match ${was}% → ${now}%` : ""}${strengthNow != null && strengthWas != null && strengthNow !== strengthWas ? ` · strength ${strengthWas} → ${strengthNow}` : ""}.`, small: true });
      setFlash(s.edit.target);
      setTimeout(() => setFlash(null), 1600);
      track("rllm_applied", { priority: s.priority, op: s.edit.op, source: s.source });
    } else {
      update((c) => ({ ...c, suggestions: { ...c.suggestions, [s.id]: { ...s, status: "skipped" } } }));
      say({ role: "user", text: "Skip", small: true });
      track("rllm_skipped", { priority: s.priority, question: !!s.question, source: s.source });
    }
    // Answering a job question or changing a job suggestion: its replacement counts for it.
    const jobItem = GUIDED.includes(s.source) || GUIDED.includes(suggestions[s.parent]?.source);
    if (jobItem) showNext();
  }

  /** A different version of a suggested rewrite, straight away. The original stays if there's no better one. */
  async function regenerate(s) {
    if (busy || !s.edit) return;
    setBusy(true);
    track("rllm_regenerate", { category: s.category || null, source: s.source });
    try {
      const data = await post("/api/tailor/chat", {
        resume,
        jd,
        jobTitle: job?.title || "",
        history: [],
        message: `Write a different version of line ${s.edit.target} (currently: "${textAt(resume, s.edit.target)}"). Don't repeat this earlier suggestion: "${s.edit.after}". It should fix: ${s.why || s.title}. Same facts only.`,
      });
      const alt = (data.suggestions || []).find((x) => x.edit?.target === s.edit.target && x.edit.after !== s.edit.after);
      if (!alt) {
        say({ role: "bot", text: "That's the best honest version I can write without more details. Apply it, skip it, or tell me what to change." });
        return;
      }
      const card = { ...alt, title: s.title, why: s.why, category: s.category, priority: s.priority, n: s.n, pin: s.pin, status: "pending", source: "chat", parent: s.parent || s.id };
      update((c) => ({
        ...c,
        suggestions: { ...c.suggestions, [s.id]: { ...c.suggestions[s.id], status: "replaced" }, [card.id]: card },
        messages: [...c.messages, { id: uid(), role: "bot", text: "Here's another version:", small: true }, { id: uid(), role: "bot", kind: "suggestion", sid: card.id }],
      }));
    } catch (e) {
      say({ role: "bot", text: `Couldn't get another version (${e.message}).` });
    } finally {
      setBusy(false);
    }
  }

  function startAnswer(s, kind) {
    setMode({ kind, sid: s.id });
    track(kind === "answer" ? "rllm_answer_started" : "rllm_change_started");
    setTimeout(() => inputRef.current?.focus(), 30);
  }

  // ---- chat ----
  async function send(raw, { parent = null } = {}) {
    const text = String(raw ?? input).trim();
    if (!text || busy) return;
    setInput("");
    const m = parent ? { kind: "action", sid: parent } : mode;
    setMode(null);
    if (!resume) {
      if (text.length >= MIN_RESUME_CHARS) return readResume(text);
      say({ role: "user", text });
      say({ role: "bot", text: "Let's start with your resume: attach it with + or paste its full text here." });
      return;
    }
    if (!jd && (!m || m.kind === "paste")) {
      if (/^https?:\/\/\S+$/i.test(text)) {
        say({ role: "user", text });
        say({ role: "bot", text: "Reading job links is coming soon. For now, open the job, copy the whole description, and paste it here." });
        return;
      }
      if (text.length >= MIN_JD_CHARS) return readJob(text);
    }
    say({ role: "user", text });
    // Contact details (email, phone, city, LinkedIn): set in code, not by the AI – the typed value is cleaned
    // up (spelling of the city, phone format) and only the essential part is kept.
    const asked = m?.kind === "answer" ? suggestions[m.sid] : null;
    if (asked?.field) {
      const value = normalizeContactField(asked.field, text);
      const label = { email: "email", phone: "phone number", location: "city", linkedin: "LinkedIn link" }[asked.field];
      if (!value) {
        say({ role: "bot", text: `I couldn't find a ${label} in that. Try again – e.g. ${{ email: "name@gmail.com", phone: "+91 98765 43210", location: "Bangalore", linkedin: "linkedin.com/in/yourname" }[asked.field]}.` });
        setMode(m);
        return;
      }
      const nextResume = { ...resume, contact: setContactField(resume.contact, asked.field, value) };
      update((c) => ({ ...c, resume: nextResume, suggestions: { ...c.suggestions, [asked.id]: { ...asked, status: "applied" } } }));
      say({ role: "bot", text: `✓ ${label[0].toUpperCase()}${label.slice(1)} set to ${value}.`, small: true });
      setFlash("C");
      setTimeout(() => setFlash(null), 1600);
      track("rllm_contact_set", { field: asked.field });
      showNext();
      return;
    }
    setBusy(true);
    track("rllm_chat_sent", { mode: m?.kind || "free", has_jd: !!jd });
    try {
      const target = m ? suggestions[m.sid] : null;
      const history = messages.filter((x) => x.text && !x.small && !x.note).slice(-10).map((x) => ({ role: x.role, text: x.text }));
      const body = { resume, jd, jobTitle: job?.title || "", history, message: text };
      if (m?.kind === "answer") body.answerTo = target.question;
      if (m?.kind === "change") body.message = `Change suggestion "${target.title}" (line ${target.edit?.target}: "${target.edit?.after}"). My request: ${text}`;
      const data = await post("/api/tailor/chat", body);
      const base = Object.keys(suggestions).length;
      const cards = (data.suggestions || []).map((s, i) => ({ ...s, n: base + i + 1, status: "pending", source: "chat", parent: m?.sid || null }));
      update((c) => {
        const all = { ...c.suggestions };
        let pinCount = c.pinCount || 0;
        cards.forEach((s, i) => (all[s.id] = { ...s, pin: m?.sid && i === 0 ? c.suggestions[m.sid]?.pin ?? ++pinCount : ++pinCount }));
        if (m?.sid) all[m.sid] = { ...all[m.sid], status: m.kind === "answer" ? "answered" : m.kind === "action" ? "done" : "replaced" };
        return { ...c, pinCount, suggestions: all, messages: [...c.messages, { id: uid(), role: "bot", text: data.reply }, ...cards.map((s) => ({ id: uid(), role: "bot", kind: "suggestion", sid: s.id }))] };
      });
      // Nothing to apply from an answer: move on to the next job suggestion.
      if (m?.sid && !cards.length && GUIDED.includes(target?.source)) showNext();
    } catch (e) {
      say({ role: "bot", text: `Sorry, that didn't work (${e.message}). Please try again.` });
    } finally {
      setBusy(false);
    }
  }

  // ---- voice ----
  function listen() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "en-IN";
    rec.interimResults = false;
    rec.onresult = (e) => setInput((v) => `${v}${v ? " " : ""}${e.results[0][0].transcript}`);
    rec.onend = () => setListening(false);
    setListening(true);
    track("rllm_voice_used");
    rec.start();
  }
  const canListen = typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  // ---- resume markers ----
  const markers = useMemo(() => {
    const map = new Map();
    for (const s of Object.values(suggestions)) {
      const t = s.edit?.target || s.target;
      if (!t || !["pending", "applied"].includes(s.status)) continue;
      if (!map.has(t)) map.set(t, []);
      map.get(t).push(s);
    }
    return map;
  }, [suggestions]);

  // The open recommendation: the newest one still waiting for a decision. The resume scrolls to its line.
  const active = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const x = messages[i].kind === "suggestion" ? suggestions[messages[i].sid] : null;
      if (x?.status === "pending") return x;
    }
    return null;
  }, [messages, suggestions]);
  const paneRef = useRef(null);
  useEffect(() => {
    const line = active?.edit?.target || active?.target;
    if (!line) return;
    const t = setTimeout(() => {
      for (const root of [paneRef.current, resumeRef.current]) root?.querySelector(`[data-line="${line}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    return () => clearTimeout(t);
  }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- scroll once per newly opened recommendation

  function jumpToMessage(sid) {
    setResumeOpen(false);
    setTimeout(() => document.querySelector(`[data-sid="${sid}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  }
  function showLine(s) {
    const line = s.edit?.target || s.target;
    const el = paneRef.current?.querySelector(`[data-line="${line}"]`);
    if (el && paneRef.current.offsetParent) return el.scrollIntoView({ behavior: "smooth", block: "center" });
    setResumeOpen(true);
    setTimeout(() => resumeRef.current?.querySelector(`[data-line="${s.edit?.target || s.target}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
  }

  /** Sign out and start over signed out, on this page (chats in this browser are cleared). */
  async function signOut(where) {
    track("signed_out", { location: "resume_llm", where });
    await supabase?.auth.signOut();
    saveStore({ chats: [], activeId: null });
    window.location.replace(window.location.pathname);
  }

  /** "Sign in" from the top bar: the same email -> code card, in the chat. */
  function askSignIn() {
    say({ role: "bot", kind: "signin", text: "Sign in with your email – we'll send you a 6-digit code. Your resume and edits are saved to your account.", email: emailIn(resume?.contact) });
    track("signin_wall_shown", { at: "resume_llm_topbar" });
  }

  function trySampleResume() {
    say({ role: "user", text: "Use a sample resume" });
    track("rllm_sample_resume");
    if (supabase && !session) {
      pendingResumeRef.current = SAMPLE_RESUME;
      say({ role: "bot", kind: "signin", text: "Here's a sample resume to try. Sign in to continue – it's the same step that saves your own resume.", email: "" });
    } else {
      resumeLoaded(SAMPLE_RESUME);
    }
  }

  // ---- review workspace (after suggestions are ready) ----
  const [wsStatus, setWsStatus] = useState("");
  const finalTextOf = (x) => finalTextFor(x, blankValues[x.id]);
  const wsSet = (id, patch) => update((c) => ({ ...c, suggestions: { ...c.suggestions, [id]: { ...c.suggestions[id], ...patch } } }));
  const flashLine = (line) => {
    setFlash(line);
    setTimeout(() => setFlash(null), 1300);
  };
  /** New suggestions from the chat (answers, "do it", ask): pinned after the existing ones. */
  function addCards(c, cards) {
    const pinned = withPins(cards.map((x) => ({ ...x, source: "chat" })), c.resume, c.pinCount || 0);
    const all = { ...c.suggestions };
    pinned.forEach((x) => (all[x.id] = x));
    return { ...c, suggestions: all, pinCount: (c.pinCount || 0) + pinned.length };
  }
  async function chatFor(message, extra = {}) {
    const history = [];
    return post("/api/tailor/chat", { resume, jd, jobTitle: job?.title || "", history, message, ...extra });
  }
  const scoreNow = (r) => (improving ? reviewResume(r, { pages }).overall : matchScore(r, { title: job?.title, jd }));

  const act = {
    opened: (id, from) => track("suggestion_opened", { suggestion_id: id, type: suggestions[id]?.category || suggestions[id]?.source, source: from }),
    apply(id, text) {
      const s = suggestions[id];
      if (!s?.edit) return;
      update((c) => {
        const cur = c.suggestions[id];
        const undo = captureUndo(c.resume, cur.edit);
        return { ...c, resume: applyEdit(c.resume, cur.edit, text ?? cur.edit.after), suggestions: { ...c.suggestions, [id]: { ...cur, status: "applied", undo, appliedText: text ?? cur.edit.after ?? null } } };
      });
      flashLine(s.edit.target);
      setWsStatus(`Applied to ${s.where}`);
      track("suggestion_applied", { suggestion_id: id, type: s.category || s.source, edited: s.custom != null, had_input: /\[number\]/.test(s.edit.after || ""), score_after: scoreNow(applyEdit(resume, s.edit, text ?? s.edit.after)) });
    },
    undo(id) {
      const s = suggestions[id];
      update((c) => ({ ...c, resume: applyUndo(c.resume, c.suggestions[id].undo), suggestions: { ...c.suggestions, [id]: { ...c.suggestions[id], status: "pending", undo: null } } }));
      flashLine(s.edit?.target);
      setWsStatus(`Undid change to ${s.where}`);
      track("suggestion_undone", { suggestion_id: id });
    },
    dismiss(id) {
      wsSet(id, { status: "dismissed" });
      setWsStatus(`Dismissed suggestion for ${suggestions[id].where}`);
      track("suggestion_dismissed", { suggestion_id: id, type: suggestions[id].category || suggestions[id].source });
    },
    restore(id) {
      wsSet(id, { status: "pending" });
    },
    reset() {
      update((c) => ({
        ...c,
        resume: c.original || c.resume,
        suggestions: Object.fromEntries(Object.entries(c.suggestions).map(([k, x]) => [k, x.status === "applied" || x.status === "dismissed" ? { ...x, status: "pending", undo: null } : x])),
      }));
      setWsStatus("Reset to your original resume");
      track("tailor_reset");
    },
    applyAll() {
      // Decide outside the state update (React may run an update function twice in development).
      const ready = [];
      const waiting = [];
      Object.values(suggestions)
        .filter((x) => x.status === "pending" && x.edit && !x.question && !x.action)
        .sort((a, b) => a.pin - b.pin)
        .forEach((x) => (isReady(x, blankValues[x.id]) ? ready.push({ id: x.id, text: finalTextOf(x) }) : waiting.push(x.pin)));
      update((c) => {
        let res = c.resume;
        const all = { ...c.suggestions };
        ready.forEach(({ id, text }) => {
          const x = all[id];
          const undo = captureUndo(res, x.edit);
          res = applyEdit(res, x.edit, text ?? x.edit.after);
          all[id] = { ...x, status: "applied", undo, appliedText: text ?? null };
        });
        return { ...c, resume: res, suggestions: all };
      });
      setWsStatus(`Applied ${ready.length}${waiting.length ? `. #${waiting.join(", #")} need${waiting.length > 1 ? "" : "s"} your input first` : ""}`);
      track("apply_all_clicked", { applied_count: ready.length, skipped_needing_input: waiting.length });
    },
    saveEdit(id, text) {
      wsSet(id, { custom: text });
      setWsStatus("Edit saved – apply it when ready");
      track("suggestion_edited", { suggestion_id: id });
    },
    async answer(id, text) {
      const s = suggestions[id];
      if (s.field) {
        // Contact details: cleaned up in code (city spelling, phone format), applied straight away.
        const value = normalizeContactField(s.field, text);
        if (!value) return wsSet(id, { note: `That doesn't look like a ${s.field === "linkedin" ? "LinkedIn link" : s.field}. Try again.` });
        const edit = { target: "C", op: "replace", after: setContactField(resume.contact, s.field, value) };
        update((c) => ({ ...c, resume: applyEdit(c.resume, edit), suggestions: { ...c.suggestions, [id]: { ...c.suggestions[id], edit, question: null, before: c.resume.contact, status: "applied", undo: captureUndo(c.resume, edit), appliedText: edit.after, note: null } } }));
        flashLine("C");
        setWsStatus(`${s.where} updated`);
        return;
      }
      setBusy(true);
      try {
        const data = await chatFor(text, { answerTo: s.question });
        const cards = data.suggestions || [];
        update((c) => {
          if (!cards.length) return { ...c, suggestions: { ...c.suggestions, [id]: { ...c.suggestions[id], note: data.reply } } };
          // The first edit takes the question's place (same pin); any others are added after.
          const [first, ...rest] = cards;
          const turned = { ...c.suggestions[id], edit: first.edit, question: null, before: first.before, note: null, where: whereOf(c.resume, first.edit.target, c.suggestions[id].category) };
          return addCards({ ...c, suggestions: { ...c.suggestions, [id]: turned } }, rest);
        });
        setWsStatus(cards.length ? "Here's the change – check it and apply" : "");
      } catch (e) {
        wsSet(id, { note: `That didn't work (${e.message}). Try again.` });
      } finally {
        setBusy(false);
      }
    },
    async action(id) {
      const s = suggestions[id];
      setBusy(true);
      try {
        const data = await chatFor(s.action);
        const cards = data.suggestions || [];
        update((c) => addCards({ ...c, suggestions: { ...c.suggestions, [id]: { ...c.suggestions[id], status: "done", note: cards.length ? `Done – ${cards.length} new suggestion${cards.length > 1 ? "s" : ""} added` : data.reply } } }, cards));
        setWsStatus(cards.length ? `${cards.length} new suggestion${cards.length > 1 ? "s" : ""} to review` : data.reply);
      } catch (e) {
        setWsStatus(`That didn't work (${e.message}).`);
      } finally {
        setBusy(false);
      }
    },
    async regenerate(id) {
      const s = suggestions[id];
      setBusy(true);
      track("rllm_regenerate", { category: s.category || null, source: s.source });
      try {
        const data = await chatFor(`Write a different version of line ${s.edit.target} (currently: "${textAt(resume, s.edit.target)}"). Don't repeat this earlier suggestion: "${s.edit.after}". It should fix: ${s.why || s.title}. Same facts only.`);
        const alt = (data.suggestions || []).find((x) => x.edit?.target === s.edit.target && x.edit.after !== s.edit.after);
        if (!alt) return setWsStatus("That's the best honest version without more details – apply, edit or dismiss it.");
        wsSet(id, { edit: alt.edit, custom: null });
        setBlankValues((v) => ({ ...v, [id]: [] }));
        setWsStatus(`New version for ${s.where}`);
      } catch (e) {
        setWsStatus(`Couldn't get another version (${e.message}).`);
      } finally {
        setBusy(false);
      }
    },
    async ask(text) {
      setBusy(true);
      try {
        const data = await chatFor(text);
        const cards = data.suggestions || [];
        if (cards.length) update((c) => addCards(c, cards));
        setWsStatus(cards.length ? `${data.reply} (${cards.length} new suggestion${cards.length > 1 ? "s" : ""})` : data.reply);
        track("rllm_chat_sent", { mode: "workspace", has_jd: !!jd });
      } catch (e) {
        setWsStatus(`That didn't work (${e.message}).`);
      } finally {
        setBusy(false);
      }
    },
    download() {
      const list = Object.values(suggestions);
      track("tailor_finished", { applied: list.filter((x) => x.status === "applied").length, dismissed: list.filter((x) => x.status === "dismissed").length, pending: list.filter((x) => x.status === "pending").length, final_score: improving ? review?.overall : score });
      setDownload(true);
    },
  };
  const wsDelta = (s, text) => {
    if (!s.edit || !resume) return 0;
    const fill = (text ?? s.edit.after ?? "").replace(/\[number\]/g, "10");
    const next = applyEdit(resume, s.edit, s.edit.after != null ? fill : undefined);
    return improving ? reviewResume(next, { pages }).overall - (review?.overall ?? 0) : (matchScore(next, { title: job?.title, jd }) ?? 0) - (score ?? 0);
  };
  const jdTerms = useMemo(() => new Set(tokenizeForMatch(jd)), [jd]);
  const wsKeywords = (s, text) => {
    if (!jd || !text) return [];
    const had = new Set(tokenizeForMatch(s.before || ""));
    return [...new Set(tokenizeForMatch(text).filter((w) => jdTerms.has(w) && !had.has(w) && w.length > 3))].slice(0, 4);
  };
  const wsScore = (() => {
    if (!resume) return { label: "Strength", unit: "", base: 0, now: 0, potential: 0 };
    let all = resume;
    Object.values(suggestions).filter((x) => x.status === "pending" && x.edit && !x.question).forEach((x) => {
      if (x.edit.after == null || x.custom != null || isReady(x, blankValues[x.id])) all = applyEdit(all, x.edit, x.custom ?? (x.edit.after ?? undefined)?.replace(/\[number\]/g, "10"));
    });
    return improving
      ? { label: "Strength", unit: "", base: chat?.baseStrength ?? review?.overall ?? 0, now: review?.overall ?? 0, potential: reviewResume(all, { pages }).overall }
      : { label: "Match", unit: "%", base: chat?.baseScore ?? score ?? 0, now: score ?? 0, potential: matchScore(all, { title: job?.title, jd }) ?? 0 };
  })();

  // ---- render ----
  const applied = Object.values(suggestions).filter((s) => s.status === "applied").length;
  const empty = messages.length === 0;
  const name = firstName(resume) || firstName({ name: session?.user?.user_metadata?.full_name });
  /** "Improve my resume": the category review, then fixes one at a time, weakest category first. */
  async function startImprove() {
    if (busy || !resume) return;
    say({ role: "user", text: "Improve my resume" });
    setBusy(true);
    const started = Date.now();
    try {
      const data = await post("/api/tailor/review", { resume, pages });
      const all = {};
      withPins(data.suggestions.map((x) => ({ ...x, source: "review" })), resume).forEach((x) => (all[x.id] = x));
      update((c) => ({
        ...c,
        mode: "improve",
        title: "Improve my resume",
        jd: "",
        job: null,
        baseStrength: data.overall,
        suggestions: all,
        queue: [],
        pinCount: Object.keys(all).length,
        original: c.resume || resume,
        workspace: true,
        lastCategory: null,
        messages: [
          ...c.messages,
          { id: uid(), role: "bot", kind: "strength" },
          { id: uid(), role: "bot", text: data.suggestions.length ? `I found ${data.suggestions.length} things to improve. We'll start with your weakest area, one change at a time – apply, regenerate or skip each.` : "Your resume is in great shape – nothing important to fix." },
        ],
      }));
      track("rllm_review", { overall: data.overall, count: data.suggestions.length, seconds: Math.round((Date.now() - started) / 100) / 10, pages });
      track("tailor_viewed", { suggestion_count: data.suggestions.length, base_score: data.overall, mode: "improve", layout: window.matchMedia("(max-width: 899px)").matches ? "mobile" : "desktop" });
    } catch (e) {
      say({ role: "bot", text: `I couldn't review your resume just now (${e.message}).`, retry: "improve" });
    } finally {
      setBusy(false);
    }
  }

  function startTailor() {
    say({ role: "user", text: "Tailor it to a job" });
    update((c) => ({ ...c, mode: "tailor" }));
    say({ role: "bot", text: "Paste the job description you're applying for – the whole thing, from the job page – and I'll take you through the changes one at a time." });
    track("rllm_tailor_chosen");
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  const starters = !resume
    ? [
        { icon: "📄", label: "Upload my resume", run: () => fileRef.current?.click() },
        { icon: "✍️", label: "Paste my resume", run: () => { setInput(""); inputRef.current?.focus(); setMode({ kind: "paste" }); } },
        { icon: "✨", label: "Try with a sample resume", run: trySampleResume },
      ]
    : !jd
      ? [
          ...(chat?.mode === "tailor"
            ? [{ icon: "🧪", label: "Try a sample job description", run: () => send(SAMPLE_JD) }]
            : improving
              ? [{ icon: "🎯", label: "Tailor it to a job", run: startTailor }]
              : [
                  { icon: "✏️", label: "Improve my resume", run: startImprove },
                  { icon: "🎯", label: "Tailor it to a job", run: startTailor },
                ]),
          ...(improving ? [{ icon: "📏", label: "Make it 1 page", run: () => send("Make my resume fit on one page: tighten wording and drop the least important bullets from older roles.") }] : []),
          { icon: "📄", label: "Use a different resume", run: () => fileRef.current?.click() },
        ]
      : [
          { icon: "📏", label: "Make it 1 page", run: () => send("Make my resume fit on one page: tighten wording and drop the least relevant bullets for this job.") },
          { icon: "📝", label: "Stronger summary", run: () => send("Rewrite my summary for this job in 2-3 sentences.") },
          { icon: "✅", label: "Fix grammar & tone", run: () => send("Fix grammar and make the wording consistent and confident, without changing facts.") },
          { icon: "🎯", label: "Tailor for another job", run: startNewChat },
        ];
  // A resume read before signing in: the sign-in card is the next step, nothing else.
  const signInPending = messages.some((m) => m.kind === "signin" && !m.done);
  const placeholder = signInPending ? "Sign in above to continue" : mode?.kind === "answer" ? "Type your answer…" : mode?.kind === "change" ? "How should I change it?" : mode?.kind === "paste" || !resume ? "Paste your resume, or attach it with +" : !jd && !improving ? "Paste the job description…" : "Ask for any change…";

  const composer = (
    <form className="rl-composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
      {mode && mode.kind !== "paste" && (
        <div className="rl-mode">
          {mode.kind === "answer" ? "Answering" : "Changing"}: <b>{suggestions[mode.sid]?.title}</b>
          <button type="button" onClick={() => setMode(null)} aria-label="Cancel">✕</button>
        </div>
      )}
      <div className="rl-pill">
        <button type="button" className="rl-icon" onClick={() => fileRef.current?.click()} aria-label="Attach resume" title="Attach resume (PDF or text)">{Icon.plus}</button>
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !window.matchMedia("(pointer: coarse)").matches) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={placeholder}
          aria-label="Message"
        />
        {canListen && !input.trim() && (
          <button type="button" className={`rl-icon${listening ? " rl-listening" : ""}`} onClick={listen} aria-label="Speak" title="Speak">{Icon.mic}</button>
        )}
        {input.trim() && <button type="submit" className="rl-send" disabled={busy} aria-label="Send">{Icon.send}</button>}
      </div>
    </form>
  );

  /** Overall strength and a bar per category – live, so it rises as fixes are applied. */
  function renderStrength() {
    if (!review) return null;
    return (
      <div className="rl-strength">
        <div className="rl-strength-top">
          <span className={`rl-strength-num rl-${tone(review.overall)}`}>{review.overall}</span>
          <div>
            <b>Resume strength</b>
            <p className="rl-strength-sub">{chat?.baseStrength != null && chat.baseStrength !== review.overall ? `Up from ${chat.baseStrength} · ` : ""}{pages ? `${pages} page${pages > 1 ? "s" : ""}` : ""}</p>
          </div>
        </div>
        {review.categories.map((c) => (
          <div key={c.id} className="rl-strength-row">
            <span className="rl-strength-label">{c.label}</span>
            <span className="rl-bar"><span className={`rl-bar-fill rl-${tone(c.score)}`} style={{ width: `${Math.max(4, c.score)}%` }} /></span>
            <span className="rl-strength-score">{c.score}</span>
          </div>
        ))}
      </div>
    );
  }

  function renderSuggestion(s) {
    const before = s.before ?? (s.edit ? textAt(resume, s.edit.target) : null);
    const blanks = s.edit?.after ? (s.edit.after.match(/\[number\]/g) || []).length : 0;
    const impact = s.status === "pending" && s.edit && jd ? scoreImpact(resume, s.edit, { title: job?.title, jd }) : null;
    const jobCount = Object.values(suggestions).filter((x) => x.source === "job").length;
    const catCount = s.category ? Object.values(suggestions).filter((x) => x.source === "review" && x.category === s.category).length : 0;
    return (
      <div className={`rl-sugg rl-sugg-${s.status}`} data-sid={s.id}>
        <div className="rl-sugg-head">
          {s.pin != null && (
            <button type="button" className={`rl-pin rl-pin-${s.status === "applied" ? "done" : s.question ? "ask" : s.priority}`} onClick={() => showLine(s)} aria-label={`Show pointer ${s.pin} on the resume`}>
              {s.status === "applied" ? "✓" : s.pin}
            </button>
          )}
          {s.source === "job" && <span className="rl-step">{s.n} of {jobCount}</span>}
          {s.source === "review" && <span className="rl-step">{catLabel(s.category)} · {s.n} of {catCount}</span>}
          {s.priority === "must" && <span className="rl-tag-must">Must-fix</span>}
          {impact > 0 && <span className="rl-tag-impact">+{impact}% match</span>}
        </div>
        <p className="rl-sugg-title">{s.title}</p>
        {s.why && <p className="rl-sugg-why">{s.why}</p>}
        {s.question && <p className="rl-sugg-q">{s.question}</p>}
        {s.edit && !["add_skills", "set_skills", "add_certifications"].includes(s.edit.op) && (
          <div className="rl-diff">
            {before ? <del>{before}</del> : <span className="rl-diff-note">New bullet</span>}
            {s.edit.op === "remove" ? <span className="rl-diff-note">Remove this bullet</span> : <ins>{s.edit.after}</ins>}
          </div>
        )}
        {s.edit?.op === "add_skills" && <div className="rl-diff"><ins>Add skills: {s.edit.skills.join(", ")}</ins></div>}
        {s.edit?.op === "set_skills" && (() => {
          const keep = new Set(s.edit.skills.map((x) => x.toLowerCase()));
          const dropped = (resume.skills || []).filter((x, i, all) => !keep.has(String(x).toLowerCase()) || all.findIndex((y) => String(y).toLowerCase() === String(x).toLowerCase()) !== i);
          return <div className="rl-diff">{dropped.length > 0 && <del>Remove: {dropped.join(", ")}</del>}<ins>Keep: {s.edit.skills.join(", ")}</ins></div>;
        })()}
        {s.edit?.op === "add_certifications" && <div className="rl-diff"><ins>Add: {s.edit.items.join(", ")}</ins></div>}
        {s.status === "pending" && blanks > 0 && (
          <div className="rl-blanks">
            {Array.from({ length: blanks }, (_, k) => (
              <label key={k}>
                {blanks > 1 ? `Number ${k + 1}` : "Fill in the number"}
                <input inputMode="decimal" placeholder="e.g. 30" value={(blankValues[s.id] || [])[k] || ""} onChange={(e) => setBlankValues((v) => ({ ...v, [s.id]: Object.assign([...(v[s.id] || [])], { [k]: e.target.value }) }))} />
              </label>
            ))}
          </div>
        )}
        {s.status === "pending" ? (
          <div className="rl-actions">
            {s.edit ? (
              <button type="button" className="rl-btn rl-btn-primary" disabled={blanks > 0 && (blankValues[s.id] || []).filter((v) => v && v.trim()).length < blanks} onClick={() => decide(s, "apply")}>Apply</button>
            ) : s.action ? (
              <button type="button" className="rl-btn rl-btn-primary" disabled={busy} onClick={() => { track("rllm_action", { category: s.category }); update((c) => ({ ...c, suggestions: { ...c.suggestions, [s.id]: { ...s, status: "requested" } } })); send(s.action, { parent: s.id }); }}>Do it</button>
            ) : (
              <button type="button" className="rl-btn rl-btn-primary" onClick={() => startAnswer(s, "answer")}>Answer</button>
            )}
            {s.edit && s.edit.after != null && <button type="button" className="rl-btn" disabled={busy} onClick={() => regenerate(s)}>↻ Regenerate</button>}
            <button type="button" className="rl-btn rl-btn-quiet" onClick={() => decide(s, "skip")}>Skip</button>
            {(s.edit?.target || s.target) && <button type="button" className="rl-link rl-see" onClick={() => showLine(s)}>See on resume</button>}
          </div>
        ) : (
          <p className="rl-sugg-status">{{ applied: "✓ Applied", skipped: "Skipped", answered: "Answered", replaced: "Replaced – see below", requested: "Working on it…", done: "Done – see below" }[s.status]}</p>
        )}
      </div>
    );
  }

  const sidebar = (
    <nav className="rl-side" aria-label="Chats">
      <div className="rl-brand">
        <a href="/" aria-label="ResumeIQ home"><span className="rl-mark">◈</span> Resume LLM</a>
        <button type="button" className="rl-icon rl-close-drawer" onClick={() => setDrawer(false)} aria-label="Close menu">{Icon.close}</button>
      </div>
      <button type="button" className="rl-newchat" onClick={startNewChat}>✎ New chat</button>
      <p className="rl-side-label">Recent</p>
      <ul className="rl-recent">
        {store.chats.filter((c) => c.messages.length).map((c) => (
          <li key={c.id}>
            <button type="button" className={c.id === store.activeId ? "rl-recent-on" : ""} onClick={() => { setStore((s) => ({ ...s, activeId: c.id })); setDrawer(false); setMode(null); }}>
              {c.title}
            </button>
          </li>
        ))}
      </ul>
      <div className="rl-account">
        {session ? (
          <>
            <span className="rl-avatar" aria-hidden="true">{(session.user.email || "?")[0].toUpperCase()}</span>
            <span className="rl-account-email">{session.user.email}</span>
            <button type="button" className="rl-link" onClick={() => signOut("sidebar")}>Sign out</button>
          </>
        ) : (
          <span className="rl-account-email">Not signed in</span>
        )}
      </div>
    </nav>
  );

  if (session === undefined) return <div className="rl-app rl-loading">Loading…</div>;

  return (
    <div className={`rl-app${drawer ? " rl-drawer-open" : ""}`}>
      {/* Outside the chat box, so "Use a different resume" works from the review screen too. */}
      <input ref={fileRef} type="file" accept=".pdf,.txt,application/pdf,text/plain" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) readResume(f); }} />
      {sidebar}
      {drawer && <div className="rl-scrim" onClick={() => setDrawer(false)} aria-hidden="true" />}

      <main className="rl-main">
        <header className="rl-top">
          <button type="button" className="rl-icon rl-menu" onClick={() => setDrawer(true)} aria-label="Menu">{Icon.menu}</button>
          <span className="rl-top-title">{chat?.title && chat.title !== "New chat" ? chat.title : "Resume LLM"}</span>
          <div className="rl-top-right">
            {/* Like ChatGPT: a new-chat button and the profile, nothing else. */}
            <button type="button" className="rl-icon" onClick={startNewChat} aria-label="New chat" title="New chat">{Icon.newChat}</button>
            {session ? (
              <div className="rl-acct">
                <button type="button" className="rl-avatar rl-avatar-btn" onClick={() => setAccountMenu((o) => !o)} aria-label="Account" aria-expanded={accountMenu}>
                  {(session.user.email || "?")[0].toUpperCase()}
                </button>
                {accountMenu && (
                  <>
                    <div className="rl-menu-scrim" onClick={() => setAccountMenu(false)} aria-hidden="true" />
                    <div className="rl-acct-menu" role="menu">
                      <p className="rl-acct-email">{session.user.email}</p>
                      <button type="button" role="menuitem" className="rl-btn rl-wide" onClick={() => signOut("topbar")}>Sign out</button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              supabase && !signInPending && <button type="button" className="rl-btn rl-btn-sm" onClick={askSignIn}>Sign in</button>
            )}
          </div>
        </header>

        {chat?.workspace && resume ? (
          <ResumeWorkspace
            resume={resume}
            suggestions={suggestions}
            title={improving ? "Improving your resume" : `Tailoring for ${job?.title || "this job"}`}
            subtitle={improving ? "" : job?.company || ""}
            score={wsScore}
            busy={busy}
            status={wsStatus}
            blankValues={blankValues}
            setBlankValues={setBlankValues}
            flash={flash}
            deltaOf={wsDelta}
            keywordsOf={wsKeywords}
            act={act}
            extras={[
              improving
                ? { label: "Tailor it to a job", run: () => { update((c) => ({ ...c, workspace: false })); startTailor(); } }
                : { label: "Improve my resume", run: startImprove },
              { label: "Use a different resume", run: () => fileRef.current?.click() },
            ]}
          />
        ) : empty ? (
          <div className="rl-hero">
            <h1>{name ? `Hi ${name}, where should we start?` : "Where should we start?"}</h1>
            <p className="rl-hero-sub">{resume ? "Your resume is ready. Paste a job description and I'll tailor it, one change at a time." : "Attach or paste your resume, then the job you want. I'll take you through every change."}</p>
            {composer}
            <div className="rl-starters">
              {starters.map((s) => (
                <button key={s.label} type="button" className="rl-starter" onClick={s.run} disabled={busy}><span aria-hidden="true">{s.icon}</span> {s.label}</button>
              ))}
            </div>
          </div>
        ) : (
          <div className={`rl-work${resume ? " rl-split" : ""}`}>
            {resume && (
              <section className="rl-pane" ref={paneRef} aria-label="Your resume">
                <div className="rl-pane-bar">
                  <b>Your resume</b>
                  {applied > 0 && <span className="rl-resume-count">{applied} change{applied > 1 ? "s" : ""} applied</span>}
                  <button type="button" className="rl-link rl-pane-full" onClick={() => setResumeOpen(true)}>Full screen</button>
                </div>
                <ResumePaper resume={resume} markers={markers} flash={flash} onMarker={jumpToMessage} active={active} />
              </section>
            )}
            <div className="rl-chatcol">
            <div className="rl-messages" ref={listRef}>
              <div className="rl-thread">
                {messages.map((m) => {
                  if (m.kind === "suggestion") {
                    const s = suggestions[m.sid];
                    return s ? <div key={m.id} className="rl-msg rl-bot">{renderSuggestion(s)}</div> : null;
                  }
                  if (m.kind === "strength") return <div key={m.id} className="rl-msg rl-bot">{renderStrength()}</div>;
                  if (m.kind === "category") {
                    const c = review?.categories.find((x) => x.id === m.category);
                    const count = Object.values(suggestions).filter((x) => x.source === "review" && x.category === m.category).length;
                    return (
                      <div key={m.id} className="rl-msg rl-bot rl-cat">
                        <p><b>{catLabel(m.category)}</b>{c ? <span className={`rl-cat-score rl-${tone(c.score)}`}>{c.score}/100</span> : null}</p>
                        <p className="rl-cat-sub">{count} thing{count === 1 ? "" : "s"} to improve here.</p>
                      </div>
                    );
                  }
                  if (m.kind === "done") {
                    const list = Object.values(suggestions);
                    return (
                      <div key={m.id} className="rl-msg rl-bot">
                        <div className="rl-done">
                          <p><b>All done.</b> {list.filter((s) => s.status === "applied").length} applied, {list.filter((s) => s.status === "skipped").length} skipped.{!improving && chat?.baseScore != null && score != null ? ` Match ${chat.baseScore}% → ${score}%.` : ""}{improving && chat?.baseStrength != null && review ? ` Strength ${chat.baseStrength} → ${review.overall}.` : ""}</p>
                          {improving && renderStrength()}
                          <div className="rl-actions">
                            <button type="button" className="rl-btn rl-btn-primary" onClick={() => setDownload(true)}>Download PDF</button>
                            <button type="button" className="rl-btn" onClick={() => setResumeOpen(true)}>View resume</button>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={m.id} className={`rl-msg rl-${m.role}${m.small ? " rl-small" : ""}`}>
                      {m.file ? <p className="rl-file">📄 {m.file}</p> : m.text && <p>{m.note && <span className="rl-note">{m.note}</span>}{m.text}</p>}
                      {m.kind === "resume" && <button type="button" className="rl-link" onClick={() => setResumeOpen(true)}>View resume</button>}
                      {m.kind === "choose" && !chat?.mode && (
                        <div className="rl-choose">
                          <button type="button" className="rl-choice" onClick={startImprove} disabled={busy}><span aria-hidden="true">✏️</span><b>Improve my resume</b><small>A full check – basic info, summary, every bullet, skills, length – scored by area, fixed one at a time.</small></button>
                          <button type="button" className="rl-choice" onClick={startTailor} disabled={busy}><span aria-hidden="true">🎯</span><b>Tailor it to a job</b><small>Paste a job description and I'll match your resume to it.</small></button>
                        </div>
                      )}
                      {m.retry === "improve" && <button type="button" className="rl-btn" onClick={startImprove} disabled={busy}>Try again</button>}
                      {m.kind === "signin" && !m.done && supabase && <SignInCard initialEmail={m.email} onSignedIn={onSignedIn} />}
                    </div>
                  );
                })}
                {busy && <div className="rl-msg rl-bot"><div className="rl-typing"><span /><span /><span /></div></div>}
              </div>
            </div>
            <div className="rl-bottom">
              {!busy && !mode && !signInPending && (
                <div className="rl-chips">
                  {resume && (
                    <>
                      <button type="button" className="rl-chip rl-phone-only" onClick={() => setResumeOpen(true)}>Full resume</button>
                      <button type="button" className="rl-chip rl-chip-primary" onClick={() => { setDownload(true); track("rllm_download_clicked", { applied, where: "chip" }); }}>Download PDF</button>
                    </>
                  )}
                  {starters.slice(0, 4).map((s) => <button key={s.label} type="button" className="rl-chip" onClick={s.run}>{s.label}</button>)}
                </div>
              )}
              {composer}
            </div>
            </div>
          </div>
        )}
      </main>

      {resume && resumeOpen && (
        <aside className="rl-resume" ref={resumeRef} aria-label="Your resume">
          <div className="rl-resume-bar">
            <b>Your resume</b>
            {applied > 0 && <span className="rl-resume-count">{applied} change{applied > 1 ? "s" : ""} applied</span>}
            <button type="button" className="rl-icon" onClick={() => setResumeOpen(false)} aria-label="Close resume">{Icon.close}</button>
          </div>
          <div className="rl-resume-scroll">
            <ResumePaper resume={resume} markers={markers} flash={flash} onMarker={jumpToMessage} active={active} />
          </div>
        </aside>
      )}

      {download && resume && (
        <DownloadPaywall
          session={session}
          paymentsRequired={!!supabase}
          notice={Object.values(suggestions).some((s) => s.status === "pending" || s.status === "queued") ? "Some suggestions are still open." : ""}
          buildAndSave={() => {
            const out = finalResume(resume);
            downloadResumePdf(out, typeof out.photoUrl === "string" && out.photoUrl.startsWith("data:") ? out.photoUrl : null, PDF_FORMAT);
            track("rllm_downloaded", { applied, score });
          }}
          onClose={() => setDownload(false)}
          onSignIn={() => { setDownload(false); askSignIn(); }}
          track={track}
        />
      )}
    </div>
  );
}
