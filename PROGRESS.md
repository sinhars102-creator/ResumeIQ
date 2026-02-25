# ResumeIQ – Progress summary (save point)

**Last updated:** Feb 24, 2025  
**Status:** All progress saved. Ready to push to GitHub tomorrow and continue by modules.

---

## What’s done

### Core app
- Single-file React app (Vite): `src/ResumeIQ.jsx`, `src/App.jsx`
- 4 steps: Select role → Analyze (JD + resume) → Suggestions (approve/reject) → Preview
- OpenAI API (GPT-4) for extraction, scoring, suggestions; env: `VITE_OPENAI_API_KEY` in `.env`
- Resume: paste or upload PDF/txt; “Extract my resume” parses to structured JSON
- Before/AFTER preview with client-side application of approved suggestions and green highlights
- Download PDF from Preview step

### Suggestions
- Suggestions generated for **all** work experiences (not just first); prompt asks for 5–12 high-value suggestions, numbers/figures in bullets
- **experienceIndex** used so additions/rewrites/removals target the correct job
- **Editable suggestions:** Before and After (and “Add to Resume”) are textareas; edits apply when you Approve
- **Regenerate with more context:** Textarea + “Regenerate suggestions with this context” to add details (e.g. omni-channel); API re-runs with that context
- **Additions always apply** (no 3-bullet gate); PDF still shows max 3 bullets per job via slice when rendering
- Suggestion card text color set to white for visibility on dark theme

### Preview & final edits
- **Edit final version** panel: edit Summary, Experience bullets (with Remove / + Add bullet), and Skills
- Changes apply to the version used in the preview and in the downloaded PDF without breaking layout
- **Skills field:** Uses local state + parse on blur so spaces are allowed while typing; label “Skills (comma or · separated; spaces allowed)”

### PDF formatting (Preview step)
- Layout & fonts, font families (Helvetica / Times / Courier), divider (show + color), section order, Skills in header (no label, ` | ` separator)
- Page: Multiple pages or Single page (scale to fit); font color + background color
- Bullets column-aligned; name/photo top-aligned; Reset to default

### PDF generation & preview
- `downloadResumePdf`: single-column, all format options, max 3 bullets per experience in output
- `PdfStylePreview`: mirrors PDF layout; `applyApprovedChangesClientSide` applies approved suggestions and no longer caps bullets in state (cap only in PDF/preview render)

---

## Tomorrow: Push to GitHub & work by modules

1. **Push to GitHub**
   - From project root: `git init` (if not already), `git add -A`, `git commit -m "ResumeIQ: full feature set checkpoint"`, then add remote and push.

2. **Work by modules**
   - Split `ResumeIQ.jsx` into logical modules, e.g.:
     - **API / data:** `callOpenAI`, `extractResume`, `scoreResume`, `generateSuggestions`, `extractLinkedInJob`
     - **PDF:** `downloadResumePdf`, `PdfStylePreview`, `DEFAULT_PDF_FORMAT`, `parseColor`, etc.
     - **Resume logic:** `applyApprovedChangesClientSide`, `renderWithHighlights`, `ResumeDocument`
     - **UI / steps:** Select, Analyze, Suggestions, Preview as separate components or sections
   - Keep `ResumeIQ.jsx` as the main container that imports from these modules so the app behavior stays the same.

---

## Key files

| Path | Purpose |
|------|--------|
| `src/ResumeIQ.jsx` | Main component (all logic and UI currently here) |
| `src/App.jsx` | Entry, renders `<ResumeIQ />` |
| `.env` | `VITE_OPENAI_API_KEY` (you add the value) |
| `IMPROVEMENTS.md` | Backlog (JD/resume persistence, P0 suggestions bug, cover letter, etc.) |
| `public/resume-photo.png` | Photo used in resume/PDF |

---

## Run locally

```bash
cd resumeiq && npm run dev
```

Then open the URL shown (e.g. http://localhost:5173).

---

*Checkpoint only. All edits are already in the codebase.*
