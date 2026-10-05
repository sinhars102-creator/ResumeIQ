import { track } from "./analytics.js";
import "./Landing.css";

// Set this to the Chrome Web Store listing once the extension is published.
// Until then the "Add to Chrome" buttons scroll to the extension section.
const CHROME_STORE_URL = null;

const Check = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#17573F" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12l5 5 9-10" />
  </svg>
);

const LogoMark = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 3h7l5 5v13H7z" />
    <path d="M14 3v5h5" />
    <path d="M10 14l2 2 4-4" />
  </svg>
);

const ChromeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="3.5" />
    <path d="M12 8.5h8.3" />
    <path d="M9 13.8L4.9 6.7" />
    <path d="M15 13.8l-4.1 7.1" />
  </svg>
);

const FAQS = [
  {
    q: "How is this different from asking ChatGPT?",
    a: "ChatGPT rewrites what you paste and often adds things you never did. ResumeIQ finds the roles first, shows how well you fit, and only suggests edits it can trace back to your resume, which you approve one by one.",
  },
  {
    q: "Does the extension submit applications for me?",
    a: "It fills the entire form for you, but you click submit. It runs only in your own browser, on the page you have open, and never stores your job-portal passwords. Nothing goes out under your name without you seeing it first.",
  },
  {
    q: "Which sites does the extension work on?",
    a: "Company career pages built on Workday, Greenhouse, Lever, Ashby, Darwinbox and similar systems, with more being added.",
  },
  {
    q: "Where do the jobs come from?",
    a: "Public listings from Indian job portals and company career pages, refreshed daily. Duplicates and expired roles are removed before you see them.",
  },
  {
    q: "What happens to my resume data?",
    a: "It is used only to match and tailor for you, never sold, and deleted when you ask.",
  },
];

