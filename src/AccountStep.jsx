import { useEffect, useRef, useState } from "react";
import { supabase } from "./easyApply/supabaseClient.js";
import { track } from "./analytics.js";
import { trackSignUp } from "./googleAds.js";
import "./UploadStep.css";
import "./AccountStep.css";

// Supabase sends 6-digit codes (its setting); up to 8 are accepted in case that setting changes.
const MIN_CODE = 6;
const MAX_CODE = 8;
const AUTO_SUBMIT_MS = 700; // a complete code submits itself this long after the last keystroke
const RESEND_AFTER_S = 30;

/**
 * Create an account (or sign in) with an emailed 6-digit code. The same ResumeIQ account signs you
 * in to the resume editor. Calls onDone(session) once signed in. afterUpload: shown between reading
 * the resume and the job board, so the copy says the matches are ready.
 */
export default function AccountStep({ onDone, homeHref, afterUpload = false }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState(supabase ? "checking" : "email"); // "checking" | "signedIn" | "email" | "code"
  const [signedInAs, setSignedInAs] = useState(null); // the session already on this browser
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [wait, setWait] = useState(0); // seconds until "Send a new code" works
  const codeRef = useRef(null);

  useEffect(() => {
    if (!wait) return undefined;
    const t = setTimeout(() => setWait((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  useEffect(() => {
    if (stage === "code") codeRef.current?.focus();
  }, [stage]);

  // Already signed in on this browser: offer to continue as that account (or switch).
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSignedInAs(data.session || null);
      setStage(data.session ? "signedIn" : "email");
    });
  }, []);

  const switchAccount = async () => {
    await supabase.auth.signOut();
    setSignedInAs(null);
    setEmail("");
    setStage("email");
  };

  const sendCode = async (e) => {
    e?.preventDefault();
    if (!supabase) return setError("Sign-in isn't set up on this site yet.");
    setBusy(true);
    setError("");
    const { error: err } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
    setBusy(false);
    if (err) {
      // Supabase allows one code per email a minute ("…after 42 seconds") and a set number of sign-in emails an hour.
      const wait = err.message.match(/after (\d+) seconds?/i)?.[1];
      setError(
        wait ? `A code was just sent – you can ask for another in ${wait} seconds.`
          : /rate limit/i.test(err.message) ? "Too many sign-in emails were sent in the last hour – please try again a bit later."
          : err.message,
      );
      return;
    }
    track("signin_code_sent");
    setCode("");
    setStage("code");
    setWait(RESEND_AFTER_S);
  };

  const verify = async (value) => {
    setBusy(true);
    setError("");
    const { data, error: err } = await supabase.auth.verifyOtp({ email: email.trim(), token: value, type: "email" });
    setBusy(false);
    if (err || !data?.session) {
      setError("That code isn't right or has expired – check the latest email, or send a new code.");
      setCode("");
      codeRef.current?.focus();
      return;
    }
    track("signin_completed");
    trackSignUp(data.session.user); // Google Ads "Sign up" – new accounts only
    onDone(data.session);
  };

  const onCodeChange = (e) => setCode(e.target.value.replace(/\D/g, "").slice(0, MAX_CODE));

  // Typed or pasted: once it's long enough and the typing stops, check it.
  useEffect(() => {
    if (stage !== "code" || busy || code.length < MIN_CODE) return undefined;
    const t = setTimeout(() => verify(code), code.length === MAX_CODE ? 0 : AUTO_SUBMIT_MS);
    return () => clearTimeout(t);
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="us-split">
      <aside className="us-guide" aria-labelledby="as-guide-title">
        <p className="us-eyebrow">Your ResumeIQ account</p>
        <h2 id="as-guide-title" className="us-guide-title">One account for matching, tailoring and applying</h2>
        <ul className="as-points">
          <li><b>Your resume, saved.</b> Upload once; come back to your matches and tailored versions any time.</li>
          <li><b>The resume editor, already signed in.</b> Fine-tune any tailored resume without a second login.</li>
          <li><b>Faster applications.</b> The Chrome extension fills forms from your profile and remembers your answers.</li>
        </ul>
        <div className="us-tip"><b>No password.</b> We email you a 6-digit code each time you sign in.</div>
      </aside>

      <div className="us-upload">
        {homeHref && (
          <a href={homeHref} className="us-home">
            <span aria-hidden="true">←</span> Back to home
          </a>
        )}
        <p className="us-eyebrow">{afterUpload ? "Last step" : "Step 1 of 2"}</p>
        {stage === "checking" ? (
          <p className="us-sub" aria-live="polite">One moment…</p>
        ) : stage === "signedIn" ? (
          <>
            <h1 className="us-title">You're signed in</h1>
            <p className="us-sub">as <b>{signedInAs?.user?.email}</b></p>
            <div className="as-form">
              <button type="button" className="us-browse as-submit" onClick={() => onDone(signedInAs)}>Continue</button>
            </div>
            <p className="as-help">
              Not you?{" "}
              <button type="button" className="us-link" onClick={switchAccount}>Use a different email</button>
            </p>
          </>
        ) : stage === "email" ? (
          <>
            <h1 className="us-title">{afterUpload ? "Your job matches are ready" : "Create your account"}</h1>
            <p className="us-sub">
              {afterUpload ? "Create your free account to see them – enter" : "Enter"} your email and we'll send you a 6-digit code.
              Already have an account? Same here – it signs you in.
            </p>
            {error && <div className="us-error" role="alert">{error}</div>}
            <form className="as-form" onSubmit={sendCode}>
              <label htmlFor="as-email" className="as-label">Email</label>
              <input
                id="as-email"
                className="as-input"
                type="email"
                autoComplete="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
              <button type="submit" className="us-browse as-submit" disabled={busy || !email.trim()}>
                {busy ? "Sending…" : "Send my code"}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="us-title">Check your email</h1>
            <p className="us-sub">We sent a sign-in code to <b>{email.trim()}</b>. It works for 1 hour.</p>
            {error && <div className="us-error" role="alert">{error}</div>}
            <form className="as-form" onSubmit={(e) => { e.preventDefault(); if (code.length >= MIN_CODE) verify(code); }}>
              <label htmlFor="as-code" className="as-label">Code</label>
              <input
                id="as-code"
                ref={codeRef}
                className="as-input as-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={MAX_CODE}
                value={code}
                onChange={onCodeChange}
                placeholder="Enter code"
                aria-describedby="as-code-help"
              />
              <button type="submit" className="us-browse as-submit" disabled={busy || code.length < MIN_CODE}>
                {busy ? "Checking…" : "Continue"}
              </button>
            </form>
            <p id="as-code-help" className="as-help">
              Not there? Check spam, or{" "}
              <button type="button" className="us-link" disabled={busy || wait > 0} onClick={sendCode}>
                {wait > 0 ? `send a new code in ${wait}s` : "send a new code"}
              </button>
              {" · "}
              <button type="button" className="us-link" onClick={() => { setStage("email"); setError(""); }}>use a different email</button>
            </p>
          </>
        )}
      </div>
    </section>
  );
}
