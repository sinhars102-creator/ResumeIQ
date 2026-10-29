import { useEffect, useRef, useState } from "react";
import { getDistinctId, getFlagVariant, HANDOFF_ID_PARAM, track } from "./analytics.js";
import "./UploadStep.css";

const ACCEPTED = /\.(pdf|txt|md)$/i;

// In-app browsers (Android WebView inside news apps, lock screens and games where display ads open,
// plus Facebook/Instagram/LinkedIn) often can't open the file picker: tapping "Choose a file" does nothing.
const UA = navigator.userAgent || "";
const IN_APP_BROWSER = /; wv\)|FBAN|FBAV|FB_IAB|Instagram|LinkedInApp/i.test(UA);
const IS_ANDROID = /Android/i.test(UA);
// Only these apps name themselves in the user agent; news, lock-screen and game apps don't.
const APP_NAME = /Instagram/i.test(UA) ? "Instagram" : /FBAN|FBAV|FB_IAB/i.test(UA) ? "Facebook" : /LinkedInApp/i.test(UA) ? "LinkedIn" : null;
const BROWSER_NAME = IS_ANDROID ? "Chrome" : "Safari";

// A/B test (PostHog experiment): in-app visitors see either the blocked-upload panel with the hand-off to
// Chrome/Safari ("test") or the plain upload box as before ("control").
const HANDOFF_FLAG = "inapp-upload-handoff";

/** This page's address, marked so the visit can be counted as arriving from an in-app browser (ad click IDs kept). */
const handoffUrl = () => {
  const url = new URL(window.location.href);
  url.searchParams.set("from", "inapp");
  const id = getDistinctId();
  if (id) url.searchParams.set(HANDOFF_ID_PARAM, id);
  return url;
};

/** Hands this page to the phone's real browser: an Android intent for Chrome, or Safari's scheme (iOS 17+). */
const openInBrowserHref = () => {
  const url = handoffUrl();
  return IS_ANDROID
    ? `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;package=com.android.chrome;end`
    : `x-safari-${url.href}`;
};

/** Shortest pasted text worth parsing (a name and a line or two isn't a resume). */
const MIN_PASTE_CHARS = 200;

/** Paste the resume as text: works where no file picker can open (in-app browsers) or no file is on the phone. */
function PasteBox({ onText, autoFocus }) {
  const [text, setText] = useState("");
  const short = text.trim().length < MIN_PASTE_CHARS;
  return (
    <div className="us-paste">
      <label htmlFor="us-paste-text" className="us-paste-label">Paste your resume text</label>
      <p className="us-paste-hint">Open your resume in Google Docs, Drive or any PDF viewer, select all, copy, and paste it here.</p>
      <textarea
        id="us-paste-text"
        className="us-paste-text"
        data-clarity-mask="True"
        rows={8}
        autoFocus={autoFocus}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Your name, experience, skills, education…"
      />
      <button type="button" className="us-browse" disabled={short} onClick={() => onText(text.trim())}>
        Find my matches
      </button>
      {short && text.trim() && <p className="us-paste-hint">Paste your whole resume: this looks too short to read.</p>}
    </div>
  );
}

/**
 * Shown when the file picker can't open here: says the app is blocking it and hands the page to the real
 * browser. Some apps refuse that hand-off too, so if the page is still showing shortly after the tap, it
 * explains the app's own "Open in browser" menu and offers the link to copy.
 */
