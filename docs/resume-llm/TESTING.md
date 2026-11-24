# Resume LLM: what to test

Start the app: `cd sidebar-event && npm run dev:all`, then open http://localhost:5173/app/editor (use the pencil "New chat" button first so old saved chats don't interfere).
Before testing payments and saving, run the three SQL files in `supabase/migrations/` that start with 20261125 in the Supabase SQL editor (one for saved chats, one for downloads).
Test on a real phone too: the same Wi-Fi, open `http://<your Mac's IP>:5173/app/editor` (`npm run dev -- --host`).

Each row names the module that owns it, so a failure points to one place (see MODULES.md).

## 1. Reading a resume (M2)
| Try | Expect |
|---|---|
| Upload a normal text PDF | "Got it, <name> · N roles · N skills", then sign-in card |
| Upload a two-column or designed PDF | Either a clean read, or a "Heads-up: I may have missed ..." message naming what looks lost |
| Paste resume text | Same as upload |
| Upload a scanned PDF (image only) | A clear "couldn't read" message with "paste the text instead" |
| Compare the left resume with your file | No missing roles, dates, emails, phone, links |

## 2. Sign-in and saving (M3)
| Try | Expect |
|---|---|
| Sign in with your email code in the chat | Chat continues; no page reload |
| Apply a few edits, close the tab, reopen on another browser or phone and sign in | Your chat and edited resume come back |
| Make edits on the phone, then open on the laptop | The newer copy of each chat wins |

## 3. Improve and Tailor (existing, plus M6 model routing)
| Try | Expect |
|---|---|
| Improve my resume | Strength score by category; suggestions linked to numbered pins |
| Tailor it to a job (paste a JD) | Suggestions tied to resume lines; blanks `[number]` where figures are missing |
| Chat: "remove the second bullet", "change my city to Bangalore" | The change happens on that line; Undo works |
| Try to make the AI invent a number or tool | It asks you instead of writing it in |
| Check AI cost: `curl -H "x-admin-key: <ADMIN_KEY>" http://localhost:3001/api/llm/spend` | Calls, tokens and dollars per task and model (needs ADMIN_KEY set when starting the server) |

## 4. Download and paywall (M1, M4, M5)
Use Razorpay test keys for these. To bypass the paywall for other testing, start the server with `DOWNLOADS_FREE=1`.
| Try | Expect |
|---|---|
| Tap Download PDF with nothing bought | Paywall: 1 download ₹79, 10 downloads ₹399, Unlimited ₹799 |
| Pay for 1 download (Razorpay test card/UPI) | "Download PDF" button appears; the PDF saves; dialog says it was saved |
| Tap Download again straight after | Same dialog, no extra download used |
| Close, tap Download PDF again | Paywall returns (the single download was used) |
| Pay for 10 downloads | Dialog shows "10 downloads left", then 9, 8 ... after each completed download |
| Pay for Unlimited | "Unlimited downloads until <date>" |
| Cancel the Razorpay window | Back to the plans, nothing charged or counted |
| A resume with 15+ bullets in one role | All bullets in the PDF; extra pages as needed |
| Check the table `download_entitlements` in Supabase | One row per purchase with downloads_used counting up |

## 4b. Templates (M10)
| Try | Expect |
|---|---|
| Tap Download PDF | The first step is "Choose a template": Modern, Classic, Compact, each with its page count |
| Switch between the three | The preview shows your own resume in that look, all pages, scrollable |
| Read the line above the preview | "Everything on your resume is in this PDF (N items checked)" |
| Use a resume with Projects, Achievements, Languages or other sections | They appear on the on-screen resume and in every template's PDF |
| Continue, pay (or already paid), download | The PDF uses the template you chose; open it and compare with the preview |
| Tap "Change template" after choosing | Back to the gallery without losing your place |
| Download again later | Your last template is selected by default |
| A very long resume (15+ bullets) | Extra pages in every template; nothing cut |

## 5. Limits (M8)
| Try | Expect |
|---|---|
| Open the tailor chat while signed out (clear site data) | You are asked to sign in |
| Many quick requests from one account (over about 120 in 10 minutes) | A "going a little fast" message with a wait time |

## 6. Tracking (M7)
Open PostHog and check the events in FUNNEL.md arrive in order for one test run, with no resume text in any event.

## Known gaps (not bugs: left out of the lean MVP on purpose)
- The PDF is made in the browser, so a technically skilled user could skip the paywall. Counting is server-side, but the file itself is not locked. A server-made PDF is the fix when it matters.
- Scanned (image) resumes are not read; there is no OCR yet.
- Groq's free tier is slow and rate limited under real traffic; a paid plan (or `LLM_WRITE_*` pointing at another model) is needed before launch.
- Real email-code sign-in and real-phone use were not tested by me.
- Prompt-injection tests and the legal review of the privacy and training-consent wording are still to do.
