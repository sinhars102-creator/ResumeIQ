/**
 * Line-level review workspace (Resume LLM, after the suggestions are ready).
 *
 * Laptop: the resume on the left with numbered margin pins; on the right ONE full-height chat panel. Exactly one
 * suggestion is open at a time: a strip at the top of the panel names it (‹ › to step), the thread below is that
 * suggestion's own conversation and its proposed change, and the composer replies about it. Clearing the strip
 * turns the composer to the whole resume ("make it fit on one page"). A new bullet shows on the resume as a
 * dashed "proposed" line until it's applied.
 *
 * Phone: the resume full screen with a bottom sheet in three sizes – a peek (the open suggestion with
 * Apply / Discuss / Skip), the chat (that suggestion's thread and a composer) and the list of all suggestions.
 *
 * All state that matters lives in ResumeLLM (one source of truth: the resume shown is the resume edited). This
 * file only renders it and reports what the person does.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { textAt } from "./tailorEdits.js";
import { wordDiff } from "./wordDiff.js";
import { finalText, isReady, blanksIn } from "./workspaceText.js";

const PHONE = "(max-width: 899px)";
const UPGRADE_FROM = /^(helped|assisted|supported|contributed|worked|participated|involved)/i;
const UPGRADE_TO = /^(led|owned|spearheaded|headed|drove|launched|directed|managed)/i;
const FILTERS = [["all", "All"], ["pending", "To review"], ["applied", "Applied"], ["dismissed", "Skipped"]];
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function Diff({ before, after, show = "both" }) {
  const parts = wordDiff(before, after).filter((p) => !(show === "after" && p.t === "-") && !(show === "before" && p.t === "+"));
  return parts.map((p, i) => {
    const sep = i < parts.length - 1 ? " " : "";
    if (p.t === "=") return <span key={i}>{p.text}{sep}</span>;
    return p.t === "-" ? <span key={i}><del>{p.text}</del>{sep}</span> : <span key={i}><ins>{p.text}</ins>{sep}</span>;
  });
}

const isApplied = (s) => s.status === "applied" || s.status === "done";
const statusWord = (s) => (isApplied(s) ? "Applied" : s.status === "dismissed" ? "Skipped" : s.question ? "Needs your answer" : "To review");
const inFilter = (s, f) => f === "all" || (f === "applied" ? isApplied(s) : s.status === f);

export default function ResumeWorkspace(props) {
  const { resume, suggestions, title, subtitle, score, busy, status, blankValues, setBlankValues, flash, deltaOf, keywordsOf, act, extras, pages = null, generalThread = [] } = props;
  const [isPhone, setIsPhone] = useState(() => window.matchMedia(PHONE).matches);
  const [filter, setFilter] = useState("all");
  const [picked, setPicked] = useState(null); // the open suggestion (laptop falls back to the first one to review)
  const [general, setGeneral] = useState(false); // the chat is about the whole resume, not one suggestion
  const [editing, setEditing] = useState(null);
  const [editText, setEditText] = useState("");
  const [highlight, setHighlight] = useState(true);
  const [sheet, setSheet] = useState(null); // phone: suggestion id | "list" | "finish" | "ask" | null
  const [talking, setTalking] = useState(false); // phone: the sheet shows the chat for the open suggestion
  const [justApplied, setJustApplied] = useState(null);
  const [msg, setMsg] = useState("");
  const paperRef = useRef(null);
  const scrollRef = useRef(null);
  const sheetRef = useRef(null);
  const threadRef = useRef(null);
  const inputRef = useRef(null);
  const timer = useRef(null);
  const activeRef = useRef(null);

  useEffect(() => {
    const mq = window.matchMedia(PHONE);
    const on = () => setIsPhone(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  const list = useMemo(() => Object.values(suggestions).filter((s) => s.pin != null).sort((a, b) => a.pin - b.pin), [suggestions]);
  const counts = { all: list.length, pending: 0, applied: 0, dismissed: 0 };
  list.forEach((s) => (counts[isApplied(s) ? "applied" : s.status] = (counts[isApplied(s) ? "applied" : s.status] || 0) + 1));
  const pendingList = list.filter((s) => s.status === "pending");
  const shown = list.filter((s) => inFilter(s, filter));
  const lineOf = (s) => s.edit?.target || s.target || null;
  const isGhost = (s) => s.edit?.op === "add_bullet" && s.status === "pending";

  // The open suggestion. Laptop: never empty while there is something to look at (unless the chat is on the
  // whole resume). Phone: whatever the sheet shows.
  const active = isPhone
    ? (suggestions[sheet] ? sheet : null)
    : general
      ? null
      : suggestions[picked] ? picked : (pendingList[0] || list[0])?.id ?? null;
  const cur = active ? suggestions[active] : null;
  const thread = cur ? cur.thread : generalThread;
  const threadLen = (thread || []).length;
  useEffect(() => {
    activeRef.current = active;
  });

  // Newest message in view.
  useEffect(() => {
    const box = threadRef.current;
    if (box) box.scrollTo({ top: box.scrollHeight, behavior: reduced() ? "auto" : "smooth" });
  }, [active, threadLen, busy, talking]);

  // ---- linking ----
  function scrollToLine(id, { centerAbove = false } = {}) {
    const s = suggestions[id];
    const el = paperRef.current?.querySelector(`[data-sid="${id}"]`) || paperRef.current?.querySelector(`[data-line="${lineOf(s)}"]`);
    if (!el) return;
    if (centerAbove && scrollRef.current) {
      // Phone: put the line in the middle of the space above the sheet.
      const box = scrollRef.current;
      const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
      const visible = box.clientHeight - (sheetRef.current?.offsetHeight || 0);
      box.scrollTo({ top: Math.max(0, top - Math.max(16, (visible - el.offsetHeight) / 2)), behavior: reduced() ? "auto" : "smooth" });
    } else el.scrollIntoView({ block: "center", behavior: reduced() ? "auto" : "smooth" });
  }
  function select(id, from) {
    clearTimeout(timer.current);
    if (isPhone) return openSheet(id, from);
    setGeneral(false);
    setEditing(null);
    setPicked(id);
    act.opened(id, from);
    if (!inFilter(suggestions[id], filter)) setFilter("all");
    if (from === "resume") setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 30);
    else setTimeout(() => scrollToLine(id), 30);
  }
  function step(dir) {
    const pool = isPhone ? list : shown.length ? shown : list;
    if (!pool.length) return;
    const i = pool.findIndex((x) => x.id === active);
    const next = pool[(i + dir + pool.length) % pool.length];
    if (isPhone) openSheet(next.id, "swipe");
    else select(next.id, "nav");
  }
  const nextPending = (fromPin) => {
    for (let k = 1; k <= list.length; k++) {
      const s = list[(list.findIndex((x) => x.pin === fromPin) + k + list.length) % list.length];
      if (s?.status === "pending" && s.pin !== fromPin) return s.id;
    }
    return null;
  };

  // ---- phone sheet ----
  function openSheet(id, from = "review") {
    clearTimeout(timer.current);
    setJustApplied(null);
    setEditing(null);
    if (!suggestions[id]) setTalking(false);
    setSheet(id);
    if (suggestions[id]) {
      act.opened(id, from);
      requestAnimationFrame(() => requestAnimationFrame(() => scrollToLine(id, { centerAbove: true })));
    }
  }
  function closeSheet() {
    clearTimeout(timer.current);
    setSheet(null);
    setTalking(false);
    setJustApplied(null);
    setEditing(null);
  }

  /** After Apply / Skip: on to the next suggestion still to review (a beat later, so the change is seen). */
  function afterDecision(id, wait) {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setJustApplied(null);
      // They moved on themselves in the meantime: leave them where they are.
      if (!isPhone && activeRef.current !== id) return;
      const n = nextPending(suggestions[id].pin);
      if (isPhone) {
        if (n) openSheet(n);
        else {
          setTalking(false);
          setSheet("finish");
        }
      } else if (n) select(n, "auto");
    }, wait);
  }

  /** The sheet's handle: a tap goes back one size (a drag that just ended on it doesn't count as a tap). */
  function grab() {
    if (sheetRef.current?.dragged) {
      sheetRef.current.dragged = false;
      return;
    }
    if (talking) setTalking(false);
    else closeSheet();
  }

  // ---- actions ----
  function apply(s) {
    const text = finalText(s, blankValues[s.id]);
    if (!isReady(s, blankValues[s.id])) return;
    act.apply(s.id, text);
    setEditing(null);
    setPicked(s.id); // stay on it (showing "Applied") until the move to the next one
    if (isPhone) setJustApplied(s.id);
    else setTimeout(() => scrollToLine(s.id), 60);
    afterDecision(s.id, isPhone ? 1000 : 1200);
  }
  function skip(s) {
    act.dismiss(s.id);
    setEditing(null);
    setPicked(s.id);
    afterDecision(s.id, isPhone ? 0 : 500);
  }
  function startEdit(s) {
    setEditing(s.id);
    setEditText(finalText(s, blankValues[s.id]) ?? textAt(resume, lineOf(s)) ?? "");
  }
  function saveEdit(s) {
    if (editText.trim()) act.saveEdit(s.id, editText.trim());
    setEditing(null);
  }
  /** The composer: a reply about the open suggestion, or (with none open) a request about the whole resume. */
  function send(text) {
    const t = String(text || "").trim();
    if (!t || busy) return;
    if (cur) act.answer(cur.id, t);
    else act.ask(t);
    setMsg("");
  }

  // Keyboard (laptop): J / K step, A applies, S skips – never while typing.
  useEffect(() => {
    if (isPhone) return;
    function onKey(e) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.("input, textarea, select, [contenteditable]")) return;
      const k = e.key.toLowerCase();
      if (k === "j" || e.key === "ArrowDown") { e.preventDefault(); step(1); }
      else if (k === "k" || e.key === "ArrowUp") { e.preventDefault(); step(-1); }
      else if (k === "a" && cur?.status === "pending" && cur.edit && !cur.question && isReady(cur, blankValues[cur.id])) apply(cur);
      else if (k === "s" && cur?.status === "pending") skip(cur);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // re-bound each render, so it sees the open suggestion

  // ---- pieces ----
  const tone = (s) => (isApplied(s) ? "done" : s.status === "dismissed" ? "off" : s.question ? "ask" : s.priority === "must" ? "must" : "nice");
  const pinEl = (s, from) => (
    <button key={s.id} type="button" className={`ws-pin ws-pin-${tone(s)}${active === s.id ? " ws-pin-on" : ""}`} onClick={(e) => { e.stopPropagation(); select(s.id, from); }} aria-label={`Suggestion ${s.pin}: ${s.title}, ${statusWord(s).toLowerCase()}`}>
      {isApplied(s) ? "✓" : s.pin}
    </button>
  );

  const byLine = useMemo(() => {
    const m = new Map();
    list.forEach((s) => {
      const l = lineOf(s);
      // A new bullet waiting for a decision gets its own dashed line (below), not a pin on the role.
      if (!l || s.status === "done" || isGhost(s)) return;
      if (!m.has(l)) m.set(l, []);
      m.get(l).push(s);
    });
    return m;
  }, [list]);
  const ghostsFor = (i) => list.filter((s) => isGhost(s) && s.edit.target === `E${i}`);

  /** A line of the resume: its pins in the margin, and – once a change is applied – the added words marked. */
  function lineEl(id, children, { as = "p", className = "", key } = {}) {
    const Tag = as;
    const here = byLine.get(id) || [];
    const lead = here.find((s) => s.id === active) || here.find((s) => s.status === "pending") || here[0];
    const appliedHere = here.find((s) => s.status === "applied" && s.before != null && s.edit?.op === "replace");
    const now = textAt(resume, id);
    const body = appliedHere && highlight && now != null ? <Diff before={appliedHere.before} after={now} show="after" /> : children;
    const on = lead && active === lead.id;
    const cls = ["ws-ln", here.length ? "ws-has" : "", lead && highlight && !on ? `ws-mark-${tone(lead)}` : "", on ? `ws-on ws-on-${tone(lead)}` : "", flash === id ? "ws-flash" : "", className].join(" ");
    return (
      <Tag key={key} data-line={id} className={cls} tabIndex={here.length ? 0 : undefined} onClick={here.length ? () => select(lead.id, "resume") : undefined} onKeyDown={(e) => { if (here.length && e.key === "Enter") select(lead.id, "resume"); }}>
        {here.length > 0 && <span className="ws-pins">{here.map((s) => pinEl(s, "resume"))}</span>}
        {body}
      </Tag>
    );
  }
  /** A proposed new bullet, dashed, where it would go. */
  const ghostEl = (s) => (
    <li key={s.id} data-sid={s.id} className={`ws-ln ws-has ws-ghost${active === s.id ? " ws-ghost-on" : ""}`} tabIndex={0} onClick={() => select(s.id, "resume")} onKeyDown={(e) => { if (e.key === "Enter") select(s.id, "resume"); }}>
      <span className="ws-pins">{pinEl(s, "resume")}</span>
      <span className="ws-ghost-tag">Proposed bullet</span>
      {finalText(s, blankValues[s.id])}
    </li>
  );

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
                {ghostsFor(i).map(ghostEl)}
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

  /** The proposed change as one inline diff: green for added words, struck through for removed ones. */
  function changeEl(s) {
    const before = s.before ?? textAt(resume, lineOf(s)) ?? "";
    const after = finalText(s, blankValues[s.id]);
    if (s.edit?.op === "add_skills") return <div className="ws-txt">{(resume.skills || []).join(" · ")} · <ins>{s.edit.skills.join(" · ")}</ins></div>;
    if (s.edit?.op === "add_certifications") return <div className="ws-txt"><ins>{s.edit.items.join(" · ")}</ins></div>;
    if (s.edit?.op === "set_skills") {
      const keep = new Set(s.edit.skills.map((x) => x.toLowerCase()));
      return <div className="ws-txt">{(resume.skills || []).map((x, i) => <span key={i}>{i ? " · " : ""}{keep.has(String(x).toLowerCase()) ? x : <del>{x}</del>}</span>)}</div>;
    }
    if (s.edit?.op === "remove") return <div className="ws-txt"><del>{before}</del></div>;
    if (s.edit?.op === "add_bullet") return <div className="ws-txt"><ins>{after}</ins></div>;
    return <div className="ws-txt"><Diff before={before} after={after} /></div>;
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
    return verb && UPGRADE_FROM.test(before.trim()) ? `Use "${verb}" only if you led this. Otherwise, skip it.` : null;
  };

  /** What's on the table for a suggestion: the change and its buttons, or what was decided. */
  function proposalEl(s) {
    if (s.status === "applied") {
      return (
        <div className="ws-receipt ws-receipt-ok" role="status">
          <span>✓ Applied to {s.where}</span>
          {s.undo && <button type="button" className="ws-lnk" onClick={() => act.undo(s.id)}>Undo</button>}
        </div>
      );
    }
    if (s.status === "done") return <div className="ws-receipt ws-receipt-ok" role="status"><span>{s.note || "Done – see the new suggestions"}</span></div>;
    if (s.status === "dismissed") {
      return (
        <div className="ws-receipt" role="status">
          <span>Skipped – your original line is kept</span>
          <button type="button" className="ws-lnk" onClick={() => act.restore(s.id)}>Restore</button>
        </div>
      );
    }
    if (s.question) return <p className="ws-hint">Answer below – I'll draft the line from what you tell me.</p>;
    if (s.action) {
      return (
        <div className="ws-acts">
          <button type="button" className="ws-btn ws-pri" disabled={busy} onClick={() => { act.action(s.id); afterDecision(s.id, 1200); }}>Do it</button>
          <button type="button" className="ws-btn" onClick={() => skip(s)}>Skip</button>
        </div>
      );
    }
    if (!s.edit) return null;
    const warn = warningOf(s);
    const delta = deltaOf(s, finalText(s, blankValues[s.id]));
    const kws = keywordsOf(s, finalText(s, blankValues[s.id]));
    return (
      <div className="ws-prop">
        <div className="ws-prop-hd">
          <span>{s.edit.op === "add_bullet" ? s.where : `Proposed change · ${s.where}`}</span>
          {delta > 0 && <span className="ws-pts">+{delta}</span>}
          <button type="button" className="ws-lnk ws-show" onClick={() => (isPhone ? (setTalking(false), requestAnimationFrame(() => scrollToLine(s.id, { centerAbove: true }))) : scrollToLine(s.id))}>Show on resume</button>
        </div>
        <div className="ws-prop-bd">
          {editing === s.id ? <textarea className="ws-edit" value={editText} onChange={(e) => setEditText(e.target.value)} aria-label="Edit the suggested line" autoFocus /> : changeEl(s)}
          {editing !== s.id && inputsEl(s)}
          {warn && <p className="ws-warn">{warn}</p>}
          {kws.length > 0 && <div className="ws-kw">Adds {kws.map((k) => <span key={k}>{k}</span>)}</div>}
        </div>
        <div className="ws-acts">
          {editing === s.id ? (
            <>
              <button type="button" className="ws-btn ws-pri" onClick={() => saveEdit(s)}>Save edit</button>
              <button type="button" className="ws-btn" onClick={() => setEditing(null)}>Cancel</button>
            </>
          ) : (
            <>
              <button type="button" className="ws-btn ws-pri" disabled={!isReady(s, blankValues[s.id])} onClick={() => apply(s)}>Apply</button>
              {s.edit.after != null && <button type="button" className="ws-btn" onClick={() => startEdit(s)}>Edit</button>}
              <button type="button" className="ws-btn" onClick={() => skip(s)}>Skip</button>
            </>
          )}
        </div>
      </div>
    );
  }

  /** The open suggestion's conversation, oldest first, then what's on the table. */
  function threadEl(s) {
    const msgs = [];
    if (s.why) msgs.push({ id: "why", role: "bot", text: s.why });
    if (!s.thread?.length && s.question) msgs.push({ id: "q", role: "bot", text: s.question });
    (s.thread || []).forEach((m) => msgs.push(m));
    if (s.note && !(s.thread || []).some((m) => m.text === s.note)) msgs.push({ id: "note", role: "bot", text: s.note });
    return (
      <>
        {msgs.map((m) => <div key={m.id} className={`ws-m ws-m-${m.role === "user" ? "user" : "bot"}${m.error ? " ws-m-err" : ""}`}>{m.text}</div>)}
        {justApplied === s.id ? <div className="ws-ok">✓ Applied to your resume</div> : proposalEl(s)}
      </>
    );
  }
  function generalEl() {
    return (
      <>
        <div className="ws-m ws-m-bot">Ask for any change to the whole resume – e.g. "make it fit on one page" or "add that I led a team of 6". Pick a numbered pin to talk about one suggestion.</div>
        {generalThread.map((m) => (
          <div key={m.id}>
            <div className={`ws-m ws-m-${m.role === "user" ? "user" : "bot"}${m.error ? " ws-m-err" : ""}`}>{m.text}</div>
            {m.added?.length > 0 && (
              <div className="ws-added">
                {m.added.filter((id) => suggestions[id]).map((id) => (
                  <button key={id} type="button" className="ws-chip-btn" onClick={() => select(id, "general")}>
                    <span className={`ws-num ws-pin-${tone(suggestions[id])}`}>{suggestions[id].pin}</span>{suggestions[id].where}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </>
    );
  }
  const typing = busy && <div className="ws-m ws-m-bot ws-typing" aria-label="Writing a reply"><i /><i /><i /></div>;

  // Quick replies under the composer.
  const quick = cur
    ? cur.status === "pending" && cur.edit && !cur.question
      ? [
          ["Make it shorter", () => act.answer(cur.id, "Make it shorter. Same facts.")],
          ["Add a metric", () => act.answer(cur.id, "Add a measurable result if I've given you one; if not, ask me for the number.")],
          ["Another version", () => act.regenerate(cur.id)],
        ]
      : []
    : [
        ["Fit on one page", () => act.ask("Make my resume fit on one page. Cut or shorten the weakest lines first.")],
        ["Tighten my summary", () => act.ask("Tighten my summary for this job. Same facts.")],
      ];
  const placeholder = cur ? (cur.question ? `Answer #${cur.pin}…` : `Reply about #${cur.pin}…`) : "Ask for a change to the whole resume…";
  const composer = (
    <form className="ws-compose" onSubmit={(e) => { e.preventDefault(); send(msg); }}>
      {quick.length > 0 && (
        <div className="ws-quick">
          {quick.map(([label, run]) => <button key={label} type="button" className="ws-chip-btn" disabled={busy} onClick={run}>{label}</button>)}
        </div>
      )}
      <div className="ws-compose-row">
        <input ref={inputRef} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={placeholder} aria-label={placeholder.replace("…", "")} enterKeyHint="send" />
        <button type="submit" className="ws-btn ws-pri" disabled={busy || !msg.trim()}>Send</button>
      </div>
    </form>
  );

  const applied = counts.applied || 0;
  const pageChip = pages != null && <span className={`ws-chip ${pages <= 1 ? "ws-chip-ok" : "ws-chip-warn"}`}>{pages <= 1 ? "Fits 1 page" : `${pages} pages`}</span>;
  const segments = (
    <button type="button" className="ws-segs" onClick={() => openSheet("list")} aria-label={`${applied} of ${list.length} applied – see all suggestions`}>
      {list.map((s) => <i key={s.id} className={`ws-seg-${active === s.id ? "on" : isApplied(s) ? "done" : s.status === "dismissed" ? "off" : "todo"}`} />)}
    </button>
  );

  // ---------------- phone ----------------
  if (isPhone) {
    const s = cur;
    const open = sheet != null;
    const dismissed = counts.dismissed || 0;
    const left = pendingList.length;
    let body = null;
    let size = "peek";
    if (sheet === "finish") {
      body = (
        <>
          <button type="button" className="ws-grab" onClick={grab} aria-label="Close" />
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
    } else if (sheet === "list") {
      size = "list";
      body = (
        <>
          <button type="button" className="ws-grab" onClick={grab} aria-label="Close" />
          <div className="ws-list-hd">
            <b>{list.length} suggestions</b>
            <div className="ws-tabs">
              {FILTERS.map(([k, l]) => <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l} {counts[k] || 0}</button>)}
            </div>
          </div>
          <div className="ws-sb ws-rows">
            {shown.length ? shown.map((x) => (
              <button key={x.id} type="button" className="ws-row" onClick={() => openSheet(x.id, "list")}>
                <span className={`ws-num ws-pin-${tone(x)}`}>{isApplied(x) ? "✓" : x.pin}</span>
                <span className="ws-row-t"><b>{x.title}</b><span>{x.where}</span></span>
                <span className={`ws-row-s ws-tag ws-tag-${tone(x)}`}>{statusWord(x)}</span>
              </button>
            )) : <p className="ws-empty-list">Nothing here yet.</p>}
          </div>
          <div className="ws-sf">
            {left ? <button type="button" className="ws-btn ws-pri ws-grow" onClick={() => openSheet(pendingList[0].id)}>Review next (#{pendingList[0].pin})</button> : <button type="button" className="ws-btn ws-pri ws-grow" onClick={() => setSheet("finish")}>Finish</button>}
          </div>
        </>
      );
    } else if (sheet === "ask") {
      size = "chat";
      body = (
        <>
          <button type="button" className="ws-grab" onClick={grab} aria-label="Close" />
          <div className="ws-sh"><div><b>Whole resume</b><span>Ask for any change</span></div></div>
          <div className="ws-sb ws-thread" ref={threadRef}>{generalEl()}{typing}</div>
          <div className="ws-sf ws-sf-col">{composer}</div>
        </>
      );
    } else if (s) {
      const i = list.findIndex((x) => x.id === s.id);
      const head = (
        <>
          <button type="button" className="ws-grab" onClick={grab} aria-label={talking ? "Back to the resume" : "Close"} />
          <div className="ws-sh">
            <button type="button" className="ws-nav" onClick={() => step(-1)} aria-label="Previous suggestion">‹</button>
            <div aria-live="polite"><b>{s.pin}. {s.title}</b><span>{i + 1} of {list.length} · {s.where} · {statusWord(s)}</span></div>
            <button type="button" className="ws-nav" onClick={() => step(1)} aria-label="Next suggestion">›</button>
          </div>
        </>
      );
      if (talking) {
        size = "chat";
        body = (
          <>
            {head}
            <div className="ws-sb ws-thread" ref={threadRef}>{threadEl(s)}{typing}</div>
            <div className="ws-sf ws-sf-col">{composer}</div>
          </>
        );
      } else if (justApplied === s.id) {
        body = <>{head}<div className="ws-sb"><div className="ws-ok">✓ Applied to your resume</div></div></>;
      } else if (s.status !== "pending") {
        body = (
          <>
            {head}
            <div className="ws-sb"><p className="ws-why">{isApplied(s) ? "Applied. The line now reads:" : "Skipped. Your original line is kept."}</p><div className="ws-txt">{isApplied(s) ? s.appliedText || textAt(resume, lineOf(s)) : s.before}</div></div>
            <div className="ws-sf">
              {isApplied(s) ? s.undo && <button type="button" className="ws-btn ws-grow" onClick={() => act.undo(s.id)}>Undo</button> : <button type="button" className="ws-btn ws-grow" onClick={() => act.restore(s.id)}>Restore</button>}
              <button type="button" className="ws-btn ws-pri ws-grow" onClick={() => step(1)}>Next</button>
            </div>
          </>
        );
      } else {
        const warn = warningOf(s);
        const last = [...(s.thread || [])].reverse().find((m) => m.role !== "user");
        body = (
          <>
            {head}
            <div className="ws-sb">
              {s.why && <p className="ws-why">{s.why}</p>}
              {s.question ? <p className="ws-q">{last?.text || s.question}</p> : s.action ? null : (
                <>
                  {editing === s.id ? <textarea className="ws-edit" value={editText} onChange={(e) => setEditText(e.target.value)} aria-label="Edit the suggested line" autoFocus /> : changeEl(s)}
                  {editing !== s.id && inputsEl(s)}
                  {warn && <p className="ws-warn">{warn}</p>}
                </>
              )}
            </div>
            <div className="ws-sf">
              {editing === s.id ? (
                <>
                  <button type="button" className="ws-btn ws-grow" onClick={() => setEditing(null)}>Cancel</button>
                  <button type="button" className="ws-btn ws-pri ws-grow" onClick={() => saveEdit(s)}>Save edit</button>
                </>
              ) : s.question ? (
                <>
                  <button type="button" className="ws-btn" onClick={() => skip(s)}>Skip</button>
                  <button type="button" className="ws-btn ws-pri ws-grow" onClick={() => setTalking(true)}>Answer</button>
                </>
              ) : (
                <>
                  <button type="button" className="ws-btn" onClick={() => skip(s)}>Skip</button>
                  <button type="button" className="ws-btn" onClick={() => setTalking(true)}>Discuss</button>
                  {s.action ? (
                    <button type="button" className="ws-btn ws-pri ws-grow" disabled={busy} onClick={() => { act.action(s.id); afterDecision(s.id, 1000); }}>Do it</button>
                  ) : (
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
          <div className="ws-ptools">
            {segments}
            <span className="ws-pcount">{applied} of {list.length} applied</span>
            {pageChip}
          </div>
          <div className="ws-ptools">
            <button type="button" className="ws-lnk" onClick={() => openSheet("ask")}>✎ Ask for a change</button>
            <span className="ws-status" role="status">{busy ? "Working…" : status}</span>
          </div>
        </div>
        <div className={`ws-pscroll${open ? ` ws-pscroll-open ws-pscroll-${size}` : ""}`} ref={scrollRef}>{paper}</div>
        {open && size !== "peek" && <div className="ws-scrim" onClick={grab} aria-hidden="true" />}
        <div className={`ws-sheet${open ? ` ws-sheet-open ws-sheet-${size}` : ""}`} ref={sheetRef} role="dialog" aria-label={s ? `Suggestion ${s.pin}` : "Suggestions"}
          onPointerDown={(e) => { sheetRef.current.sx = e.clientX; sheetRef.current.sy = e.clientY; sheetRef.current.dragged = false; }}
          onClickCapture={(e) => {
            // A swipe that ends on a button is a swipe, not a tap on that button.
            if (sheetRef.current.dragged && !e.target.closest(".ws-grab")) {
              sheetRef.current.dragged = false;
              e.stopPropagation();
              e.preventDefault();
            }
          }}
          onPointerUp={(e) => {
            if (e.target.closest("input,textarea,.ws-thread,.ws-rows")) return;
            const dx = e.clientX - sheetRef.current.sx;
            const dy = e.clientY - sheetRef.current.sy;
            if (Math.abs(dx) > 60 || Math.abs(dy) > 60) sheetRef.current.dragged = true;
            else return;
            if (s && !talking && Math.abs(dx) > 60 && Math.abs(dy) < 45) step(dx < 0 ? 1 : -1);
            else if (Math.abs(dy) > 60 && Math.abs(dx) < 45) {
              // Drag the sheet: up opens the chat, down goes back a size (chat -> peek -> closed).
              if (dy < 0 && s && !talking) setTalking(true);
              else if (dy > 0) (talking ? setTalking(false) : closeSheet());
            }
          }}>
          {open && body}
        </div>
      </div>
    );
  }

  // ---------------- laptop ----------------
  return (
    <div className="ws ws-desk">
      <div className="ws-head">
        <div className="ws-head-l">
          <h1>{title}</h1>
          {subtitle && <p className="ws-sub">{subtitle}</p>}
        </div>
        <div className="ws-chips" aria-live="polite">
          <span className="ws-chip">{score.label} <b>{score.base}{score.unit}</b> → <b className="ws-up">{score.now}{score.unit}</b>{score.potential > score.now ? <small> · up to {score.potential}{score.unit}</small> : null}</span>
          <span className="ws-chip">{applied} of {list.length} applied</span>
          {pageChip}
        </div>
        <div className="ws-head-r">
          <span className="ws-status" role="status">{busy ? "Working…" : status}</span>
          <details className="ws-more">
            <summary className="ws-btn">More</summary>
            <div className="ws-more-menu">
              <button type="button" className="ws-btn" disabled={busy || !pendingList.some((s) => !s.question && isReady(s, blankValues[s.id]))} onClick={act.applyAll}>Apply all ready</button>
              <label className="ws-tog"><input type="checkbox" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} /> Highlight on resume</label>
              {extras?.map((x) => <button key={x.label} type="button" className="ws-btn" onClick={x.run}>{x.label}</button>)}
              <button type="button" className="ws-btn" onClick={act.reset}>Reset to original</button>
            </div>
          </details>
          <button type="button" className="ws-btn ws-pri" onClick={act.download}>Download PDF</button>
        </div>
      </div>
      <div className="ws-main">
        <section className="ws-left" aria-label="Resume">{paper}</section>
        <aside className="ws-chat" aria-label="Assistant">
          <div className="ws-chat-hd">
            <b>Assistant</b>
            <div className="ws-tabs">
              {FILTERS.map(([k, l]) => <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l} {counts[k] || 0}</button>)}
            </div>
          </div>
          {cur ? (
            <div className="ws-strip" aria-live="polite">
              <span className={`ws-num ws-pin-${tone(cur)}`}>{isApplied(cur) ? "✓" : cur.pin}</span>
              <div className="ws-strip-t"><b>{cur.title}</b><span>{cur.where} · {statusWord(cur)}</span></div>
              <button type="button" className="ws-nav" onClick={() => step(-1)} aria-label="Previous suggestion (K)">‹</button>
              <button type="button" className="ws-nav" onClick={() => step(1)} aria-label="Next suggestion (J)">›</button>
              <button type="button" className="ws-x" onClick={() => setGeneral(true)} aria-label="Close this suggestion and ask about the whole resume" title="Ask about the whole resume">×</button>
            </div>
          ) : (
            <div className="ws-strip ws-strip-gen">
              <div className="ws-strip-t"><b>Whole resume</b><span>{pendingList.length ? `${pendingList.length} suggestion${pendingList.length > 1 ? "s" : ""} still to review` : "All suggestions reviewed"}</span></div>
              {list.length > 0 && <button type="button" className="ws-btn ws-sm" onClick={() => select((pendingList[0] || list[0]).id, "nav")}>{pendingList.length ? `Review #${pendingList[0].pin}` : "Back to suggestions"}</button>}
            </div>
          )}
          <div className="ws-thread" ref={threadRef}>
            {cur ? threadEl(cur) : generalEl()}
            {typing}
            {!cur && !pendingList.length && list.length > 0 && (
              <div className="ws-receipt ws-receipt-ok"><span>All done – {applied} applied. Your resume is ready.</span><button type="button" className="ws-lnk" onClick={act.download}>Download PDF</button></div>
            )}
          </div>
          {composer}
          <p className="ws-keys">J / K to move · A apply · S skip</p>
        </aside>
      </div>
    </div>
  );
}
