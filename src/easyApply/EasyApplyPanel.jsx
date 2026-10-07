import { useEffect, useMemo, useState } from "react";
import { supabase, loadProfile, saveProfile } from "./supabaseClient.js";
import "./EasyApplyPanel.css";

/**
 * Easy Apply, phase 1: a slide-over that shows the employer's real application form inside
 * ResumeIQ, fills it from the applicant's profile and resume, and lets them review every
 * answer. Submission is phase 2 – for now they finish on the company site.
 */

const API = (base, path) => `${String(base || "").replace(/\/$/, "")}${path}`;

const questionKey = (label) => String(label || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 120);
// Fields whose answer is the same for every employer, kept as profile columns rather than saved answers.
const PROFILE_FIELD = { first_name: "first_name", last_name: "last_name", email: "email", phone: "phone", location: "city" };

/** "linkedin.com/in/x" → "https://linkedin.com/in/x"; empty stays empty. */
const withScheme = (url) => {
  const u = String(url || "").trim();
  return !u || /^https?:\/\//i.test(u) ? u : `https://${u}`;
};

/** Starting profile from the parsed resume: name, email, phone, LinkedIn from its contact line. */
function profileFromResume(resume, email) {
  const parts = String(resume?.name || "").trim().split(/\s+/).filter(Boolean);
  const contact = String(resume?.contact || "");
  return {
    first_name: parts[0] || "",
    last_name: parts.slice(1).join(" "),
    email: email || contact.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] || "",
    phone: contact.match(/\+?\(?\d[\d\s()-]{8,}\d/)?.[0] || "",
    linkedin_url: contact.match(/linkedin\.com\/in\/[\w-]+/)?.[0] || "",
    city: "",
    current_ctc_lpa: "",
    expected_ctc_lpa: "",
    notice_period_days: "",
    authorized_to_work: { India: true },
    needs_sponsorship: false,
    highest_education: "",
  };
}

