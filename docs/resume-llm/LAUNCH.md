# Resume LLM: going live

Nothing here has been done yet. The branch `resume-llm` is not merged and nothing is deployed.

## Before the merge
1. Test everything in TESTING.md on a laptop and a real phone.
2. Run these in the Supabase SQL editor (production project): `20261125000000_rllm_state.sql` and `20261125010000_download_entitlements.sql`. Each is safe to run twice.
3. Paid model plan: choose a provider and plan (see SCALE_PLAN.md section 7), put the key in the production environment, and set per-task models if wanted (`LLM_WRITE_PROVIDER`, `LLM_WRITE_MODEL`, ...; see `.env.example`). Groq's free tier will not carry real traffic.
4. Razorpay: live keys in the production environment (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `VITE_RAZORPAY_KEY_ID`). Test one real payment of ₹79 and refund it.
5. Set `LLM_DAILY_ALERT_USD` (and `LLM_ALERT_WEBHOOK` for a Slack or Discord message) so a cost spike is noticed. Set `ADMIN_KEY` to see spend at `/api/llm/spend`.
6. Privacy: update the privacy page for what Resume LLM sends to model providers and stores (resume, chats, payments), keep "no training on user data yet", and get the wording reviewed.
7. Suspend the unused Render service and remove `render.yaml` (it sends a failed-deploy email on each push).

## The merge (safe: the launch switch is off)
Merge `resume-llm` into `main` and deploy. With `VITE_RESUME_LLM` unset, `/app/editor` still opens the earlier sign-in-first editor, so ad traffic is unchanged. Resume LLM is reachable at `/app/resume-llm` on the live site: do a last check there with real accounts.

## The switch
1. In Vercel set `VITE_RESUME_LLM=1` (production) and redeploy.
2. `/app/editor` (the home page "Edit my resume" button and the editor ads) now opens Resume LLM.
3. Point the editor-keyword Google Ads final URLs at `/app/editor` if they are not already.
4. Watch the funnel (FUNNEL.md), the AI spend, and payments for the first day.

## Switching back
Remove `VITE_RESUME_LLM` and redeploy: `/app/editor` returns to the earlier editor. Paid downloads already bought stay in the database.

## Turning the paywall off
Set `DOWNLOADS_FREE=1` on the server (and restart): downloads are free and not counted. Remove it to charge again.

## After launch: watch
- Paid conversion per step (the funnel). Break-even for the ₹79 plan needs about 3% of sessions to pay with the cheapest model setup (SCALE_PLAN.md section 11).
- Daily AI spend against the alert level.
- Read-check flags (`rllm_read_check_flagged`) and read failures: they say how often files are misread, and whether better ingestion or OCR is worth building next.
