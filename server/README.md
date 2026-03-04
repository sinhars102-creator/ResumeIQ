# ResumeIQ API server

Proxies **LinkedIn job search** so API keys (Apify or RapidAPI) stay on the server.

## Run

```bash
# From project root
npm run server
```

Runs on **http://localhost:3001**. The Vite dev server proxies `/api` to this port when you run `npm run dev`.

## Run app + server together

```bash
npm run dev:all
```

Starts both Vite (frontend) and the API server.

## Setup

Use **APIFY_TOKEN** (recommended; get token: https://console.apify.com/account/integrations; actor: https://apify.com/practicaltools/linkedin-jobs). Or 1. Subscribe to **[LinkedIn Job Search API](https://rapidapi.com/fantastic-jobs-fantastic-jobs-default/api/linkedin-job-search-api)** (by fantastic-jobs).  
   **Note:** This is not the “Real-Time LinkedIn Scraper API”; that one has discontinued job search. Use the link above.
2. Add your key to the project root `.env`:
   ```
   APIFY_TOKEN=your_apify_token_here
   ```
   **Optional:** `RAPIDAPI_KEY=...` for fallback. Server tries Apify first. If neither is set, job search returns 503.

## Endpoints

- `GET /api/linkedin-jobs?keywords=...&location=...&limit=25&offset=0` – returns `{ jobs: [...] }` in ResumeIQ job shape. With Apify, when descriptions are requested the server uses [valig/linkedin-jobs-scraper](https://apify.com/valig/linkedin-jobs-scraper) first (returns jobs **with full JDs** in one call). If that fails, it falls back to practicaltools (jobs without JDs). Add `&fetchDescriptions=0` to skip and use practicaltools only (faster, no JDs).
- `GET /api/health` – returns `{ ok: true, linkedinConfigured, apify, rapidapi }`.

## Troubleshooting (jobs not loading)

1. **Key not used** – Put `RAPIDAPI_KEY=your_key` in the **project root** `.env` (same folder as `package.json`), not in `server/.env`. Restart the server after changing `.env`.
2. **401 / invalid key** – In RapidAPI, open the LinkedIn Job Search API page → **App** tab. Copy the **X-RapidAPI-Key** value and set it as `RAPIDAPI_KEY` in `.env`. Ensure you’re on a plan that allows requests (e.g. free tier may have limits).
3. **200 but no jobs** – The API may use different parameter names or response shape. Check the **Params** and **Headers** in the [RapidAPI playground](https://rapidapi.com/fantastic-jobs-fantastic-jobs-default/api/linkedin-job-search-api/playground) and compare with what the server sends. The server logs a warning with the response’s top-level keys when it gets 200 but finds no job list; use that to adapt `server/index.js` (e.g. correct param names or `normalizeJob` / extraction path).
4. **CORS / wrong URL** – Use the app via the Vite dev server (`npm run dev` or `npm run dev:all`) so `/api` is proxied to the backend. Don’t call a different origin from the frontend.