function InAppPanel({ onSample, onPaste }) {
  const [handoffFailed, setHandoffFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  const openInBrowser = () => {
    track("upload_inapp_open_browser", { browser: BROWSER_NAME, app: APP_NAME || "unknown" });
    let left = false;
    const mark = () => { left = true; };
    window.addEventListener("blur", mark, { once: true });
    document.addEventListener("visibilitychange", mark, { once: true });
    setTimeout(() => {
      window.removeEventListener("blur", mark);
      document.removeEventListener("visibilitychange", mark);
      if (left) return;
      track("upload_inapp_handoff_failed", { browser: BROWSER_NAME, app: APP_NAME || "unknown" });
      setHandoffFailed(true);
    }, 1500);
  };

  const copy = async () => {
    track("upload_inapp_link_copied");
    const link = handoffUrl().href;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      window.prompt(`Copy this link and open it in ${BROWSER_NAME}:`, link);
    }
  };

  return (
    <div className="us-inapp" role="alert">
      <b className="us-inapp-title">{APP_NAME ? `${APP_NAME} is` : "The app you're in is"} blocking file uploads</b>
      <p>
        It opened ResumeIQ in its own mini browser, which can't reach the files on your phone.
        Open ResumeIQ in {BROWSER_NAME} to upload your resume.
      </p>
      <a className="us-browse us-inapp-open" href={openInBrowserHref()} onClick={openInBrowser}>
        Open in {BROWSER_NAME}
      </a>
      {handoffFailed && (
        <div className="us-inapp-manual">
          <b>Didn't open?</b> The app blocked that too. Tap <b>⋮</b> or <b>···</b> at the top of the screen and choose
          <b> Open in browser</b>, or copy the link and paste it into {BROWSER_NAME}.
          <div><button type="button" className="us-inapp-copy" onClick={copy}>{copied ? "Link copied" : "Copy link"}</button></div>
        </div>
      )}
      <div className="us-inapp-alt">
        <span>Or stay here:</span>
        <button type="button" className="us-link" onClick={onPaste}>paste your resume text</button>
        <span>·</span>
        <button type="button" className="us-link" onClick={onSample}>try a sample resume</button>
      </div>
    </div>
  );
}

/** How long each instruction step is highlighted (and its illustration animates) before the next. */
const STEP_MS = 4500;

/** Small illustrations for each instruction step (drawn in HTML so they stay crisp and themeable). */
function ResumeArt() {
  return (
    <div className="us-art us-art-resume" aria-hidden="true">
      <div className="us-doc">
        <div className="us-scan" />
        <div className="us-doc-line us-w60 us-strong" />
        <div className="us-doc-line us-w40" />
        <div className="us-doc-gap" />
        <div className="us-doc-line us-w90" />
        <div className="us-doc-line us-w80" />
        <div className="us-doc-line us-w85" />
        <div className="us-doc-gap" />
        <div className="us-doc-line us-w70" />
        <div className="us-doc-line us-w90" />
      </div>
      <div className="us-arrow">→</div>
      <div className="us-chips">
        {["Product Manager", "6 yrs", "SQL", "A/B testing"].map((chip, i) => (
          <span key={chip} className="us-pop" style={{ "--us-delay": `${0.6 + i * 0.3}s` }}>{chip}</span>
        ))}
      </div>
    </div>
  );
}

const MATCHES = [
  { role: "Senior PM, Payments", meta: "Bengaluru · ₹38–45 LPA", tag: "Strong", fit: 92 },
  { role: "PM, Supply Chain", meta: "Gurugram · ₹30–36 LPA", tag: "Good", fit: 76 },
  { role: "Group PM, AI", meta: "Remote · ₹55–70 LPA", tag: "Stretch", fit: 58 },
];

function MatchesArt() {
  return (
    <div className="us-art us-art-list" aria-hidden="true">
      {MATCHES.map((m, i) => (
        <div key={m.role} className="us-row us-slide" style={{ "--us-delay": `${0.15 + i * 0.3}s` }}>
          <div className="us-row-main">
            <b>{m.role}</b>
            <small>{m.meta}</small>
            <div className="us-fit">
              <div className="us-fit-bar" style={{ width: `${m.fit}%`, "--us-delay": `${0.5 + i * 0.3}s` }} />
            </div>
          </div>
          <span className={`us-tag us-tag-${m.tag.toLowerCase()} us-pop`} style={{ "--us-delay": `${0.9 + i * 0.3}s` }}>
            {m.tag}
          </span>
        </div>
      ))}
    </div>
  );
}