function SignIn() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    // The email carries a sign-in link back to the app (and a code too, once a custom email
    // sender lets the template include one). Either signs the user in.
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/app` },
    });
    setBusy(false);
    if (err) setError(err.message);
    else setSent(true);
  };
  const verify = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error: err } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (err) setError(err.message);
  };

  return (
    <div className="ea-signin">
      <h3>Sign in to use Easy Apply</h3>
      <p>Your application profile is saved to your account, so forms fill themselves next time.</p>
      {!sent ? (
        <form onSubmit={send} className="ea-signin-form">
          <label htmlFor="ea-email">Email</label>
          <input id="ea-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          <button type="submit" className="ea-btn ea-btn-primary" disabled={busy}>{busy ? "Sending…" : "Email me a sign-in link"}</button>
        </form>
      ) : (
        <form onSubmit={verify} className="ea-signin-form">
          <div className="ea-sent">
            <strong>Check your email.</strong> We sent a sign-in link to {email}. Click it and you'll be signed in here –
            if it opens in a new tab, you can come back to this one.
          </div>
          <label htmlFor="ea-code">Got a code instead? Enter it here</label>
          <input id="ea-code" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code" />
          <button type="submit" className="ea-btn ea-btn-primary" disabled={busy}>{busy ? "Checking…" : "Sign in"}</button>
          <button type="button" className="ea-link" onClick={() => setSent(false)}>Use a different email</button>
        </form>
      )}
      {error && <div className="ea-error" role="alert">{error}</div>}
    </div>
  );
}

function ProfileStep({ initial, onSave, onCancel }) {
  const [p, setP] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (e) => setP((prev) => ({ ...prev, [key]: e.target.value }));
  const num = (v) => (v === "" || v == null ? null : Number(v));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave({
        ...p,
        linkedin_url: withScheme(p.linkedin_url),
        current_ctc_lpa: num(p.current_ctc_lpa),
        expected_ctc_lpa: num(p.expected_ctc_lpa),
        notice_period_days: num(p.notice_period_days),
      });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const text = (key, label, type = "text", extra = {}) => (
    <label className="ea-field">
      <span>{label}</span>
      <input type={type} value={p[key] ?? ""} onChange={set(key)} {...extra} />
    </label>
  );

  return (
    <form className="ea-profile" onSubmit={submit}>
      <h3>Your application profile</h3>
      <p>Filled from your resume. Check it once; Easy Apply uses it for every form.</p>
      <div className="ea-grid">
        {text("first_name", "First name", "text", { required: true })}
        {text("last_name", "Last name", "text", { required: true })}
        {text("email", "Email", "email", { required: true })}
        {text("phone", "Phone", "tel", { required: true })}
        {/* Plain text, not type="url": resumes write "linkedin.com/in/…" without https://, which a url input rejects. */}
        {text("linkedin_url", "LinkedIn URL", "text", { inputMode: "url", placeholder: "linkedin.com/in/yourname" })}
        {text("city", "Current city")}
        {text("current_ctc_lpa", "Current CTC (LPA)", "number", { min: 0, step: "0.1" })}
        {text("expected_ctc_lpa", "Expected CTC (LPA)", "number", { min: 0, step: "0.1" })}
        {text("notice_period_days", "Notice period (days)", "number", { min: 0 })}
        {text("highest_education", "Highest education (e.g. Bachelor's, Master's)")}
        <label className="ea-field ea-check">
          <input
            type="checkbox"
            checked={!!p.authorized_to_work?.India}
            onChange={(e) => setP((prev) => ({ ...prev, authorized_to_work: { ...prev.authorized_to_work, India: e.target.checked } }))}
          />
          <span>I'm authorised to work in India</span>
        </label>
        <label className="ea-field ea-check">
          <input type="checkbox" checked={!!p.needs_sponsorship} onChange={(e) => setP((prev) => ({ ...prev, needs_sponsorship: e.target.checked }))} />
          <span>I need visa sponsorship</span>
        </label>
      </div>
      {error && <div className="ea-error" role="alert">{error}</div>}
      <div className="ea-profile-actions">
        {onCancel && <button type="button" className="ea-btn" onClick={onCancel}>Cancel</button>}
        <button type="submit" className="ea-btn ea-btn-primary" disabled={busy}>{busy ? "Saving…" : "Save profile"}</button>
      </div>
    </form>
  );
}

function FieldInput({ field, value, onChange }) {
  const id = `ea-f-${field.id}`;
  if (field.type === "file") {
    return field.id === "resume" ? (
      <div className="ea-file">Your ResumeIQ resume will be attached (tailor it first for a stronger match).</div>
    ) : (
      <div className="ea-file ea-muted">Optional – not attached.</div>
    );
  }
  if (field.type === "textarea") {
    return <textarea id={id} rows={4} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
  }
  if (field.type === "select") {
    return (
      <select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select…</option>
        {field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  if (field.type === "multiselect" || field.type === "checkbox") {
    const selected = new Set([].concat(value ?? []).map(String));
    return (
      <div className="ea-options" role="group" aria-labelledby={`${id}-label`}>
        {(field.options || []).map((o) => (
          <label key={o.value} className="ea-option">
            <input
              type="checkbox"
              checked={selected.has(o.value)}
              onChange={(e) => {
                const next = new Set(selected);
                if (e.target.checked) next.add(o.value);
                else next.delete(o.value);
                onChange([...next]);
              }}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    );
  }
  const type = { email: "email", phone: "tel", url: "url" }[field.type] || "text";
  return <input id={id} type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
}

const SOURCE_LABEL = { profile: "From your profile", saved: "Your saved answer", resume: "From your resume", ai: "AI suggestion" };

export default function EasyApplyPanel({ job, resume, getResumePdf, apiBase, onClose, onTailorResume }) {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [profile, setProfile] = useState(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState("");
  const [values, setValues] = useState({});
  const [meta, setMeta] = useState({});
  const [needs, setNeeds] = useState({});
  const [filling, setFilling] = useState(false);
  const [fillError, setFillError] = useState("");
  const [codeMethod, setCodeMethod] = useState(null); // "gmail" | "manual"
  const [savedNote, setSavedNote] = useState("");
  // Submission: idle | confirm | rehearsing | sending | code | done | failed
  const [phase, setPhase] = useState("idle");
  const [result, setResult] = useState(null); // last response from rehearse / submit / code
  const [code, setCode] = useState("");

  // Session
  useEffect(() => {
    if (!supabase) return undefined;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  // Profile for the signed-in user
  const userId = session?.user?.id;
  useEffect(() => {
    if (!userId) return;
    loadProfile(userId)
      .then((row) => {
        setProfile(row);
        if (!row) setEditingProfile(true);
      })
      .catch((err) => setFormError(`Could not load your profile: ${err.message}`));
  }, [userId]);

  // The employer's form
  useEffect(() => {
    fetch(API(apiBase, `/api/easy-apply/form?jobId=${encodeURIComponent(job.id)}`))
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        setForm(d);
      })
      .catch((err) => setFormError(err.message));
  }, [apiBase, job.id]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const required = useMemo(() => (form?.fields || []).filter((f) => f.required), [form]);
  const isAnswered = (f) => {
    if (f.type === "file") return true; // the resume is attached automatically; a cover letter is optional
    const v = values[f.id];
    return Array.isArray(v) ? v.length > 0 : v != null && String(v).trim() !== "";
  };
  const missingRequired = required.filter((f) => !isAnswered(f));
  const canSubmit = !!(session && form && profile && !editingProfile && Object.keys(meta).length);

  const autofill = async () => {
    setFilling(true);
    setFillError("");
    try {
      const r = await fetch(API(apiBase, "/api/easy-apply/fill"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: form.fields, profile: profile || {}, resume, job: form.job }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      const nextValues = {};
      const nextMeta = {};
      for (const [id, a] of Object.entries(d.answers || {})) {
        nextValues[id] = a.value;
        nextMeta[id] = a;
      }
      setValues((prev) => ({ ...nextValues, ...Object.fromEntries(Object.entries(prev).filter(([, v]) => v != null && v !== "")) }));
      setMeta(nextMeta);
      setNeeds(Object.fromEntries((d.needsYou || []).map((n) => [n.id, n.reason])));
    } catch (err) {
      setFillError(err.message);
    } finally {
      setFilling(false);
    }
  };

  const setValue = (field, v) => {
    setValues((prev) => ({ ...prev, [field.id]: v }));
    setMeta((prev) => ({ ...prev, [field.id]: { ...prev[field.id], source: "you", confidence: "high" } }));
  };

  /** Call a phase-2 endpoint as the signed-in applicant. */
  const callApply = async (path, body) => {
    const r = await fetch(API(apiBase, path), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok && !d.status) throw new Error(d.error || `HTTP ${r.status}`);
    return d;
  };

  const applyBody = async () => ({
    jobId: job.id,
    values,
    country: profile?.country || "India",
    resumePdf: getResumePdf ? await getResumePdf() : null,
  });

  /** Fill the employer's real page and show it – nothing is sent. */
  const checkFilledForm = async () => {
    setPhase("rehearsing");
    setResult(null);
    try {
      setResult(await callApply("/api/easy-apply/rehearse", await applyBody()));
    } catch (err) {
      setResult({ status: "error", error: err.message });
    }
    setPhase("idle");
  };

  const sendApplication = async () => {
    setPhase("sending");
    setResult(null);
    try {
      const d = await callApply("/api/easy-apply/submit", await applyBody());
      setResult(d);
      setPhase(d.status === "submitted" ? "done" : d.status === "code_required" ? "code" : "failed");
    } catch (err) {
      setResult({ status: "error", error: err.message });
      setPhase("failed");
    }
  };

  const sendCode = async (e) => {
    e.preventDefault();
    setPhase("sending");
    try {
      const d = await callApply("/api/easy-apply/code", { sessionId: result.sessionId, code: code.trim() });
      setResult((prev) => ({ ...d, sessionId: prev?.sessionId }));
      setPhase(d.status === "submitted" ? "done" : d.status === "code_required" ? "code" : "failed");
    } catch (err) {
      setResult({ status: "error", error: err.message });
      setPhase("failed");
    }
  };

  /** Remember the answers the applicant gave, so the next form fills itself. */
  const rememberAnswers = async () => {
    const patch = {};
    const saved = { ...(profile?.saved_answers || {}) };
    for (const f of form.fields) {
      const v = values[f.id];
      if (v == null || v === "" || f.type === "file" || f.section === "voluntary") continue;
      if (PROFILE_FIELD[f.id]) patch[PROFILE_FIELD[f.id]] = v;
      else if (f.type === "url" && /linkedin/i.test(f.label)) patch.linkedin_url = withScheme(v);
      else if (f.type === "url" && /website|portfolio/i.test(f.label)) patch.website_url = withScheme(v);
      else if (["select", "textarea", "text", "url", "email", "phone"].includes(f.type)) saved[questionKey(f.label)] = v;
    }
    try {
      const row = await saveProfile(userId, { ...patch, saved_answers: saved });
      setProfile(row);
      setSavedNote("Saved – these answers will fill in automatically next time.");
    } catch (err) {
      setSavedNote(`Could not save: ${err.message}`);
    }
  };

  const body = () => {
    if (!supabase) return <div className="ea-message">Sign-in isn't set up yet (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).</div>;
    if (!authReady) return <div className="ea-message">Loading…</div>;
    if (!session) return <SignIn />;
    if (editingProfile) {
      return (
        <ProfileStep
          initial={{ ...profileFromResume(resume, session.user.email), ...(profile || {}) }}
          onCancel={profile ? () => setEditingProfile(false) : null}
          onSave={async (p) => {
            const row = await saveProfile(userId, { ...p, resume });
            setProfile(row);
            setEditingProfile(false);
          }}
        />
      );
    }
    if (formError) return <div className="ea-error" role="alert">{formError}</div>;
    if (phase === "done") {
      return (
        <div className="ea-outcome ea-outcome-ok" role="status">
          <h3>Application sent</h3>
          <p>{form?.job.company} has your application for {form?.job.title}. It's saved to your applications.</p>
          <button type="button" className="ea-btn ea-btn-primary" onClick={onClose}>Back to jobs</button>
        </div>
      );
    }
    if (phase === "code" || (phase === "sending" && result?.sessionId)) {
      return (
        <form className="ea-outcome" onSubmit={sendCode}>
          <h3>Enter the verification code</h3>
          <p>{form?.job.company}'s application system just emailed you a code. Enter it to finish sending your application.</p>
          {codeMethod === "gmail" && <p className="ea-muted">Reading the code from Gmail automatically is coming next – please type it for now.</p>}
          <label htmlFor="ea-verify" className="ea-q-label">Code</label>
          <input id="ea-verify" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code from the email" />
          {result?.status === "code_required" && result?.errors?.length > 0 && <div className="ea-error">{result.errors.join(" · ")}</div>}
          <button type="submit" className="ea-btn ea-btn-primary" disabled={phase === "sending" || !code.trim()}>{phase === "sending" ? "Sending…" : "Submit code"}</button>
        </form>
      );
    }
    if (!form || !profile) return <div className="ea-message">Loading the application form…</div>;

    return (
      <>
        {phase === "failed" && result && (
          <div className="ea-error" role="alert">
            {result.status === "not_filled"
              ? `Couldn't fill: ${(result.problems || []).map((p) => p.label).join(", ")}. Check those answers, or finish on the company site.`
              : result.status === "errors"
                ? `The application page didn't accept it: ${(result.errors || []).join(" · ")}`
                : result.error || "The application page didn't confirm it was sent. Please finish on the company site."}
          </div>
        )}
        {result?.status === "rehearsed" && (
          <div className="ea-rehearsal">
            <div className="ea-rehearsal-head">
              <strong>This is {form.job.company}'s real form, filled with your answers. Nothing has been sent.</strong>
              <button type="button" className="ea-link" onClick={() => setResult(null)}>Hide</button>
            </div>
            {result.problems?.length > 0 && (
              <div className="ea-error">Couldn't fill: {result.problems.map((p) => `${p.label} (${p.reason})`).join(" · ")}</div>
            )}
            <img src={result.screenshot} alt={`${form.job.company}'s application form, filled with your answers`} />
          </div>
        )}
        {result?.status === "error" && phase === "idle" && <div className="ea-error" role="alert">{result.error}</div>}
        <div className="ea-cards">
          <div className="ea-card">
            <div className="ea-card-title">Resume</div>
            <div className="ea-card-sub">{resume?.name ? `${resume.name}'s resume` : "Your resume"}</div>
            <button type="button" className="ea-btn" onClick={onTailorResume}>Tailor resume</button>
          </div>
          <div className="ea-card">
            <div className="ea-card-title">Cover letter <span className="ea-muted">(optional)</span></div>
            <div className="ea-card-sub ea-muted">No cover letter</div>
            <button type="button" className="ea-btn" disabled title="Coming soon">Tailor cover letter</button>
          </div>
          <div className="ea-card">
            <div className="ea-card-title">Verification codes</div>
            <div className="ea-card-sub">Some employers email a code before accepting an application.</div>
            {codeMethod === "manual" ? (
              <div className="ea-card-sub ea-ok">You'll type the code when it arrives. <button type="button" className="ea-link" onClick={() => setCodeMethod(null)}>Change</button></div>
            ) : (
              <>
                <button type="button" className="ea-btn" onClick={() => setCodeMethod("gmail")}>Connect Gmail</button>
                <button type="button" className="ea-link" onClick={() => setCodeMethod("manual")}>No, I'll type it manually</button>
                {codeMethod === "gmail" && <div className="ea-card-sub ea-muted">Gmail connection arrives with submission in the next phase.</div>}
              </>
            )}
          </div>
        </div>

        <div className="ea-split">
          <aside className="ea-required" aria-label="Required fields">
            <div className="ea-required-title">Required</div>
            <ul>
              {required.map((f) => (
                <li key={f.id} className={isAnswered(f) ? "ea-done" : needs[f.id] ? "ea-needs" : ""}>
                  <span className="ea-dot" aria-hidden="true" />
                  <span className="ea-req-label">{f.label}</span>
                </li>
              ))}
            </ul>
            <button type="button" className="ea-link" onClick={() => setEditingProfile(true)}>Edit my profile</button>
          </aside>

          <div className="ea-form">
            <button type="button" className="ea-btn ea-btn-primary ea-autofill" onClick={autofill} disabled={filling}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z" /><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></svg>
              {filling ? "Filling your application…" : Object.keys(meta).length ? "Autofill again" : "Start to Autofill"}
            </button>
            {fillError && <div className="ea-error" role="alert">{fillError}</div>}

            {form.fields.map((f) => {
              const m = meta[f.id];
              return (
                <div key={f.id} className={`ea-q${f.required && needs[f.id] && !isAnswered(f) ? " ea-q-needs" : ""}`}>
                  <label id={`ea-f-${f.id}-label`} htmlFor={`ea-f-${f.id}`} className="ea-q-label">
                    {f.required && <span className="ea-star" aria-hidden="true">*</span>}
                    {f.label}
                    {f.section === "voluntary" && <span className="ea-muted"> (voluntary)</span>}
                  </label>
                  <FieldInput field={f} value={values[f.id]} onChange={(v) => setValue(f, v)} />
                  {m && m.source !== "you" && f.type !== "file" && (
                    <div className={`ea-hint${m.confidence === "check" ? " ea-hint-check" : ""}`}>
                      {SOURCE_LABEL[m.source] || ""}{m.confidence === "check" ? " · please check" : ""}
                    </div>
                  )}
                  {needs[f.id] && !isAnswered(f) && (
                    f.required
                      ? <div className="ea-hint ea-hint-needs">{needs[f.id]}</div>
                      : <div className="ea-hint">Optional – leave blank if it doesn't apply.</div>
                  )}
                </div>
              );
            })}
            <div className="ea-remember">
              <button type="button" className="ea-btn" onClick={rememberAnswers}>Save my answers for next time</button>
              {savedNote && <span className="ea-muted">{savedNote}</span>}
            </div>
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="ea-overlay" onClick={onClose}>
      <section className="ea-panel" role="dialog" aria-modal="true" aria-labelledby="ea-title" onClick={(e) => e.stopPropagation()}>
        <header className="ea-header">
          <button type="button" className="ea-close" onClick={onClose} aria-label="Close Easy Apply">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
          </button>
          <h2 id="ea-title">Apply to {job.role} @ {job.company}</h2>
          {session && <button type="button" className="ea-link ea-signout" onClick={() => supabase.auth.signOut()}>Sign out</button>}
        </header>
        <div className="ea-body">{body()}</div>
        <footer className="ea-footer">
          {missingRequired.length > 0 && form && session && !editingProfile && (
            <span className="ea-muted">{missingRequired.length} required field{missingRequired.length === 1 ? "" : "s"} left</span>
          )}
          <a className="ea-btn" href={form?.applyUrl || job.url} target="_blank" rel="noopener noreferrer">Continue on company site</a>
          {canSubmit && phase !== "done" && phase !== "code" && (
            <button type="button" className="ea-btn" onClick={checkFilledForm} disabled={phase === "rehearsing" || phase === "sending"}>
              {phase === "rehearsing" ? "Filling the real form…" : "Check the filled form"}
            </button>
          )}
          {phase === "confirm" ? (
            <span className="ea-confirm" role="group" aria-label="Confirm sending">
              <span>Send to {form?.job.company}?</span>
              <button type="button" className="ea-btn" onClick={() => setPhase("idle")}>Cancel</button>
              <button type="button" className="ea-btn ea-btn-primary" onClick={sendApplication}>Yes, send</button>
            </span>
          ) : (
            phase !== "done" && phase !== "code" && (
              <button
                type="button"
                className="ea-btn ea-btn-primary"
                disabled={!canSubmit || missingRequired.length > 0 || phase === "sending" || phase === "rehearsing"}
                title={missingRequired.length ? "Answer the required fields first" : undefined}
                onClick={() => setPhase("confirm")}
              >
                {phase === "sending" ? "Sending…" : "Submit"}
              </button>
            )
          )}
        </footer>
      </section>
    </div>
  );
}
