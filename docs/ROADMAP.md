# ResumeIQ – Roadmap

Work one item at a time, in this order: make the Chrome extension reliable (Phase 1), then the
extension → website flows (Phase 2), then the resume editing flow (Phase 3). Website pieces are
parked in the backlog by screen until Phases 1–3 are done. Detailed notes for numbered backlog
items (#9, #10…) are in [`IMPROVEMENTS.md`](../IMPROVEMENTS.md).

Status: ✅ done · 🔍 built, needs checking on real pages · 🚧 in progress · ⏳ to do · ❓ decision pending

---

## Phase 1 – Extension works reliably

| # | Item | Status |
|---|---|---|
| 1.1 | Stays signed in: shares the ResumeIQ website's sign-in; picks up the site's current session from an open ResumeIQ tab instead of signing out | 🔍 |
| 1.2 | Autofill is visible and obvious: on an application page the panel leads with "Autofill this application", not below the job details | 🔍 |
| 1.3 | Attach the resume you choose: upload your own resume file(s) to your profile, pick one when applying | ⏳ |
| 1.4 | Fix the generated-PDF fallback: the ₹ symbol (breaks the text) and hyphen spacing ("Day - 7") | ⏳ |

## Phase 2 – Extension → website flows

| # | Item | Status |
|---|---|---|
| 2.1 | "Improve my resume for this job" opens the Tailor step for that job, with the profile's resume | 🔍 |
| 2.2 | Coming back: after tailoring, the tailored resume becomes what autofill attaches, with a way back to the job page | ⏳ |

## Phase 3 – Resume editing flow (website, Tailor screen)

| # | Item | Status |
|---|---|---|
| 3.1 | Assistant reliability: edits no longer dropped over the requirement label; honest "held back" messages | 🔍 |
| 3.1b | Move the assistant to a stronger model (OpenAI or Claude) – compare on real conversations, estimate cost per session | ❓ |
| 3.2 | Export the tailored resume as a clean PDF for applying | ⏳ |

---

## Backlog – website, by screen (after Phases 1–3)

### Job Matches
- Jobright-style left rail (narrow icon strip, pinned to the screen edge)
- Filter chips: location, role, seniority, job type, work mode, date posted, industry, years of experience, hidden jobs (needs AI structuring of jobs)
- "What's holding the match back" on each card
- #10 Prefer the Greenhouse posting when a role is on both LinkedIn and Greenhouse

### Tailor
- #13 Deeper matching: must-haves weigh more (also used by the extension)

### Easy Apply panel
- Connect Gmail to read verification codes (typing the code works today)
- Applications tab: everything applied to, with status and date
- Warn before applying to the same job twice

### Job sources
- #9 Every Greenhouse posting in the job board (learn boards from job links; live search uses all active boards)
- #12 Keka as a source
- Naukri (and Glassdoor) via Apify's All Jobs Scraper ❓ cost decision
- Adzuna (needs free API keys)

### Going live
- Worker server for Easy Apply submissions (Vercel can't run the automated browser)
- Vercel environment variables (Supabase keys) for the live site
- Merge `tailoring-assistant` → `main` (deploys the site and turns on the daily job collection)

## Backlog – extension (after Phases 1–3)
- #11 follow-ups: cache-aware match on every job view is done; deeper matching is #13
- LinkedIn Easy Apply autofill – decided: not now (account-restriction risk)
- Chrome Web Store listing