function EditArt() {
  return (
    <div className="us-art us-art-edit" aria-hidden="true">
      <div className="us-old"><span className="us-strike">Worked on payments features.</span></div>
      <div className="us-new us-pop" style={{ "--us-delay": "1s" }}>Led UPI checkout redesign; payment success 82% → 91%.</div>
      <div className="us-edit-actions us-pop" style={{ "--us-delay": "1.4s" }}>
        <span className="us-accept">✓ Accept</span>
        <span className="us-reject">Reject</span>
      </div>
    </div>
  );
}

const STEPS = [
  {
    title: "Upload your latest resume",
    text: "We read your roles, skills and years of experience in a few seconds. Nothing is shared with employers.",
    art: <ResumeArt />,
  },
  {
    title: "Pick a role from your matches",
    text: "Fresh openings are ranked Strong, Good or Stretch, with the skills that matched and the gaps.",
    art: <MatchesArt />,
  },
  {
    title: "Approve edits and apply",
    text: "Accept or reject each suggested change. Nothing is added that isn't already in your resume.",
    art: <EditArt />,
  },
];

export default function UploadStep({ onFile, onSample, error, homeHref }) {
  const inputRef = useRef(null);
  const [hover, setHover] = useState(false);
  const [rejected, setRejected] = useState("");
  // The highlighted instruction step cycles on its own; hovering a step shows it and pauses the cycle.
  const [activeStep, setActiveStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduceMotion] = useState(() => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

  useEffect(() => {
    if (paused || reduceMotion) return undefined;
    const timer = setTimeout(() => setActiveStep((i) => (i + 1) % STEPS.length), STEP_MS);
    return () => clearTimeout(timer);
  }, [activeStep, paused, reduceMotion]);

  // The picker didn't open: shown up front in a known in-app browser (test variant), or after a tap that opened nothing.
  const [pickerBlocked, setPickerBlocked] = useState(false);
  // In-app visitors: "test" or "control" once the experiment flag loads; null until then and for everyone else.
  const [handoffVariant, setHandoffVariant] = useState(null);
  useEffect(() => {
    if (IN_APP_BROWSER) {
      track("upload_inapp_browser_seen", { app: APP_NAME || "unknown" });
      getFlagVariant(HANDOFF_FLAG, "control").then((variant) => {
        setHandoffVariant(variant);
        if (variant === "test") setPickerBlocked(true);
      });
    }
    // Arrived from the "Open in Chrome/Safari" hand-off: count it, then drop the marker from the address.
    const url = new URL(window.location.href);
    if (url.searchParams.get("from") === "inapp") {
      track("opened_from_inapp", { still_in_app: IN_APP_BROWSER });
      url.searchParams.delete("from");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
  }, []);

  // On Android the picker is a separate screen that hides the page; if that doesn't happen shortly
  // after the tap, nothing opened. (iOS shows a sheet that may not blur the page, so it isn't checked.)
  const choose = () => {
    inputRef.current?.click();
    // Only the experiment's test group gets the panel after a tap that opened nothing; everyone else keeps the old behaviour.
    if (!IS_ANDROID || pickerBlocked || handoffVariant !== "test") return;
    let opened = false;
    const mark = () => { opened = true; };
    window.addEventListener("blur", mark, { once: true });
    document.addEventListener("visibilitychange", mark, { once: true });
    setTimeout(() => {
      window.removeEventListener("blur", mark);
      document.removeEventListener("visibilitychange", mark);
      if (opened) return;
      track("file_picker_not_opened", { in_app: IN_APP_BROWSER });
      setPickerBlocked(true);
    }, 1500);
  };

  const take = (file) => {
    if (!file) return;
    setPickerBlocked(false);
    if (!ACCEPTED.test(file.name)) {
      setRejected(`"${file.name}" isn't supported yet. Please upload a PDF, TXT or Markdown file.`);
      return;
    }
    setRejected("");
    onFile(file);
  };

  // Pasted text goes through the same reading and parsing as an uploaded .txt file.
  const [pasting, setPasting] = useState(false);
  const openPaste = (where) => {
    track("resume_paste_opened", { location: where, in_app: IN_APP_BROWSER });
    setPasting(true);
  };
  const takeText = (text) => {
    track("resume_pasted", { chars_bucket: text.length < 1500 ? "<1500" : text.length < 4000 ? "1500-4000" : "4000+", in_app: IN_APP_BROWSER });
    take(new File([text], "Pasted resume.txt", { type: "text/plain" }));
  };

  return (
    <section className="us-split">
      {/* LEFT: instructions */}
      <aside className="us-guide" aria-labelledby="us-guide-title">
        <p className="us-eyebrow">How it works</p>
        <h2 id="us-guide-title" className="us-guide-title">Three steps to a sharper application</h2>
        <ol
          className={reduceMotion ? "us-steps us-steps-static" : "us-steps"}
          onMouseLeave={() => setPaused(false)}
        >
          {STEPS.map((s, i) => (
            <li
              key={s.title}
              className={i === activeStep ? "us-step us-step-active" : "us-step"}
              onMouseEnter={() => { setActiveStep(i); setPaused(true); }}
            >
              <div className="us-step-head">
                <span className="us-num">{i + 1}</span>
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </div>
              </div>
              {s.art}
            </li>
          ))}
        </ol>
        <div className="us-tip">
          <b>Tip:</b> use the resume you'd send today, as a PDF of 1–2 pages. Text-based PDFs work best; scanned images may not read correctly.
        </div>
      </aside>

      {/* RIGHT: upload */}
      <div className="us-upload">
        {homeHref && (
          <a href={homeHref} className="us-home">
            <span aria-hidden="true">←</span> Back to home
          </a>
        )}
        <p className="us-eyebrow">Get started</p>
        <h1 className="us-title">Upload your resume</h1>
        <p className="us-sub">We'll find roles you fit and show you why. Takes about a minute.</p>

        {(error || rejected) && (
          <div className="us-error" role="alert">{rejected || error}</div>
        )}

        {pickerBlocked && !pasting && <InAppPanel onSample={onSample} onPaste={() => openPaste("inapp_note")} />}
        {pasting && <PasteBox onText={takeText} autoFocus />}

        {/* Where the picker is blocked the box shrinks to a "try anyway" link (a few apps do allow it).
            Otherwise the whole box opens the picker, so a tap on the icon or label isn't a dead click. */}
        {pickerBlocked && (
          <div className="us-sample us-paste-link">
            <button type="button" className="us-link" onClick={choose}>Try choosing a file here anyway</button>
          </div>
        )}
        <div
          hidden={pickerBlocked}
          className={hover ? "us-drop us-drop-hover" : "us-drop"}
          onClick={(e) => { if (!e.target.closest("button, input")) choose(); }}
          onDragOver={(e) => { e.preventDefault(); setHover(true); }}
          onDragLeave={() => setHover(false)}
          onDrop={(e) => {
            e.preventDefault();
            setHover(false);
            take(e.dataTransfer?.files?.[0]);
          }}
        >
          <div className="us-drop-icon" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4" /><path d="M6 10l6-6 6 6" /><path d="M4 20h16" /></svg>
          </div>
          <div className="us-drop-label us-drop-label-drag">Drag and drop your resume here</div>
          <div className="us-drop-or">or</div>
          <button type="button" className="us-browse" onClick={choose}>
            Choose a file
          </button>
          <div className="us-drop-types">PDF, TXT or Markdown · up to 1–2 pages works best</div>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
            className="us-hidden"
            aria-label="Upload resume file"
            onChange={(e) => {
              take(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>

        {!pasting && !pickerBlocked && (
          <div className="us-sample us-paste-link">
            <span>No file on this device?</span>
            <button type="button" className="us-link" onClick={() => openPaste("below_drop")}>Paste your resume text</button>
          </div>
        )}

        <ul className="us-trust">
          <li>No signup needed to see your matches</li>
          <li>Your resume is used only to match and tailor for you</li>
          <li>Delete your data anytime</li>
        </ul>

        <div className="us-sample">
          <span>Just exploring?</span>
          <button type="button" className="us-link" onClick={onSample}>Try it with a sample resume</button>
        </div>
      </div>
    </section>
  );
}
