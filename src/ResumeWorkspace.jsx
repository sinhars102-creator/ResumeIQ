/**
 * Line-level review workspace (Resume LLM, after the suggestions are ready).
 *
 * Laptop: the resume on the left with numbered margin pins; recommendations on the right (filter tabs, cards
 * with Current / Suggested diffs, Apply / Edit / Dismiss, Undo / Restore). Phone: the resume full screen with
 * a fixed-height bottom sheet that steps through suggestions; the line being edited stays visible above it.
 *
 * All state lives in ResumeLLM (one source of truth: the resume shown is the resume edited). This file only
 * renders it and reports what the person does.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { textAt } from "./tailorEdits.js";
import { wordDiff } from "./wordDiff.js";
import { finalText, isReady, blanksIn } from "./workspaceText.js";

const PHONE = "(max-width: 899px)";
const UPGRADE_FROM = /^(helped|assisted|supported|contributed|worked|participated|involved)/i;
const UPGRADE_TO = /^(led|owned|spearheaded|headed|drove|launched|directed|managed)/i;

function Diff({ before, after, show = "both" }) {
  const parts = wordDiff(before, after).filter((p) => !(show === "after" && p.t === "-") && !(show === "before" && p.t === "+"));
  return parts.map((p, i) => {
    const sep = i < parts.length - 1 ? " " : "";
    if (p.t === "=") return <span key={i}>{p.text}{sep}</span>;
    return p.t === "-" ? <span key={i}><del>{p.text}</del>{sep}</span> : <span key={i}><ins>{p.text}</ins>{sep}</span>;
  });
}

export default function ResumeWorkspace(props) {
  const { resume, suggestions, title, subtitle, score, busy, status, blankValues, setBlankValues, flash, deltaOf, keywordsOf, act, extras, thread = [] } = props;
  const [isPhone, setIsPhone] = useState(() => window.matchMedia(PHONE).matches);
  const [filter, setFilter] = useState("all");
  const [active, setActive] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editText, setEditText] = useState("");
  const [answers, setAnswers] = useState({});
  const [highlight, setHighlight] = useState(true);
  const [sheet, setSheet] = useState(null); // phone: suggestion id | "finish" | "ask" | null
  const [justApplied, setJustApplied] = useState(null);
  const [ask, setAsk] = useState("");
  const paperRef = useRef(null);
  const scrollRef = useRef(null);
  const sheetRef = useRef(null);
  const cardsRef = useRef(null);
  const threadRef = useRef(null);
  const timer = useRef(null);
  // Keep the newest message of the conversation in view.
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.length, busy, sheet]);

  // The conversation: your messages and the replies, in order, with a typing indicator while a reply is on its way.
  const threadEl = () =>
    thread.length || busy ? (
      <div className="ws-thread" ref={threadRef} role="log" aria-live="polite" aria-label="Conversation">
        {thread.map((m) => (
          <div key={m.id} className={`ws-bub ws-bub-${m.role}`}>{m.text}</div>
        ))}
        {busy && <div className="ws-bub ws-bub-bot ws-typing" aria-label="Working"><span /><span /><span /></div>}
      </div>
    ) : null;
  const sendAsk = () => {
    const text = ask.trim();
    if (!text || busy) return;
    act.ask(text);
    setAsk("");
  };
  const askKeys = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      sendAsk();
    }
  };


  useEffect(() => {
    const mq = window.matchMedia(PHONE);
    const on = () => setIsPhone(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  const list = useMemo(() => Object.values(suggestions).filter((s) => s.pin != null).sort((a, b) => a.pin - b.pin), [suggestions]);
  const counts = { all: list.length, pending: 0, applied: 0, dismissed: 0 };
  list.forEach((s) => (counts[s.status === "done" ? "applied" : s.status] = (counts[s.status === "done" ? "applied" : s.status] || 0) + 1));
  const pendingList = list.filter((s) => s.status === "pending");
  const lineOf = (s) => s.edit?.target || s.target || null;

  // ---- linking ----
  function scrollToLine(id, { centerAbove = false } = {}) {
    const s = suggestions[id];
    const el = paperRef.current?.querySelector(`[data-line="${lineOf(s)}"]`);
    if (!el) return;
    if (centerAbove && scrollRef.current) {
      // Phone: put the line in the middle of the space above the sheet.
      const box = scrollRef.current;
      const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
      const visible = box.clientHeight - (sheetRef.current?.offsetHeight || 0);
      box.scrollTo({ top: Math.max(0, top - Math.max(16, (visible - el.offsetHeight) / 2)), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    } else el.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  function select(id, from) {
    setActive(id);
    act.opened(id, from);
    if (isPhone) return openSheet(id, from);
    if (from === "resume") {
      if (filter !== "all" && suggestions[id].status !== filter) setFilter("all");
      setTimeout(() => cardsRef.current?.querySelector(`#ws-card-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 30);
    } else scrollToLine(id);
  }

  // ---- phone sheet ----
  function openSheet(id, from = "review") {
    clearTimeout(timer.current);
    setJustApplied(null);
    setEditing(null);
    setSheet(id);
    setActive(typeof id === "string" && suggestions[id] ? id : null);
    if (suggestions[id]) {
      act.opened(id, from);
      requestAnimationFrame(() => requestAnimationFrame(() => scrollToLine(id, { centerAbove: true })));
    }
  }
  const nextPending = (fromPin) => {
    for (let k = 1; k <= list.length; k++) {
      const s = list[(list.findIndex((x) => x.pin === fromPin) + k + list.length) % list.length];
      if (s?.status === "pending") return s.id;
    }
    return null;
  };
  function closeSheet() {
    clearTimeout(timer.current);
    setSheet(null);
    setJustApplied(null);
    setEditing(null);
    setActive(null);
  }
  function step(dir) {
    const cur = suggestions[sheet];
    if (!cur || !list.length) return;
    const i = list.findIndex((x) => x.id === cur.id);
    openSheet(list[(i + dir + list.length) % list.length].id, "swipe");
  }
  function afterDecision(id) {
    const n = nextPending(suggestions[id].pin);
    if (n && n !== id) openSheet(n);
    else {
      setSheet("finish");
      setActive(null);
    }
  }

  // ---- actions ----
  function apply(s) {
    const text = finalText(s, blankValues[s.id]);
    if (!isReady(s, blankValues[s.id])) return;
    act.apply(s.id, text);
    setEditing(null);
    setActive(s.id);
    if (isPhone) {
      setJustApplied(s.id);
      timer.current = setTimeout(() => {
        setJustApplied(null);
        afterDecision(s.id);
      }, 1000);
    } else setTimeout(() => scrollToLine(s.id), 60);
  }
  function startEdit(s) {
    setEditing(s.id);
    setEditText(finalText(s, blankValues[s.id]) ?? textAt(resume, lineOf(s)) ?? "");
  }
  function saveEdit(s) {
    if (editText.trim()) act.saveEdit(s.id, editText.trim());
    setEditing(null);
  }

  // ---- pieces ----
  const tone = (s) => (s.status === "applied" || s.status === "done" ? "done" : s.status === "dismissed" ? "off" : s.question ? "ask" : s.priority === "must" ? "must" : "nice");
  const pinEl = (s, from) => (
    <button key={s.id} type="button" className={`ws-pin ws-pin-${tone(s)}${active === s.id ? " ws-pin-on" : ""}`} onClick={(e) => { e.stopPropagation(); select(s.id, from); }} aria-label={`Recommendation ${s.pin}, ${s.status}`}>
      {s.status === "applied" || s.status === "done" ? "✓" : s.pin}
    </button>
  );

  const byLine = useMemo(() => {
    const m = new Map();
    list.forEach((s) => {
      const l = lineOf(s);
      if (!l || s.status === "done") return;
      if (!m.has(l)) m.set(l, []);
      m.get(l).push(s);
    });
    return m;
  }, [list]);

  /** A line of the resume: its pins in the margin, and – once a change is applied – the added words marked. */
  function lineEl(id, children, { as = "p", className = "", key } = {}) {
    const Tag = as;
    const here = byLine.get(id) || [];
    const lead = here.find((s) => s.id === active) || here.find((s) => s.status === "pending") || here[0];
    const applied = here.find((s) => s.status === "applied" && s.before != null && s.edit?.op === "replace");
    const now = textAt(resume, id);
    const shown = applied && highlight && now != null ? <Diff before={applied.before} after={now} show="after" /> : children;
    const cls = ["ws-ln", here.length ? "ws-has" : "", lead && active === lead.id ? `ws-on ws-on-${tone(lead)}` : "", flash === id ? "ws-flash" : "", className].join(" ");
    return (
      <Tag key={key} data-line={id} className={cls} tabIndex={here.length ? 0 : undefined} onClick={here.length ? () => select(lead.id, "resume") : undefined} onKeyDown={(e) => { if (here.length && e.key === "Enter") select(lead.id, "resume"); }}>
        {here.length > 0 && <span className="ws-pins">{here.map((s) => pinEl(s, "resume"))}</span>}
        {shown}
      </Tag>
    );
  }

  const r = resume || {};
  const paper = (
    <article className="ws-paper" ref={paperRef}>
      <h2 className="ws-name">{r.name}</h2>
      {lineEl("T", r.title || <span className="ws-empty">No headline</span>, { className: "ws-title" })}
      {lineEl("C", r.contact || <span className="ws-empty">No contact details</span>, { className: "ws-contact" })}
      {(r.summary || byLine.has("S")) && (
        <section>
          <h3>Summary</h3>
          {lineEl("S", r.summary || <span className="ws-empty">No summary yet</span>)}
        </section>
      )}
      {(r.experience || []).length > 0 && (
        <section>
          <h3>Experience</h3>
          {r.experience.map((e, i) => (
            <div key={i} className="ws-job">
              {lineEl(`E${i}`, <><strong>{[e.role, e.company].filter(Boolean).join(" · ")}</strong><span>{e.period}</span></>, { as: "div", className: "ws-job-hd" })}
              <ul>
                {(e.bullets || []).map((b, j) => (b == null ? null : lineEl(`E${i}B${j}`, b, { as: "li", key: j })))}
              </ul>
            </div>
          ))}
        </section>
      )}
      {(r.education || []).length > 0 && (
        <section>
          <h3>Education</h3>
          {r.education.map((ed, i) => <p key={i} className="ws-ln">{[ed.degree, ed.school, ed.year].filter(Boolean).join(" · ")}</p>)}
        </section>
      )}
      <section>
        <h3>Skills</h3>
        {lineEl("K", (r.skills || []).join(" · ") || <span className="ws-empty">No skills listed</span>)}
      </section>
      {((r.certifications || []).length > 0 || byLine.has("Z")) && (
        <section>
          <h3>Certifications</h3>
          {lineEl("Z", (r.certifications || []).join(" · ") || <span className="ws-empty">None added yet</span>)}
        </section>
      )}
    </article>
  );

  /** Current and suggested text for a card (desktop: two blocks) or the sheet (phone: one inline diff). */
  function changeEl(s, inline) {
    const before = s.before ?? textAt(resume, lineOf(s)) ?? "";
    const after = finalText(s, blankValues[s.id]);
    if (s.edit?.op === "add_skills") return <div className="ws-txt">{(resume.skills || []).join(" · ")} · <ins>{s.edit.skills.join(" · ")}</ins></div>;
    if (s.edit?.op === "add_certifications") return <div className="ws-txt"><ins>{s.edit.items.join(" · ")}</ins></div>;
    if (s.edit?.op === "set_skills") {
      const keep = new Set(s.edit.skills.map((x) => x.toLowerCase()));
      return <div className="ws-txt">{(resume.skills || []).map((x, i) => <span key={i}>{i ? " · " : ""}{keep.has(String(x).toLowerCase()) ? x : <del>{x}</del>}</span>)}</div>;
    }
    if (s.edit?.op === "remove") return <div className="ws-txt"><del>{before}</del></div>;
    if (s.edit?.op === "add_bullet") return <><div className="ws-dl">New bullet</div><div className="ws-txt"><ins>{after}</ins></div></>;
    if (inline) return <div className="ws-txt"><Diff before={before} after={after} /></div>;
    return (
      <>
        <div className="ws-dl">Current</div>
        <div className="ws-txt"><Diff before={before} after={after} show="before" /></div>
        <div className="ws-dl">Suggested</div>
        <div className="ws-txt">{editing === s.id ? null : <Diff before={before} after={after} show="after" />}</div>
      </>
    );
  }

  function inputsEl(s) {
    const n = blanksIn(s);
    if (!n) return null;
    return (
      <div className="ws-ask">
        {Array.from({ length: n }, (_, k) => (
          <label key={k}>
            {n > 1 ? `Number ${k + 1}` : "The number for this result"}
            <input inputMode="decimal" placeholder="e.g. 18" value={(blankValues[s.id] || [])[k] || ""} onChange={(e) => setBlankValues((v) => ({ ...v, [s.id]: Object.assign([...(v[s.id] || [])], { [k]: e.target.value }) }))} />
          </label>
        ))}
      </div>
    );
  }

  const warningOf = (s) => {
    const before = s.before ?? "";
    const after = finalText(s, blankValues[s.id]) || "";
    const verb = (after.match(UPGRADE_TO) || [])[0];
    return verb && UPGRADE_FROM.test(before.trim()) ? `Use "${verb}" only if you led this. Otherwise, dismiss.` : null;
  };

  function questionEl(s, compact) {
    const value = answers[s.id] || "";
    return (
      <form className="ws-qa" onSubmit={(e) => { e.preventDefault(); if (value.trim()) { act.answer(s.id, value.trim()); setAnswers((a) => ({ ...a, [s.id]: "" })); } }}>
        <p className="ws-q">{s.question}</p>
        <div className="ws-qa-row">
          {compact ? <input value={value} onChange={(e) => setAnswers((a) => ({ ...a, [s.id]: e.target.value }))} placeholder="Your answer" aria-label="Your answer" /> : <textarea rows={2} value={value} onChange={(e) => setAnswers((a) => ({ ...a, [s.id]: e.target.value }))} placeholder="Your answer" aria-label="Your answer" />}
          <button type="submit" className="ws-btn ws-pri" disabled={busy || !value.trim()}>{busy ? "…" : "Send"}</button>
        </div>
        {s.note && <p className="ws-note">{s.note}</p>}
      </form>
    );
  }

  function cardEl(s) {
    const on = active === s.id ? " ws-card-on" : "";
    const delta = s.status === "pending" && s.edit ? deltaOf(s, finalText(s, blankValues[s.id])) : null;
    const kws = s.status === "pending" && s.edit ? keywordsOf(s, finalText(s, blankValues[s.id])) : [];
    const head = (
      <div className="ws-ch" onClick={() => select(s.id, "card")}>
        <span className={`ws-num ws-pin-${tone(s)}`}>{s.status === "applied" || s.status === "done" ? "✓" : s.pin}</span>
        <span className="ws-where">{s.where}</span>
        <span className={`ws-tag ws-tag-${tone(s)}`}>{s.title}</span>
        {delta > 0 && <span className="ws-pts">+{delta}</span>}
      </div>
    );
    if (s.status === "applied") {
      return (
        <div className={`ws-card ws-card-applied${on}`} id={`ws-card-${s.id}`}>
          {head}
          {s.appliedText && <div className="ws-txt ws-mt">{s.appliedText}</div>}
          <div className="ws-done"><span>Applied to your resume</span>{s.undo && <button type="button" className="ws-lnk" onClick={() => act.undo(s.id)}>Undo</button>}</div>
        </div>
      );
    }
    if (s.status === "done") {
      return <div className={`ws-card ws-card-applied${on}`} id={`ws-card-${s.id}`}>{head}<div className="ws-done"><span>{s.note || "Done – see the new suggestions"}</span></div></div>;
    }
    if (s.status === "dismissed") {
      return (
        <div className={`ws-card ws-card-off${on}`} id={`ws-card-${s.id}`}>
          {head}
          <div className="ws-done"><span>Dismissed, your original line is kept</span><button type="button" className="ws-lnk" onClick={() => act.restore(s.id)}>Restore</button></div>
        </div>
      );
    }
    const warn = warningOf(s);
    return (
      <div className={`ws-card${on}`} id={`ws-card-${s.id}`}>
        {head}
        {s.why && <p className="ws-why">{s.why}</p>}
        {s.question ? (
          questionEl(s)
        ) : s.action ? (
          <div className="ws-acts"><button type="button" className="ws-btn ws-pri" disabled={busy} onClick={() => act.action(s.id)}>Do it</button><button type="button" className="ws-btn" onClick={() => act.dismiss(s.id)}>Dismiss</button></div>
        ) : (
          <>
            {changeEl(s)}
            {editing === s.id && <textarea className="ws-edit" value={editText} onChange={(e) => setEditText(e.target.value)} aria-label="Edit suggestion" autoFocus />}
            {editing !== s.id && inputsEl(s)}
            {warn && <p className="ws-warn">{warn}</p>}
            {kws.length > 0 && <div className="ws-kw">Adds {kws.map((k) => <span key={k}>{k}</span>)}</div>}
            <div className="ws-acts">
              {editing === s.id ? (
                <>
                  <button type="button" className="ws-btn ws-pri" onClick={() => saveEdit(s)}>Save edit</button>
                  <button type="button" className="ws-btn" onClick={() => setEditing(null)}>Cancel</button>
                </>
              ) : (
                <>
                  <button type="button" className="ws-btn ws-pri" disabled={!isReady(s, blankValues[s.id])} onClick={() => apply(s)}>Apply to resume</button>
                  {s.edit?.after != null && <button type="button" className="ws-btn" onClick={() => startEdit(s)}>Edit</button>}
                  <button type="button" className="ws-btn" onClick={() => act.dismiss(s.id)}>Dismiss</button>
                  {s.edit?.after != null && <button type="button" className="ws-lnk" disabled={busy} onClick={() => act.regenerate(s.id)}>↻ Another version</button>}
                </>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  const scoreBlock = (
    <div className="ws-score" aria-live="polite">
      <div className="ws-score-row"><span>{score.label}</span><span>{score.potential > score.now ? `up to ${score.potential}${score.unit} if all applied` : ""}</span></div>
      <div className="ws-score-row"><b>{score.now}{score.unit}</b><span>{score.now > score.base ? `+${score.now - score.base} from ${score.base}` : ""}</span></div>
      <div className="ws-bar"><u style={{ width: `${Math.min(100, score.potential)}%` }} /><i style={{ width: `${Math.min(100, score.now)}%` }} /></div>
    </div>
  );

  // ---------------- phone ----------------
  if (isPhone) {
    const s = suggestions[sheet];
    const open = sheet != null;
    const applied = list.filter((x) => x.status === "applied" || x.status === "done").length;
    const dismissed = list.filter((x) => x.status === "dismissed").length;
    const left = pendingList.length;
    let body = null;
    if (sheet === "finish") {
      body = (
        <>
          <button type="button" className="ws-grab" onClick={closeSheet} aria-label="Close" />
          <div className="ws-sb">
            <div className="ws-fin">
              <h3>{left ? "Almost there" : score.label === "Match" ? "Resume tailored" : "Resume improved"}</h3>
              <p>{applied} applied · {dismissed} skipped{left ? ` · ${left} left` : ""}</p>
              <div className="ws-big">{score.base}{score.unit} → {score.now}{score.unit}</div>
              <p>{score.label === "Match" ? "match score for this job" : "resume strength"}</p>
            </div>
          </div>
          <div className="ws-sf">
            {left ? <button type="button" className="ws-btn ws-grow" onClick={() => openSheet(pendingList[0].id)}>Review {left} left</button> : null}
            <button type="button" className="ws-btn ws-pri ws-grow" onClick={act.download}>Download PDF</button>
          </div>
          {extras?.length > 0 && <div className="ws-extras">{extras.map((x) => <button key={x.label} type="button" className="ws-lnk" onClick={x.run}>{x.label}</button>)}</div>}
        </>
      );
    } else if (sheet === "ask") {
      body = (
        <>
          <button type="button" className="ws-grab" onClick={closeSheet} aria-label="Close" />
          {threadEl() || <div className="ws-sb"><p className="ws-why">Chat with me about your resume – e.g. "make it fit on one page" or "add that I led a team of 6".</p></div>}
          <form className="ws-chatform" onSubmit={(e) => { e.preventDefault(); sendAsk(); }}>
            <textarea className="ws-edit" rows={2} value={ask} onChange={(e) => setAsk(e.target.value)} onKeyDown={askKeys} placeholder="Message…" autoFocus />
            <button type="submit" className="ws-btn ws-pri" disabled={busy || !ask.trim()}>Send</button>
          </form>
        </>
      );
    } else if (s) {
      const i = list.findIndex((x) => x.id === s.id);
      const head = (
        <>
          <button type="button" className="ws-grab" onClick={closeSheet} aria-label="Close" />
          <div className="ws-sh">
            <button type="button" className="ws-nav" onClick={() => step(-1)} aria-label="Previous suggestion">‹</button>
            <div><b>{s.pin}. {s.where}</b><span>{i + 1} of {list.length} · {s.title}{s.status === "pending" && s.edit && deltaOf(s, finalText(s, blankValues[s.id])) > 0 ? ` · +${deltaOf(s, finalText(s, blankValues[s.id]))}` : ""}</span></div>
            <button type="button" className="ws-nav" onClick={() => step(1)} aria-label="Next suggestion">›</button>
          </div>
        </>
      );
      if (justApplied === s.id) body = <>{head}<div className="ws-sb"><div className="ws-ok">✓ Applied to your resume</div></div></>;
      else if (s.status !== "pending") {
        const ap = s.status === "applied" || s.status === "done";
        body = (
          <>
            {head}
            <div className="ws-sb"><p className="ws-why">{ap ? "Applied. The line above now reads:" : "Skipped. Your original line is kept."}</p><div className="ws-txt">{ap ? s.appliedText || textAt(resume, lineOf(s)) : s.before}</div></div>
            <div className="ws-sf">
              {ap ? s.undo && <button type="button" className="ws-btn ws-grow" onClick={() => act.undo(s.id)}>Undo</button> : <button type="button" className="ws-btn ws-grow" onClick={() => act.restore(s.id)}>Restore</button>}
              <button type="button" className="ws-btn ws-pri ws-grow" onClick={() => step(1)}>Next</button>
            </div>
          </>
        );
      } else {
        const warn = warningOf(s);
        body = (
          <>
            {head}
            <div className="ws-sb">
              {s.why && <p className="ws-why">{s.why}</p>}
              {s.question ? questionEl(s, true) : s.action ? null : (
                <>
                  {editing === s.id ? <textarea className="ws-edit" value={editText} onChange={(e) => setEditText(e.target.value)} aria-label="Edit suggestion" autoFocus /> : changeEl(s, true)}
                  {editing !== s.id && inputsEl(s)}
                  {warn && <p className="ws-warn">{warn}</p>}
                  {s.edit?.after != null && editing !== s.id && <button type="button" className="ws-lnk" disabled={busy} onClick={() => act.regenerate(s.id)}>↻ Another version</button>}
                </>
              )}
            </div>
            <div className="ws-sf">
              {editing === s.id ? (
                <>
                  <button type="button" className="ws-btn ws-grow" onClick={() => setEditing(null)}>Cancel</button>
                  <button type="button" className="ws-btn ws-pri ws-grow" onClick={() => saveEdit(s)}>Save edit</button>
                </>
              ) : (
                <>
                  <button type="button" className="ws-btn" onClick={() => { act.dismiss(s.id); afterDecision(s.id); }}>Skip</button>
                  {s.edit?.after != null && <button type="button" className="ws-btn" onClick={() => startEdit(s)}>Edit</button>}
                  {s.action ? (
                    <button type="button" className="ws-btn ws-pri ws-grow" disabled={busy} onClick={() => { act.action(s.id); afterDecision(s.id); }}>Do it</button>
                  ) : !s.question && (
                    <button type="button" className="ws-btn ws-pri ws-grow" disabled={!isReady(s, blankValues[s.id])} onClick={() => apply(s)}>Apply</button>
                  )}
                </>
              )}
            </div>
          </>
        );
      }
    }
    return (
      <div className="ws ws-phone">
        <div className="ws-ptop">
          <div className="ws-ptop-row">
            <div className="ws-ptitle"><b>{title}</b>{subtitle && <span>{subtitle}</span>}</div>
            <div className="ws-psc"><b>{score.now}{score.unit}</b><small>{score.label.toLowerCase()}</small></div>
            <button type="button" className="ws-btn ws-pri ws-sm" onClick={() => (left ? openSheet(pendingList[0].id) : setSheet("finish"))}>{left ? `Review ${left}` : "Finish"}</button>
          </div>
          <div className="ws-pbar"><i style={{ width: `${Math.min(100, score.now)}%` }} /></div>
          <div className="ws-ptools">
            <button type="button" className="ws-lnk" onClick={() => setSheet("ask")}>✎ Ask for a change</button>
            <span className="ws-status" role="status">{busy ? "Working…" : status}</span>
          </div>
        </div>
        <div className={`ws-pscroll${open ? " ws-pscroll-open" : ""}`} ref={scrollRef}>{paper}</div>
        <div className={`ws-sheet${open ? " ws-sheet-open" : ""}`} ref={sheetRef} aria-label="Suggestion"
          onPointerDown={(e) => { sheetRef.current.sx = e.clientX; sheetRef.current.sy = e.clientY; }}
          onPointerUp={(e) => {
            if (!s || e.target.closest("input,textarea")) return;
            const dx = e.clientX - sheetRef.current.sx;
            const dy = e.clientY - sheetRef.current.sy;
            if (Math.abs(dx) > 60 && Math.abs(dy) < 45) step(dx < 0 ? 1 : -1);
          }}>
          {open && body}
        </div>
      </div>
    );
  }

  // ---------------- laptop ----------------
  const shown = list.filter((s) => filter === "all" || (filter === "applied" ? s.status === "applied" || s.status === "done" : s.status === filter));
  return (
    <div className="ws ws-desk">
      <div className="ws-head">
        <div className="ws-head-top">
          <div>
            <h1>{title}</h1>
            <p className="ws-sub">{subtitle ? `${subtitle} · ` : ""}{counts.applied || 0} of {list.length} suggestions applied</p>
          </div>
          {scoreBlock}
        </div>
        <div className="ws-tools">
          <button type="button" className="ws-btn ws-pri" disabled={busy || !pendingList.some((s) => isReady(s, blankValues[s.id]))} onClick={act.applyAll}>Apply all ready</button>
          <button type="button" className="ws-btn" onClick={act.reset}>Reset</button>
          <label className="ws-tog"><input type="checkbox" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} /> Highlight changes on resume</label>
          <button type="button" className="ws-btn" onClick={act.download}>Download PDF</button>
          {extras?.map((x) => <button key={x.label} type="button" className="ws-lnk" onClick={x.run}>{x.label}</button>)}
          <span className="ws-status" role="status">{busy ? "Working…" : status}</span>
        </div>
      </div>
      <div className="ws-main">
        <section className="ws-left" aria-label="Resume">{paper}</section>
        <aside className="ws-right" aria-label="Recommendations">
          <div className="ws-right-scroll" ref={cardsRef}>
          <div className="ws-tabs">
            {[["all", "All"], ["pending", "To review"], ["applied", "Applied"], ["dismissed", "Dismissed"]].map(([k, l]) => (
              <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l} {counts[k] || 0}</button>
            ))}
          </div>
          {shown.length ? shown.map((s) => <div key={s.id}>{cardEl(s)}</div>) : <p className="ws-empty-list">Nothing here yet.</p>}
          </div>
          <div className="ws-dock">
            {threadEl()}
            <form className="ws-askbox" onSubmit={(e) => { e.preventDefault(); sendAsk(); }}>
              <textarea rows={1} value={ask} onChange={(e) => setAsk(e.target.value)} onKeyDown={askKeys} placeholder='Message – e.g. "add that I led a team of 6"' aria-label="Message" />
              <button type="submit" className="ws-btn ws-pri" disabled={busy || !ask.trim()}>Send</button>
            </form>
          </div>
        </aside>
      </div>
    </div>
  );
}
