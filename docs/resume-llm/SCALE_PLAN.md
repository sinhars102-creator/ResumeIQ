# Resume LLM: lean MVP now, scale plan for later

Written 2026-11-24. Reference for when Resume LLM grows. The MVP ships the lean scope below. Everything in "Deferred" is built only when its trigger fires.
Prices are from third-party trackers and the author's token estimates (about +/-30%). Re-check official pricing pages before committing.
The full product spec the plan follows (`MyResumeIQ_AI_Product_Specification.md`) was shared in chat and is not stored here. Drop it into this folder.

## 1. Principles (from the spec)
- Truth over persuasion: never invent or inflate facts. AI proposes, code validates and decides.
- Candidate approves content. Content and design are separate: a template never rewrites content.
- No silent content loss. Flag uncertainty and ask. Missing in the resume does not mean the candidate lacks it.

## 2. Lean MVP (ship first)
Flow: upload text PDF/DOCX or paste -> sign in in chat -> see what we read (light check) -> Improve or Tailor -> review workspace with chat edits, Undo, Reset -> download PDF (paid section).

Must have before launch:
1. Paid model plan with a fallback (not Groq free tier).
2. Server-side saving of the resume per user (not browser-only).
3. Remove the silent 12-bullet limit in the PDF format (`PDF_FORMAT` maxBullets).
4. Light read check: warn when numbers, dates, emails or URLs in the file are missing from the parsed resume; show what we read so the user can fix it.
5. Existing honesty guards kept, with tests for hard cases.
6. Privacy line and consent wording; no training on user data yet.
7. Free-use limits and sign-in before expensive AI calls.
8. Paid section at download (Razorpay exists, currently off).
9. Analytics for each step.
10. Keep the live sign-in-first Reactive Resume editor flow until the new flow passes tests, then switch ad traffic to `/app/editor`. Launch audience: all ad traffic.

## 3. Deferred, with triggers
| Trigger | Build |
|---|---|
| Users upload files we misread, or complain | Layout-aware ingestion, confirm step, OCR for scans |
| Users want to change design | Templates (2-3 ATS-safe own + a few ported Reactive Resume, MIT notice kept) and preservation check |
| Users ask for Word | Word export |
| Edits go wrong or users want cross-session undo | Versions and typed command layer |
| Model cost is a visible share of revenue | Cheaper models, caching, then fine-tuning |
| Thousands of consented corrections exist | Fine-tuning trial |
| Steady high volume | Own model serving |
Also deferred: embeddings, full requirement-to-evidence matrix, full fact ledger, streaming, job links, from-scratch flow, workflow framework.

## 4. Target architecture (destination)
Front end (chat + document panel + template gallery) -> API -> workflow state machine -> stages:
1. Ingestion: file-type check, size/page limits, text layer detection, text+layout extract (OCR later), AI structures text, code completeness check, facts created, user confirms doubts.
2. Job analysis: save raw JD, AI splits into requirements.
3. Evidence matching: code retrieves facts (filters, text search, embeddings), AI re-ranks, code sets strong/partial/not_found/unknown, code decides what to ask, AI words the question.
4. Writing: AI drafts lines citing fact IDs, code validators (numbers, dates, tools, ownership, IDs) pass / blank / question.
5. Chat commands: AI turns the message into a typed command, code finds the target line, validates, applies to that one line, logs for undo.
6. Approval: code locks the version.
7. Rendering: mapper -> template -> paginate -> preservation check -> PDF (Word later). No AI.
Data (Postgres/Supabase + file storage): users, files, canonical resumes + versions, facts, jobs + requirements, matches, commands, approvals, exports.

AI does only: structuring text, splitting a job into requirements, re-ranking matches, wording questions, writing/rewriting bullets, understanding commands (plus embeddings later). Everything else is code.

## 5. Reading files reliably
Cannot promise 100%. Promise: every file ends as read-and-verified, read-with-flagged-doubts, or could-not-read (offer paste). Method: validate file, layered extraction, round-trip completeness check against raw text (counts of numbers, dates, emails, URLs; leftover text goes to an "unplaced" bucket), plausibility checks, user confirmation, and a hand-labelled test set to measure it.

## 6. Chat commands ("change this bullet to this", "remove this point")
Interpret (AI to typed command) -> resolve target (code: selected line, then ordinals/keywords on line IDs; ask if two fit) -> validate (same guards; user-dictated text inserted as typed) -> execute (code, one line only, exact undo) -> confirm (apply with Undo; ask before deletions). Test with 100-200 realistic phone-style commands; changing a non-target line must be zero.

