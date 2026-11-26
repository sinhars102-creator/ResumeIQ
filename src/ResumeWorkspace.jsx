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
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import "./ResumeWorkspace.css";
import { extraLines, educationLine, educationDetails, roleLine, sectionPlan, addableSections, CORE_SECTIONS, splitLine } from "./resumeSections.js";
import { textAt, extraSlot } from "./tailorEdits.js";
import { wordDiff } from "./wordDiff.js";
import { finalText, isReady, blanksIn, ownershipWarning, withoutNumbers } from "./workspaceText.js";
import { removalWarning } from "./cardState.js";
import { isWholeResumeRequest, visibleList, counts, stepId, nextTodoId, keyAction, layoutPins, snapTo, progressSegments, fitChip, threadFor, placeholderFor, stateOf } from "./workspaceNav.js";

const PHONE = "(max-width: 767px)";
const NARROW = "(max-width: 1023px)";

const alive = (arr) => (arr || []).map((x, i) => [x, i]).filter(([x]) => x && !x.removed);

function Diff({ before, after, show = "both" }) {
  const parts = wordDiff(before, after).filter((p) => !(show === "after" && p.t === "-") && !(show === "before" && p.t === "+"));
  return parts.map((p, i) => {
    const sep = i < parts.length - 1 ? " " : "";
    if (p.t === "=") return <span key={i}>{p.text}{sep}</span>;
    return p.t === "-" ? <span key={i}><del>{p.text}</del>{sep}</span> : <span key={i}><ins>{p.text}</ins>{sep}</span>;
  });
}

/** One education entry as a small form (degree, school, dates, grade, place), so nothing has to be typed in a special order. */
function EducationForm({ initial = {}, onSave, onCancel, submitLabel = "Save" }) {
  const [v, setV] = useState({ degree: initial.degree || "", school: initial.school || "", year: initial.year || "", grade: initial.grade || "", location: initial.location || "" });
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  const ok = !!(v.degree.trim() || v.school.trim());
  const save = () => ok && onSave(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.trim()])));
  const keys = (e) => {
    if (e.key === "Escape") onCancel();
    else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      save();
    }
  };
  const field = (k, label, placeholder, wide) => (
    <label className={wide ? "ws-ef-wide" : undefined}>
      <small>{label}</small>
      <input value={v[k]} onChange={set(k)} onKeyDown={keys} placeholder={placeholder} autoFocus={k === "degree"} />
    </label>
  );
  return (
    <span className="ws-eduform" role="group" aria-label="Education entry" onClick={(e) => e.stopPropagation()}>
      {field("degree", "Degree", "e.g. MBA, Finance", true)}
      {field("school", "School or university", "e.g. IIM Ahmedabad", true)}
      {field("year", "Dates", "e.g. 2010 – 2012")}
      {field("grade", "Grade (optional)", "e.g. CGPA 8.4")}
      {field("location", "Location (optional)", "e.g. Mumbai", true)}
      <span className="ws-inl-btns">
        <button type="button" className="ws-btn ws-pri" disabled={!ok} onClick={save}>{submitLabel}</button>
        <button type="button" className="ws-btn" onClick={onCancel}>Cancel</button>
      </span>
    </span>
  );
}

/** The small form that edits, adds or renames one line in place. Enter saves, Escape cancels. */
function InlineForm({ value, label, onSave, onCancel, multiline = true }) {
  const [text, setText] = useState(value);
  const save = () => {
    const t = text.trim();
    if (t && t !== value.trim()) onSave(t);
    else onCancel();
  };
  const keys = (e) => {
    if (e.key === "Escape") onCancel();
    else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      save();
    }
  };
  return (
    <span className="ws-inl" onClick={(e) => e.stopPropagation()}>
      {multiline ? <textarea autoFocus rows={2} value={text} aria-label={label} onChange={(e) => setText(e.target.value)} onKeyDown={keys} /> : <input autoFocus value={text} aria-label={label} onChange={(e) => setText(e.target.value)} onKeyDown={keys} />}
      <span className="ws-inl-btns">
        <button type="button" className="ws-btn ws-pri" onClick={save}>Save</button>
        <button type="button" className="ws-btn" onClick={onCancel}>Cancel</button>
      </span>
    </span>
  );
}

