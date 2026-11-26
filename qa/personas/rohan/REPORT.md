Usability: 5/10 - the flow (resume in, JD, cards, design, PDF) is clear, but an applied suggestion silently deleted my whole Education section and toolbar Undo left the cards and the resume disagreeing.
Ease of use: 6/10 - upload, JD paste, apply and the template dialog were easy; fixing Education and dates by hand was fiddly, and role dates cannot be edited at all.
Helpfulness: 7/10 - good JD matching, honest questions about gaps, and exact INR values and led-vs-supported kept; undermined by the lost-education bug and by output still unfit for a very picky executive.
Would you come back and use this again: NO - not until the suggestion engine stops deleting content, dates can be edited and aligned, and templates look more executive.

# ResumeIQ persona test: Rohan Kapoor (persona 2)
Simulated Associate Director, Corporate Finance, Mumbai, going for Director of Finance. JD: written by me (Aldervale Global Services, listed MNC financial group, Director of Finance, Mumbai). Scope: Resume LLM flow only.

Journey outcome: Completed with defects (critical content loss mid-journey, recovered manually).
Steps: chat, resume intake, JD intake, tailoring, template selection, final review, PDF download all reached.

## What worked well
- Upload of my deliberately untidy PDF was read accurately: 4 roles, 11 skills, all exact INR figures (1,842.6 Cr, 412.5 Cr, 25 Cr), "supported deal team" wording kept. Dates kept exactly as I wrote them, not silently "cleaned".
- JD intake gave 9 specific cards and an 88% match. Cards were relevant: acquisition bullet "keep INR 412.5 Cr", team size, governance gap.
- Truthfulness was strong: for Ind AS/IFRS, treasury, tax, CA/CFA, Oracle it asked questions instead of adding them; it kept treasury, tax, CA/CFA and audit ownership out after I said no. Unclear metric ("significantly") became a "[number]%" placeholder with an input box, not an invented figure. It spotted the overlapping 2012-2015 Halden/Orbit dates and the "Narsee Monjee style" placeholder.
- Led vs supported: after I reminded it, the acquisition bullet read "Built the financial model and supported the deal team..." with 412.5 Cr kept.
- Revenue correction (1,842.6 to 1,284.6) was applied correctly; chat said it was the only occurrence, true in the resume.
- Design dialog: 12 templates grouped by single-column/sidebar, honest ATS notes, font/size/spacing/margin/colour controls, live preview, "Everything on your resume is in this PDF (39 items checked)". Executive template: single column, navy rule, uppercase headings, dates right-aligned in one consistent column. PDF text extracted fully, 1 page.
- "Unlimited downloads" dialog and PDF download worked (Rohan_Kapoor_resume.pdf).

## Friction points
- First reply to "what do you need from me before editing?" was a canned "attach your resume" with no answer to my question (02-first-reply.png).
- Stale cards pile up: after each chat round old cards (1, 2, 3, 6) stay beside newer replacements for the same bullet. Count rose 9 to 15 to 18.
- Chat leaked internal tokens: "[E0B0]", "[D0]", "[D1]". One sentence was garbled: "The job mentions applied. Have you worked with this?"
- Chat said it "added 6/2/1 suggestions" but sometimes added fewer than it promised (said "apply all three", only one card appeared).
- "Some suggestions are still open" warning shows in the design and download dialogs, but 13 open cards (several are questions) have no clear way to finish them.
- Role dates cannot be edited anywhere: the pencil next to a role edits only title/company; chat said "I can't edit role dates, change Orbit yourself" but I could not (07, 20-roleedit.png). I could not make date formats consistent or fix Orbit.
- Hover-only controls and a custom-section "+ Add section" flow were hard to drive; my blind clicks created stray Certifications/Projects sections which I then removed (my doing, but the add-section flow gives no clear confirmation).
- Match score moved oddly (88, 87, 89, 88) when applying/undoing.

