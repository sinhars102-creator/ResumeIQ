Usability: 7/10 - Resume intake, tailoring cards and download all worked; the cluttered, repeating suggestion list and the first-screen chat dead end cost points.
Ease of use: 6/10 - I could always find the next step, but 19 numbered cards, overlapping badges and stale questions were hard to keep track of.
Helpfulness: 7/10 - Truthful, well-extracted and a clean PDF, but the tailoring changes were mostly small word swaps and did not make the manufacturing-to-tech move legible until I wrote that line myself.
Would you come back and use this again: YES - It would not let me lie about Python or tech experience and the PDF is clean, but I would want the transition summary written for me.

# ResumeIQ persona report: Priya Nair (persona 3)

Target role: Program Manager, Business Operations, e-commerce/logistics-tech (Flipkart-style). I wrote the job description myself (6 duties, 6 requirements incl. advanced SQL, Python "strong plus", tech-company experience "preferred").
Extra behaviours: 1 (title and company first, full JD later), 5 (Python asked, I have none), 13 (wording approved, design handled separately). Also tried a truthfulness challenge and a repeated correction.
Outcome: **Completed with defects.** Chat, resume intake, JD intake, tailoring, template selection, final review and PDF download all done. Scope: Resume LLM flow only.
Model calls used: 12 (corpus/_count.json = {"n":12}).

## What worked well
- Resume extraction was excellent. A text PDF with 3 roles, a 2017-2018 date range, a certificate and skills came through with every employer, date, the 14%, the shift of 30, Power BI and "SQL (basic)" intact (03-upload.png). The confirmation line "Operations Manager · 3 roles · 8 skills" was reassuring.
- Giving only a title and company (behaviour 1): it did not stall. It produced 8 cards, used "[number]" placeholders instead of inventing metrics, and asked a targeted question about cross-functional projects.
- Truthfulness is strong. When I asked it to write software product management experience and add Python "because everyone does it", it refused plainly, said recruiters and interviews catch it, noted "preferred isn't required", offered to add Python as "learning" only once I start, and asked about real tech-adjacent work (ERP/MES rollouts) instead (09-challenge.png).
- The reply to "which transfers, which gaps" was the most useful message of the session: clear Transfers list and Gaps list (advanced SQL, Python, Tableau, tech/e-commerce experience, seller onboarding, product/finance partnering, forecasting). It kept SQL as basic and wrote no late-delivery number as I asked (07-sql.png).
- Cards show Current vs Suggested with word-level highlighting, "Adds" keyword chips, Apply / Edit / Dismiss / Another version, Undo and Reset. I always felt in control. Direct editing via the pencil icon worked and my own wording stuck (16 / PDF).
- Design dialog: 13 templates grouped by ATS safety ("Single column - safest for applicant tracking systems" vs two-column "some ATS read these less reliably"), colour, font, spacing and margin options, and a line "Everything on your resume is in this PDF (31 items checked)." Content was identical across Modern and Executive. Both PDFs fit one page with nothing clipped (23-modern-p1.png, 24-exec-p1.png). Executive (navy rule, right-aligned dates) looked more senior and suited me best.
- Download worked in one click, "Unlimited downloads" in test mode, dates and contact line intact.

## Friction points
1. First screen: my opening question ("Can this platform help me make my manufacturing experience relevant?") got only "Let's start with your resume: attach it..." with no answer to my question (02-open.png). No model call was spent, so it is a canned reply. I only got a real answer after uploading.
2. Raw citation tags leaked into a chat reply: "[E0B1]", "[E0B4]", "[D1]", "[S]" (04-q1.png). Meaningless to me.
3. Suggestion list grew from 9 to 17 to 19 cards after two chat messages, with old cards left in place. Many are near duplicates: summary cards 1, 10, 18, 19; bullet 2 and 12 conflict (both rewrite the 14% bullet); old questions (cards 6, 9) stay open after I answered them in chat. Overlapping number badges on the resume (e.g. "12" over "3") make the left margin messy. Hard to know what is "done".
4. Cards 4, 8, 16 still say "reducing late deliveries by [number]%" / "line stoppages by [number]%" after I said I do not remember a number. They are placeholders, but I had to ignore or dismiss them, and Apply is disabled until a number is typed, so there is no "keep the line without a number" option other than Dismiss.
5. Match score moved the wrong way: 64% before, 63% after applying 6 cards, 60% after the summary, back to 64% later (08-applied.png, 13-edit.png). The "up to 65%" ceiling is also tiny for a lot of work. Confusing: applying what it recommends made the number drop.
6. Summary requests (my two corrections, behaviour "repeated correction"): I asked for a 3-line summary that explains the move into business operations / programme management in tech. Result 1 was about five lines, no mention of the move, and used "I run weekly..."; the chat reply claimed it "frames the move as a step into tech business operations". That was false. After the second request (shorter, no "I", add the target move) the chat claimed "closes with your target move into business operations / programme management in e-commerce or tech" but the card text ended "...and basic SQL." with no target move (11-summary2.png, 12-summary-applied.png). Reply text and card disagree, which is the known pattern but here it defeated the point of my request. I wrote the transition sentence myself in the editor.
7. Design dialog gives no recommendation or explanation of why one template suits a career changer; I asked for this as Priya would, but there is no place in the dialog to ask. The template list shows "1 page" for every template with no differences in how a longer resume would behave.
8. "Some suggestions are still open." in red appears in the design dialog and again before download, but never says which ones, and 10 cards were still unreviewed. I had to click through anyway. Minor, but alarming for a non-expert.
9. Two cards (summary, bullet 1) became "Dismissed" without my action when newer versions were added (Dismissed 2 appeared at the design step). Explained with "Dismissed, your original line is kept" and Restore, which is fine, but surprising.
10. The earlier Design dialog came back on "Modern" after I had picked Executive and left without continuing; template choice only sticks once continued. Minor.

