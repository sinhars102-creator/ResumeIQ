# ResumeIQ: go-live checklist

How it runs today: one **Vercel** project serves the website (`dist/`) and the API (`api/index.js` → `server/index.js`, same origin, `/api/*`).
Database, sign-in and files are **Supabase**. AI is **Groq** and **Anthropic**. Payments are **Razorpay**. Analytics is **PostHog**.
(The old Render setup in `render.yaml` and `DEPLOYMENT.md` is not how the live site runs; do not follow it.)

## 1. Before anything goes to production
- [ ] Commit the work (nothing is committed yet), review the diff, merge to `main`.
- [ ] Run `npm test` (all must pass) and `npm run build`.
- [ ] Confirm no secret is in the repo or in any `VITE_` variable. Only these may be public: `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_RAZORPAY_KEY_ID`, `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`. **Never** put an AI key in a `VITE_` variable (it ships to every visitor's browser). If `VITE_OPENAI_API_KEY` or `VITE_ANTHROPIC_API_KEY` exists in Vercel, delete it and rotate that key.

## 2. Vercel environment variables (Production)
| Variable | Needed for |
|---|---|
| `GROQ_API_KEY`, `ANTHROPIC_API_KEY` (and `LLM_PROVIDER` / model overrides if used) | the assistant (server only) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | database and files (server only, never public) |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | sign-in in the browser |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` (**live** keys), `VITE_RAZORPAY_KEY_ID` (live key id) | payments |
| `RAZORPAY_WEBHOOK_SECRET` | confirms payments even when the customer closes the tab |
| `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST` | analytics |
| `LLM_DAILY_ALERT_USD`, `LLM_ALERT_WEBHOOK` | a Slack or Discord alert when a day's AI spend passes the limit |
| `DOWNLOADS_FREE` | **must be unset**: setting it makes downloads free |
| `VITE_API_URL` | leave empty (same origin) |

## 3. Supabase
- [ ] Apply every file in `supabase/migrations/` (14 files; the newest are `rllm_state` and `download_entitlements`).
- [ ] Authentication → SMTP: set a **custom email sender** on your own domain (the built-in sender allows only a few emails per hour, so ad traffic would be locked out of sign-in). Add SPF, DKIM and DMARC for the sending domain, and test a code arriving in Gmail and Outlook inboxes (not spam).
- [ ] Authentication → URL configuration: site URL `https://www.myresumeiq.io`.
- [ ] Row-level security is on for every table that holds user data.

## 4. Razorpay (live payments)
The account that takes the money is the one whose **live** keys you put in Vercel. It must show "Activated" and let you switch the dashboard from Test to Live.
1. Razorpay dashboard → switch to **Live** → Account & Settings → API Keys → Generate key. Copy the Key Id (`rzp_live_…`) and the Key Secret (shown once).
2. In Vercel, set `RAZORPAY_KEY_ID` and `VITE_RAZORPAY_KEY_ID` (the same `rzp_live_…` id) and `RAZORPAY_KEY_SECRET`. Do not paste the secret anywhere else (not in chat, not in the repo).
3. **Webhook** (so a payment still counts if the customer closes the tab): Dashboard → Settings → Webhooks → Add. URL `https://www.myresumeiq.io/api/razorpay-webhook`, events **payment.captured** and **order.paid**, and a secret you invent (a long random string). Put that same string in Vercel as `RAZORPAY_WEBHOOK_SECRET`. Redeploy after changing variables.
4. Test the webhook: in the webhook's page use "Send test webhook" (expect HTTP 200), then make the real ₹79 payment below and check the Vercel logs show `[payments] webhook: granted`.
5. **One real test:** pay ₹79 with your own card or UPI, confirm the download works and the plan shows, then refund it from the dashboard.
6. After going live, the Test-mode keys must not remain in Vercel Production.

## 4b. Tax
- ResumeIQ is an individual business and is not GST-registered (the Terms say so). Keep track of yearly turnover: GST registration becomes compulsory once it passes the threshold (₹20 lakh for most states), and from that point the prices and the Terms need to change. Confirm the exact threshold and any other rules with your CA.

## 5. AI cost protection
- [ ] Set a **hard monthly spend limit** in the Groq and Anthropic consoles (the in-app limiter only slows abuse and counts per server instance).
- [ ] Set `LLM_ALERT_WEBHOOK` and check an alert arrives.

## 6. Domain and site
- [ ] `https://www.myresumeiq.io` serves the site over HTTPS, the bare domain redirects to `www`.
- [ ] Open `/`, `/privacy`, `/terms`, `/refund`, `/contact`, `/robots.txt`, `/sitemap.xml`, `/favicon.svg`, and a made-up address (shows the 404 page).
- [ ] Share the home link in WhatsApp/LinkedIn and check the preview image and title.
- [ ] `rahul@myresumeiq.io` receives mail (it is the support, refund and privacy address).

## 7. Google Ads (your account)
- [ ] Advertiser verification completed (legal name, country, payment profile).
- [ ] Billing set up.
- [ ] Create the **Purchase** conversion (value in INR), paste its label into `PURCHASE_LABEL` in `src/googleAds.js`, and redeploy. Until then no purchase conversion is sent.
- [ ] Check with Google Tag Assistant on the live site: the tag fires, consent mode shows denied until Accept, then granted.
- [ ] Ad text matches the page: say "free to edit, PDF from ₹79", never "free resume download". Do not promise jobs or interviews.
- [ ] Final URL is `https://www.myresumeiq.io/` (or `/app/editor`; both open the same editor).

## 8. After launch (first 48 hours)
- [ ] Build the PostHog funnel in `docs/ANALYTICS_FUNNEL.md`.
- [ ] Watch `rllm_download_failed` and `rllm_paid` minus `rllm_downloaded_counted`: each gap is a refund owed. Answer refund emails within 2 working days (the policy promises it).
- [ ] Check the AI spend alert and the Razorpay dashboard daily.

## Known gaps accepted for launch
Open bugs BUG-013 (download dialog focus trap), BUG-015, BUG-016, BUG-017, BUG-023; non-Latin text is not drawn in the PDF (the app warns); the "ResumeIQ" footer on the PDF; no error-monitoring service yet.
