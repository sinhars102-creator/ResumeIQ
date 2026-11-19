/**
 * Tailor chat – prototype at /app/tailor (not linked from anywhere yet).
 *
 * Upload or paste a resume -> sign in (the resume is saved to the account) -> the resume, with a chat
 * underneath (beside it on wide screens). Paste a job description: suggestions arrive in the chat and are
 * marked on the resume lines they change; Apply edits the resume and the match score updates. Free-text
 * requests ("make it 1 page") come back as the same kind of cards. Download is where payment will go.
 *
 * Line ids shared with the server (server/tailorChat.js): T title, S summary, E{i} role, E{i}B{j} bullet,
 * K skills. Removed bullets are left as null until export so later ids keep pointing at the same lines.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import AccountStep from "./AccountStep.jsx";
import UploadStep from "./UploadStep.jsx";
import { supabase, loadProfile, saveProfile } from "./easyApply/supabaseClient.js";
import { extractResumeFromText, readResumeFileText, downloadResumePdf, SAMPLE_RESUME } from "./ResumeIQ.jsx";
import { finalResume, textAt, applyEdit, matchScore, scoreImpact } from "./tailorEdits.js";
import { track } from "./analytics.js";
import "./TailorChat.css";

const API_BASE = (import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:3001" : "")).replace(/\/$/, "");
const DRAFT_KEY = "riq_tailor_draft_v1";
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
const TIP = "Tip: recruiters spend about 7 seconds on a first scan of a resume (Ladders eye-tracking study, 2018) – your title, summary and first bullets do most of the work.";

async function post(path, body) {
  const res = await fetch(`${API_BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/** Where a suggestion's marker sits: a bullet, the role (for a new bullet), or T/S/K. */
const markerTarget = (s) => s.edit?.target || s.target || null;

function readDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
  } catch {
    return null;
  }
}
function writeDraft(draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Private mode or full storage: the session still works, it just won't survive a reload.
  }
}

