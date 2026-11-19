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
import { finalResume, textAt, applyEdit, matchScore, scoreImpact } from "./tailorEdits.js";
import { track } from "./analytics.js";
import { trackSignUp } from "./googleAds.js";
import "./ResumeLLM.css";

const API_BASE = (import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:3001" : "")).replace(/\/$/, "");
const STORE_KEY = "riq_resume_llm_v1";
const MIN_RESUME_CHARS = 300;
const MIN_JD_CHARS = 200;
const WIDE = "(min-width: 900px)";

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
  close: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>,
};

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const isWide = () => window.matchMedia(WIDE).matches;
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

/** The resume as a page, with numbered markers on lines that have a suggestion. */
function ResumePaper({ resume, markers, flash, onMarker }) {
  const r = resume || {};
  const marks = (line) =>
    (markers.get(line) || []).map((s) => (
      <button key={s.id} type="button" className={`rl-marker rl-marker-${s.status === "applied" ? "done" : s.question ? "ask" : s.priority}`} onClick={() => onMarker(s.id)} aria-label={`Suggestion ${s.n}: ${s.title}`}>
        {s.status === "applied" ? "✓" : s.n}
      </button>
    ));
  const cls = (line) => {
    const open = (markers.get(line) || []).find((s) => s.status === "pending");
    return `rl-line${open ? ` rl-line-${open.question ? "ask" : open.priority}` : ""}${flash === line ? " rl-line-flash" : ""}`;
  };
  return (
    <article className="rl-paper">
      <h1>{r.name}</h1>
      {r.title && <p data-line="T" className={`${cls("T")} rl-p-title`}>{r.title}{marks("T")}</p>}
      {r.contact && <p className="rl-p-contact">{r.contact}</p>}
      {r.summary && (
        <section>
          <h2>Summary</h2>
          <p data-line="S" className={cls("S")}>{r.summary}{marks("S")}</p>
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
                {(e.bullets || []).map((b, j) => (b == null ? null : <li key={j} data-line={`E${i}B${j}`} className={cls(`E${i}B${j}`)}>{b}{marks(`E${i}B${j}`)}</li>))}
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
      {(r.skills || []).length > 0 && (
        <section>
          <h2>Skills</h2>
          <p data-line="K" className={cls("K")}>{r.skills.join(" · ")}{marks("K")}</p>
        </section>
      )}
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
  const [resumeOpen, setResumeOpen] = useState(() => isWide()); // wide: panel; phone: full screen
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
  const messages = chat?.messages || [];
  const score = resume && jd ? matchScore(resume, { title: job?.title, jd }) : null;

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
    say({ role: "bot", text: "Now paste the job description you're applying for, and I'll take you through the changes one at a time." });
    if (isWide()) setResumeOpen(true);
  }

  async function readResume(fileOrText) {
    const isText = typeof fileOrText === "string";
    say({ role: "user", ...(isText ? { text: `${fileOrText.slice(0, 160)}${fileOrText.length > 160 ? "…" : ""}`, note: "Pasted resume" } : { file: fileOrText.name }) });
    setBusy(true);
    const started = Date.now();
    try {
      const text = isText ? fileOrText : await readResumeFileText(fileOrText);
      const parsed = await extractResumeFromText(text);
      track("rllm_resume_read", { seconds: Math.round((Date.now() - started) / 1000), pasted: isText });
      if (supabase && !session) {
        pendingResumeRef.current = parsed;
        say({ role: "bot", kind: "signin", text: `I've read your resume${firstName(parsed) ? `, ${firstName(parsed)}` : ""}. Sign in so it's saved – you won't have to upload it again for the next job.`, email: emailIn(parsed.contact) });
        track("signin_wall_shown", { at: "resume_llm" });
      } else {
        resumeLoaded(parsed);
      }
    } catch (e) {
      say({ role: "bot", text: `I couldn't read that resume (${e.message}). Try another file, or paste the text.` });
    } finally {
      setBusy(false);
    }
  }

  function onSignedIn(s) {
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
      // Must-fixes first, then the rest, as the model ranked them.
      const ordered = [...data.suggestions.filter((s) => s.priority === "must"), ...data.suggestions.filter((s) => s.priority !== "must")];
      ordered.forEach((s, i) => (all[s.id] = { ...s, n: i + 1, status: "queued", source: "job" }));
      const must = ordered.filter((s) => s.priority === "must").length;
      update((c) => ({
        ...c,
        resume: c.resume || resume,
        jd: text,
        job: { title: data.jobTitle, company: data.company },
        title: [data.jobTitle, data.company].filter(Boolean).join(" · ") || "Tailored resume",
        baseScore: before,
        suggestions: all,
        queue: ordered.map((s) => s.id),
      }));
      say({ role: "bot", text: `${data.intro || ""}\n\nMatch now: ${before ?? "–"}%. I have ${ordered.length} change${ordered.length === 1 ? "" : "s"}${must ? ` – ${must} must-fix` : ""}. ${TIP}`.trim() });
      track("rllm_suggestions", { count: ordered.length, must, questions: ordered.filter((s) => s.question).length, seconds: Math.round((Date.now() - started) / 100) / 10, score: before });
      showNext();
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
      const list = Object.values(c.suggestions).filter((x) => x.source === "job");
      if (!list.length || list.some((x) => x.status === "pending")) return c;
      const next = c.queue.find((id) => c.suggestions[id]?.status === "queued");
      if (!next) {
        if (c.messages.some((m) => m.kind === "done")) return c;
        return { ...c, messages: [...c.messages, { id: uid(), role: "bot", kind: "done" }] };
      }
      return {
        ...c,
        suggestions: { ...c.suggestions, [next]: { ...c.suggestions[next], status: "pending" } },
        messages: [...c.messages, { id: uid(), role: "bot", kind: "suggestion", sid: next }],
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
      update((c) => ({ ...c, resume: nextResume, suggestions: { ...c.suggestions, [s.id]: { ...s, status: "applied" } } }));
      say({ role: "user", text: "Apply", small: true });
      say({ role: "bot", text: `✓ Applied${now != null && was != null && now !== was ? ` · match ${was}% → ${now}%` : ""}.`, small: true });
      setFlash(s.edit.target);
      setTimeout(() => setFlash(null), 1600);
      track("rllm_applied", { priority: s.priority, op: s.edit.op, source: s.source });
    } else {
      update((c) => ({ ...c, suggestions: { ...c.suggestions, [s.id]: { ...s, status: "skipped" } } }));
      say({ role: "user", text: "Skip", small: true });
      track("rllm_skipped", { priority: s.priority, question: !!s.question, source: s.source });
    }
    // Answering a job question or changing a job suggestion: its replacement counts for it.
    const jobItem = s.source === "job" || suggestions[s.parent]?.source === "job";
    if (jobItem) showNext();
  }

  function startAnswer(s, kind) {
    setMode({ kind, sid: s.id });
    track(kind === "answer" ? "rllm_answer_started" : "rllm_change_started");
    setTimeout(() => inputRef.current?.focus(), 30);
  }

  // ---- chat ----
  async function send(raw) {
    const text = String(raw ?? input).trim();
    if (!text || busy) return;
    setInput("");
    const m = mode;
    setMode(null);
    if (!resume) {
      if (text.length >= MIN_RESUME_CHARS) return readResume(text);
      say({ role: "user", text });
      say({ role: "bot", text: "Let's start with your resume: attach it with + or paste its full text here." });
      return;
    }
    if (!jd && !m) {
      if (/^https?:\/\/\S+$/i.test(text)) {
        say({ role: "user", text });
        say({ role: "bot", text: "Reading job links is coming soon. For now, open the job, copy the whole description, and paste it here." });
        return;
      }
      if (text.length >= MIN_JD_CHARS) return readJob(text);
    }
    say({ role: "user", text });
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
        cards.forEach((s) => (all[s.id] = s));
        if (m) all[m.sid] = { ...all[m.sid], status: m.kind === "answer" ? "answered" : "replaced" };
        return { ...c, suggestions: all, messages: [...c.messages, { id: uid(), role: "bot", text: data.reply }, ...cards.map((s) => ({ id: uid(), role: "bot", kind: "suggestion", sid: s.id }))] };
      });
      // Nothing to apply from an answer: move on to the next job suggestion.
      if (m && !cards.length && target?.source === "job") showNext();
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

  function jumpToMessage(sid) {
    if (!isWide()) setResumeOpen(false);
    setTimeout(() => document.querySelector(`[data-sid="${sid}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  }
  function showLine(s) {
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

  // ---- render ----
  const applied = Object.values(suggestions).filter((s) => s.status === "applied").length;
  const empty = messages.length === 0;
  const name = firstName(resume) || firstName({ name: session?.user?.user_metadata?.full_name });
  const starters = !resume
    ? [
        { icon: "📄", label: "Upload my resume", run: () => fileRef.current?.click() },
        { icon: "✍️", label: "Paste my resume", run: () => { setInput(""); inputRef.current?.focus(); setMode({ kind: "paste" }); } },
        { icon: "✨", label: "Try with a sample resume", run: trySampleResume },
      ]
    : !jd
      ? [
          { icon: "🎯", label: "Tailor it to a job description", run: () => inputRef.current?.focus() },
          { icon: "🧪", label: "Try a sample job description", run: () => send(SAMPLE_JD) },
          { icon: "📝", label: "Improve my summary", run: () => send("Rewrite my summary to be sharper, in 2-3 sentences.") },
          { icon: "📄", label: "Use a different resume", run: () => fileRef.current?.click() },
        ]
      : [
          { icon: "📏", label: "Make it 1 page", run: () => send("Make my resume fit on one page: tighten wording and drop the least relevant bullets for this job.") },
          { icon: "📝", label: "Stronger summary", run: () => send("Rewrite my summary for this job in 2-3 sentences.") },
          { icon: "✅", label: "Fix grammar & tone", run: () => send("Fix grammar and make the wording consistent and confident, without changing facts.") },
          { icon: "🎯", label: "Tailor for another job", run: startNewChat },
        ];
  const placeholder = mode?.kind === "answer" ? "Type your answer…" : mode?.kind === "change" ? "How should I change it?" : mode?.kind === "paste" || !resume ? "Paste your resume, or attach it with +" : !jd ? "Paste the job description…" : "Ask for any change…";

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
      <input ref={fileRef} type="file" accept=".pdf,.txt,application/pdf,text/plain" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) readResume(f); }} />
    </form>
  );

  function renderSuggestion(s) {
    const before = s.before ?? (s.edit ? textAt(resume, s.edit.target) : null);
    const blanks = s.edit?.after ? (s.edit.after.match(/\[number\]/g) || []).length : 0;
    const impact = s.status === "pending" && s.edit && jd ? scoreImpact(resume, s.edit, { title: job?.title, jd }) : null;
    const jobCount = Object.values(suggestions).filter((x) => x.source === "job").length;
    return (
      <div className={`rl-sugg rl-sugg-${s.status}`} data-sid={s.id}>
        <div className="rl-sugg-head">
          {s.source === "job" && <span className="rl-step">{s.n} of {jobCount}</span>}
          {s.priority === "must" && <span className="rl-tag-must">Must-fix</span>}
          {impact > 0 && <span className="rl-tag-impact">+{impact}% match</span>}
        </div>
        <p className="rl-sugg-title">{s.title}</p>
        {s.why && <p className="rl-sugg-why">{s.why}</p>}
        {s.question && <p className="rl-sugg-q">{s.question}</p>}
        {s.edit && s.edit.op !== "add_skills" && (
          <div className="rl-diff">
            {before ? <del>{before}</del> : <span className="rl-diff-note">New bullet</span>}
            {s.edit.op === "remove" ? <span className="rl-diff-note">Remove this bullet</span> : <ins>{s.edit.after}</ins>}
          </div>
        )}
        {s.edit?.op === "add_skills" && <div className="rl-diff"><ins>Add skills: {s.edit.skills.join(", ")}</ins></div>}
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
            ) : (
              <button type="button" className="rl-btn rl-btn-primary" onClick={() => startAnswer(s, "answer")}>Answer</button>
            )}
            {s.edit && <button type="button" className="rl-btn" onClick={() => startAnswer(s, "change")}>Change it</button>}
            <button type="button" className="rl-btn rl-btn-quiet" onClick={() => decide(s, "skip")}>Skip</button>
            {(s.edit?.target || s.target) && <button type="button" className="rl-link rl-see" onClick={() => showLine(s)}>See on resume</button>}
          </div>
        ) : (
          <p className="rl-sugg-status">{{ applied: "✓ Applied", skipped: "Skipped", answered: "Answered", replaced: "Changed – see below" }[s.status]}</p>
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
    <div className={`rl-app${resumeOpen && resume ? " rl-with-resume" : ""}${drawer ? " rl-drawer-open" : ""}`}>
      {sidebar}
      {drawer && <div className="rl-scrim" onClick={() => setDrawer(false)} aria-hidden="true" />}

      <main className="rl-main">
        <header className="rl-top">
          <button type="button" className="rl-icon rl-menu" onClick={() => setDrawer(true)} aria-label="Menu">{Icon.menu}</button>
          <span className="rl-top-title">{chat?.title && chat.title !== "New chat" ? chat.title : "Resume LLM"}</span>
          <div className="rl-top-right">
            {score != null && <span className="rl-score" title="Keyword and skills match with this job (estimate)"><b>{score}%</b> match</span>}
            {resume && !empty && <button type="button" className="rl-btn rl-btn-sm" onClick={() => setResumeOpen((o) => !o)}>{resumeOpen && isWide() ? "Hide resume" : "Resume"}</button>}
            {resume && !empty && <button type="button" className="rl-btn rl-btn-sm rl-btn-primary" onClick={() => { setDownload(true); track("rllm_download_clicked", { applied }); }}>Download</button>}
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
              supabase && !messages.some((m) => m.kind === "signin" && !m.done) && <button type="button" className="rl-btn rl-btn-sm" onClick={askSignIn}>Sign in</button>
            )}
          </div>
        </header>

        {empty ? (
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
          <>
            <div className="rl-messages" ref={listRef}>
              <div className="rl-thread">
                {messages.map((m) => {
                  if (m.kind === "suggestion") {
                    const s = suggestions[m.sid];
                    return s ? <div key={m.id} className="rl-msg rl-bot">{renderSuggestion(s)}</div> : null;
                  }
                  if (m.kind === "done") {
                    const list = Object.values(suggestions);
                    return (
                      <div key={m.id} className="rl-msg rl-bot">
                        <div className="rl-done">
                          <p><b>All done.</b> {list.filter((s) => s.status === "applied").length} applied, {list.filter((s) => s.status === "skipped").length} skipped.{chat?.baseScore != null && score != null ? ` Match ${chat.baseScore}% → ${score}%.` : ""}</p>
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
                      {m.kind === "signin" && !m.done && supabase && <SignInCard initialEmail={m.email} onSignedIn={onSignedIn} />}
                    </div>
                  );
                })}
                {busy && <div className="rl-msg rl-bot"><div className="rl-typing"><span /><span /><span /></div></div>}
              </div>
            </div>
            <div className="rl-bottom">
              {!busy && !mode && (
                <div className="rl-chips">
                  {starters.slice(0, 4).map((s) => <button key={s.label} type="button" className="rl-chip" onClick={s.run}>{s.label}</button>)}
                </div>
              )}
              {composer}
            </div>
          </>
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
            <ResumePaper resume={resume} markers={markers} flash={flash} onMarker={jumpToMessage} />
          </div>
        </aside>
      )}

      {download && (
        <div className="rl-modal-scrim" role="dialog" aria-modal="true" aria-label="Download your resume" onClick={() => setDownload(false)}>
          <div className="rl-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Download your resume</h2>
            {Object.values(suggestions).some((s) => s.status === "pending" || s.status === "queued") && <p className="rl-warn">Some suggestions are still open.</p>}
            <p className="rl-pay">Payment step goes here. (Prototype: download is free.)</p>
            <button type="button" className="rl-btn rl-btn-primary rl-wide" onClick={() => { const out = finalResume(resume); downloadResumePdf(out, typeof out.photoUrl === "string" && out.photoUrl.startsWith("data:") ? out.photoUrl : null); track("rllm_downloaded", { applied, score }); setDownload(false); }}>Download PDF</button>
            <button type="button" className="rl-btn rl-btn-quiet rl-wide" onClick={() => setDownload(false)}>Keep editing</button>
          </div>
        </div>
      )}
    </div>
  );
}
