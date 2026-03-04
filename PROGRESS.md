# ResumeIQ – Progress summary

**Last updated:** March 2025  
**Status:** Ready for git sync and going live.

---

## What’s done

### Core app

- Single-file React app (Vite): `src/ResumeIQ.jsx`, `src/App.jsx`
- Steps: Upload → Parsing → Job Matches → Analyze → Suggestions → Preview
- OpenAI API (GPT-4) for extraction, scoring, suggestions; env: `VITE_OPENAI_API_KEY`
- Resume: paste or upload PDF/TXT/MD; AI parses to structured JSON
- Before/After preview with approved suggestions and green highlights
- Download PDF from Preview step with layout options

### Job search (LinkedIn)

- **Search LinkedIn** panel on Job Matches: keywords, location, **India only** checkbox, limit 50/100/150
- Default location: **India**; optional worldwide
- API server (`server/index.js`): proxies job search so API keys stay server-side
- **Apify:** Tries **Valig** first (jobs + full JDs in one call); fallback **practicaltools** (jobs only, no JDs)
- Job cards show **JD preview** (first ~280 chars) when available; “View full JD on LinkedIn” link when we have URL
- Normalizer supports both actors’ shapes; practicaltools list returns `jobId`, `title`, `company`, `location`, `url`, etc.

### Suggestions & PDF

- Suggestions for all work experiences; experienceIndex; editable Before/After; regenerate with context
- Edit final version (summary, bullets, skills); PDF and preview stay in sync
- PDF: layout, fonts, colors, single/multi-page

### Docs and deploy

- **README.md** – Overview, quick start, env, scripts, project layout
- **DEPLOYMENT.md** – Build, env vars, hosting frontend (Vercel/Netlify/CF) and API (Railway/Render/Fly)
- **.env.example** – Template for `VITE_OPENAI_API_KEY`, `VITE_API_URL`, `APIFY_TOKEN`
- **GIT_SETUP.md** – Steps to push to GitHub
- Code ready to commit and push; no secrets in repo

---

## Key files

| Path | Purpose |
|------|---------|
| `src/ResumeIQ.jsx` | Main component (logic + UI) |
| `src/App.jsx` | Entry, renders `<ResumeIQ />` |
| `server/index.js` | Express API: LinkedIn jobs, health |
| `.env` | Keys (not committed); copy from `.env.example` |
| `docs/LINKEDIN_JOBS_OPTIONS.md` | LinkedIn data sources |
| `server/README.md` | API endpoints and setup |

---

## Run locally

```bash
cd resumeiq
npm install
cp .env.example .env   # then add your keys
npm run dev:all
```

Open the URL shown (e.g. http://localhost:5173). API at http://localhost:3001.

---

## Git and launch

1. **Sync with git:** `git add -A`, `git status`, `git commit -m "ResumeIQ: ready for launch – jobs, India, JDs, deploy docs"`, then push.
2. **Go live:** Follow [DEPLOYMENT.md](./DEPLOYMENT.md) to build, set env, and deploy frontend + API.