## Defects (reproduction)
- Citation tags in chat: upload resume, ask "Will recruiters consider my experience relevant?" -> reply contains [E0B1] [E0B4] [D1] [S]. Expected plain text. Screenshot 04-q1.png.
- Chat claim vs card mismatch on summary: after asking for a 3-line summary with the move into tech, the reply says it was done; the card does not include it. 10-summary.png, 11-summary2.png, 12-summary-applied.png.
- Match percentage drops after applying suggestions: apply cards 1-6 (08-applied.png shows 63%, was 64%); applying the summary lowers it to 60% (13-edit.png).
- Duplicate/conflicting cards after chat (bullet 3 and bullet 12 both rewrite the same line); answered question cards not cleared.
- First-turn question not answered (02-open.png).

## My corrections
- "Don't make SQL sound advanced / no Python / no number": fixed in chat reply and new cards; stale placeholder cards remained.
- "Summary lost my team of 30, write it to explain my move in 3 lines": team of 30 returned; the move and the 3-line limit were not delivered. Asked twice, not fixed by the AI; fixed by my own edit.
- "No 'I run'": fixed in second attempt.
- Truthfulness challenge: correctly refused.

## Visual review (PDF)
- Modern: Sans-serif, green section headings and a green rule under the contact line, left-aligned dates on their own line, one page, about a third of the page empty at the bottom. Clean and approachable.
- Executive: navy top bar and navy small-caps headings with thin rules, dates right-aligned on the title line, one page, about 40% empty at the bottom. This is the look I wanted (navy, professional, not student-like).
- Hierarchy is clear in both; font size is small but readable; no clipping, no page breaks, all 31 items present. A small "ResumeIQ" footer mark is visible at the bottom left (a little distracting on a job application). The education lines are bold, which makes the two certificate lines as heavy as the job titles.
- Sidebar template: dark teal band; only skimmed in the dialog preview, not downloaded.

## Content review
- Accurate: all employers, dates, 14%, ~30 people, Power BI, basic SQL, Green Belt preserved. No fabrication anywhere in the final PDF. Placeholders were never applied.
- Relevance: summary now states the target move (my own wording). Bullets use "process improvement", "operational metrics", "vendor relationships" language from the JD. But the bullets are only lightly reworded; the 14% and the team of 30 each appear twice (summary and bullet), which wastes space for a one-page, half-empty resume.
- Gaps the product did not fill: the Certifications section reads "None added yet" in the chat preview even though Six Sigma Green Belt is listed in skills. No bullet about the delivery-delay analytics capstone (only in the first summary, then lost in my rewrite). Headline stayed "Operations Manager"; the "Business Operations" headline card was not carried over after I dismissed the earlier set.
- Did not ask for evidence beyond one question about line stoppages and one about cross-functional projects, but those questions were targeted and not too many.

## Scores (1 poor to 5 excellent)
Chat usability 3 · Context retention 4 · Resume extraction 5 · JD understanding 4 · Tailoring quality 3 · User control 4 · Template choice 4 · Visual quality 4 · Document integrity 5 · Recovery 3

Critical failures: none in the final document (no fabricated facts, nothing clipped, nothing missing). Chat-versus-card statements that were false (summary, item 6) are the closest thing and should be treated as serious for trust.

## Would I apply with this resume?
Only after fixes. It is truthful and clean, but the summary/transition was something I had to write myself, and I would want a shorter headline that says Business Operations. I would use it with the Executive template.

## Top three improvements
1. Make the transition legible: when the user says they are changing industries, write a short summary line that says so, and make the chat claim match the actual card.
2. Tidy the suggestion list: replace or auto-resolve old cards when new ones supersede them, clear question cards after the user answers, and fix the match score going down.
3. Answer the opening question and explain template choice: respond to the first message before asking for a resume, remove the [E0B1]-style tags, and recommend a template with a reason for career changers.

I am a simulated persona, not a real job seeker.
