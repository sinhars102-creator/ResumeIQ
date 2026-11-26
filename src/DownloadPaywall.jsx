/**
 * Module M5 – the download dialog with the paywall.
 *
 * Opens when the user taps Download. For a signed-in user it asks the server what they've paid for
 * (GET /api/downloads/status):
 *   - nothing yet  -> three plans (₹79 / ₹399 / ₹799), pay with Razorpay, then a Download button
 *   - something    -> a Download button, and what's left
 * The PDF is built and saved by `buildAndSave` (the page's own PDF code). Only after that returns is the
 * download counted (POST /api/downloads/complete), so a failed PDF never uses up a download.
 * The paywall appears only here, at the first download; everything before it is free.
 *
 * The first step is choosing a template (module M10): the candidate sees their own resume in each look before anything
 * is paid for. Choosing only changes the layout; the text is never rewritten or cut.
 *
 * Props: resume (the final resume, for the previews), session (Supabase session or null), paymentsRequired (false when
 * there's no account system, e.g. a bare local setup), buildAndSave(templateId) -> void (throws if the PDF fails),
 * onClose, signInSlot (the email-code sign-in, shown inside this dialog for a visitor with no account yet), track, notice (optional text).
 */
import { useEffect, useRef, useState } from "react";
import { payForPlan } from "./razorpayCheckout.js";
import { PLANS } from "./pricing.js";
import { trackPurchase } from "./googleAds.js";
import TemplatePicker from "./TemplatePicker.jsx";
import { DEFAULT_TEMPLATE, templateById, loadDesign, saveDesign } from "./resumeTemplates.js";

