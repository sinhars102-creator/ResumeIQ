# Pulling Jobs from LinkedIn – Options

Ways to get LinkedIn job data into ResumeIQ: official API, unofficial/guest API, or third-party APIs.

---

## 1. Official LinkedIn Job Posting API

- **What it is:** [LinkedIn Job Posting API](https://learn.microsoft.com/en-us/linkedin/talent/job-postings/api/overview) (Microsoft Learn) for posting and managing jobs.
- **Catch:** For **posting** jobs (ATS/employers). **Not** for searching or pulling public job listings for end users.
- **Access:** Requires LinkedIn Talent Solutions Partner approval; they are **not accepting new partnerships** for this API. New requests go to "Apply Connect" instead.
- **Verdict:** Not suitable for “pull job from LinkedIn” in ResumeIQ.

---

## 2. Unofficial LinkedIn “Guest” Job Search API

- **What it is:** LinkedIn’s own guest (unauthenticated) endpoint used by their jobs search page.
- **Endpoint (documented in community):**  
  `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search`
- **Query parameters (examples):**
  - `keywords` – search term (e.g. "Product Manager")
  - `location` – country/region (e.g. "United States")
  - `start` – pagination offset (0, 25, 50, …)
  - `f_E` – experience (1–6: Intern, Entry, Mid-Senior, etc.)
  - `f_JT` – job type (F=Full-time, P=Part-time, C=Contract, etc.)
  - `f_WT` – work type (1=On-site, 2=Remote, 3=Hybrid)
  - `f_TPR` – time posted (e.g. `r86400` = 24h, `r604800` = week)
- **Pros:** No API key; same data as LinkedIn’s job search.
- **Cons:** Unofficial, no SLA; can change or break anytime; CORS/rate limits when called from browser; may need a small backend proxy to avoid CORS and to control rate.
- **Verdict:** Possible for a “search LinkedIn jobs” feature if you accept unofficial/breakable and add a proxy if needed.

---

## 3. Third-Party APIs (LinkedIn job search / scrape)

### RapidAPI – LinkedIn Job Search APIs

- **LinkedIn Job Search API** (e.g. [linkedin-job-search-api](https://rapidapi.com/fantastic-jobs-fantastic-jobs-default/api/linkedin-job-search-api)):
  - Host: `linkedin-job-search-api.p.rapidapi.com`
  - Endpoint example: search active jobs with `limit`, `offset`, optional filters.
  - Auth: RapidAPI key (subscription on RapidAPI).
- **Other RapidAPI “LinkedIn” APIs:** Various scrapers/search APIs; check RapidAPI for “LinkedIn jobs” and compare pricing and rate limits.

### Apify – LinkedIn Jobs Scraper

- **Product:** [LinkedIn Jobs Scraper](https://apify.com/practicaltools/linkedin-jobs) (e.g. “practicaltools/linkedin-jobs”).
- **Pricing:** Roughly from ~$0.70 per 1,000 jobs (pay-as-you-go).
- **Output (dataset items):** `jobId`, `title`, `company`, `location`, `datePosted`, `url`, `labels`, `logo`, `extractedAt`, `source`, `discoveredAt`. **No `description` field** in the list output — the actor does not return full job descriptions in the default response.
- **Workaround:** ResumeIQ adds a “View full JD on LinkedIn →” link on each fetched job card using `url`; users open the listing on LinkedIn to read the full JD.
- **Pros:** Built for job scraping; no cookies in your app; scalable.
- **Cons:** Cost and Apify account setup; no in-app JD unless you use another actor or paste JDs.

### SerpAPI – LinkedIn Search

- **Product:** [LinkedIn Public Search Results API](https://serpapi.com/linkedin-search).
- **Note:** Search results may be disabled or waitlisted for scalability; confirm on their site.
- **Use case:** More for profile/search results; less clearly “jobs-only” than Apify/RapidAPI job endpoints.

---

## 4. Recommendation for ResumeIQ

| Approach | Best for | Effort | Cost |
|----------|----------|--------|------|
| **Unofficial guest API** | Quick “search LinkedIn jobs” in-app | Medium (may need backend proxy for CORS) | Free |
| **RapidAPI LinkedIn Job Search** | Stable, documented, fast to integrate | Low | Subscription (see RapidAPI) |
| **Apify LinkedIn Jobs Scraper** | Large volume, full job details | Low–medium | Pay per use |
| **Official LinkedIn API** | Not applicable for pulling jobs | N/A | N/A |

- **Short term:** Implement “paste JD” (current flow) and optionally add **RapidAPI LinkedIn Job Search** (or one guest-API-based “Search LinkedIn” if you add a small proxy).
- **Later:** If you need more volume or robustness, add **Apify** or another dedicated job API and switch/combine behind a single “LinkedIn jobs” feature in the app.

---

## 5. Implementation notes (if you add “Pull from LinkedIn”)

- **Env:** Store third-party API keys in `.env` (e.g. `VITE_RAPIDAPI_KEY` or backend-only key).
- **Backend proxy (recommended for guest API or to hide keys):** Small Node/Express (or Vite server) endpoint that calls LinkedIn or third-party API and returns JSON; frontend calls your proxy. Keeps CORS and keys off the client.
- **Data shape:** Map API response to your existing job shape (e.g. `company`, `role`, `location`, `jd`, `id`, `source: "linkedin"`) so the rest of ResumeIQ (analyze, suggestions, etc.) stays unchanged.

---

*References: [LinkedIn Job Posting API (Microsoft)](https://learn.microsoft.com/en-us/linkedin/talent/job-postings/api/overview), [Guest API params (community)](https://gist.github.com/Diegiwg/51c22fa7ec9d92ed9b5d1f537b9e1107), [RapidAPI LinkedIn Job Search](https://rapidapi.com/fantastic-jobs-fantastic-jobs-default/api/linkedin-job-search-api), [Apify LinkedIn Jobs](https://apify.com/practicaltools/linkedin-jobs).*
