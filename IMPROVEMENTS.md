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

*Add new items below as needed.*