export default function ResumeWorkspace(props) {
  const { resume, suggestions, title, subtitle, score, busy, status, blankValues, setBlankValues, flash, deltaOf, keywordsOf, act, extras, thread = [], pages } = props;
  const [isPhone, setIsPhone] = useState(() => window.matchMedia(PHONE).matches);
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches); // under 1024px: pins sit inline and the chat is slimmer
  const [filter, setFilter] = useState("all");
  const [showSkipped, setShowSkipped] = useState(false);
  const [active, setActive] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editText, setEditText] = useState("");
  const [answers, setAnswers] = useState({});
  const [highlight, setHighlight] = useState(true);
  const editMode = true; // the resume is always directly editable; there is no separate mode
  const [inline, setInline] = useState(null); // { id, mode: "edit" | "add" | "rename" | "custom", text }
  const [addMenu, setAddMenu] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [snap, setSnapState] = useState("peek"); // phone sheet: "peek" | "chat" | "list"
  const [drag, setDrag] = useState(null); // px height while the sheet is being dragged
  const [pinTops, setPinTops] = useState({});
  const [ask, setAsk] = useState("");
  const paperRef = useRef(null);
  const scrollRef = useRef(null);
  const wrapRef = useRef(null);
  const threadRef = useRef(null);
  const composerRef = useRef(null);
  const sheetRef = useRef(null);
  const snapRef = useRef("peek");
  const timer = useRef(null);
  const cleared = useRef(false); // the person pressed Clear: talk about the whole resume until they pick a suggestion

  // ---- the suggestions on screen ----
  const list = useMemo(() => Object.values(suggestions).filter((s) => s.pin != null).sort((a, b) => a.pin - b.pin), [suggestions]);
  const nav = useMemo(() => visibleList(list, filter, { showDismissed: showSkipped }), [list, filter, showSkipped]);
  const tally = useMemo(() => counts(list), [list]);
  const skippedCount = list.filter((s) => stateOf(s) === "dismissed").length;
  const pendingList = list.filter((s) => s.status === "pending");
  const activeS = active && suggestions[active] ? suggestions[active] : null;
  const appliedCount = tally.applied;
  const statusLabel = (s) => ({ applied: "Applied", dismissed: s.outdated ? "Set aside" : "Skipped", todo: s.question ? "Needs your answer" : "To review" })[stateOf(s)];
  // Whole-section targets all point at the section heading.
  const normTarget = (t) => {
    if (!t) return null;
    if (t === "D") return "SEC:education";
    const m = /^X:([a-z]+\d*)$/.exec(t);
    return m ? `SEC:${m[1]}` : t;
  };
  const lineOf = (s) => normTarget(s.edit?.target || s.target || null);
  const isFlash = (id) => (Array.isArray(flash) ? flash.includes(id) : flash === id);

  useEffect(() => {
    const mqs = [[PHONE, setIsPhone], [NARROW, setNarrow]].map(([q, set]) => {
      const mq = window.matchMedia(q);
      const on = () => set(mq.matches);
      mq.addEventListener("change", on);
      return () => mq.removeEventListener("change", on);
    });
    return () => mqs.forEach((off) => off());
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  // Something is always open: the first suggestion to review, until the person picks another.
  useEffect(() => {
    if ((active && suggestions[active]) || cleared.current) return;
    const first = list.find((s) => stateOf(s) === "todo") || list[0];
    if (first) setActive(first.id);
  }, [list.length, active]);
  // The first time one opens, bring its line into view (and later, every move scrolls the resume to its line).
  const shownFirst = useRef(false);
  useEffect(() => {
    if (shownFirst.current || !activeS) return;
    shownFirst.current = true;
    const t = setTimeout(() => scrollToLine(activeS.id, { centerAbove: isPhone }), 250);
    return () => clearTimeout(t);
  }, [activeS?.id]);

  // ---- going to a suggestion: the resume, the strip and the chat all follow ----
  function lineElFor(s) {
    const root = paperRef.current;
    if (!root) return null;
    return (s.edit?.op === "add_bullet" && root.querySelector(`[data-line="ghost:${s.id}"]`)) || root.querySelector(`[data-line="${lineOf(s)}"]`);
  }
  function scrollToLine(id, { centerAbove = false } = {}) {
    const s = suggestions[id];
    const el = s && lineElFor(s);
    if (!el) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    const box = scrollRef.current;
    if (centerAbove && box) {
      // Phone: put the line in the middle of the space above the sheet.
      const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
      const visible = box.clientHeight - (sheetRef.current?.offsetHeight || 0);
      box.scrollTo({ top: Math.max(0, top - Math.max(16, (visible - el.offsetHeight) / 2)), behavior: reduce });
    } else el.scrollIntoView({ block: "center", behavior: reduce });
  }
  function select(id, from = "nav") {
    if (!suggestions[id]) return;
    cleared.current = false;
    setActive(id);
    setEditing(null);
    clearTimeout(timer.current);
    act.opened(id, from);
    requestAnimationFrame(() => {
      if (threadRef.current) threadRef.current.scrollTop = 0;
      if (from === "resume") {
        if (isPhone) scrollToLine(id, { centerAbove: true });
        else composerRef.current?.focus();
      } else scrollToLine(id, { centerAbove: isPhone });
    });
  }
  const step = (dir) => select(stepId(nav, active, dir), "nav");
  /** After Accept or Skip: on to the next suggestion still to review (nothing left shows "All done"). */
  const advance = (fromId) => {
    const next = nextTodoId(list, fromId);
    if (next) select(next, "advance");
  };

  // ---- actions ----
  function apply(s) {
    const text = finalText(s, blankValues[s.id]);
    if (!isReady(s, blankValues[s.id])) return;
    act.apply(s.id, text);
    setEditing(null);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => advance(s.id), 900);
  }
  function skip(s) {
    act.dismiss(s.id);
    clearTimeout(timer.current);
    advance(s.id);
  }
  function undoOne(s) {
    clearTimeout(timer.current); // a quick Undo must not be followed by a jump to the next suggestion
    act.undo(s.id);
  }
  function startEdit(s) {
    setEditing(s.id);
    setEditText(finalText(s, blankValues[s.id]) ?? textAt(resume, lineOf(s)) ?? "");
  }
  function saveEdit(s) {
    if (editText.trim()) act.saveEdit(s.id, editText.trim());
    setEditing(null);
  }
  const sendAsk = (text = ask) => {
    const t = String(text).trim();
    if (!t || busy) return;
    // A request about the whole resume ("make it one page") is answered in the general conversation, so go there.
    if (isWholeResumeRequest(t)) {
      cleared.current = true;
      setActive(null);
    }
    act.ask(t, { sid: activeS?.id || null });
    setAsk("");
  };
  const askKeys = (e) => {
    if (e.key === "Escape") return e.currentTarget.blur(); // hand the keyboard back to J / K / A / S
    // On a touch device Return adds a new line (the send button sends), as in the start composer.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !window.matchMedia("(pointer: coarse)").matches) {
      e.preventDefault();
      sendAsk();
    }
  };

  // Keyboard: J / K (or ↓ / ↑) move between suggestions, A accepts, S skips. Never while typing.
  const keyRef = useRef(null);
  keyRef.current = (e) => {
    const action = keyAction(e);
    if (!action || !activeS) return;
    e.preventDefault();
    act.event("ws_hotkey_used", { action });
    if (action === "next") step(1);
    else if (action === "prev") step(-1);
    else if (action === "skip" && activeS.status === "pending") skip(activeS);
    else if (action === "accept" && activeS.status === "pending" && activeS.edit && !activeS.question) {
      if (warningOf(activeS)) return; // a removal or an ownership claim needs a deliberate click, not a keystroke
      apply(activeS);
    }
  };
  useEffect(() => {
    const on = (e) => keyRef.current?.(e);
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  // ---- margin pins: lined up with their lines, never overlapping ----
  const railPins = useMemo(() => nav.filter((s) => lineOf(s)), [nav]);
  useLayoutEffect(() => {
    if (isPhone || narrow) return undefined;
    const measure = () => {
      const wrap = wrapRef.current;
      const paper = paperRef.current;
      if (!wrap || !paper) return;
      const base = wrap.getBoundingClientRect().top;
      const wants = railPins.map((s) => {
        const el = lineElFor(s);
        return el ? { id: s.id, top: Math.max(0, Math.round(el.getBoundingClientRect().top - base)) } : null;
      }).filter(Boolean);
      const next = layoutPins(wants, { size: 28, gap: 8, max: wrap.offsetHeight });
      setPinTops((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (paperRef.current) ro.observe(paperRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [railPins, resume, isPhone, narrow, inline, highlight, suggestions]);

  // ---- phone sheet: peek / chat / list, drag to move, Back closes it, stays above the keyboard ----
  const snapHeights = () => {
    const h = window.innerHeight;
    return { peek: 176, list: Math.round(h * 0.75), chat: Math.round(h * 0.92) };
  };
  function setSnap(next) {
    const cur = snapRef.current;
    if (next === cur) return;
    if (cur === "peek" && next !== "peek") history.pushState({ wxSheet: true }, "");
    else if (next === "peek" && cur !== "peek" && history.state?.wxSheet) {
      snapRef.current = "peek";
      setSnapState("peek");
      history.back(); // the Back button and this close are the same step
      return;
    }
    snapRef.current = next;
    setSnapState(next);
    act.event("ws_sheet_snap", { snap: next });
    if (next === "chat") setTimeout(() => composerRef.current?.focus({ preventScroll: true }), 220);
  }
  useEffect(() => {
    if (!isPhone) return undefined;
    const onPop = () => {
      if (snapRef.current !== "peek") {
        snapRef.current = "peek";
        setSnapState("peek");
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [isPhone]);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!isPhone || !vv) return undefined;
    const fit = () => document.documentElement.style.setProperty("--wx-kb", `${Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))}px`);
    fit();
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    return () => {
      vv.removeEventListener("resize", fit);
      vv.removeEventListener("scroll", fit);
      document.documentElement.style.removeProperty("--wx-kb");
    };
  }, [isPhone]);
  const dragStart = useRef(null);
  const onGrabDown = (e) => {
    // Only the handle, the headers and the peek area drag the sheet: the conversation itself scrolls.
    if (e.target.closest("button, input, textarea, a") || !e.target.closest(".wx-handle, .wx-chat-h, .wx-list-h, .wx-peek")) return;
    const el = sheetRef.current;
    el.setPointerCapture?.(e.pointerId);
    dragStart.current = { y: e.clientY, h: el.getBoundingClientRect().height, t: performance.now(), v: 0, lastY: e.clientY, lastT: performance.now() };
  };
  const onGrabMove = (e) => {
    const d = dragStart.current;
    if (!d) return;
    const now = performance.now();
    if (now - d.lastT > 0) d.v = (d.lastY - e.clientY) / (now - d.lastT); // px per ms, up is positive
    d.lastY = e.clientY;
    d.lastT = now;
    const { peek, chat } = snapHeights();
    setDrag(Math.min(chat, Math.max(peek, d.h + (d.y - e.clientY))));
  };
  const onGrabUp = () => {
    const d = dragStart.current;
    if (!d) return;
    dragStart.current = null;
    const heights = snapHeights();
    const target = snapTo(drag ?? d.h, d.v, Object.values(heights));
    setDrag(null);
    setSnap(Object.entries(heights).find(([, h]) => h === target)?.[0] || "peek");
  };

  // ---- pieces ----
  const pinTone = (s) => (stateOf(s) === "applied" ? "done" : stateOf(s) === "dismissed" ? "off" : "todo");
  const pinEl = (s, from, style) => (
    <button
      key={s.id}
      type="button"
      className={`ws-pin ws-pin-${pinTone(s)}${active === s.id ? " ws-pin-on" : ""}`}
      style={style}
      data-pin={s.id}
      onClick={(e) => { e.stopPropagation(); select(s.id, from); }}
      aria-label={`Suggestion ${s.pin}: ${s.title}, ${statusLabel(s).toLowerCase()}`}
      aria-current={active === s.id ? "true" : undefined}
    >
      {s.pin}
      {stateOf(s) === "applied" && <i className="wx-check" aria-hidden="true">✓</i>}
    </button>
  );

  // The lines suggestions are about, for the pins and highlights: what the filter shows, plus the one that is open.
  const byLine = useMemo(() => {
    const m = new Map();
    const shown = activeS && !nav.some((x) => x.id === activeS.id) ? [...nav, activeS] : nav;
    shown.forEach((s) => {
      const l = lineOf(s);
      if (!l || s.status === "done") return;
      if (s.status === "pending" && s.edit?.op === "add_bullet") return; // its pin and highlight sit on the proposed bullet
      if (!m.has(l)) m.set(l, []);
      m.get(l).push(s);
    });
    return m;
  }, [nav, activeS]);

  const closeInline = () => setInline(null);
  const doEdit = (edit, label) => {
    closeInline();
    act.manual(edit, label);
  };

  /**
   * A line of the resume: its pins in the margin, and – once a change is applied – the added words marked.
   * In edit mode a line with `edit` ({ text, save(text) -> edit, remove? -> edit }) becomes click-to-edit with a remove button.
   */
  function lineEl(id, children, { as = "p", className = "", key, edit } = {}) {
    const Tag = as;
    const here = byLine.get(id) || [];
    const lead = here.find((s) => s.id === active) || here.find((s) => s.status === "pending") || here[0];
    const leadState = lead ? (lead.id === active ? "on" : stateOf(lead)) : null;
    const applied = here.find((s) => s.status === "applied" && s.before != null && s.edit?.op === "replace");
    const now = textAt(resume, id);
    const ed = editMode && edit ? edit : null;
    const editingHere = ed && inline?.id === id && inline.mode === "edit";
    const shown = applied && highlight && now != null ? <Diff before={applied.before} after={now} show="after" /> : children;
    const cls = ["ws-ln", here.length ? "ws-has" : "", leadState ? `wx-hl wx-hl-${leadState}` : "", isFlash(id) ? "ws-flash" : "", ed ? "ws-editable" : "", className].join(" ");
    const open = () => setInline({ id, mode: "edit", text: ed.text });
    return (
      <Tag
        key={key}
        data-line={id}
        className={cls}
        tabIndex={ed || here.length ? 0 : undefined}
        onClick={editingHere ? undefined : here.length ? () => select(lead.id, "resume") : ed ? open : undefined}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (ed && e.key === "Enter") open();
          else if (!ed && here.length && e.key === "Enter") select(lead.id, "resume");
        }}
        aria-label={ed && !editingHere ? `Edit: ${String(ed.text).slice(0, 60)}` : undefined}
      >
        {here.length > 0 && (isPhone || narrow) && <span className="ws-pins">{here.map((s) => pinEl(s, "resume"))}</span>}
        {editingHere ? (ed.form ? ed.form(closeInline) : <InlineForm value={ed.text} label="Edit this line" onSave={(t) => doEdit(ed.save(t), "Updated your resume")} onCancel={closeInline} />) : shown}
        {ed && !editingHere && (
          <button type="button" className="ws-pen" aria-label="Edit this line" onClick={(e) => { e.stopPropagation(); open(); }}>✎</button>
        )}
        {ed?.remove && !editingHere && (
          <button type="button" className="ws-x" aria-label="Remove this line" onClick={(e) => { e.stopPropagation(); doEdit(ed.remove, "Removed a line"); }}>×</button>
        )}
      </Tag>
    );
  }

  /** "+ Add …" under a list: opens a one-line form. */
  function addRow(id, label, build, { initial = "" } = {}) {
    if (!editMode) return null;
    if (inline?.id === id && inline.mode === "add") return <div key={id} className="ws-add"><InlineForm value={initial} label={label} onSave={(t) => doEdit(build(t), "Added to your resume")} onCancel={closeInline} /></div>;
    return <div key={id} className="ws-add"><button type="button" className="ws-addbtn" onClick={() => setInline({ id, mode: "add", text: "" })}>+ {label}</button></div>;
  }

  /** A section heading; in edit mode it carries Move up / Move down / Rename / Remove. */
  function sectionHead(sec, index, count) {
    const id = `SEC:${sec.key}`;
    if (!editMode) return lineEl(id, sec.title, { as: "h3" });
    const renaming = inline?.id === id && inline.mode === "rename";
    return (
      <div key={id} className="ws-sh">
        {renaming ? (
          <InlineForm value={sec.title} label="Section name" multiline={false} onSave={(t) => doEdit({ target: id, op: "rename_section", after: t }, `Renamed to ${t}`)} onCancel={closeInline} />
        ) : (
          lineEl(id, sec.title, { as: "h3" })
        )}
        {!renaming && !sec.readOnly && (
          <span className="ws-sbar" role="group" aria-label={`${sec.title} section`}>
            <button type="button" aria-label={`Move ${sec.title} up`} disabled={index === 0} onClick={() => doEdit({ target: id, op: "move_section", to: index - 1 }, `Moved ${sec.title} up`)}>↑</button>
            <button type="button" aria-label={`Move ${sec.title} down`} disabled={index === count - 1} onClick={() => doEdit({ target: id, op: "move_section", to: index + 1 }, `Moved ${sec.title} down`)}>↓</button>
            <button type="button" onClick={() => setInline({ id, mode: "rename", text: sec.title })}>Rename</button>
            <button type="button" className="ws-danger" onClick={() => doEdit({ target: id, op: "remove_section" }, `Removed ${sec.title}`)}>Remove</button>
          </span>
        )}
      </div>
    );
  }

  const r = resume || {};
  // Sections a card is pinned to show even when empty (for example "write a summary").
  const forced = [byLine.has("S") && "summary", byLine.has("SEC:education") && "education", byLine.has("K") && "skills", byLine.has("Z") && "certifications"].filter(Boolean);
  const plan = sectionPlan(r, { include: forced });
  const replaceOf = (target) => (t) => ({ target, op: "replace", after: t });
  const itemEdit = (id, text) => ({ text, save: replaceOf(id), remove: { target: id, op: "remove" } });

  const sectionBody = (sec) => {
    if (sec.key === "summary") return lineEl("S", r.summary || <span className="ws-empty">No summary yet</span>, { edit: { text: r.summary || "", save: replaceOf("S") } });
    if (sec.key === "skills") return lineEl("K", (r.skills || []).join(" · ") || <span className="ws-empty">No skills listed</span>, { edit: { text: (r.skills || []).join(" · "), save: replaceOf("K") } });
    if (sec.key === "certifications") return lineEl("Z", (r.certifications || []).join(" · ") || <span className="ws-empty">None added yet</span>, { edit: { text: (r.certifications || []).join(" · "), save: replaceOf("Z") } });
    if (sec.key === "experience") {
      return alive(r.experience).map(([e, i]) => (
        <div key={i} className="ws-job">
          {lineEl(`E${i}`, <><strong>{roleLine(e)}</strong>{inline?.id === `E${i}:period` ? <InlineForm value={e.period || ""} label="Edit dates" multiline={false} onSave={(t) => doEdit({ target: `E${i}`, op: "replace", after: roleLine(e), period: t }, "Updated the dates")} onCancel={closeInline} /> : <span className="ws-period" role="button" tabIndex={0} aria-label={`Edit dates: ${e.period || "none yet"}`} title="Edit dates" onClick={(ev) => { ev.stopPropagation(); setInline({ id: `E${i}:period`, mode: "edit", text: e.period || "" }); }} onKeyDown={(ev) => { if (ev.key === "Enter") { ev.stopPropagation(); setInline({ id: `E${i}:period`, mode: "edit", text: e.period || "" }); } }}>{e.period || "Add dates"}</span>}</>, { as: "div", className: "ws-job-hd", edit: { text: roleLine(e), save: replaceOf(`E${i}`), remove: { target: `E${i}`, op: "remove" } } })}
          <ul>
            {(e.bullets || []).map((b, j) => (b == null ? null : lineEl(`E${i}B${j}`, b, { as: "li", key: j, edit: itemEdit(`E${i}B${j}`, b) })))}
            {nav.filter((g) => g.status === "pending" && g.edit?.op === "add_bullet" && g.edit.target === `E${i}`).map((g) => (
              <li key={`ghost-${g.id}`} className={`wx-ghost${active === g.id ? " wx-ghost-on" : ""}`} data-line={`ghost:${g.id}`} tabIndex={0} onClick={() => select(g.id, "resume")} onKeyDown={(ev) => ev.key === "Enter" && select(g.id, "resume")}>
                {(isPhone || narrow) && <span className="ws-pins">{pinEl(g, "resume")}</span>}
                <span className="wx-ghost-l">PROPOSED BULLET</span>
                {finalText(g, blankValues[g.id]) || g.edit.after}
              </li>
            ))}
          </ul>
          {addRow(`add:E${i}`, "Add bullet", (t) => ({ target: `E${i}`, op: "add_bullet", after: t }))}
        </div>
      ));
    }
    if (sec.key === "education") {
      return (
        <>
          {alive(r.education).map(([ed, i]) => (
            <div key={i}>
              {lineEl(`D${i}`, educationLine(ed), { edit: { ...itemEdit(`D${i}`, educationLine(ed)), form: (close) => <EducationForm initial={ed} onCancel={close} onSave={(entry) => doEdit({ target: `D${i}`, op: "update_education", entry }, "Updated your education")} /> } })}
              {textAt(r, `D${i}:meta`) ? lineEl(`D${i}:meta`, textAt(r, `D${i}:meta`), { className: "ws-ln-sub", edit: itemEdit(`D${i}:meta`, textAt(r, `D${i}:meta`)) }) : null}
              {(ed.details || []).map((d, k) => (d == null || !String(d).trim() ? null : lineEl(`D${i}:d${k}`, d, { className: "ws-ln-sub", key: k, edit: itemEdit(`D${i}:d${k}`, d) })))}
              {addRow(`add:D${i}`, "Add detail", (t) => ({ target: `D${i}`, op: "add_detail", after: t }))}
            </div>
          ))}
          {inline?.id === "add:education" && inline.mode === "add"
            ? <div key="add:education" className="ws-add"><EducationForm submitLabel="Add" onCancel={closeInline} onSave={(entry) => doEdit({ target: "D", op: "add_education", entry }, "Added to your education")} /></div>
            : <div key="add:education" className="ws-add"><button type="button" className="ws-addbtn" onClick={() => setInline({ id: "add:education", mode: "add", text: "" })}>+ Add education</button></div>}
        </>
      );
    }
    const x = extraLines(r).find((e) => e.key === sec.key);
    if (!x) return null;
    if (x.kind === "inline") {
      return (
        <>
          <p className="ws-ln">{x.items.map((it, i) => <span key={it.id}>{i ? " · " : ""}{lineEl(it.id, it.text, { as: "span", key: it.id, edit: itemEdit(it.id, it.text) })}</span>)}</p>
          {addRow(`add:${x.key}`, "Add item", (t) => ({ target: `X:${x.key}`, op: "add_item", after: t }))}
        </>
      );
    }
    if (x.kind === "bullets") {
      return (
        <>
          <ul>{x.items.map((it, i) => (it.id ? lineEl(it.id, it.text, { as: "li", key: it.id, edit: itemEdit(it.id, it.text) }) : <li key={i}>{it.text}</li>))}</ul>
          {!x.readOnly && addRow(`add:${x.key}`, "Add item", (t) => ({ target: `X:${x.key}`, op: "add_item", after: t }))}
        </>
      );
    }
    return (
      <>
        {x.items.map((e) => (
          <div key={e.id} className="ws-job">
            {lineEl(e.id, <><strong>{e.heading}</strong><span>{e.meta}</span></>, { as: "div", className: "ws-job-hd", edit: { text: e.heading, save: replaceOf(e.id), remove: { target: e.id, op: "remove" } } })}
            {e.bullets.length > 0 && <ul>{e.bullets.map((b) => lineEl(b.id, b.text, { as: "li", key: b.id, edit: itemEdit(b.id, b.text) }))}</ul>}
            {addRow(`add:${e.id}`, "Add bullet", (t) => ({ target: e.id, op: "add_item", after: t }))}
          </div>
        ))}
        {addRow(`addentry:${x.key}`, x.key === "projects" ? "Add project" : "Add role", (t) => ({ target: `X:${x.key}`, op: "add_entry", after: t }))}
      </>
    );
  };

  // What "Add section" offers: standard sections the resume doesn't have (including core ones the person removed).
  const missingCore = CORE_SECTIONS.filter(([key]) => key !== "experience" && !plan.some((x) => x.key === key));
  const addSection = (key, title) => {
    setAddMenu(false);
    setInline({ id: `addsec:${key}`, mode: "add", text: "", title });
  };
  const addSectionForm = () => {
    if (!inline || !String(inline.id).startsWith("addsec:")) return null;
    const key = inline.id.slice(7);
    const title = inline.title;
    const build = (t) => {
      if (key === "custom") return { op: "add_custom_section", title: t, after: "" };
      if (key === "summary") return { target: "S", op: "replace", after: t };
      if (key === "skills") return { target: "K", op: "replace", after: t };
      if (key === "certifications") return { target: "Z", op: "replace", after: t };
      if (key === "education") { const [degree = "", school = "", year = ""] = splitLine(t); return { target: "D", op: "add_education", entry: { degree, school, year } }; }
      if (key === "projects" || key === "volunteer") return { target: `X:${key}`, op: "add_entry", after: t };
      return { target: `X:${key}`, op: "add_item", after: t };
    };
    if (key === "education") return <div className="ws-add"><EducationForm submitLabel="Add" onCancel={closeInline} onSave={(entry) => doEdit({ target: "D", op: "add_education", entry }, "Added Education")} /></div>;
    const label = key === "custom" ? "Name of the new section" : `First line for ${title}`;
    return <div className="ws-add"><InlineForm value="" label={label} multiline={key !== "custom"} onSave={(t) => doEdit(build(t), key === "custom" ? `Added ${t}` : `Added ${title}`)} onCancel={closeInline} /></div>;
  };

  const paper = (
    <article className={`ws-paper${editMode ? " ws-editing" : ""}`} ref={paperRef}>
      {editMode ? lineEl("N", r.name || <span className="ws-empty">Your name</span>, { as: "h2", className: "ws-name", edit: { text: r.name || "", save: replaceOf("N") } }) : <h2 className="ws-name">{r.name}</h2>}
      {lineEl("T", r.title || <span className="ws-empty">No headline</span>, { className: "ws-title", edit: { text: r.title || "", save: replaceOf("T") } })}
      {lineEl("C", r.contact || <span className="ws-empty">No contact details</span>, { className: "ws-contact", edit: { text: r.contact || "", save: replaceOf("C") } })}
      {plan.map((sec, i) => (
        <section key={sec.key} data-section={sec.key}>
          {sectionHead(sec, i, plan.length)}
          {sectionBody(sec)}
        </section>
      ))}
      {editMode && (
        <div className="ws-addsec">
          {addSectionForm()}
          <button type="button" className="ws-btn" aria-expanded={addMenu} onClick={() => setAddMenu((v) => !v)}>+ Add section</button>
          {addMenu && (
            <div className="ws-menu" role="menu">
              {[...missingCore, ...addableSections(r)].map(([key, title]) => <button key={key} type="button" role="menuitem" onClick={() => addSection(key, title)}>{title}</button>)}
              <button type="button" role="menuitem" onClick={() => addSection("custom", "Custom section")}>Custom section…</button>
            </div>
          )}
        </div>
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
    if (s.edit?.op === "set_items") {
      const now = (extraSlot(resume, s.edit.target)?.list || []).filter((x) => x != null);
      const key = (x) => String(x).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
      const keep = new Set(s.edit.items.map(key));
      const dropped = now.filter((x) => !keep.has(key(x)));
      return (
        <div className="ws-txt">
          {dropped.length === 0 && <div className="ws-dl">New order</div>}
          {now.map((x, i) => <div key={i}>{keep.has(key(x)) ? x : <del>{x}</del>}</div>)}
        </div>
      );
    }
    if (s.edit?.op === "remove_section") {
      const key = s.edit.target.replace(/^(SEC|X):/, "");
      const sec = sectionPlan(resume, { include: ["summary", "education", "skills", "certifications"] }).find((x) => x.key === key);
      const x = extraLines(resume).find((e) => e.key === key);
      const texts = x
        ? (x.kind === "entries" ? x.items.flatMap((e) => [e.heading, ...e.bullets.map((b) => b.text)]) : x.items.map((i) => i.text))
        : key === "summary" ? [resume.summary] : key === "skills" ? [(resume.skills || []).join(" · ")] : key === "certifications" ? [(resume.certifications || []).join(" · ")]
        : key === "education" ? alive(resume.education).map(([e]) => educationLine(e)) : key === "experience" ? alive(resume.experience).map(([e]) => roleLine(e)) : [];
      return <div className="ws-txt"><div className="ws-dl">Remove the whole {sec?.title || "section"} section</div>{texts.filter(Boolean).slice(0, 8).map((t, i) => <div key={i}><del>{t}</del></div>)}</div>;
    }
    if (s.edit?.op === "move_section") {
      const keys = sectionPlan(resume).map((x) => x.key);
      const key = s.edit.target.slice(4);
      const title = sectionPlan(resume).find((x) => x.key === key)?.title || key;
      const to = Math.max(0, Math.min(keys.length - 1, s.edit.to));
      const rest = keys.filter((k) => k !== key);
      const above = to === 0 ? null : sectionPlan(resume).find((x) => x.key === rest[to - 1])?.title;
      return <div className="ws-txt"><div className="ws-dl">New position</div><ins>{title}</ins> {above ? `moves below ${above}` : "moves to the top"}</div>;
    }
    if (s.edit?.op === "rename_section") {
      const key = s.edit.target.slice(4);
      const title = sectionPlan(resume).find((x) => x.key === key)?.title || key;
      return <div className="ws-txt"><Diff before={title} after={s.edit.after} /></div>;
    }
    if (s.edit?.op === "set_certifications") {
      const keep = new Set(s.edit.items.map((x) => x.toLowerCase()));
      return <div className="ws-txt">{(resume.certifications || []).map((x, i) => <span key={i}>{i ? " · " : ""}{keep.has(String(x).toLowerCase()) ? x : <del>{x}</del>}</span>)}</div>;
    }
    if (s.edit?.op === "remove" && /^E\d+$/.test(s.edit.target)) {
      const e = resume.experience?.[+s.edit.target.slice(1)];
      return <div className="ws-txt"><div className="ws-dl">Remove this role and its bullets</div><del>{roleLine(e)}</del>{(e?.bullets || []).filter((b) => b != null).slice(0, 4).map((b, i) => <div key={i}><del>{b}</del></div>)}</div>;
    }
    if (s.edit?.op === "remove" && /^D\d+$/.test(s.edit.target)) return <div className="ws-txt"><div className="ws-dl">Remove this education entry</div><del>{educationLine(resume.education?.[+s.edit.target.slice(1)])}</del></div>;
    if (s.edit?.op === "add_education") return <><div className="ws-dl">New education</div><div className="ws-txt"><ins>{after}</ins></div></>;
    if (s.edit?.op === "update_education") {
      const merged = [{ ...(resume.education?.[+s.edit.target.slice(1)] || {}), ...s.edit.entry }].map(educationLine)[0];
      return inline ? <div className="ws-txt"><Diff before={before} after={merged} /></div> : (
        <>
          <div className="ws-dl">Current</div><div className="ws-txt"><Diff before={before} after={merged} show="before" /></div>
          <div className="ws-dl">Suggested</div><div className="ws-txt"><Diff before={before} after={merged} show="after" /></div>
        </>
      );
    }
    if (s.edit?.op === "add_item") return <><div className="ws-dl">New item</div><div className="ws-txt"><ins>{after}</ins></div></>;
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
        <button type="button" className="ws-lnk" onClick={() => act.saveEdit(s.id, withoutNumbers(s.edit.after))}>I don't have a number: keep it without one</button>
      </div>
    );
  }

  const warningOf = (s) => {
    const before = s.before ?? "";
    const after = finalText(s, blankValues[s.id]) || "";
    return ownershipWarning(before, after) || (s.edit ? removalWarning(resume, s.edit) : null);
  };

  function questionEl(s, compact) {
    const value = answers[s.id] || "";
    return (
      <form className="ws-qa" onSubmit={(e) => { e.preventDefault(); if (value.trim()) { act.answer(s.id, value.trim()); setAnswers((a) => ({ ...a, [s.id]: "" })); } }}>
        <p className="ws-q">{s.question}</p>
        <div className="ws-qa-row">
          {compact ? <input value={value} onChange={(e) => setAnswers((a) => ({ ...a, [s.id]: e.target.value }))} placeholder="Answer this question (Enter to send)" aria-label="Your answer" /> : <textarea rows={2} value={value} onChange={(e) => setAnswers((a) => ({ ...a, [s.id]: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} placeholder="Answer this question (Enter to send)" aria-label="Your answer" />}
          <button type="submit" className="ws-btn ws-pri" disabled={busy || !value.trim()}>{busy ? "…" : "Send"}</button>
        </div>
        {s.note && <p className="ws-note">{s.note}</p>}
      </form>
    );
  }

  /** One suggestion as a card in the conversation: what changes, and Accept / Edit / Skip. */
  function proposalEl(s, { compact = false } = {}) {
    const st = stateOf(s);
    const on = active === s.id ? " wx-prop-on" : "";
    const delta = st === "todo" && s.edit ? deltaOf(s, finalText(s, blankValues[s.id])) : null;
    const where = s.where || "your resume";
    if (st === "applied") {
      const can = act.canUndoCard(s.id);
      return (
        <div className={`wx-prop wx-prop-applied${on}`} id={`ws-card-${s.id}`}>
          <div className="wx-prop-h"><span>Applied to {where}</span></div>
          {s.status === "done" ? <div className="wx-prop-b">{s.note || "Done: see the new suggestions"}</div> : s.appliedText && <div className="wx-prop-b wx-prop-plain">{s.appliedText}</div>}
          {s.status !== "done" && s.undo && (
            <div className="wx-prop-f">
              <button type="button" className="wx-btn wx-btn-ok" disabled={!can} title={can ? undefined : "A newer change sits on top of this one. Use Undo in the menu to step back in order."} onClick={() => undoOne(s)}>Applied ✓ (undo)</button>
            </div>
          )}
        </div>
      );
    }
    if (st === "dismissed") {
      return (
        <div className={`wx-prop wx-prop-off${on}`} id={`ws-card-${s.id}`}>
          <div className="wx-prop-h"><span>{s.outdated ? "Set aside" : "Skipped"}</span></div>
          <div className="wx-prop-b wx-prop-plain">{s.outdated ? "This line changed after the suggestion was written. Restore to use it anyway." : "Your original line is kept."}</div>
          <div className="wx-prop-f"><button type="button" className="wx-btn" onClick={() => act.restore(s.id)}>Restore</button></div>
        </div>
      );
    }
    if (s.question) {
      return (
        <div className={`wx-prop wx-prop-ask${on}`} id={`ws-card-${s.id}`}>
          <div className="wx-prop-h"><span>Question about {where}</span></div>
          <div className="wx-prop-b wx-prop-plain">{questionEl(s, compact)}</div>
          <div className="wx-prop-f"><button type="button" className="wx-btn" onClick={() => skip(s)}>Skip</button></div>
        </div>
      );
    }
    if (s.action) {
      return (
        <div className={`wx-prop${on}`} id={`ws-card-${s.id}`}>
          <div className="wx-prop-h"><span>{where}</span></div>
          <div className="wx-prop-f">
            <button type="button" className="wx-btn wx-btn-pri" disabled={busy} onClick={() => act.action(s.id)}>Do it</button>
            <button type="button" className="wx-btn" onClick={() => skip(s)}>Skip</button>
          </div>
        </div>
      );
    }
    const warn = warningOf(s);
    const kws = keywordsOf(s, finalText(s, blankValues[s.id]));
    return (
      <div className={`wx-prop${on}`} id={`ws-card-${s.id}`}>
        <div className="wx-prop-h"><span>Proposed for {where} · shown on the resume</span>{delta > 0 && <span className="ws-pts">+{delta}</span>}</div>
        <div className="wx-prop-b">
          {editing === s.id ? <textarea className="ws-edit" value={editText} onChange={(e) => setEditText(e.target.value)} aria-label="Edit suggestion" autoFocus /> : changeEl(s, true)}
        </div>
        {editing !== s.id && inputsEl(s)}
        {warn && <p className="ws-warn wx-pad">{warn}</p>}
        {editing !== s.id && kws.length > 0 && <div className="ws-kw wx-pad">Adds {kws.map((k) => <span key={k}>{k}</span>)}</div>}
        <div className="wx-prop-f">
          {editing === s.id ? (
            <>
              <button type="button" className="wx-btn wx-btn-pri" onClick={() => saveEdit(s)}>Save edit</button>
              <button type="button" className="wx-btn" onClick={() => setEditing(null)}>Cancel</button>
            </>
          ) : (
            <>
              <button type="button" className="wx-btn wx-btn-pri" disabled={!isReady(s, blankValues[s.id])} onClick={() => apply(s)}>Accept</button>
              {s.edit?.after != null && <button type="button" className="wx-btn" onClick={() => startEdit(s)}>Edit</button>}
              <button type="button" className="wx-btn" onClick={() => skip(s)}>Skip</button>
              {s.edit?.after != null && <button type="button" className="ws-lnk" disabled={busy} onClick={() => act.regenerate(s.id)}>↻ Another version</button>}
            </>
          )}
        </div>
      </div>
    );
  }

  /** Several changes proposed at once: one receipt with Apply all, View and Undo. */
  function receiptEl(m) {
    const cards = (m.ids || []).map((id) => suggestions[id]).filter(Boolean);
    if (!cards.length) return null;
    if (cards.length === 1) return <div key={m.id}>{proposalEl(cards[0], { compact: true })}</div>;
    const ready = cards.filter((c) => c.status === "pending" && c.edit && !c.question && isReady(c, blankValues[c.id]) && !warningOf(c));
    const done = cards.filter((c) => stateOf(c) === "applied");
    return (
      <div key={m.id} className="wx-receipt">
        <div className="wx-receipt-h"><b>{cards.length} changes proposed</b><button type="button" className="ws-lnk" onClick={() => { act.showLines(m.ids); act.event("ws_receipt_viewed", { count: cards.length }); }}>View on resume</button></div>
        <ul>
          {cards.map((c) => (
            <li key={c.id}>
              <button type="button" className="wx-rl" onClick={() => select(c.id, "nav")}>
                <span className={`wx-badge wx-badge-${stateOf(c)}`}>{c.pin}</span>
                <span className="wx-rl-t">{c.title}</span>
                <small>{statusLabel(c)}</small>
              </button>
            </li>
          ))}
        </ul>
        <div className="wx-prop-f">
          {ready.length > 0 && <button type="button" className="wx-btn wx-btn-pri" disabled={busy} onClick={() => { act.event("ws_receipt_apply_all", { count: ready.length, of: cards.length }); act.applyAll(ready.map((c) => c.id)); }}>Apply all {ready.length}</button>}
          {done.length > 0 && <button type="button" className="wx-btn wx-btn-ok" onClick={() => { act.event("ws_receipt_undo", { count: done.length }); act.undoMany(done.map((c) => c.id)); }}>{done.length} applied ✓ (undo)</button>}
        </div>
      </div>
    );
  }
  const messageEl = (m) =>
    m.kind === "proposal" || m.kind === "receipt" ? receiptEl(m) : <div key={m.id} className={`ws-bub ws-bub-${m.role}`}>{m.text}</div>;

  const allDone = list.length > 0 && tally.todo === 0;
  const doneSent = useRef(false);
  useEffect(() => {
    if (allDone && !doneSent.current) {
      doneSent.current = true;
      act.event("ws_all_decided", { applied: tally.applied, skipped: skippedCount, total: list.length });
    }
    if (!allDone) doneSent.current = false;
  }, [allDone]);
  const fit = fitChip(pages);
  const matchEl = (
    <span className="wx-match" title={score.potential > score.now ? `Up to ${score.potential}${score.unit} if everything is applied` : undefined}>
      {score.label} <b>{score.base}{score.unit}</b>{score.now !== score.base && <> → <b className="wx-up">{score.now}{score.unit}</b></>}
    </span>
  );
  const filterPills = (cls = "") => (
    <div className={`wx-pills ${cls}`} role="group" aria-label="Show suggestions">
      {[["all", "All", tally.all], ["todo", "To review", tally.todo], ["applied", "Applied", tally.applied]].map(([k, l, n]) => (
        <button key={k} type="button" aria-pressed={filter === k} onClick={() => { setFilter(k); act.event("ws_filter_changed", { filter: k }); }}>{l} {n}</button>
      ))}
    </div>
  );
  const stripEl = (
    <div className="wx-strip" role="region" aria-live="polite" aria-label="Open suggestion">
      {activeS ? (
        <>
          <span className="wx-badge wx-badge-on">{activeS.pin}</span>
          <div className="wx-strip-t"><b>{activeS.title}</b><span>{activeS.where} · {statusLabel(activeS)}</span></div>
        </>
      ) : (
        <div className="wx-strip-t"><b>Whole resume</b><span>Pick a pin, or ask for a change</span></div>
      )}
      <button type="button" className="wx-nav" aria-label="Previous suggestion" disabled={!nav.length} onClick={() => step(-1)}>‹</button>
      <button type="button" className="wx-nav" aria-label="Next suggestion" disabled={!nav.length} onClick={() => step(1)}>›</button>
    </div>
  );
  const clearEl = activeS && (
    <button type="button" className="ws-lnk wx-clear" onClick={() => { cleared.current = true; setActive(null); act.event("ws_scope_cleared"); }}>Clear: talk about the whole resume</button>
  );
  const threadBody = (
    <div className="wx-thread" ref={threadRef} role="log" aria-live="polite" aria-label="Conversation">
      {activeS ? (
        <>
          {activeS.why && stateOf(activeS) === "todo" && <p className="wx-msg">{activeS.why}</p>}
          {proposalEl(activeS, { compact: isPhone })}
          {threadFor(thread, activeS.id).map(messageEl)}
        </>
      ) : (
        <>
          <p className="wx-msg wx-muted">{list.length ? "Pick a suggestion on the resume, or ask for a change to the whole resume." : "Ask for a change to your resume."}</p>
          {threadFor(thread, null).map(messageEl)}
        </>
      )}
      {busy && <div className="ws-bub ws-bub-bot ws-typing" aria-label="Working"><span /><span /><span /></div>}
      {allDone && (
        <div className="wx-alldone">
          <b>All done</b>
          <p>Every suggestion is decided. Download your resume when you are ready.</p>
          <button type="button" className="wx-btn wx-btn-pri" onClick={act.download}>Design &amp; download</button>
        </div>
      )}
    </div>
  );
  const composerEl = (
    <form className="wx-composer" onSubmit={(e) => { e.preventDefault(); sendAsk(); }}>
      <div className="wx-chips">
        {["Make it shorter", "Add a metric", "Keep to 1 page"].map((c) => <button key={c} type="button" disabled={busy} onClick={() => sendAsk(c)}>{c}</button>)}
      </div>
      <div className="wx-row">
        <label className="wx-sr" htmlFor="wx-msg">Message</label>
        <textarea id="wx-msg" ref={composerRef} rows={1} value={ask} onChange={(e) => setAsk(e.target.value)} onKeyDown={askKeys} placeholder={placeholderFor(activeS)} />
        <button type="submit" className="wx-send" disabled={busy || !ask.trim()} aria-label="Send">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg><span>Send</span>
        </button>
      </div>
    </form>
  );
  const moreEl = (
    <details className="wx-more" onToggle={(e) => setMoreOpen(e.currentTarget.open)}>
      <summary aria-label="More actions">···</summary>
      <div className="wx-menu" role="menu" onClick={(e) => (e.target.closest("button") ? (e.currentTarget.parentElement.open = false) : null)}>
        <button type="button" role="menuitem" disabled={!props.canUndo} onClick={act.undoLast}>Undo last change</button>
        <button type="button" role="menuitem" disabled={!props.canRedo} onClick={act.redo}>Redo</button>
        <button type="button" role="menuitem" onClick={act.reset}>Reset to the original</button>
        <button type="button" role="menuitem" disabled={busy || !pendingList.some((s) => isReady(s, blankValues[s.id]) && !warningOf(s))} onClick={() => act.applyAll()}>Apply all ready</button>
        <label className="wx-tog"><input type="checkbox" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} /> Highlight changes</label>
        {extras?.map((x) => <button key={x.label} type="button" role="menuitem" onClick={x.run}>{x.label}</button>)}
      </div>
    </details>
  );

  // ---------------- phone: the resume full screen, a sheet with three heights ----------------
  if (isPhone) {
    const segs = progressSegments(list, active);
    const pend = nextTodoId(list, active) || list.find((s) => stateOf(s) === "todo")?.id;
    const peekEl = activeS ? (
      <div className="wx-peek">
        <div className="wx-prow">
          <span className="wx-badge wx-badge-on wx-badge-l">{activeS.pin}</span>
          <div className="wx-strip-t"><b>{activeS.title}</b><span>{activeS.where} · {statusLabel(activeS)}</span></div>
          <button type="button" className="wx-nav wx-nav-l" aria-label="Previous suggestion" onClick={() => step(-1)}>‹</button>
          <button type="button" className="wx-nav wx-nav-l" aria-label="Next suggestion" onClick={() => step(1)}>›</button>
        </div>
        <div className="wx-pacts">
          {stateOf(activeS) === "todo" ? (
            activeS.edit && !activeS.question ? (
              <button type="button" className="wx-btn wx-btn-pri wx-btn-l" disabled={!isReady(activeS, blankValues[activeS.id]) || !!warningOf(activeS)} onClick={() => apply(activeS)}>Accept</button>
            ) : (
              <button type="button" className="wx-btn wx-btn-pri wx-btn-l" onClick={() => setSnap("chat")}>{activeS.question ? "Answer" : "Open"}</button>
            )
          ) : stateOf(activeS) === "applied" ? (
            <button type="button" className="wx-btn wx-btn-ok wx-btn-l" disabled={!act.canUndoCard(activeS.id)} onClick={() => undoOne(activeS)}>Applied ✓ (undo)</button>
          ) : (
            <button type="button" className="wx-btn wx-btn-l" onClick={() => act.restore(activeS.id)}>Restore</button>
          )}
          <button type="button" className="wx-btn wx-btn-l" onClick={() => setSnap("chat")}>Discuss ↑</button>
          {stateOf(activeS) === "todo" && <button type="button" className="wx-btn wx-btn-l wx-btn-skip" onClick={() => skip(activeS)}>Skip</button>}
        </div>
      </div>
    ) : (
      <div className="wx-peek"><p className="wx-msg wx-muted">{list.length ? "Nothing open." : "Ask for a change to your resume."}</p><button type="button" className="wx-btn wx-btn-l" onClick={() => setSnap("chat")}>Ask ↑</button></div>
    );
    const chatEl = (
      <div className="wx-chat">
        <div className="wx-chat-h">
          {activeS ? (
            <>
              <span className="wx-badge wx-badge-on wx-badge-l">{activeS.pin}</span>
              <div className="wx-strip-t"><b>{activeS.title}</b><span>{nav.findIndex((x) => x.id === activeS.id) + 1} of {nav.length} · {activeS.where}</span></div>
            </>
          ) : <div className="wx-strip-t"><b>Whole resume</b><span>Ask for a change</span></div>}
          <button type="button" className="wx-nav wx-nav-l wx-nav-bare" aria-label="Previous suggestion" onClick={() => step(-1)}>‹</button>
          <button type="button" className="wx-nav wx-nav-l wx-nav-bare" aria-label="Next suggestion" onClick={() => step(1)}>›</button>
        </div>
        {clearEl}
        {threadBody}
        {composerEl}
      </div>
    );
    const listEl = (
      <div className="wx-list">
        <div className="wx-list-h"><b>{tally.all} suggestion{tally.all === 1 ? "" : "s"}</b>{filterPills("wx-pills-l")}</div>
        <div className="wx-rows">
          {nav.map((s) => (
            <button key={s.id} type="button" className={`wx-row${active === s.id ? " wx-row-on" : ""}`} onClick={() => { select(s.id, "nav"); setSnap("peek"); }}>
              <span className={`wx-badge wx-badge-${active === s.id ? "on" : stateOf(s)} wx-badge-l`}>{s.pin}</span>
              <span className="wx-rl-t"><b>{s.title}</b><small>{s.where}</small></span>
              <em className={`wx-st wx-st-${stateOf(s)}`}>{statusLabel(s)}</em>
            </button>
          ))}
          {!nav.length && <p className="wx-msg wx-muted wx-pad">Nothing here yet.</p>}
          {skippedCount > 0 && <button type="button" className="ws-lnk wx-pad" onClick={() => setShowSkipped((v) => !v)}>{showSkipped ? "Hide" : "Show"} skipped ({skippedCount})</button>}
        </div>
        <div className="wx-list-f">
          <button type="button" className="wx-btn wx-btn-pri wx-btn-xl" disabled={!pend} onClick={() => { if (pend) select(pend, "nav"); setSnap("peek"); }}>{pend ? `Review next (#${suggestions[pend].pin})` : "All reviewed"}</button>
        </div>
      </div>
    );
    return (
      <div className="ws ws-phone wx wx-phone">
        <header className="wx-phead">
          <div className="wx-phead-t"><b>Your resume</b><small>{title.replace(/^Tailoring for /, "")} · {matchEl}</small></div>
          <button type="button" className="wx-icon" aria-label="Design and download" onClick={act.download}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 4v12M6 10l6 6 6-6M5 20h14" /></svg>
          </button>
          {moreEl}
        </header>
        <button type="button" className="wx-progress" onClick={() => setSnap("list")} aria-label={`${appliedCount} of ${tally.all} applied. Open the list`}>
          <span>{appliedCount} of {tally.all} applied</span>
          <span className="wx-seg" style={{ gridTemplateColumns: `repeat(${Math.max(1, segs.length)}, minmax(0, 1fr))` }}>{segs.map((g) => <i key={g.id} className={`wx-seg-${g.state}`} />)}</span>
          {fit && <span className={fit.ok ? "wx-fit-ok" : "wx-fit-warn"}>{fit.ok ? "1 page ✓" : fit.label}</span>}
        </button>
        <div className="wx-pscroll" ref={scrollRef}>{paper}</div>
        {snap !== "peek" && <button type="button" className="wx-dim" aria-label="Close and see the resume" onClick={() => setSnap("peek")} />}
        <div
          className={`wx-sheet${drag != null ? " wx-dragging" : ""}`}
          data-snap={snap}
          ref={sheetRef}
          style={drag != null ? { height: drag } : undefined}
          role="group"
          aria-label="Suggestions"
          onPointerDown={onGrabDown}
          onPointerMove={onGrabMove}
          onPointerUp={onGrabUp}
          onPointerCancel={onGrabUp}
        >
          <div className="wx-handle" aria-hidden="true" />
          {snap === "peek" ? peekEl : snap === "chat" ? chatEl : listEl}
        </div>
      </div>
    );
  }

  // ---------------- laptop and tablet: the resume, then the assistant at full height ----------------
  return (
    <div className={`ws ws-desk wx wx-desk${narrow ? " wx-narrow" : ""}`}>
      <header className="wx-head">
        <span className="wx-jobchip">{title.replace(/^Tailoring for /, "Tailoring for: ")}{subtitle ? ` · ${subtitle}` : ""}</span>
        {matchEl}
        <span className="wx-spacer" />
        <span className="wx-status" role="status">{busy ? "Working…" : status}</span>
        <span className="wx-count">{appliedCount} of {tally.all} applied</span>
        {fit && <span className={`wx-fit ${fit.ok ? "wx-fit-ok" : "wx-fit-warn"}`}>{fit.label}</span>}
        {moreEl}
        <button type="button" className="wx-download" onClick={act.download}>Design &amp; download</button>
      </header>
      <div className="wx-body">
        <main className="wx-canvas" ref={scrollRef} aria-label="Resume">
          <div className="wx-wrap" ref={wrapRef}>
            <div className="wx-page">{paper}</div>
            {!narrow && (
              <nav className="wx-rail" aria-label="Suggestions" style={{ visibility: railPins.length && !Object.keys(pinTops).length ? "hidden" : "visible" }}>
                {railPins.map((s) => pinEl(s, "resume", { top: pinTops[s.id] ?? 0 }))}
              </nav>
            )}
          </div>
        </main>
        <aside className="wx-panel" aria-label="Assistant">
          <div className="wx-ph"><b>Assistant</b>{filterPills()}</div>
          {skippedCount > 0 && <button type="button" className="ws-lnk wx-skipped" onClick={() => setShowSkipped((v) => !v)}>{showSkipped ? "Hide" : "Show"} skipped ({skippedCount})</button>}
          {stripEl}
          {clearEl}
          {threadBody}
          {composerEl}
        </aside>
      </div>
    </div>
  );
}
