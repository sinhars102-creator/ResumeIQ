# ResumeIQ – epics and stories (to load into Linear)

Status: ✅ done · 🧪 built, waiting for your test · 🚧 in progress · ⏳ to do · ❓ needs your decision

## E1 · Extension: reliable autofill (Roadmap Phase 1)
| Story | Status |
|---|---|
| Stays signed in (reads the site's sign-in, never renews it) | ✅ |
| Clearer resume errors ("what failed, what happens instead") | ✅ |
| Autofill leads on application pages; Workday / multi-step and upload-only steps recognised, each step afresh | 🧪 |
| Upload your own resumes, pick one, see and View what was attached | 🧪 |
| Generated PDFs: ₹ → INR, special hyphens / arrows fixed | 🧪 |
| Employment section: one block per job ("Add another"), filled in order; current role handled | 🧪 |
| Greenhouse dropdowns open and fill in the extension | 🧪 |
| Resume text read in with extra spaces ("Day - 7", "analysts .") – clean it when parsing | ⏳ |
| Test checkpoint 1 – your pass through docs/TEST_CHECKPOINT_1.md | ⏳ (you) |

## E2 · Edit resume: tailor from the extension, apply with the tailored resume (Phase 2)
| Story | Status |
|---|---|
| "Improve my resume for this job" opens Tailor for that job with the profile resume | ✅ |
| Editor PDF export works locally (dev JSX fix, committed on `editor`) | ✅ (push = editor deploy, needs your OK) |
| Keep one editor resume per job – reopen it so editor edits stay; new suggestions update content, keep design | 🚧 (server done, untested) |
| Migration `20261009010000_tailored_resumes.sql` | ⏳ (you run it) |
| "Use this resume for applying" in the editor bar – saves the editor's PDF for that job – plus "Back to the job" | ⏳ |
| Extension picks the tailored resume automatically on that job's application (company match for LinkedIn → company site) | ⏳ |
| Test checkpoint 2 – job → tailor → edit → use → back → Autofill attaches it | ⏳ |

## E3 · Generate new resume (one click, wording gaps only)
| Story | Status |
|---|---|
| Decide: PDFs re-created in the closest editor template? Word files edited in place now or later? | ❓ |
| "Generate new resume" on the extension's match card – applies wording fixes, saves for that job | ⏳ |
| Real gaps are never invented – listed, with "Edit resume" offered | ⏳ |

## E4 · Tailoring assistant quality (Phase 3)
| Story | Status |
|---|---|
| Reliability: edits not dropped over the requirement label; honest "held back" messages | 🧪 |
| Stronger model (OpenAI / Claude): compare on real conversations, cost per session | ❓ |

## E5 · Going live (each needs your approval)
| Story | Status |
|---|---|
| Vercel environment variables (Supabase keys) for the live site | ⏳ |
| Worker server for Easy Apply submissions (Vercel can't run the browser) | ⏳ |
| Push the editor dev fix (`editor` branch → editor redeploy) | ⏳ |
| Merge `tailoring-assistant` → `main` (deploys site, starts daily job collection) | ⏳ |

## E6 · Extension backlog
| Story | Status |
|---|---|
| Match card inside LinkedIn job pages (like Jobright's) | ⏳ |
| Deeper matching – must-haves weigh more (#13) | ⏳ |
| Job details: location missing on some careers sites (e.g. GoKwik) | ⏳ |
| Chrome Web Store listing | ⏳ |

## E7 · Website backlog (by screen)
| Story | Status |
|---|---|
| Job Matches: Jobright-style left rail; filter chips; "what's holding the match back"; prefer Greenhouse over LinkedIn (#10) | ⏳ |
| Tailor: deeper matching shared with the extension (#13) | ⏳ |
| Easy Apply panel: Gmail for verification codes; Applications tab; warn before applying twice | ⏳ |
| Job sources: every Greenhouse posting (#9); Keka (#12); Naukri/Glassdoor via Apify ❓ cost; Adzuna (keys) | ⏳ |

## E8 · Ideas (not planned)
| Story | Status |
|---|---|
| Auto apply on any site – plan in docs/AUTO_APPLY.md | 💡 |
| AI picks the best of your resumes for each job | 💡 |
| Job-hunting agent – finds roles, asks approval, applies | 💡 |
