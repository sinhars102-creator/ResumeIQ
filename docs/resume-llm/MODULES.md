# Resume LLM: build modules

Each module is built, tested and committed on its own, so a problem can be traced to one module and fixed there.
Branch: `resume-llm`. Scope and reasons: see SCALE_PLAN.md. Status: todo / building / done.

| # | Module | What it does | Files | Test | Status |
|---|---|---|---|---|---|
| M1 | Export integrity | The PDF never silently drops approved content (no bullet limit; flows onto more pages) | `src/resumePdf.js`, `PDF_FORMAT` in `src/ResumeLLM.jsx` | build with many bullets, count pages | done |
| M2 | Read check | After reading a file, compare the raw text with the parsed resume (numbers, dates, emails, URLs, leftover text); warn and let the user fix | `src/readCheck.js` (new), notice in `src/ResumeLLM.jsx` | `server/readCheck.test.js` | done |
| M3 | Resume storage | Save the resume per signed-in user on the server (not only the browser) and load it back | new migration in `supabase/migrations`, routes in `server/index.js`, `src/ResumeLLM.jsx` | `server/resumeStore.test.js` | todo |
| M4 | Plans and entitlements (server) | Three plans: 1 download ₹79, 10 downloads/month ₹399, unlimited/month ₹799. Count a download only when the PDF download completes | `server/payments.js`, new migration, new routes | `server/payments.test.js` | todo |
| M5 | Paywall (front end) | Pricing popup at the first download only; pay with Razorpay; then download | `src/ResumeLLM.jsx` download modal, `src/razorpayCheckout.js` | browser test | todo |
| M6 | Model layer | Per-task model choice, paid provider config, fallback, spend logging for an alert | `server/llm.js`, `server/tailorChat.js` | `server/llm.test.js` | todo |
| M7 | Analytics events | Events for each step (upload, read, sign-in, goal, edits, approve, paywall, pay, download) | `src/analytics.js`, `src/ResumeLLM.jsx` | PostHog check | todo |
| M8 | Abuse guard | Technical limits only (no product cap): sign-in before expensive AI calls, per-IP rate limit | `server/index.js` | `server/rateLimit.test.js` | todo |
| M9 | Launch switch | Point ad traffic at `/app/editor`; keep the Reactive Resume flow as fallback until tests pass | routing, ads | manual | todo |

Order is by dependency: M1, M2, M3, M4, M5, M6, M7, M8, M9.
Rules for every module: one small change set, a test or check, a commit message naming the module, and a line here updating the status.
