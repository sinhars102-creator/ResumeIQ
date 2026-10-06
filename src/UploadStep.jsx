import { useEffect, useRef, useState } from "react";
import "./UploadStep.css";

const ACCEPTED = /\.(pdf|txt|md)$/i;

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

  const take = (file) => {
    if (!file) return;
    if (!ACCEPTED.test(file.name)) {
      setRejected(`"${file.name}" isn't supported yet. Please upload a PDF, TXT or Markdown file.`);
      return;
    }
    setRejected("");
    onFile(file);
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

        <div
          className={hover ? "us-drop us-drop-hover" : "us-drop"}
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
          <div className="us-drop-label">Drag and drop your resume here</div>
          <div className="us-drop-or">or</div>
          <button type="button" className="us-browse" onClick={() => inputRef.current?.click()}>
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