export default function Landing({ onStart }) {
  const start = (where) => (e) => {
    e.preventDefault();
    track("landing_cta_clicked", { location: where });
    onStart();
  };

  const chromeHref = CHROME_STORE_URL || "#extension";
  const chromeClick = (where) => () => track("landing_chrome_clicked", { location: where });

  return (
    <div className="lp">
      <header className="lp-nav">
        <nav aria-label="Main" className="lp-wrap lp-nav-inner">
          <a href="#top" className="lp-logo">
            <span className="lp-logo-mark"><LogoMark /></span>
            <span className="lp-logo-word">ResumeIQ</span>
          </a>
          <div className="lp-nav-links">
            <a href="#features">Features</a>
            <a href="#extension">Chrome extension</a>
            <a href="#how">How it works</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
          </div>
          <div className="lp-nav-cta">
            <a href="/app" className="lp-signin" onClick={start("nav_signin")}>Sign in</a>
            <a href="/app" className="lp-btn lp-btn-primary" onClick={start("nav")}>Try it now</a>
          </div>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section id="top" className="lp-wrap lp-hero">
          <div className="lp-hero-copy">
            <p className="lp-pill">Built for job seekers in India</p>
            <h1>Find jobs you fit. Tailor your resume. Let us fill the form.</h1>
            <p className="lp-hero-sub">
              ResumeIQ scans Naukri, LinkedIn, Instahyre and company career pages, scores your fit for every role,
              and tailors your resume line by line, with every edit approved by you. Then our Chrome extension fills
              the whole application for you: details, CTC, notice period, resume upload and screening answers.
            </p>
            <div className="lp-hero-ctas">
              <a href="/app" className="lp-btn lp-btn-primary lp-btn-lg" onClick={start("hero")}>
                Try it now — it's free
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>
              </a>
              <a href={chromeHref} className="lp-btn lp-btn-outline lp-btn-lg" onClick={chromeClick("hero")}>
                <ChromeIcon /> Add to Chrome
              </a>
            </div>
            <p className="lp-hero-note">No signup for your first matches · 1 tailored resume free · Pay by UPI</p>
          </div>

          <div className="lp-hero-visual" aria-hidden="true">
            <div className="lp-card lp-mock">
              <div className="lp-mock-head">
                <div>
                  <div className="lp-mock-title">Your matches</div>
                  <div className="lp-mock-meta">Product Manager · Bengaluru · 6 yrs</div>
                </div>
                <span className="lp-tag lp-tag-good">48 new today</span>
              </div>
              <div className="lp-jobs">
                <div className="lp-job">
                  <div>
                    <div className="lp-job-title">Senior PM, Payments</div>
                    <div className="lp-mock-meta">Paybridge · Bengaluru · Hybrid · ₹38–45 LPA</div>
                    <div className="lp-job-why">Matched: UPI, A/B testing, SQL · Gap: none</div>
                  </div>
                  <span className="lp-tag lp-tag-strong">Strong</span>
                </div>
                <div className="lp-job">
                  <div>
                    <div className="lp-job-title">Product Manager, Supply</div>
                    <div className="lp-mock-meta">Kirana Cloud · Gurugram · WFO · ₹30–36 LPA</div>
                    <div className="lp-job-why">Matched: forecasting, ops · Gap: B2B SaaS</div>
                  </div>
                  <span className="lp-tag lp-tag-good">Good</span>
                </div>
                <div className="lp-job">
                  <div>
                    <div className="lp-job-title">Group PM, AI Platform</div>
                    <div className="lp-mock-meta">Zestly · Remote · ₹55–70 LPA</div>
                    <div className="lp-job-why">Matched: LLM, RAG · Gap: 10+ yrs asked</div>
                  </div>
                  <span className="lp-tag lp-tag-stretch">Stretch</span>
                </div>
              </div>
            </div>
            <div className="lp-edit">
              <div className="lp-edit-label">Suggested edit 3 of 7</div>
              <div className="lp-edit-old">Worked on payments features for the app.</div>
              <div className="lp-edit-new">Led UPI checkout redesign that lifted payment success from 82% to 91%.</div>
              <div className="lp-edit-src">Source: your resume, line 14</div>
              <div className="lp-edit-actions">
                <button type="button" className="lp-accept" tabIndex={-1}>Accept</button>
                <button type="button" className="lp-reject" tabIndex={-1}>Reject</button>
              </div>
            </div>
          </div>
        </section>

        {/* Sources */}
        <section aria-label="Where jobs come from" className="lp-strip">
          <div className="lp-wrap lp-strip-inner">
            <p className="lp-strip-label">Fresh roles from</p>
            <div className="lp-strip-names">
              <span>Naukri</span><span>LinkedIn</span><span>Instahyre</span><span>Foundit</span><span>Hirist</span><span>Company career pages</span>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section aria-label="At a glance" className="lp-wrap lp-stats">
          <div className="lp-card lp-stat"><div className="lp-stat-num">~60 sec</div><div className="lp-stat-text">from upload to your first ranked matches</div></div>
          <div className="lp-card lp-stat"><div className="lp-stat-num">1 click</div><div className="lp-stat-text">to fill an entire application form with the extension</div></div>
          <div className="lp-card lp-stat"><div className="lp-stat-num">0</div><div className="lp-stat-text">lines added that aren't in your resume</div></div>
          <div className="lp-card lp-stat"><div className="lp-stat-num">You</div><div className="lp-stat-text">review and click submit. Nothing goes out without you.</div></div>
        </section>

        {/* Features */}
        <section id="features" className="lp-wrap lp-section">
          <p className="lp-eyebrow">What you get</p>
          <h2 className="lp-h2">Fewer, better applications. Every one of them sharp.</h2>

          <div className="lp-feature">
            <div className="lp-feature-copy">
              <div className="lp-feature-num">01 · Matches you can trust</div>
              <h3 className="lp-h3">See why a role fits, not just a number</h3>
              <p className="lp-body">Every role is marked Strong, Good or Stretch, with the skills that matched and the gaps that didn't. Duplicates and expired listings are filtered out, and roles far above or below your level stay out of the way.</p>
            </div>
            <div className="lp-feature-visual lp-card lp-fit" aria-hidden="true">
              <div className="lp-fit-head"><span>Senior PM, Payments · Paybridge</span><span className="lp-tag lp-tag-strong">Strong</span></div>
              <div className="lp-bars">
                <div><div className="lp-bar-row"><span>Skills</span><span>9 of 10 matched</span></div><div className="lp-bar"><div style={{ width: "90%" }} /></div></div>
                <div><div className="lp-bar-row"><span>Seniority</span><span>Right level</span></div><div className="lp-bar"><div style={{ width: "100%" }} /></div></div>
                <div><div className="lp-bar-row"><span>CTC fit</span><span>Within your range</span></div><div className="lp-bar"><div style={{ width: "85%" }} /></div></div>
              </div>
              <div className="lp-fit-note">Missing: "Kafka" — mentioned once, nice to have</div>
            </div>
          </div>

          <div className="lp-feature lp-feature-rev">
            <div className="lp-feature-visual lp-card lp-edits" aria-hidden="true">
              <div className="lp-edit-item"><div className="lp-mini-label">Keyword from JD</div><p>Moved "experimentation" and "SQL" into your summary.</p><span className="lp-tag lp-tag-good">Accepted</span></div>
              <div className="lp-edit-item"><div className="lp-mini-label">Reworded bullet</div><p>Led a 6-person pod shipping the merchant onboarding revamp.</p><span className="lp-tag lp-tag-good">Accepted</span></div>
              <div className="lp-edit-item lp-edit-item-blocked"><div className="lp-mini-label">Blocked</div><p>"Kafka" isn't in your resume, so we won't add it. Add it yourself if you've used it.</p></div>
            </div>
            <div className="lp-feature-copy">
              <div className="lp-feature-num">02 · Tailored, never invented</div>
              <h3 className="lp-h3">A resume for each role, approved by you</h3>
              <p className="lp-body">ResumeIQ suggests edits one at a time: keywords from the JD, sharper bullets, a better order. You accept or reject each. It will not add a skill, number or employer you never had, so you can defend every line in the interview.</p>
            </div>
          </div>

          <div className="lp-feature">
            <div className="lp-feature-copy">
              <div className="lp-feature-num">03 · Made for Indian hiring</div>
              <h3 className="lp-h3">CTC, notice period and city, built in</h3>
              <p className="lp-body">Tell us your current and expected CTC, notice period and preferred cities once. Matches respect them, and you get copy-ready answers for the screening questions every Indian application asks.</p>
            </div>
            <div className="lp-feature-visual lp-card lp-india" aria-hidden="true">
              <div className="lp-india-cell"><small>Current CTC</small><div>₹28 LPA</div></div>
              <div className="lp-india-cell"><small>Expected CTC</small><div>₹36–42 LPA</div></div>
              <div className="lp-india-cell"><small>Notice period</small><div>60 days</div></div>
              <div className="lp-india-cell"><small>Cities</small><div>Bengaluru, NCR</div></div>
              <div className="lp-india-q"><strong>Why are you looking for a change?</strong><br />Ready-to-paste answer, written from your resume.</div>
            </div>
          </div>

          {/* Chrome extension */}
          <div id="extension" className="lp-feature lp-feature-rev">
            <div className="lp-feature-visual lp-card lp-browser" aria-hidden="true">
              <div className="lp-browser-bar">
                <span className="lp-dot" /><span className="lp-dot" /><span className="lp-dot" />
                <span className="lp-url">careers.paybridge.in/apply/senior-pm-payments</span>
              </div>
              <div className="lp-browser-body">
                <div className="lp-form">
                  <div><small>Full name</small><div className="lp-field">Ananya Rao</div></div>
                  <div><small>Current CTC (LPA)</small><div className="lp-field">28</div></div>
                  <div><small>Notice period</small><div className="lp-field">60 days</div></div>
                  <div><small>Resume</small><div className="lp-field">Ananya_SeniorPM_Paybridge.pdf</div></div>
                  <div><small>Why do you want this role?</small><div className="lp-field">I've spent four years on UPI checkout and want to own payments end to end…</div></div>
                  <div><small>Willing to relocate to Pune?</small><div className="lp-field lp-field-todo">Needs your answer</div></div>
                </div>
                <div className="lp-panel">
                  <div className="lp-panel-brand"><span><LogoMark size={13} /></span>ResumeIQ</div>
                  <div className="lp-panel-sub">Strong match · tailored resume attached</div>
                  <div className="lp-progress"><div /></div>
                  <div className="lp-panel-count">12 of 13 fields filled</div>
                  <div className="lp-panel-todo">1 question needs you</div>
                  <button type="button" tabIndex={-1}>Review and submit</button>
                </div>
              </div>
            </div>
            <div className="lp-feature-copy">
              <div className="lp-feature-num">04 · Chrome extension</div>
              <h3 className="lp-h3">One click fills the whole application</h3>
              <p className="lp-body">Open any application form and the ResumeIQ extension fills it for you: personal details, work history, CTC, notice period, the tailored resume for that role, and answers to screening questions written from your profile. Anything it isn't sure about is flagged for you. You take one last look and click submit.</p>
              <ul className="lp-checks">
                <li><Check />Works on company career pages: Workday, Greenhouse, Lever, Darwinbox and more</li>
                <li><Check />Attaches the resume you tailored for that exact role</li>
                <li><Check />Logs every application to your tracker automatically</li>
              </ul>
              <div style={{ marginTop: 24 }}>
                <a href={chromeHref} className="lp-btn lp-btn-dark" onClick={chromeClick("extension_section")}>Add to Chrome — it's free</a>
              </div>
            </div>
          </div>

          <div className="lp-grid2">
            <div className="lp-card lp-tile">
              <div className="lp-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#17573F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18" /><path d="M9 4v16" /></svg>
              </div>
              <div className="lp-feature-num">05 · One place to track</div>
              <h3>Track every role you apply to</h3>
              <p>Every role you tailor for or fill with the extension lands on a simple board: saved, applied, interviewing, offer. No spreadsheet needed.</p>
            </div>
            <div className="lp-card lp-tile">
              <div className="lp-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#17573F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.2A8.5 8.5 0 1 1 21 12z" /></svg>
              </div>
              <div className="lp-feature-num">06 · Daily matches on WhatsApp</div>
              <h3>New Strong matches every morning</h3>
              <p>Opt in and get the day's best-fit roles on WhatsApp. Tap one, tailor your resume, apply before the role gets crowded.</p>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="lp-wrap lp-section">
          <p className="lp-eyebrow">How it works</p>
          <h2 className="lp-h2">Three steps, about ten minutes</h2>
          <ol className="lp-steps">
            <li className="lp-card lp-step"><div className="lp-step-num">1</div><h3>Upload your resume</h3><p>PDF, DOCX or text. We read your roles, skills and experience in seconds. No signup needed to start.</p></li>
            <li className="lp-card lp-step"><div className="lp-step-num">2</div><h3>Pick from your matches</h3><p>Browse fresh roles ranked Strong, Good and Stretch, with the reasons for each. Or paste any JD you found yourself.</p></li>
            <li className="lp-card lp-step"><div className="lp-step-num">3</div><h3>Approve edits, let the extension apply</h3><p>Accept the edits you like. Open the posting and the Chrome extension fills the form with your tailored resume attached. Review and submit.</p></li>
          </ol>
          <div style={{ marginTop: 32 }}>
            <a href="/app" className="lp-btn lp-btn-primary lp-btn-lg" onClick={start("how_it_works")}>Try it now with your resume</a>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="lp-wrap lp-section">
          <p className="lp-eyebrow">Pricing</p>
          <h2 className="lp-h2">Pay once. No subscription.</h2>
          <p className="lp-lead">One-time packs paid by UPI, card or netbanking. GST invoice included.</p>
          <div className="lp-prices">
            <div className="lp-card lp-price">
              <div className="lp-price-name">Free</div>
              <div className="lp-price-amt">₹0</div>
              <ul><li>Resume parsing</li><li>Top matches with reasons</li><li>1 fully tailored resume</li><li>Extension autofill on 1 application</li></ul>
              <a href="/app" className="lp-btn lp-btn-outline" onClick={start("pricing_free")}>Try it now</a>
            </div>
            <div className="lp-card lp-price lp-price-featured">
              <span className="lp-price-badge">Most picked</span>
              <div className="lp-price-name">Job Search Pack</div>
              <div className="lp-price-amt">₹399</div>
              <ul><li>10 tailored applications</li><li>Extension autofill for all 10</li><li>PDF and DOCX exports</li><li>Application tracker</li><li>Valid for 60 days</li></ul>
              <a href="/app" className="lp-btn lp-btn-primary" onClick={start("pricing_pack")}>Get the pack</a>
            </div>
            <div className="lp-card lp-price lp-price-dark">
              <div className="lp-price-name">Sprint Pass</div>
              <div className="lp-price-amt">₹799</div>
              <ul><li>Unlimited tailored applications for 30 days</li><li>Unlimited extension autofill</li><li>Daily matches on WhatsApp</li><li>Priority support</li></ul>
              <a href="/app" className="lp-btn lp-btn-mint" onClick={start("pricing_pass")}>Start my sprint</a>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="lp-wrap lp-section lp-faq">
          <h2 className="lp-h2">Questions</h2>
          <div className="lp-faq-list">
            {FAQS.map((f) => (
              <details key={f.q}>
                <summary>{f.q}<span aria-hidden="true">+</span></summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="lp-wrap lp-final">
          <div className="lp-final-box">
            <div className="lp-final-copy">
              <h2>Your next role is probably in today's list.</h2>
              <p>Upload your resume and see your matches in about a minute. Free to start.</p>
            </div>
            <a href="/app" className="lp-btn lp-btn-white" onClick={start("footer_band")}>Try it now</a>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-inner">
          <span className="lp-logo-word" style={{ fontSize: 18, color: "#15171a" }}>ResumeIQ</span>
          <div className="lp-footer-links">
            {/* TODO: replace with real pages before launch */}
            <a href="#top">Privacy policy</a>
            <a href="#top">Terms</a>
            <a href="#top">Contact</a>
          </div>
          <span>Made in India</span>
        </div>
      </footer>
    </div>
  );
}