## Defects
1. CRITICAL: applying card 17 "Remove MBA entry with duplicate dates" (and card 18 "Remove old B.Com line") deleted the whole Education section. Text said "I'll rebuild your MBA entry"; no replacement card ever came. Repro: apply cards 14, then 17, then 18. Screens: 09-edu.png, 11-edu2.png, 12-edu-empty.png. Chat recovery (turn 10) did not produce add-back cards, only another removal.
2. HIGH: toolbar Undo states vs cards disagree. After two Undos, header said 5 of 18 applied while cards 17/18 still showed "Applied"; the final PDF shows the original summary and original acquisition bullet ("(supported deal team; did diligence workstreams on financials)") although cards 10 and 11 had been applied. Revenue 1,284.6 and "team of 8" did persist. Unsure exactly which undo removed what: the resume, not the cards, is what I trust, and it differs from what I approved (13-undo, 26-pdf.png).
3. MEDIUM: stale suggestion 1 still contains the wrong revenue "INR 1,842.6 Cr" after my correction; applying it would reintroduce the error (card still open at 18 cards).
4. MEDIUM: Education after manual rebuild shows MBA "2010" only (I asked for 2010 - 2012) and original B.Com year 2010 vs I typed 2007-2010 earlier; the earlier duplicate "2012 / 2010-2012" was never fixed cleanly. "Mumbai" sat on its own line in the editor (03b).
5. MEDIUM: design choices of Large text, Airy spacing and a darker colour did not visibly change the downloaded PDF (it looks like the default Executive: small ~9pt body, lots of blank space). I asked twice (extra behaviour 10): settings did not persist between sessions and the download looked identical.
6. LOW: PDF page is ~30 percent empty at the bottom with small type; "ResumeIQ" footer text printed bottom-left.
7. LOW: Mixed date formats remain in the PDF ("Apr-2018 – Present", "Apr 2015 to Mar 2018", "2012 to 2015", "June 2012 - 2015"); column is aligned but formats are not consistent, which for me is a rejection reason.

## Corrections I asked for
- Led vs supported on acquisition: applied correctly in the card; but final PDF shows older wording (see defect 2).
- Revenue 1,842.6 to 1,284.6: fixed in the resume and PDF; stale summary card still carries old figure.
- Education dates once: not fixed; resulted in content loss, then my manual fix.
- Alignment/colour/size ask (twice): not visible in PDF.
- Orbit month unknown and dates: app could not edit; flagged honestly but unresolved.

## Visual review (Executive, serif, PDF page 1)
Serif body, bold role lines with right-aligned dates in one consistent column, navy hairline rules and thin top bar, restrained and conservative: right taste. Weaknesses: tiny body text, no spacing between education entries vs bullets (inconsistent gaps: education lines have more gap than bullets), blank bottom third, section spacing before EDUCATION larger than between jobs, mixed date wording, "ResumeIQ" footer. 1 page, no awkward breaks.

## Content review
Accuracy mostly good, metrics kept, no fabricated skills or employers, no led-vs-supported inflation. Missing in final: nothing from the original except my unwanted summary edit being lost. Added: nothing unsupported. "10+ years" in one suggestion was a mild inflation from "10 years" (I did not apply it).

## Scores (1-5)
Chat usability 3 · Context retention 3 · Resume extraction 5 · JD understanding 5 · Tailoring quality 4 · User control 2 · Template choice 4 · Visual quality 3 · Document integrity 2 · Recovery 2

## Critical failures
- Facts deleted by an applied suggestion without approval (Education section removed; MBA never restored by the AI).
- Approved content (summary, acquisition wording) absent from final PDF after Undo.

## Would I apply with this resume?
Only after fixes: I would need consistent dates, a visible text size, and confidence that what I approved is what is in the PDF.

## Top three improvements
1. Never let a suggestion remove a section or entry without a replacement; make Undo exactly restore resume and cards together, and drop stale cards when a new one supersedes them.
2. Let me edit role dates and normalise date format across all roles in one action.
3. Make design controls (size, spacing, colour) visibly effective and persistent; give an executive template with larger type that fills one balanced page.

Model calls used: 6 (corpus/_count.json). Screens in rohan/screens, PDF in rohan/downloads.
I am a simulated persona, not a real job seeker.
