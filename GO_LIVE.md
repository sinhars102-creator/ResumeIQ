# ResumeIQ – Step-by-step: Make it live

You will use **two platforms**: **Render** (for the API) and **Vercel** (for the website). Do them in this order.

---

# Part 1: Deploy the API on Render

The API serves LinkedIn job search. It must be live first so you can paste its URL into Vercel.

## 1.1 Open Render

1. Go to **https://render.com**
2. Sign in (or sign up with **Sign in with GitHub**).
3. You should see the Render dashboard.

## 1.2 Create a new Web Service

1. Click the blue **New +** button (top right).
2. Click **Web Service**.

## 1.3 Connect your GitHub repo

1. If asked “Connect a repository”, find **sinhars102-creator/ResumeIQ** in the list.
2. If it’s not there, click **Configure account** and allow Render to access your GitHub (or the org that owns the repo).
3. Click **Connect** next to **ResumeIQ**.

## 1.4 Fill in the form

Use these values exactly:

| Field | What to enter |
|--------|----------------|
| **Name** | `resumeiq-api` (or any name you like) |
| **Region** | Choose one (e.g. **Oregon (US West)**) |
| **Branch** | `main` |
| **Root Directory** | Leave **empty** |
| **Runtime** | **Node** |
| **Build Command** | `npm install` |
| **Start Command** | `yarn start` or `npm start` |

## 1.5 Add the API key (environment variable)

1. Scroll to the **Environment** section.
2. Click **Add Environment Variable**.
3. **Key:** `APIFY_TOKEN`
4. **Value:** Paste your Apify token (from https://console.apify.com/account/integrations).
5. Leave other env vars empty unless you use RapidAPI; then add `RAPIDAPI_KEY`.

## 1.6 Deploy

1. Scroll down and click **Create Web Service**.
2. Wait for the first deploy to finish (a few minutes). The log should show “ResumeIQ API server running…”.
3. At the top of the page you’ll see **Your service is live at** with a URL like:
   - `https://resumeiq-api.onrender.com`
4. **Copy this URL** and keep it for Part 2. Do **not** add a slash at the end.

---

# Part 2: Deploy the website on Vercel

The website is the React app. It will call the API using the URL you got from Render.

## 2.1 Open Vercel

1. Go to **https://vercel.com**
2. Sign in (or sign up with **Continue with GitHub**).

## 2.2 Create a new project

1. On the dashboard, click **Add New…**.
2. Click **Project**.

## 2.3 Import your repo

1. Find **sinhars102-creator/ResumeIQ** in the list (or search for “ResumeIQ”).
2. Click **Import** next to it.

## 2.4 Configure build (usually auto-filled)

Check these; Vercel often detects them for Vite:

| Field | Value |
|--------|--------|
| **Framework Preset** | Vite |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |
| **Install Command** | `npm install` (default) |

Leave **Root Directory** empty.

## 2.5 Add environment variables (important)

Before clicking Deploy:

1. Expand **Environment Variables**.
2. Add **two** variables:

**Variable 1**

- **Name:** `VITE_OPENAI_API_KEY`
- **Value:** Your OpenAI API key (from https://platform.openai.com/api-keys).
- **Environment:** leave all checked (Production, Preview, Development).

**Variable 2**

- **Name:** `VITE_API_URL`
- **Value:** The Render URL you copied in Part 1 (e.g. `https://resumeiq-api.onrender.com`). **No slash at the end.**
- **Environment:** leave all checked.

3. Click **Add** for each so both appear in the list.

## 2.6 Deploy

1. Click **Deploy**.
2. Wait for the build to finish (1–2 minutes).
3. When it’s done you’ll see **Congratulations!** and a link like:
   - `https://resumeiq-xxxx.vercel.app`
4. Click **Visit** (or open that URL). That is your **live app**.

---

# Part 3: You’re live

- **Your website (share this):** the Vercel URL (e.g. `https://resumeiq-xxxx.vercel.app`).
- **API (used by the app):** the Render URL; you don’t need to share it.

Users can open the Vercel link, upload a resume, search jobs (India/worldwide), get suggestions, and download PDF.

---

# Quick checklist

- [ ] Render: Web Service created, **Build** = `npm install`, **Start** = `yarn start` or `npm start`, **APIFY_TOKEN** set.
- [ ] Render: Service is live and you copied the URL (no trailing slash).
- [ ] Vercel: Project imported, **VITE_OPENAI_API_KEY** and **VITE_API_URL** (Render URL) set.
- [ ] Vercel: Deploy succeeded and you opened the Vercel URL.

---

# If something goes wrong

| Problem | What to check |
|--------|----------------|
| Render deploy fails | Build command must be `npm install`, start command `yarn start` or `npm start`. Check the **Logs** tab. |
| “Could not reach the server” when searching jobs | In Vercel, **Settings → Environment Variables**: `VITE_API_URL` must be exactly the Render URL (https, no trailing slash). Then **Redeploy** the project. |
| Job search returns no jobs / error | In Render, **Environment**: `APIFY_TOKEN` must be set. Redeploy the service after adding it. |
| OpenAI errors (extract resume, suggestions) | In Vercel, `VITE_OPENAI_API_KEY` must be set. Redeploy after adding it. |
| **"Resume parsing is temporarily unavailable"** (users see this) | Add **VITE_OPENAI_API_KEY** in Vercel → Settings → Environment Variables, then **Redeploy** (Deployments → ⋮ → Redeploy). Key is baked in at build time. |
| First job search very slow (30–60 s) | On Render’s free tier the API sleeps after ~15 min idle; the first request wakes it. Later requests are fast. |
