# Auto apply – plan

## Goal
A user sees a job opening on any site, opens the ResumeIQ extension and clicks **Auto apply**. The
application is filled for them – every page, with their resume and (when asked) a cover letter – and
stops at Review for them to submit. It works on any platform (Workday, Greenhouse, Lever, Ashby, Keka,
SmartRecruiters, iCIMS, SuccessFactors…) without a separate engine per site.

## Decisions (agreed 2026-10-08)
| Topic | Decision |
|---|---|
| End of the flow | **Stop at Review.** The user reads it over and clicks Submit. Never auto-submit. |
| Real typing and clicking | **Yes** – use Chrome's `debugger` permission so custom dropdowns and React widgets respond. Chrome shows "ResumeIQ started debugging this browser" while filling. |
| Questions the profile can't answer | **AI answers, highlighted for the user to check.** Factual unknowns (dates, salary, notice period not in the profile) pause and ask in the panel. Every answer the user gives or keeps is saved to an answer bank for next time. |
| Resume | For now: the resume picked in the panel (default first). **Backlog:** the AI scores each of the user's resumes against the job, shows the scores, and uses the best fit. |
| Cover letter | **Only when the form asks** – attached as a file, or pasted into a text box. |
| Site accounts (Workday, iCIMS…) | **The user signs in.** Auto apply fills the email, pauses with "Sign in or create your account, then click Continue", and carries on. ResumeIQ stores no site passwords. |
| Where it starts | **On the job posting or the form.** On a posting it clicks the site's Apply button and follows to the form; on a form it starts filling. |
| Tracking | **Yes** – each Auto apply is recorded: job, company, date, resume and cover letter used, status (filled → submitted when the site's confirmation appears). |

## User flow
1. User opens a posting and the extension. The panel shows the match and **Auto apply**.
2. Click **Auto apply** → it clicks Apply on the page and follows to the form (new tab or same page).
3. If the site asks for an account → pause: "Sign in or create your account, then click Continue."
4. On each form page: read every question → answer → fill → check the answers stuck → fix any errors
   the site shows → **Next**. The panel shows progress ("Step 2 of 6 – My Information: 9 filled, 1 to check").
5. An unknown factual question → the panel asks; the answer is saved and filling continues.
6. At Review → stop. The panel lists what to check (AI answers, anything it couldn't fill) with links to each field.
7. The user clicks Submit on the page; the extension sees the confirmation and marks the application submitted.

## How it works – one engine, five layers
Site-specific code is limited to thin extras where truly needed; the engine itself knows nothing about Workday or Greenhouse.

1. **Detect** – score whether the page is an application step: labelled fields, required markers, a step
   indicator, Next/Continue/Submit buttons, an upload area. Also detect: job posting (Apply button), sign-in /
   create-account page, Review page, confirmation page. (Replaces today's "3 fields + email" rule.)
2. **Read** – build the list of questions on the page from what screen readers use (labels, ARIA roles
   `combobox` / `listbox` / `option` / `radiogroup`, `aria-required`, `aria-invalid`): label, control type,
   options (opening custom dropdowns to read them), required, current value. Repeatable sections ("Add
   experience") are read as sections.
3. **Decide** – answer each question: profile + fixed rules first (the current `easyApplyFill.js` rules
   move here), then the answer bank, then the AI. Each answer carries where it came from (profile /
   saved / AI) so AI answers are highlighted.
4. **Act** – one driver per control type, using real input through `chrome.debugger`: text, native
   select, custom dropdown (click → type → pick option), radio, checkbox, file (resume / cover letter),
   date, "Add" section. Fills visibly so the user can follow.
5. **Check and move on** – re-read to confirm values stuck, read the site's error messages and fix them,
   click Next, wait for the next step, repeat. Stop at Review.

## Build order (each step is checked on real postings before the next)
| # | Step | Done when |
|---|---|---|
| A1 | **Detect + Read** on any site; the panel shows the questions it found (nothing filled yet) | The question list is right on the test set below |
| A2 | **Act** – drivers per control type with real input | Every control type fills on the test set, including Workday and Greenhouse dropdowns |
| A3 | **Decide** – profile rules, answer bank, AI answers marked for checking; pause-and-ask in the panel | No made-up facts; unknown factual questions are asked once and reused |
| A4 | **Multi-step loop** – Next → Next → stop at Review; sign-in pause; start from the posting | A full Workday application reaches Review with one click plus sign-in |
| A5 | **Tracking** – applications list (job, documents used, status) | Submitted is recorded when the confirmation appears |

**Test set:** about 20 real India postings across Workday, Greenhouse, Lever, Ashby, Keka,
SmartRecruiters, iCIMS and SuccessFactors. Measured by: share of fields filled correctly, and whether
the run reached Review.

## Risks and limits
- **CAPTCHAs** stop it – the user solves them and clicks Continue.
- **Chrome Web Store:** the `debugger` permission gets a stricter review; the listing must explain why.
- **AI cost:** about one AI call per form page (plus one per cover letter), on Groq.
- **Site terms:** LinkedIn Easy Apply stays out (account-restriction risk, decided earlier).

## Backlog related to Auto apply
- AI scores each of the user's resumes against the job and uses the best fit (see Decisions).
- Tailored resume per job as the attachment (needs Roadmap 2.2 and 3.2).
- Reading verification codes from Gmail for site sign-ups.

---

## Idea: job-hunting agent
*Not planned – an idea to build on later.*

**What:** the user gives ResumeIQ their resume(s), preferences and permission once. An agent then works
for them in the background, even when they aren't on the platform: it keeps finding roles that fit,
asks for approval, and applies to the ones they approve.

**How it could work:**
1. **Brief, once:** roles, locations, salary floor, companies to avoid, minimum match score, how many
   applications per week, and which resumes to use.
2. **Find:** each day the agent searches the jobs repository (career boards, LinkedIn on demand) and
   scores new roles against the user's resumes (the "AI picks the best resume" idea).
3. **Approve:** it sends a short daily list (email / WhatsApp / in the app): role, company, match score,
   the resume it would use, why it fits. The user taps Approve or Skip; skips teach it what not to send.
4. **Apply:** approved roles are applied to by a server worker running the Auto apply engine: the
   resume, a cover letter when asked, the answer bank for questions. Anything it can't answer
   goes back to the user as a question.
5. **Report:** the applications list shows what was sent, with which documents, and any replies.

**Things to work out:**
- **Running without the user's browser:** today's Easy Apply already does this for Greenhouse on our
  server. Sites that need an account (Workday, iCIMS) would need stored sign-ins, or would stay for the
  user to finish – the agent prepares, the user signs in.
- **Approval:** whether "approve" means "submit", or the agent fills and the user does a final check
  (Auto apply stops at Review today).
- **CAPTCHAs and site limits:** some sites will block automated submissions; how many per day is safe.
- **Quality over volume:** a cap and a minimum match score so it never mass-applies.
- **Cost:** AI calls per job scored and per application, and the worker server (Vercel can't run the
  browser – already in "Going live").
