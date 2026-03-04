# ResumeIQ

AI-powered resume optimization: upload your resume, match it to real jobs (including India), get fit scores and tailored suggestions, then export a polished PDF.

## Features

- **Upload & parse** – PDF, TXT, or Markdown resume; AI extracts structure (experience, skills, summary).
- **Live job search** – LinkedIn jobs via Apify (keywords + location; India-only option, up to 150 jobs).
- **Job descriptions** – When available, full JD preview on each card (Valig scraper); otherwise “View on LinkedIn” link.
- **Analyze fit** – Score resume vs. selected job; get bullet-point suggestions (add/rewrite/remove) with Before/After.
- **Approve & edit** – Apply suggestions, edit final text, see highlights in preview.
- **Export PDF** – Download resume with layout options (fonts, colors, single/multi-page).

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/resumeiq.git
cd resumeiq
npm install
```

### 2. Environment

Copy the example env and add your keys:

```bash
cp .env.example .env
```

Edit `.env`:

| Variable | Required | Purpose |
|----------|----------|---------|
| `VITE_OPENAI_API_KEY` | Yes | OpenAI API key for resume parsing, scoring, suggestions. [Get one](https://platform.openai.com/api-keys). |
| `APIFY_TOKEN` | For job search | Apify token for LinkedIn jobs (and JDs). [Get one](https://console.apify.com/account/integrations). |
| `VITE_API_URL` | Production only | API base URL when frontend and API are on different hosts (e.g. `https://your-api.fly.dev`). |

### 3. Run locally

**Frontend + API together (recommended):**

```bash
npm run dev:all
```

- App: http://localhost:5173 (or next free port)
- API: http://localhost:3001

**Or run separately:**

```bash
# Terminal 1 – API
npm run server

# Terminal 2 – Frontend
npm run dev
```

Set `VITE_API_URL=http://localhost:3001` in `.env` if the app runs on a different port than the API.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server (frontend only). |
| `npm run dev:all` | Start frontend + API with one command. |
| `npm run server` | Start API only (port 3001). |
| `npm run build` | Build frontend for production (`dist/`). |
| `npm run preview` | Preview production build locally. |
| `npm run lint` | Run ESLint. |

## Project layout

| Path | Purpose |
|------|---------|
| `src/ResumeIQ.jsx` | Main app component (steps, UI, API calls). |
| `src/App.jsx` | Entry; renders `<ResumeIQ />`. |
| `server/index.js` | Express API: LinkedIn job search proxy, health check. |
| `docs/LINKEDIN_JOBS_OPTIONS.md` | Notes on LinkedIn job data sources. |
| `server/README.md` | API endpoints and env for the server. |

## Going live

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for building, env vars, and hosting the frontend and API (e.g. Vercel + Railway/Render).

## License

Private / unlicensed unless you add a LICENSE file.