export default function TailorChat() {
  const [stage, setStage] = useState("loading"); // loading | upload | reading | signin | work
  const [readError, setReadError] = useState(null);
  const [resume, setResume] = useState(null);
  const [jd, setJd] = useState("");
  const [job, setJob] = useState(null); // { title, company }
  const [suggestions, setSuggestions] = useState([]); // [{ id, priority, title, why, edit, question, status, n }]
  const [messages, setMessages] = useState([]); // [{ id, role, text, cards: [suggestion ids] }]
  const [input, setInput] = useState("");
  const [answering, setAnswering] = useState(null); // the question card being answered
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState("half"); // peek | half | full (phones)
  const [focus, setFocus] = useState(null); // highlighted suggestion id
  const [flash, setFlash] = useState(null); // line id that just changed
  const [blankValues, setBlankValues] = useState({}); // suggestion id -> [values for each [number]]
  const [download, setDownload] = useState(false);
  const [baseScore, setBaseScore] = useState(null);
  const resumeRef = useRef(null);
  const chatRef = useRef(null);
  const inputRef = useRef(null);

  // ---- start: the account's resume, or upload ----
  useEffect(() => {
    track("tailor_proto_opened");
    (async () => {
      const session = supabase ? (await supabase.auth.getSession()).data.session : null;
      const draft = readDraft();
      const profile = session ? await loadProfile(session.user.id).catch(() => null) : null;
      if (session && (draft?.resume || profile?.resume)) return startWork(draft?.resume ? draft : { resume: profile.resume });
      setStage("upload");
    })();
  }, []);

  function startWork(state) {
    setResume(state.resume);
    setJd(state.jd || "");
    setJob(state.job || null);
    setSuggestions(state.suggestions || []);
    setBaseScore(state.baseScore ?? null);
    setMessages(
      state.messages?.length
        ? state.messages
        : [{ id: "hello", role: "bot", text: `Your resume is ready${state.resume?.name ? `, ${state.resume.name.split(" ")[0]}` : ""}. Paste the job description you're applying for, and I'll show you exactly what to change.` }],
    );
    setStage("work");
  }

  // Keep the session (resume, job, suggestions, chat) across reloads.
  useEffect(() => {
    if (stage === "work" && resume) writeDraft({ resume, jd, job, suggestions, messages, baseScore });
  }, [stage, resume, jd, job, suggestions, messages, baseScore]);

  async function saveToAccount(parsed) {
    try {
      const session = supabase ? (await supabase.auth.getSession()).data.session : null;
      if (!session) return;
      const [first, ...rest] = String(parsed.name || "").trim().split(/\s+/);
      const existing = await loadProfile(session.user.id).catch(() => null);
      await saveProfile(session.user.id, {
        resume: parsed,
        email: existing?.email || session.user.email,
        first_name: existing?.first_name || first || undefined,
        last_name: existing?.last_name || rest.join(" ") || undefined,
      });
    } catch (e) {
      console.warn("Couldn't save the resume to the account:", e.message);
    }
  }

  async function resumeReady(parsed) {
    writeDraft({ resume: parsed });
    setResume(parsed);
    const session = supabase ? (await supabase.auth.getSession()).data.session : null;
    if (supabase && !session) {
      setStage("signin");
      return;
    }
    if (parsed !== SAMPLE_RESUME) saveToAccount(parsed);
    startWork({ resume: parsed });
  }

  async function onFile(file) {
    setReadError(null);
    setStage("reading");
    const started = Date.now();
    try {
      const text = await readResumeFileText(file);
      const parsed = await extractResumeFromText(text);
      track("tailor_proto_resume_ready", { seconds: Math.round((Date.now() - started) / 1000) });
      await resumeReady(parsed);
    } catch (e) {
      setReadError(e.message || "Couldn't read that resume. Try pasting the text instead.");
      setStage("upload");
    }
  }

  // ---- score: the same quick estimate as the job board, recomputed on every change ----
  const score = useMemo(() => {
    if (!resume || !jd) return null;
    return matchScore(resume, { title: job?.title, jd });
  }, [resume, jd, job]);

  // ---- chat ----
  const say = (role, text, cards = []) => setMessages((m) => [...m, { id: `m${Date.now().toString(36)}${m.length}`, role, text, cards }]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function readJob(text) {
    setBusy(true);
    const started = Date.now();
    try {
      // The resume as it is (removed bullets still in place), so line ids match on both sides.
      const data = await post("/api/tailor/suggest", { resume, jd: text });
      const before = matchScore(resume, { title: data.jobTitle, jd: text });
      setJd(text);
      setJob({ title: data.jobTitle, company: data.company });
      setBaseScore(before);
      const cards = data.suggestions.map((s, i) => ({ ...s, n: i + 1, status: "pending" }));
      setSuggestions(cards);
      const must = cards.filter((s) => s.priority === "must").length;
      say(
        "bot",
        `${data.intro || ""}\n\n${cards.length} suggestions${must ? ` – ${must} must-fix` : ""}. They're numbered on your resume; tap one to see the change.`.trim(),
        cards.map((s) => s.id),
      );
      say("bot", TIP);
      track("tailor_proto_suggestions_shown", {
        count: cards.length,
        must,
        questions: cards.filter((s) => s.question).length,
        seconds: Math.round((Date.now() - started) / 100) / 10,
        score: before,
      });
    } catch (e) {
      say("bot", `I couldn't read that job just now (${e.message}). Please try again.`);
      track("tailor_proto_failed", { step: "suggest" });
    } finally {
      setBusy(false);
    }
  }

  async function send(raw) {
    const text = String(raw ?? input).trim();
    if (!text || busy) return;
    setInput("");
    const question = answering;
    setAnswering(null);
    say("user", text);
    if (!jd) {
      if (/^https?:\/\/\S+$/i.test(text)) {
        say("bot", "Reading job links is coming soon. For now, open the job, copy the whole description, and paste it here.");
        return;
      }
      if (text.length >= MIN_JD_CHARS) {
        track("tailor_proto_jd_pasted", { chars: text.length });
        return readJob(text);
      }
    }
    track("tailor_proto_chat_sent", { answering: !!question, has_jd: !!jd });
    setBusy(true);
    try {
      const history = messages.filter((m) => m.role === "user" || m.text).slice(-10).map((m) => ({ role: m.role, text: m.text }));
      const data = await post("/api/tailor/chat", { resume, jd, jobTitle: job?.title || "", history, message: text, answerTo: question?.question || "" });
      const start = suggestions.length;
      const cards = (data.suggestions || []).map((s, i) => ({ ...s, n: start + i + 1, status: "pending" }));
      if (cards.length) setSuggestions((all) => [...all, ...cards]);
      if (question) setSuggestions((all) => all.map((s) => (s.id === question.id ? { ...s, status: "answered" } : s)));
      say("bot", data.reply, cards.map((s) => s.id));
      if (!jd && text.length < MIN_JD_CHARS) say("bot", "Whenever you're ready, paste the full job description and I'll tailor the whole resume to it.");
    } catch (e) {
      say("bot", `Sorry, that didn't work (${e.message}). Please try again.`);
      track("tailor_proto_failed", { step: "chat" });
    } finally {
      setBusy(false);
    }
  }

  // ---- suggestions ----
  const byId = useMemo(() => new Map(suggestions.map((s) => [s.id, s])), [suggestions]);

  function showOnResume(s) {
    setFocus(s.id);
    const target = markerTarget(s);
    if (!target) return;
    if (window.matchMedia("(max-width: 899px)").matches) setSheet("peek");
    setTimeout(() => {
      const el = resumeRef.current?.querySelector(`[data-line="${target}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
  }

  function openCard(id) {
    setFocus(id);
    if (window.matchMedia("(max-width: 899px)").matches) setSheet("half");
    setTimeout(() => document.getElementById(`card-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 120);
  }

  function filledAfter(s) {
    const values = blankValues[s.id] || [];
    let i = 0;
    return s.edit.after.replace(/\[number\]/g, () => (values[i++] || "").trim() || "[number]");
  }

  function apply(s, { silent = false } = {}) {
    if (s.status !== "pending" || !s.edit) return false;
    if (s.edit.op !== "add_skills" && s.edit.op !== "remove" && textAt(resume, s.edit.target) == null) {
      setSuggestions((all) => all.map((o) => (o.id === s.id ? { ...o, status: "stale" } : o)));
      return false;
    }
    const after = s.edit.after != null ? filledAfter(s) : undefined;
    if (after && after.includes("[number]")) return false;
    setResume((r) => applyEdit(r, s.edit, after));
    setSuggestions((all) => all.map((o) => (o.id === s.id ? { ...o, status: "applied" } : o)));
    setFlash(s.edit.target);
    setTimeout(() => setFlash(null), 1600);
    if (!silent) track("tailor_proto_suggestion_applied", { priority: s.priority, op: s.edit.op, blanks: s.edit.blanks || 0 });
    return true;
  }

  function skip(s) {
    setSuggestions((all) => all.map((o) => (o.id === s.id ? { ...o, status: "skipped" } : o)));
    track("tailor_proto_suggestion_skipped", { priority: s.priority, question: !!s.question });
  }

  function applyAllMust() {
    const ready = suggestions.filter((s) => s.status === "pending" && s.edit && s.priority === "must" && !s.edit.blanks);
    let count = 0;
    // One at a time against the latest resume, so ids stay valid.
    ready.forEach((s) => {
      if (apply(s, { silent: true })) count++;
    });
    track("tailor_proto_apply_all", { count });
    const left = suggestions.filter((s) => s.status === "pending" && s.priority === "must" && (s.question || s.edit?.blanks)).length;
    say("bot", count ? `Applied ${count} must-fix change${count > 1 ? "s" : ""}.${left ? ` ${left} still need your input.` : ""}` : "Nothing left to apply automatically – the remaining must-fixes need your input.");
  }

  function answer(s) {
    setAnswering(s);
    setSheet("half");
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  // ---- markers on the resume ----
  const markers = useMemo(() => {
    const map = new Map();
    for (const s of suggestions) {
      const t = markerTarget(s);
      if (!t || s.status === "skipped" || s.status === "stale" || s.status === "answered") continue;
      if (!map.has(t)) map.set(t, []);
      map.get(t).push(s);
    }
    return map;
  }, [suggestions]);

  const Markers = ({ line }) =>
    (markers.get(line) || []).map((s) => (
      <button
        key={s.id}
        type="button"
        className={`tc-marker tc-marker-${s.status === "applied" ? "done" : s.question ? "ask" : s.priority}${focus === s.id ? " tc-marker-focus" : ""}`}
        onClick={() => openCard(s.id)}
        aria-label={`Suggestion ${s.n}: ${s.title}`}
      >
        {s.status === "applied" ? "✓" : s.question ? `${s.n}?` : s.n}
      </button>
    ));

  const lineClass = (line) => {
    const list = markers.get(line) || [];
    const pending = list.find((s) => s.status === "pending" && s.edit) || list.find((s) => s.status === "pending");
    return ["tc-line", pending ? `tc-line-${pending.edit ? pending.priority : "ask"}` : "", list.some((s) => s.id === focus) ? "tc-line-focus" : "", flash === line ? "tc-line-flash" : ""].join(" ");
  };

  // ---- render ----
  if (stage === "loading") return <div className="tc-center">Loading…</div>;
  if (stage === "reading") return <div className="tc-center"><span className="tc-spin" aria-hidden="true" /> Reading your resume…</div>;
  if (stage === "upload")
    return <UploadStep mode="editor" homeHref="/" error={readError} onFile={onFile} onSample={() => resumeReady(SAMPLE_RESUME)} />;
  if (stage === "signin")
    return (
      <AccountStep
        homeHref="/"
        copy={{
          eyebrow: "Save your resume",
          title: "Sign in so your resume is saved",
          sub: "Enter your email and we'll send you a 6-digit code. Your resume stays in your account, so you can tailor it for every job without uploading again. New here? The same code creates your free account.",
        }}
        initialEmail={(String(resume?.contact || "").match(/[^\s@·|,;<>()]+@[^\s@·|,;<>()]+\.[a-z]{2,}/i) || [""])[0]}
        onDone={() => {
          if (resume !== SAMPLE_RESUME) saveToAccount(resume);
          startWork({ resume });
        }}
      />
    );

  const pending = suggestions.filter((s) => s.status === "pending");
  const mustLeft = pending.filter((s) => s.priority === "must").length;
  const chips = !jd
    ? [{ label: "Try a sample job description", run: () => send(SAMPLE_JD) }]
    : [
        ...(pending.some((s) => s.priority === "must" && s.edit && !s.edit.blanks) ? [{ label: "Apply all must-fix", run: applyAllMust }] : []),
        { label: "Make it 1 page", run: () => send("Make my resume fit on one page: tighten wording and drop the least relevant bullets for this job.") },
        { label: "Stronger summary", run: () => send("Rewrite my summary for this job in 2-3 sentences.") },
        { label: "Fix grammar & tone", run: () => send("Fix grammar and make the wording consistent and confident, without changing facts.") },
      ];
  const r = resume || {};

  return (
    <div className="tc-app">
      <header className="tc-top">
        <a href="/" className="tc-logo" aria-label="ResumeIQ home"><span aria-hidden="true">◈</span> ResumeIQ</a>
        {score != null && (
          <span className="tc-score" title="Keyword and skills match with this job (estimate)">
            {baseScore != null && score !== baseScore && <span className="tc-score-was">{baseScore}%→</span>}
            <b>{score}%</b> match
          </span>
        )}
        <button
          type="button"
          className="tc-btn tc-btn-primary"
          onClick={() => {
            track("tailor_proto_download_clicked", { applied: suggestions.filter((s) => s.status === "applied").length, must_left: mustLeft });
            setDownload(true);
          }}
        >
          Download
        </button>
      </header>

      <div className={`tc-body tc-sheet-${sheet}`}>
        {/* The resume, with numbered markers on the lines suggestions change. */}
        <main className="tc-resume-wrap" ref={resumeRef} onClick={() => sheet === "full" && setSheet("half")}>
          {job?.title && (
            <p className="tc-job">
              Tailoring for <b>{job.title}</b>{job.company ? ` at ${job.company}` : ""}
            </p>
          )}
          <article className="tc-resume">
            <h1 className="tc-name">{r.name}</h1>
            {r.title && <p data-line="T" className={`${lineClass("T")} tc-title`}>{r.title}<Markers line="T" /></p>}
            {r.contact && <p className="tc-contact">{r.contact}</p>}
            {r.summary && (
              <section>
                <h2>Summary</h2>
                <p data-line="S" className={lineClass("S")}>{r.summary}<Markers line="S" /></p>
              </section>
            )}
            {(r.experience || []).length > 0 && (
              <section>
                <h2>Experience</h2>
                {r.experience.map((e, i) => (
                  <div key={i} className="tc-role">
                    <div data-line={`E${i}`} className={`${lineClass(`E${i}`)} tc-role-head`}>
                      <span><b>{e.role}</b>{e.company ? ` · ${e.company}` : ""}</span>
                      <span className="tc-period">{e.period}</span>
                      <Markers line={`E${i}`} />
                    </div>
                    <ul>
                      {(e.bullets || []).map((b, j) =>
                        b == null ? null : (
                          <li key={j} data-line={`E${i}B${j}`} className={lineClass(`E${i}B${j}`)}>
                            {b}
                            <Markers line={`E${i}B${j}`} />
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                ))}
              </section>
            )}
            {(r.education || []).length > 0 && (
              <section>
                <h2>Education</h2>
                {r.education.map((ed, i) => (
                  <p key={i} className="tc-line">{[ed.degree, ed.school, ed.year].filter(Boolean).join(" · ")}</p>
                ))}
              </section>
            )}
            {(r.skills || []).length > 0 && (
              <section>
                <h2>Skills</h2>
                <p data-line="K" className={lineClass("K")}>{r.skills.join(" · ")}<Markers line="K" /></p>
              </section>
            )}
          </article>
        </main>

        {/* Chat: a sheet over the bottom of the screen on phones, a side panel on wide screens. */}
        <aside className="tc-chat" aria-label="Resume assistant">
          <button
            type="button"
            className="tc-handle"
            aria-label={sheet === "full" ? "Shrink chat" : "Expand chat"}
            onClick={() => setSheet((s) => (s === "full" ? "half" : s === "half" ? "full" : "half"))}
          >
            <span />
            {sheet === "peek" && pending.length > 0 && <em>{pending.length} suggestion{pending.length > 1 ? "s" : ""} – tap to open</em>}
          </button>
          <div className="tc-messages" ref={chatRef}>
            {messages.map((m) => (
              <div key={m.id} className={`tc-msg tc-msg-${m.role}`}>
                {m.text && <p>{m.text}</p>}
                {(m.cards || []).map((id) => {
                  const s = byId.get(id);
                  if (!s) return null;
                  const before = s.before ?? (s.edit ? textAt(resume, s.edit.target) : null);
                  const impact = s.status === "pending" && s.edit && jd ? scoreImpact(resume, s.edit, { title: job?.title, jd }) : null;
                  const blanks = s.edit?.after ? (s.edit.after.match(/\[number\]/g) || []).length : 0;
                  return (
                    <div key={id} id={`card-${id}`} className={`tc-card tc-card-${s.status}${focus === id ? " tc-card-focus" : ""}`}>
                      <div className="tc-card-head">
                        <span className={`tc-dot tc-dot-${s.status === "applied" ? "done" : s.priority}`}>{s.status === "applied" ? "✓" : s.n}</span>
                        <b>{s.title}</b>
                        {s.priority === "must" && s.status === "pending" && <span className="tc-tag">Must-fix</span>}
                        {impact != null && impact !== 0 && <span className={`tc-impact${impact < 0 ? " tc-impact-down" : ""}`}>{impact > 0 ? "+" : ""}{impact}% match</span>}
                      </div>
                      {s.why && <p className="tc-why">{s.why}</p>}
                      {s.question && <p className="tc-question">{s.question}</p>}
                      {s.edit && s.edit.op !== "add_skills" && s.edit.op !== "remove" && (
                        <div className="tc-diff">
                          {before ? <del>{before}</del> : <span className="tc-new">New bullet</span>}
                          <ins>{s.edit.after}</ins>
                        </div>
                      )}
                      {s.edit?.op === "add_skills" && <div className="tc-diff"><ins>Add skills: {s.edit.skills.join(", ")}</ins></div>}
                      {s.edit?.op === "remove" && <div className="tc-diff"><del>{before}</del><span className="tc-new">Remove this bullet</span></div>}
                      {s.status === "pending" && blanks > 0 && (
                        <div className="tc-blanks">
                          {Array.from({ length: blanks }, (_, k) => (
                            <label key={k}>
                              Fill in the {blanks > 1 ? `${k + 1}${["st", "nd", "rd"][k] || "th"} ` : ""}number
                              <input
                                inputMode="decimal"
                                value={(blankValues[s.id] || [])[k] || ""}
                                onChange={(ev) => setBlankValues((v) => ({ ...v, [s.id]: Object.assign([...(v[s.id] || [])], { [k]: ev.target.value }) }))}
                                placeholder="e.g. 30"
                              />
                            </label>
                          ))}
                        </div>
                      )}
                      {s.status === "pending" ? (
                        <div className="tc-card-actions">
                          {s.edit ? (
                            <button
                              type="button"
                              className="tc-btn tc-btn-primary"
                              disabled={blanks > 0 && ((blankValues[s.id] || []).filter((v) => v && v.trim()).length < blanks)}
                              onClick={() => apply(s)}
                            >
                              Apply
                            </button>
                          ) : (
                            <button type="button" className="tc-btn tc-btn-primary" onClick={() => answer(s)}>Answer</button>
                          )}
                          {markerTarget(s) && <button type="button" className="tc-btn" onClick={() => showOnResume(s)}>Show on resume</button>}
                          <button type="button" className="tc-btn tc-btn-quiet" onClick={() => skip(s)}>Skip</button>
                        </div>
                      ) : (
                        <p className="tc-status">{{ applied: "Applied", skipped: "Skipped", stale: "This line changed – no longer applies", answered: "Answered" }[s.status]}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
            {busy && <div className="tc-msg tc-msg-bot tc-typing"><span /><span /><span /></div>}
          </div>
          <div className="tc-chips">
            {chips.map((c) => (
              <button key={c.label} type="button" className="tc-chip" disabled={busy} onClick={c.run}>{c.label}</button>
            ))}
          </div>
          <form
            className="tc-input"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            {answering && (
              <p className="tc-answering">
                Answering: {answering.question} <button type="button" onClick={() => setAnswering(null)} aria-label="Cancel answer">✕</button>
              </p>
            )}
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onFocus={() => sheet === "peek" && setSheet("half")}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !window.matchMedia("(pointer: coarse)").matches) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={jd ? "Ask for any change…" : "Paste the job description here…"}
              aria-label={jd ? "Message" : "Job description"}
            />
            <button type="submit" className="tc-send" disabled={busy || !input.trim()} aria-label="Send">➤</button>
          </form>
        </aside>
      </div>

      {download && (
        <div className="tc-scrim" role="dialog" aria-modal="true" aria-label="Download your resume" onClick={() => setDownload(false)}>
          <div className="tc-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Download your resume</h2>
            {mustLeft > 0 && <p className="tc-warn">{mustLeft} must-fix suggestion{mustLeft > 1 ? "s are" : " is"} still open.</p>}
            <p className="tc-pay">Payment step goes here. (Prototype: download is free.)</p>
            <button
              type="button"
              className="tc-btn tc-btn-primary tc-btn-wide"
              onClick={() => {
                const out = finalResume(resume);
                downloadResumePdf(out, typeof out.photoUrl === "string" && out.photoUrl.startsWith("data:") ? out.photoUrl : null);
                track("tailor_proto_downloaded", { applied: suggestions.filter((s) => s.status === "applied").length, score });
                setDownload(false);
              }}
            >
              Download PDF
            </button>
            <button type="button" className="tc-btn tc-btn-quiet tc-btn-wide" onClick={() => setDownload(false)}>Keep editing</button>
          </div>
        </div>
      )}
    </div>
  );
}
