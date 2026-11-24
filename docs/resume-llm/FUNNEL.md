# Resume LLM funnel events (module M7)

Events go to PostHog through `track()` in `src/analytics.js`. They carry counts and categories only, never resume text or contact details.
Build the funnel in PostHog with these steps, in order (conversion between each step shows where people drop off):

| # | Step | Event | Where |
|---|---|---|---|
| 1 | Opened the editor | `rllm_opened` | `ResumeLLM.jsx` |
| 2 | Started an upload or paste | `rllm_upload_started` (pasted, type) | `readResume` |
| 3 | Resume read | `rllm_resume_read` (seconds, pasted) | `readResume` |
| 3x | Read failed | `rllm_resume_read_failed` | `readResume` |
| 3y | Read check flagged lost details | `rllm_read_check_flagged` (counts) | `readResume` (M2) |
| 4 | Sign-in shown | `signin_wall_shown` | `readResume` |
| 5 | Signed in | `rllm_signed_in` | `onSignedIn` |
| 6 | Chose a goal | `rllm_review` (Improve) or `rllm_tailor_chosen` (Tailor) | `ResumeLLM.jsx` |
| 7 | Reviewed suggestions | `suggestion_opened`, `suggestion_applied`, `suggestion_dismissed`, `suggestion_edited`, `rllm_chat_sent` | workspace and chat |
| 8 | Clicked Download | `rllm_download_clicked` or `tailor_finished` | `ResumeLLM.jsx` |
| 9 | Saw the paywall | `rllm_paywall_shown` | `DownloadPaywall.jsx` (M5) |
| 10 | Tapped Pay | `rllm_pay_clicked` (plan) | `DownloadPaywall.jsx` |
| 10x | Cancelled or failed | `rllm_pay_cancelled`, `rllm_pay_failed` | `DownloadPaywall.jsx` |
| 11 | Paid | `rllm_paid` (plan) | `DownloadPaywall.jsx` |
| 12 | PDF downloaded | `rllm_downloaded` (applied, score) and `rllm_downloaded_counted` (plan) | `ResumeLLM.jsx`, `DownloadPaywall.jsx` |

`rllm_download_ready` (plan) fires when someone who already paid opens the download dialog.
Suggested funnel to save in PostHog: 1 -> 2 -> 3 -> 5 -> 6 -> 8 -> 9 -> 10 -> 11 -> 12.
