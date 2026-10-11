# Test checkpoint 1 – the extension

Covers Roadmap Phase 1 (1.1–1.4). Note anything that fails (page link + what you saw, a screenshot
helps), and it gets fixed before Phase 2.

**Before you start:** `chrome://extensions` → ResumeIQ → reload. The local stack is running
(`~/start-resumeiq.sh`), and you're signed in on the ResumeIQ site.

## A. Sign-in and panel (1.1, 1.2)
- [ ] Open the panel on any job page – your email shows at the top right, no "Open ResumeIQ" prompt.
- [ ] On a job posting: the match % and job details lead; "Application form" says to click Apply.
- [ ] On an application form: **Autofill this application** is at the top, job details collapse to one line.

## B. Your resumes (1.3)
- [ ] "Resume to attach" loads with no error.
- [ ] Upload a second resume → it appears in the list; the first one stays the default.
- [ ] Make default → "(default)" moves to the one you picked.
- [ ] Remove (click twice) → it's gone from the list.

## C. Autofill on real applications (1.2, 1.3)
For each posting: open the application, pick a resume, click **Autofill**, then check:
the fields filled are right · **your chosen resume** is in the form's upload · the panel says
**"Resume attached: <name> · <file>"** and **View** opens that exact file · anything left is outlined
in amber and listed.

| # | Platform | Example to use | Result |
|---|---|---|---|
| 1 | Greenhouse | any India role on job-boards.greenhouse.io | |
| 2 | Lever | any India role on jobs.lever.co (click Apply) | |
| 3 | Ashby | any India role on jobs.ashbyhq.com | |
| 4 | Workday – step "Autofill with Resume" | e.g. the JioStar role | |
| 5 | Workday – step "My Information" | same application, after Continue | |
| 6 | Greenlight | any open role | |
| 7 | A company's own careers site | any | |
| 8 | LinkedIn job page (match only, no autofill) | any | |

Workday specifics to check:
- [ ] Each step shows Autofill again after **Continue** ("New page of the form – click Autofill…").
- [ ] Step 1 attaches your resume; Workday reads it and pre-fills later steps.
- [ ] Step 2 fills name/phone; "Select One" dropdowns (e.g. How did you hear about us, Phone device type)
  are outlined and listed as "(pick on the page)" – these stay manual for now.

Employment section (Greenhouse forms with "Employment" and **Add another**):
- [ ] Autofill adds one block per job in your resume and fills each in order – company, title, start/end month and year.
- [ ] A current job: "Current role" ticked, end dates empty and greyed out, not listed as missing.
- [ ] Month dropdowns show the month (not just typed text).

## D. Cover letter
- [ ] On a form with a cover letter upload: a letter is written and attached; **View** opens it.
- [ ] Edit the text → **Re-attach** → View shows the edited version.

## E. Generated PDFs (1.4)
- [ ] Choose "Generated from your ResumeIQ profile" (only offered when no resume is uploaded – remove
  yours temporarily, or test on a second account) → Autofill → **View**: no letter-spaced lines;
  amounts show as "INR 50 Cr"; "Day-7" has no gaps.
- [ ] A cover letter with an amount in it shows "INR …" with normal spacing.

## Known limits (not bugs for this checkpoint)
- Workday's button dropdowns and "Add experience" sections aren't filled (Auto apply idea).
- Greenhouse dropdowns now open and fill in the extension (new) – Easy Apply stays available from the panel.
- Workday asks for an account per company – sign in yourself.
