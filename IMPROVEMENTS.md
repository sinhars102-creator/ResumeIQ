# ResumeIQ – Improvements backlog

Track these items for future implementation.

---

## 1. JD persistence
**What:** The job description (JD) that is pasted should persist.
**Why:** So the user doesn’t have to paste the same JD again and again (e.g. across sessions or when navigating steps).
**Notes:** Consider saving to `localStorage` keyed by job/session, or to app state that survives step changes and refresh (e.g. restore from `localStorage` on load).

---

## 2. Resume persistence
**What:** Same for resume (pasted or uploaded).
**Why:** So the user doesn’t have to re-paste or re-upload the resume repeatedly.
**Notes:** Same approach as JD: e.g. `localStorage` and/or restore from saved state on load. Handle both raw text and extracted resume JSON if needed.

---

## 3. P0 – Suggestions only for first 2 work experiences
**What:** Suggestions are only generated for the first 2 work experiences, not the rest.
**Why:** Bug; all experience entries should get suggestions.
**Action:** Check why and fix (likely in the prompt/API response parsing or in how suggestions are filtered/mapped to experience items).
**Priority:** P0

---

## 4. Resume builder tool update
**What:** The resume builder tool needs to be updated.
**Why:** To reflect current behavior, new PDF formatting options, or other changes.
**Notes:** Clarify scope (e.g. in-app “builder” UI, or external doc/README). Update copy, steps, and options (e.g. JD/resume persistence, PDF formatting, single page, colors) as needed.

---

## 5. Suggestions: editable or improve with AI
**What:** Suggestions should be editable and/or there should be an option to improve a suggestion with AI.
**Why:** So users can tweak wording manually or ask AI to refine a suggestion (e.g. shorter, more formal, or more impact-focused) without re-running the full analysis.
**Notes:** Consider: (a) Inline edit of the suggested text before approving; (b) "Improve with AI" button per suggestion that calls the API to regenerate/refine that suggestion (with optional user hint).

---

## 6. Text still stretched in PDF
**What:** Text in the downloaded PDF still appears stretched (letter spacing / character spacing).
**Why:** Improves readability and professional look of the PDF output.
**Notes:** Revisit jsPDF usage: ensure `setCharSpace(0)` is applied consistently; try different font or viewer; check if `splitTextToSize` or other options introduce spacing; consider testing in multiple PDF viewers.

---

## 7. Generate cover letter from JD and final resume
**What:** Option to generate a cover letter based on the job description (JD) and the final (updated) resume.
**Why:** Users can get a tailored cover letter that aligns with both the role and their optimized resume in one flow.
**Notes:** Add a step or button (e.g. on Preview or after download) to "Generate cover letter"; call API with JD + final resume text/JSON; display editable result and offer download (e.g. PDF or copy).

---

## 8. Pull jobs from LinkedIn
**What:** Let users search and pull job listings from LinkedIn (title, company, location, JD) instead of only pasting.
**Why:** Smoother flow: search LinkedIn from the app and load the JD automatically.
**Options (see `docs/LINKEDIN_JOBS_OPTIONS.md`):**
- **Unofficial guest API** – free, no key; may need a small backend proxy for CORS; can break (unofficial).
- **RapidAPI “LinkedIn Job Search”** – paid subscription; stable, easy to integrate.
- **Apify LinkedIn Jobs Scraper** – pay per use (~$0.70/1k jobs); good for volume.
- **Official LinkedIn API** – not for pulling public job listings; for posting only and partner-only.

**Notes:** Prefer third-party API or guest API behind a backend proxy; map response to existing job shape (`company`, `role`, `location`, `jd`, `source: "linkedin"`).

---

## 9. Every Greenhouse job posting in our job board
**What:** All Greenhouse job postings (India scope) should come into the ResumeIQ jobs database, not only the ~70 boards we know about today.
**Why:** Roles like [Eudia – 4333174009](https://job-boards.greenhouse.io/eudia/jobs/4333174009) appear on LinkedIn and Greenhouse but were missing from our Greenhouse list, because Eudia's board isn't one we collect.
**Notes:**
- Learn boards from job links: any URL naming a Greenhouse board (`job-boards.greenhouse.io/<board>/…`, `?gh_jid=…&for=<board>`), whether from LinkedIn "Apply" links, the Chrome extension or Easy Apply, adds that board to `public.companies` as active, with no name guessing.
- The live "Company career pages" search should use every active board in the database, not the 29 hard-coded in `server/jobBoards.js`.
- Finish discovery of the ~1,130 companies still waiting (500 per daily run today); consider running it more often.
- Same approach later for Lever and Ashby.

---

## 10. Prefer the Greenhouse posting when a role is on both LinkedIn and Greenhouse
**What:** When the same role exists on LinkedIn and on Greenhouse, show and use the Greenhouse version.
**Why:** The Greenhouse posting has the full job description, the employer's own apply link, and works with Easy Apply; LinkedIn copies often don't.
**Notes:**
- Today `mergeJobs` collapses duplicates by company + title + city and keeps the longer description; it should keep the Greenhouse record (id, source, link) and treat the LinkedIn one as a duplicate.
- Apply the same rule in the database: link LinkedIn rows to the matching Greenhouse row (e.g. a `duplicate_of` column) so searches return one card, Greenhouse first.
- LinkedIn's "Apply" link often points at the Greenhouse posting – use it to match the two exactly when available.

---

## 11. Match and tailor straight from any job page (Chrome extension)
**What:** As soon as the extension sees a job opening, it matches it against the user's profile and shows the match percentage (with what's holding it back) in the side panel – without having to "Add to ResumeIQ" first – and offers an option to edit/tailor the resume for that role.
**Why:** The fit is the first thing a job seeker wants to know on a posting; tailoring should be one click from there.
**Notes:**
- Today the match score appears only after "Add to ResumeIQ" (POST /api/ext/match runs after saving).
- Run the match when the panel reads a job (cache per job so revisiting doesn't re-run the AI); keep "Add to ResumeIQ" as a separate save.
- "Edit resume" opens ResumeIQ's tailoring flow for that job (the role saved or passed through, like `/app?easyApply=…`), and the tailored resume is what autofill / Easy Apply attach.

---

## 12. Keka as a job source
**What:** Add Keka (keka.com) as a source of job postings.
**Why:** Keka is an Indian HR platform whose hiring module ("Keka Hire") hosts careers pages for many Indian companies – roles we don't reach through Greenhouse, Lever, Ashby or Workable.
**Notes (to verify when we start):**
- Careers pages appear to live at `<company>.keka.com/careers`; check whether there's a public JSON feed per company (like Greenhouse's job board API) or whether pages must be read.
- Discovery: learn Keka company slugs the same way as backlog item 9 (from job links seen on LinkedIn, the extension and Easy Apply), plus a curated list.
- Then: India-scope filter, closing roles that leave a board, and whether Easy Apply / extension autofill can work on Keka's application form.

---

*Add new items below as needed.*
