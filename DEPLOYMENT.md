# ResumeIQ – Going live

This guide covers building the app and deploying the **frontend** and **API** so the platform is available on the internet.

## Architecture

- **Frontend** – Vite/React SPA. Built to static files (`dist/`). Needs to know the API URL at **build time**.
- **API** – Node/Express server (`server/index.js`). Serves `/api/linkedin-jobs` and `/api/health`. Reads `APIFY_TOKEN` (and optional `RAPIDAPI_KEY`) from the environment.

For production you typically:

1. Deploy the **API** to a Node host (Railway, Render, Fly.io, etc.).
2. Deploy the **frontend** to a static host (Vercel, Netlify, Cloudflare Pages).
3. Set **VITE_API_URL** to your API base URL when building the frontend.

---

## 1. Build the frontend

From the project root:

```bash
npm install
npm run build
```

**Required at build time** (so they are baked into the client):

- `VITE_OPENAI_API_KEY` – OpenAI key (used by the frontend for extraction, scoring, suggestions).
- `VITE_API_URL` – Full base URL of your deployed API (e.g. `https://resumeiq-api.fly.dev`). No trailing slash.

Example:

```bash
VITE_OPENAI_API_KEY=sk-proj-... VITE_API_URL=https://your-api.example.com npm run build
```

Output is in `dist/`. Serve that folder as a static site (no Node needed).

---

## 2. Deploy the API

The API is a plain Node/Express app. It needs:

- **Node** (e.g. 18+)
- **Env:** `APIFY_TOKEN` (for LinkedIn jobs; optional `RAPIDAPI_KEY` for fallback). No need to expose OpenAI key here; the frontend uses its own.

### Option A: Railway

1. Create a new project; connect your repo or upload code.
2. Set **Root Directory** to the repo root (or leave default).
3. **Start command:** `node server/index.js` (or `npm run server`).
4. **Env:** Add `APIFY_TOKEN`, optionally `RAPIDAPI_KEY`. Set `PORT` if Railway provides it.
5. Deploy. Note the public URL (e.g. `https://resumeiq-production.up.railway.app`).

### Option B: Render

1. New **Web Service**; connect repo.
2. **Build:** `npm install`
3. **Start:** `node server/index.js` or `npm run server`
4. Add env: `APIFY_TOKEN`, `RAPIDAPI_KEY` (optional). Render sets `PORT`.
5. Deploy and copy the service URL.

### Option C: Fly.io

1. In repo root: `fly launch` (or create `fly.toml`).
2. Set **env** in `fly.toml` or dashboard: `APIFY_TOKEN`, etc.
3. Ensure start command runs `node server/index.js`.
4. `fly deploy`; use the app URL (e.g. `https://resumeiq-api.fly.dev`) as `VITE_API_URL`.

---

## 3. Deploy the frontend

Use the **same** `VITE_API_URL` as your deployed API.

### Option A: Vercel

1. Import the repo; framework preset **Vite**.
2. **Build command:** `npm run build` (or leave default).
3. **Environment variables** (in Vercel dashboard):
   - `VITE_OPENAI_API_KEY` = your OpenAI key
   - `VITE_API_URL` = `https://your-api-url` (Railway/Render/Fly URL from step 2)
4. Deploy. Vercel will run the build with these env vars and serve `dist/`.

### Option B: Netlify

1. New site from repo; build command `npm run build`; publish directory `dist`.
2. In **Site settings → Environment**, add `VITE_OPENAI_API_KEY` and `VITE_API_URL`.
3. Deploy.

### Option C: Cloudflare Pages

1. Connect repo; framework **Vite**; build command `npm run build`; output `dist`.
2. Add env vars in **Settings → Environment variables** (for Production): `VITE_OPENAI_API_KEY`, `VITE_API_URL`.
3. Deploy.

---

## 4. Checklist before launch

- [ ] API deployed and `/api/health` returns `{ "ok": true }`.
- [ ] Frontend built with correct `VITE_API_URL` (no trailing slash).
- [ ] `VITE_OPENAI_API_KEY` set only in the **frontend** build env (not in API env).
- [ ] `APIFY_TOKEN` set only on the **API** server (never in frontend).
- [ ] CORS: API uses `cors({ origin: true })`; if you restrict origins, add your frontend URL.
- [ ] No `.env` or secrets committed; `.gitignore` includes `.env`, `node_modules`, `dist`.

---

## 5. After going live

- Share the frontend URL (e.g. `https://resumeiq.vercel.app`).
- Users get jobs and JDs (when Valig returns them) and can analyze, edit, and download PDF.
- Monitor API logs for Apify/OpenAI errors; rotate keys if needed.