const API_BASE = (import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:3001" : "")).replace(/\/$/, "");


const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

async function api(path, token, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

const leftText = (s) => (s?.free ? "" : s?.unlimited ? `Unlimited downloads${s.expiresAt ? ` until ${new Date(s.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}.` : s?.remaining != null ? `${s.remaining} download${s.remaining === 1 ? "" : "s"} left.` : "");

export default function DownloadPaywall({ resume, session, paymentsRequired, buildAndSave, onClose, signInSlot, track, notice }) {
  const token = session?.access_token || "";
  const email = session?.user?.email || "";
  // loading | signin | paywall | ready | done
  const [stage, setStage] = useState(paymentsRequired ? (session ? "loading" : "signin") : "ready");
  const [status, setStatus] = useState(null);
  const [plan, setPlan] = useState("dl1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState("template"); // template -> pay
  const [templateId, setTemplateId] = useState(() => {
    try {
      return templateById(localStorage.getItem("riq_template") || DEFAULT_TEMPLATE).id;
    } catch {
      return DEFAULT_TEMPLATE;
    }
  });
  const [design, setDesign] = useState(loadDesign);
  const trackRef = useRef(track);
  trackRef.current = track;
  // One id for this dialog: tapping Download again (say, the phone blocked the first save) isn't counted twice.
  const downloadIdRef = useRef(uid());

  // Escape closes the dialog, and focus moves into it when it opens.
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // While a payment or PDF is in progress the dialog stays open: closing it would hide a purchase still being recorded.
  const busyRef = useRef(false);
  busyRef.current = busy;
  const closeUnlessBusy = () => { if (!busyRef.current) onCloseRef.current?.(); };
  useEffect(() => {
    const prev = document.activeElement;
    dialogRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") closeUnlessBusy(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); if (prev && prev.focus) prev.focus(); };
  }, []);

  // Signed in from inside this dialog: carry on to the plans (or straight to the download for someone who already has one).
  useEffect(() => {
    if (paymentsRequired && stage === "signin" && session) setStage("loading");
  }, [session, stage, paymentsRequired]);
  useEffect(() => {
    if (step === "pay" && stage === "signin") trackRef.current?.("signin_wall_shown", { at: "download" });
  }, [step, stage]);

  useEffect(() => {
    if (!paymentsRequired || !token) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const r = await api("/api/downloads/status", token);
        if (cancelled) return;
        if (!r.ok) throw new Error(r.data.error || `status ${r.status}`);
        setStatus(r.data);
        setStage(r.data.allowed ? "ready" : "paywall");
        trackRef.current?.(r.data.allowed ? "rllm_download_ready" : "rllm_paywall_shown", { plan: r.data.plan });
      } catch (e) {
        if (cancelled) return;
        setError(`We couldn't check your downloads (${e.message}). Please try again.`);
        setStage("error");
      }
    })();
    return () => { cancelled = true; };
  }, [paymentsRequired, token]);

  function chooseTemplate() {
    try {
      localStorage.setItem("riq_template", templateId);
      saveDesign(design);
    } catch {
      // Storage blocked: the choice just isn't remembered for next time.
    }
    trackRef.current?.("rllm_template_chosen", { template: templateId, customised: JSON.stringify(design) !== JSON.stringify(loadDesign()) || undefined });
    setStep("pay");
  }

  async function pay() {
    setError("");
    setBusy(true);
    trackRef.current?.("rllm_pay_clicked", { plan, price: PLANS.find((p) => p.id === plan)?.price });
    try {
      const r = await payForPlan(plan, { email, token });
      if (r.status === "cancelled") {
        trackRef.current?.("rllm_pay_cancelled", { plan });
        return;
      }
      setStatus(r.purchase);
      setStage("ready");
      const paid = PLANS.find((p) => p.id === plan);
      trackRef.current?.("rllm_paid", { plan, price: paid?.price, value: paid?.price, currency: "INR" });
      trackPurchase({ plan, value: paid?.price, transactionId: r.purchase?.paymentId || r.paymentId || null });
    } catch (e) {
      setError(e.message);
      trackRef.current?.("rllm_pay_failed", { plan });
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    setError("");
    setBusy(true);
    try {
      buildAndSave(templateId, design); // throws if the PDF can't be made; nothing is counted then
    } catch (e) {
      trackRef.current?.("rllm_download_failed", { plan: status?.plan || null, stage: "build" });
      setError(`The PDF couldn't be made (${e.message}). Nothing was used from your downloads. If this keeps happening, email rahul@myresumeiq.io and we'll refund you.`);
      setBusy(false);
      return;
    }
    try {
      if (paymentsRequired && token) {
        const r = await api("/api/downloads/complete", token, { method: "POST", body: JSON.stringify({ downloadId: downloadIdRef.current }) });
        if (r.ok && r.data.status) setStatus(r.data.status);
        else if (r.status === 402) {
          setError("Your downloads have run out. Choose a plan to download again.");
          setStage("paywall");
          return;
        }
      }
      trackRef.current?.("rllm_downloaded_counted", { plan: status?.plan || null });
      setStage("done");
    } catch {
      setStage("done"); // the file was saved; a failed count shouldn't turn the user away
    } finally {
      setBusy(false);
    }
  }

  const selected = PLANS.find((p) => p.id === plan);

  return (
    <div className="rl-modal-scrim" role="dialog" aria-modal="true" aria-label="Download your resume" onClick={closeUnlessBusy}>
      <div className={`rl-modal${step === "template" ? " rl-modal-wide" : ""}`} ref={dialogRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        {step === "template" ? (
          <>
            <h2>Design your resume</h2>
            <p className="rl-modal-sub">Pick a template, then adjust the font, size, spacing, margins and colour. Your text stays exactly as you approved it; this only changes the look.</p>
            {notice && <p className="rl-warn">{notice}</p>}
            <TemplatePicker resume={resume} selected={templateId} onSelect={setTemplateId} design={design} onDesign={setDesign} />
            <button type="button" className="rl-btn rl-btn-primary rl-wide" onClick={chooseTemplate}>Continue with {templateById(templateId).name}</button>
            <button type="button" className="rl-btn rl-btn-quiet rl-wide" onClick={onClose}>Keep editing</button>
          </>
        ) : (
          <>
        <h2>{stage === "done" ? "Downloaded" : "Download your resume"}</h2>
        {notice && stage !== "done" && <p className="rl-warn">{notice}</p>}

        {stage === "loading" && <p className="rl-pay">Checking your downloads…</p>}

        {stage === "signin" && (
          <>
            <p className="rl-pay-lead">Your resume is ready. Create your free account to download it: we'll email you a 6-digit code, with no password. Your resume and edits stay exactly as they are.</p>
            {signInSlot}
          </>
        )}

        {stage === "paywall" && (
          <>
            <p className="rl-pay-lead">Your resume is ready. Choose how many PDFs you need.</p>
            <div className="rl-plans" role="radiogroup" aria-label="Plans">
              {PLANS.map((p) => (
                <button key={p.id} type="button" role="radio" aria-checked={plan === p.id} className={`rl-plan${plan === p.id ? " is-on" : ""}`} onClick={() => { setPlan(p.id); trackRef.current?.("rllm_plan_selected", { plan: p.id, price: p.price }); }}>
                  <span className="rl-plan-main"><b>{p.title}</b><small>{p.note}</small></span>
                  <span className="rl-plan-price">₹{p.price}</span>
                </button>
              ))}
            </div>
            <p className="rl-pay-fine">One-time payment by UPI, card or netbanking. No subscription. If your PDF can't be delivered after you pay, we refund you in full: <a href="/refund.html" target="_blank" rel="noopener">refund policy</a>.</p>
            <button type="button" className="rl-btn rl-btn-primary rl-wide" disabled={busy} onClick={pay}>{busy ? "Opening payment…" : `Pay ₹${selected.price} and continue`}</button>
          </>
        )}

        {stage === "ready" && (
          <>
            {leftText(status) && <p className="rl-pay">{leftText(status)}</p>}
            <button type="button" className="rl-btn rl-btn-primary rl-wide" disabled={busy} onClick={download}>{busy ? "Preparing your PDF…" : "Download PDF"}</button>
          </>
        )}

        {stage === "done" && (
          <>
            <p className="rl-pay">Your PDF has been saved to your device. {leftText(status)}</p>
            <button type="button" className="rl-btn rl-btn-primary rl-wide" onClick={download} disabled={busy}>Didn't save? Download again</button>
          </>
        )}

        {stage === "error" && <p className="rl-warn">{error}</p>}
        {error && stage !== "error" && <p className="rl-warn" role="alert">{error}</p>}

        {stage !== "done" && <button type="button" className="rl-btn rl-btn-quiet rl-wide" onClick={() => setStep("template")}>← Change design ({templateById(templateId).name})</button>}
        <button type="button" className="rl-btn rl-btn-quiet rl-wide" onClick={onClose}>{stage === "done" ? "Close" : "Keep editing"}</button>
          </>
        )}
      </div>
    </div>
  );
}