## 7. Models and cost
Use different models per job; pick the cheapest that passes the honesty gate on our test set.
| Model | $ per 1M tokens (in/out) |
|---|---|
| gpt-oss-120b (Groq and others) | 0.15 / 0.60 |
| Llama 3.1 8B (Groq) | 0.05 / 0.08 (confirm) |
| Llama 3.3 70B (Groq) | 0.59 / 0.79 (confirm) |
| Claude Haiku 4.5 | 1 / 5 |
| Claude Sonnet 4.6 | 3 / 15 |
| Claude Sonnet 5.5 | 2 / 10 (unconfirmed) |
Assumed Tailor session: about 50k input and 15k output tokens, +30% for retries, only with small targeted prompts.
| Setup | Per session | 500/mo | 2,000/mo | 10,000/mo |
|---|---|---|---|---|
| A. all gpt-oss-120b | ~$0.02 | ~$11 | ~$43 | ~$215 |
| B. gpt-oss-120b + Haiku writer | ~$0.08 | ~$41 | ~$162 | ~$810 |
| C. gpt-oss-120b + Sonnet 4.6 writer | ~$0.22 | ~$108 | ~$434 | ~$2,170 |
| D. all Sonnet 4.6 | ~$0.49 | ~$244 | ~$975 | ~$4,875 |
Cost per paying customer = session cost / conversion (at an assumed 5%: A ~$0.43, B ~$1.60, C ~$4.30, D ~$9.70).
Other monthly costs (to confirm): Supabase Pro ~$25 (free tier may do first), Vercel Pro ~$20, email/PostHog/Sentry free tiers, Razorpay % per payment, Render suspended, Apify paid plan if LinkedIn jobs are wanted, Google Ads (likely largest).
Pre-revenue: launch month ~$60-180 all-in excluding ads; growth month ~$230-300.

## 8. Fine-tuning and GPUs (later)
- No live weight updates. Collect consented, anonymised corrections (best signal: user fixes in the confirm step), fine-tune periodically (LoRA), test on a frozen set, roll out gradually with rollback.
- Decide before any run: baseline score; frozen ~100-resume test set never used in training; metrics (field recall/precision, lost-text rate, date/number accuracy, valid JSON, invented-claim rate must not rise); pass bar; minimum data (hundreds to thousands of corrected examples); data rules; rollout/rollback; budget cap.
- Consent: privacy-policy line plus opt-in at sign-in; get a lawyer's review; prefer anonymised field-level corrections or synthetic data. Not trained on user data until then.
- GPUs: never run one 24/7 for serving at this stage. Rent only for training runs (H100 ~$2.7-4/hr, A100 ~$1.5-2/hr; 8B LoRA run ~$5-25, 70B ~$50-120 per run).
- Serverless GPU (Modal, RunPod Serverless): pay per second, scales to zero. Best fit: scheduled training jobs. Serving own fine-tuned model comes later, with the hosted API as fallback; always-warm worker costs about the same as a dedicated GPU (16GB ~$415/mo, A100 ~$1,970/mo, H100 ~$2,840/mo). Cold starts add delay; set max workers, timeouts and spend alerts.
- Open-weight models are free to download, not free to run. Read each license (Llama has its own terms).

## 9. Templates (later)
Mapper from canonical JSON to template; rules for long content (wrap, flow pages, hide empty sections, keep headings with first item); minimum font size; preservation check on every approved line ID after render; stress test each template (10+ roles, long bullets, many skills). Mark each template ATS-safe or design-first, default ATS-safe. Copy template components from Reactive Resume (MIT; keep the notice, re-check license) instead of embedding its app. Do not copy OpenResume (AGPL).

## 11. Decided pricing for Resume LLM (2026-11-24)
- Paywall appears at the first download only, never before it. Everything up to the first download is free (so AI cost for free users is on us).
- 1 download: ₹79 (raised from ₹59 on 2026-11-24, see break-even table below). 10 downloads per month: ₹399. Unlimited downloads per month: ₹799.
- Cost implication (FX ~₹88/$, unverified): ₹59 is about $0.67 ($0.57 excluding 18% GST). AI cost per paying customer = session cost / conversion; at an assumed 5% conversion that is about $0.43 (setup A), $1.60 (B), $4.30 (C). So ₹59 only works with setup A or a higher conversion; free-use limits before the paywall are essential.
- Downloads themselves cost no AI (rendering is code). The cost sits in the edits and tailoring before the download, so fairness caps should limit AI actions, not downloads.
- Decided: a download counts when the PDF download completes. No cap on free AI use for now (watch provider spend with an alert instead; revisit if costs spike).
- To define: whether the old Job Search Pack and Sprint Pass stay for the job-application product.
- Break-even conversion (share of sessions that pay) for the 1-download plan, assuming price includes 18% GST, 2% gateway fee, FX ~₹88/$: setup A (~$0.0215/session): ₹59 3.9%, ₹79 2.9%, ₹99 2.3%, ₹149 1.5%. Setup B (~$0.081): ₹59 14.6%, ₹79 10.9%, ₹99 8.7%, ₹149 5.8%. Setup C (~$0.217): ₹59 39%, ₹79 29%, ₹99 23%, ₹149 15.5%. Real paid conversion is unknown until launch data exists.

## 10. Open items
- (SUPERSEDED by the decided Resume LLM pricing in section 11; old plans kept for reference) Pricing already exists in code (`server/payments.js`, plan section in `src/Landing.jsx`, hidden by `SHOW_PRICING = false`): Free ₹0 (parsing, top matches, 1 fully tailored resume, autofill on 1 application); Job Search Pack ₹399 (10 tailored applications, autofill for all 10, PDF and DOCX exports, tracker, valid 60 days); Sprint Pass ₹799 (unlimited tailored applications for 30 days, unlimited autofill, daily WhatsApp matches, priority support). One-time, UPI/card/netbanking, GST invoice. The Resume LLM download paywall should reuse these plans. Open: does the free "1 tailored resume" cover the first Resume LLM download, and does Sprint Pass need a fair-use cap (unlimited tailoring on a paid model can cost more than the plan earns).
- Monthly spending ceiling and free-use limits.
- Provider data-retention review and legal review of consent wording.
- 40-60 consented real resumes for the first test set.
- Suspend unused Render service; Apify free plan is exhausted.
