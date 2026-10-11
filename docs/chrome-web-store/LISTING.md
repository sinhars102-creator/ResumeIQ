# Chrome Web Store listing – ResumeIQ

Everything the developer dashboard asks for, ready to paste. Images are in this folder.
Upload: `dist-extension/ResumeIQ-extension.zip` (build it with `npm run ext:package`).

## Store listing tab

**Name** (from the manifest): ResumeIQ – Save jobs & autofill applications

**Summary** (from the manifest, max 132): Save jobs from any page to ResumeIQ, see how well you fit, and autofill applications for you to review and submit.

**Category:** Productivity → Workflow & Planning (or Tools if that's what the form offers)

**Language:** English

**Description:**

> ResumeIQ helps you apply to jobs faster – with a resume that fits each role.
>
> Open the ResumeIQ side panel on any job posting and you'll see:
>
> • Your match – a score for how well your resume fits the role, what's holding it back, and where you already fit.
> • A tailored resume in one click – ResumeIQ rewords your resume for the job using only what you've actually done. Every change is marked so you can review it, and anything you don't have is listed as a gap instead of being made up.
> • Autofill for the application – on the job's application form, ResumeIQ fills in your details from your profile and attaches your resume (or the one tailored for that job). You review everything and submit it yourself.
>
> Also: save jobs to your ResumeIQ list from any site, upload and choose between your own resumes, and get a cover letter written from your resume when a form asks for one.
>
> ResumeIQ works on company career sites and job boards such as Greenhouse, Lever, Ashby and Workday. Sign in once on the ResumeIQ website and the extension uses the same account.

**Icon:** `extension/icons/icon128.png`

**Screenshots (1280×800):** `1-match.png`, `2-tailored-resume.png`, `3-autofill.png` – in that order. They show the real extension with a fictional company and candidate.

**Small promo tile (440×280):** `promo-small-440x280.png`

**Official URL / homepage:** https://www.myresumeiq.io
**Support:** rahul@myresumeiq.io

## Privacy practices tab

**Single purpose:**
> Helps job seekers apply to jobs: shows how well their resume matches the job posting they're viewing, creates a version of their resume tailored to that job, and fills in the job's application form for them to review and submit.

**Permission justifications:**

| Permission | Justification |
|---|---|
| `sidePanel` | The extension's interface (match, tailored resume, autofill) is a side panel next to the job page. |
| `storage` | Keeps the user's ResumeIQ sign-in, recent match scores and draft resumes on their computer, so they aren't lost when the panel closes. |
| `scripting` | When the user opens the panel or clicks Autofill, reads the job posting or application form on the current tab and fills in the form with the user's details. |
| `tabs` | Knows which job page is open in the current tab (its address) so the panel shows that job, and opens ResumeIQ pages (sign-in, tailoring) in a new tab when the user asks. |
| Host permission `<all_urls>` | Job postings and application forms are on thousands of different company career sites and job boards, so the extension must be able to read and fill a form on whichever site the user is applying on. It only does so on the current tab when the user uses the panel. |

**Remote code:** No, I am not using remote code. (All code is in the package; it only calls the ResumeIQ API for data.)

**Data usage – what the extension collects:**

| Category | Collected? | What |
|---|---|---|
| Personally identifiable information | **Yes** | Name, email, phone and links from the user's profile, used to fill applications |
| Health information | No | |
| Financial and payment information | No | |
| Authentication information | **Yes** | The ResumeIQ sign-in session, taken from the ResumeIQ website |
| Personal communications | No | |
| Location | No | |
| Web history | No | |
| User activity | No | |
| Website content | **Yes** | The job posting and application form on the page the user is applying on |

**Certify all three:** not sold to third parties; not used or transferred for purposes unrelated to the item's single purpose; not used to determine creditworthiness or for lending.

**Privacy policy URL:** https://www.myresumeiq.io/privacy.html

## Distribution tab

**Visibility:** Unlisted (only people with the link can find and install it).
**Regions:** All regions.

## Test instructions (for Google's reviewer)

> 1. Go to https://www.myresumeiq.io/app and sign in with any email address (a sign-in code is emailed). Upload any resume (PDF).
> 2. Open a job posting, e.g. any job on https://jobs.lever.co, and click the ResumeIQ toolbar icon to open the side panel: it shows the match score. "Generate resume for this job" shows a tailored version for review.
> 3. Click the job's Apply button to reach the application form; in the panel, click "Autofill this application" – the form is filled and the resume attached. Nothing is submitted; the user submits on the page.
