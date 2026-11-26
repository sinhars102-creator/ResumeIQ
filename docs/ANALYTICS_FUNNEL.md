# ResumeIQ funnel: what is tracked at each step

Events go to PostHog (`src/analytics.js`). Every event carries the channel and campaign (UTM, ad click id) and an `is_internal` flag, so filter
`is_internal = false`. Events hold counts, scores and categories only, never resume or message text.

**Consent.** On the live site, before a visitor chooses in the cookie notice, events are still sent but with no cookies, nothing stored on the
device and no session recording (each visit is an anonymous visitor). After "Accept": cookies, returning-visitor recognition, masked session
recordings, and Google Ads / LinkedIn / Clarity. After "Decline" or "Cookie settings" withdrawal: back to the cookieless mode.
When a person signs in, events are linked to their account ID, so one journey can be followed across sessions.

## The funnel, in order

| # | Step | Event | Notes |
|---|---|---|---|
| 1 | Ad click, page opens | `$pageview`, `rllm_opened` | `path`; channel and campaign on every event |
| 2 | Cookie choice | `cookie_choice` | `accepted` |
| 3 | Starts adding a resume | `rllm_upload_started` | `pasted`, `type`; `sample_resume_used` for the sample |
| 4 | Resume read | `rllm_resume_read` / `rllm_resume_read_failed` | `seconds`; `rllm_read_check_flagged` if something looked lost |
| 5 | Sign-in wall | `signin_wall_shown` → `signin_email_submitted` → `signin_code_sent` → `signin_code_entered` → `signin_completed` | Google Ads "Sign up" conversion fires on a new account |
| 6 | Chooses tailor or improve | `rllm_tailor_chosen`, `rllm_review` | |
| 7 | Job description in, suggestions ready | `rllm_suggestions` | `count`, `must`, `questions`, `seconds`, `score` |
| 8 | Review screen shown | `tailor_viewed` | `layout` (mobile or desktop) |
| 9 | Works through suggestions | `suggestion_opened` (`source`: resume, nav, advance), `suggestion_applied`, `suggestion_dismissed`, `suggestion_edited`, `suggestion_undone`, `apply_all_clicked` | |
| 10 | Redesign interactions | `ws_hotkey_used`, `ws_filter_changed`, `ws_scope_cleared`, `ws_sheet_snap` (phone), `ws_receipt_viewed`, `ws_receipt_apply_all`, `ws_receipt_undo`, `ws_all_decided` | |
| 11 | Chats and edits by hand | `rllm_chat_sent` (`scoped`, `whole`), `resume_edited_manually` (`op`, `target`), `resume_undo`, `resume_redo` | |
| 12 | Opens Design and download | `rllm_download_clicked` | |
| 13 | Picks a template | `rllm_template_chosen` | `template`, `customised` |
| 14 | Sees the paywall | `rllm_paywall_shown` | |
| 15 | Picks a plan | `rllm_plan_selected` | `plan`, `price` |
| 16 | Starts payment | `rllm_pay_clicked` | `plan`, `price` |
| 17 | Payment result | `rllm_paid` (`value`, `currency`) / `rllm_pay_cancelled` / `rllm_pay_failed` | Google Ads "Purchase" conversion fires on `rllm_paid` once its label is set |
| 18 | PDF delivered | `rllm_downloaded_counted` | **Revenue funnel end** |
| 19 | PDF failed (refund case) | `rllm_download_failed` | `stage`; each of these is a person owed a refund |
| – | Errors | `ai_error`, `rllm_resume_read_failed`, `editor_open_failed` | |

## Where the truth lives besides PostHog
- **Money:** the Razorpay dashboard, and the `download_entitlements` and download-log tables in Supabase (the server writes them, so they cannot be blocked by an ad blocker).
- **Sign-ups:** Supabase `auth.users`, and `user_attribution` (first channel and campaign).
- **AI spend:** server logs (`[llm-spend]`) and the `LLM_ALERT_WEBHOOK` alert.

## Funnel to build in PostHog
Insight type "Funnel", filter `is_internal = false`, break down by `utm_source` / channel:
`rllm_opened` → `rllm_upload_started` → `rllm_resume_read` → `signin_completed` → `rllm_suggestions` → `suggestion_applied` → `rllm_download_clicked` → `rllm_paywall_shown` → `rllm_pay_clicked` → `rllm_paid` → `rllm_downloaded_counted`.
Add a second insight: count of `rllm_download_failed` per day (should be near zero) and `rllm_paid` minus `rllm_downloaded_counted` (paid but not yet downloaded).
