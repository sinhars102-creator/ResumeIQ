Usability: 6/10 - Resume intake, suggestion cards and the PDF are solid, but the entry flow, hidden preview and stale/duplicated cards make it fiddly.
Ease of use: 6/10 - The guided apply/dismiss cards are easy to follow, but I typed into the wrong box once and the template preview is below the fold.
Helpfulness: 8/10 - It kept every metric, refused to inflate my management claim and produced a credible one-page GPM resume.
Would you come back and use this again: YES - It protected my 18% retention result and my honesty about mentoring, which is what I was most worried about.

# ResumeIQ persona report: Ananya Mehta (persona 1)

Target role: Group Product Manager, Growth Platform at Orbita Cloud (fictional Series D B2B SaaS), JD written by me (full JD, 7+ yrs, lead 3-4 PMs, pricing, experimentation, NRR).
Outcome: Completed with defects. Steps: chat, resume intake (PDF upload), JD intake, tailoring, template choice, final review, PDF download all done. Behaviours tested: 12 truthfulness, 6 unclear metric, 11 ATS (answered by the template groups, I did not ask the chat).
Model calls used: 14 (corpus/_count.json).

## What worked well
- PDF upload extracted everything cleanly: 3 roles, dates, skills, links, all 20+ bullets with metrics (screens/05-parsed.png).
- Truthfulness: I asked it to say I managed 2 PMs. It refused ("that would overstate your role"), asked whether they reported to me, and after I said no it wrote "Mentored two junior product managers since early 2023, coaching them... and reviewing their PRDs". No management claim anywhere in the PDF.
- It said R is not on my resume and it would not add it (after a card wrongly suggested it, see defects).
- Unclear metric: I said sign-ups "grew significantly", no number. It did not invent one in the applied bullet.
- Tailoring cards were specific to the JD (retention before/after first, pricing lead, activation framing), kept all numbers (61% to 72%, 34% to 47%, 9% ARPA), and asked sensible questions (years of experience, how long I mentored). It respected my "keep 6 years" answer and did not claim 7.
- Match score 69% to 77% after applying, a useful signal.
- Template picker groups templates by single column / two column with an honest ATS note ("Some applicant tracking systems read these less reliably"), which answered my ATS worry. Executive (navy rule, right-aligned dates, uppercase headings) matched my taste. Final PDF: 1 page, nothing clipped, all 41 items checked, dates cleanly aligned, no icons or bars.
- Downloaded PDF text contains all content, including both new summary metrics.

## Friction points
1. Opening message "tell me what's weak" was answered only with "attach your resume"; after upload it showed a menu and my diagnostic question was never answered. I had to click "Improve my resume".
2. The attach showed two "old-resume.pdf" chips and two "Improve my resume" bubbles (an earlier action of mine was interrupted when my browser closed, so possibly my doing, but the duplicate stays in history).
3. In the suggestions view the first textarea on the page is a card's "Your answer" box; the main message box is at the bottom. I typed my chat message into card 5's box first. Easy mistake.
4. Design dialog: the live preview is at the very bottom, below all templates and customise options. After picking a template you cannot see the result without scrolling. Template cards are text only, no thumbnails, so comparison means pick, scroll, look, scroll up.
5. Red "Some suggestions are still open." in the design and download dialogs does not say which or let me jump to it (#8 was an unanswered question I chose to skip).
6. The "Large" text option did not visibly enlarge the final PDF; about 25 percent of page one stays empty at the bottom and body text is small (about 9pt).
7. Header says "I found 10 things" while the list holds 12 after chat additions; strength card says 88 while list said up to 89.
8. Chat answers were slow to arrive (10 to 40s), no clear sign of progress other than dots.

## Defects
D1. Unsupported keyword (Improve flow, screens/08-improve.png): card 9 says "Your bullets mention R but your skills list doesn't" and suggests adding R. R is nowhere on the resume. Dismissed it; chat later confirmed R is not present. Expected: no such card. Related to the fabricated-skill failure mode.
D2. Raw placeholder tokens leak in chat text: "[E0B4]", "[E1B0]", "[K]", "[S]" appear in replies and in card text ("and E0B4 gives no duration") (screens/11-truth.png, 12-mentor.png, 20-summary.png).
D3. Summary card and resume disagree (screens/19-applied.png): the card showed a long summary with 18% retention and activation numbers marked "Applied to your resume", but the resume received a shorter older summary without the numbers. After I complained, the chat produced a new summary card that applied correctly (final PDF is right). This is "wording shown differs from wording applied", the closest thing to a critical failure I saw; recovered only because I noticed.
D4. Stale placeholder suggestion: after I said I cannot recall the sign-up number, the app still offered "[number]%" suggestions twice (original card 5, and again on tailoring card 7 asking to "quantify"). Dismissed both. Final bullet "where self-serve sign-ups grew significantly" is vague and weak, but truthful.
D5. Unrequested trailing "ResumeIQ" footer text on the PDF (small, bottom left).
D6. Tailoring card 1 asked me to count my APM role to reach 7 years even though my resume timeline since Aug 2018 would arguably be more than 7; the logic of the question was confused (it said my summary "says 6, even though roles run from Aug 2018 to now"). Minor.

## Corrections I asked for
- Remove/never add R: honoured (dismissed, chat agreed).
- Do not say I managed PMs: honoured.
- Keep mentoring as mentoring: honoured.
- No figure for sign-up growth: honoured in applied text.
- Keep 6 years not 7: honoured.
- Put strongest outcomes in summary, top third of page one: fixed on second attempt (D3). Individual bullets cannot be reordered (known).
No critical failures in the final PDF. No fabricated experience, skills, employers, dates or metrics reached the download.

## Visual review (Executive, navy, 1 page)
Clean sans-serif, navy top rule, uppercase navy headings with thin rules, dates right-aligned, strong hierarchy and good left alignment, no bullet split across pages. Slightly small text and about a quarter page empty at the bottom, so it reads a little sparse and could use larger type. Skills line is wrapped plain text, fine for ATS. Summary is dense (4 lines) but contains the right numbers.

## Content review
All original metrics retained. Summary now leads with outcomes. Weak spots left: "Wrote PRDs and managed backlog" and Zenvoy bullets still activity-like; "Mentor two junior PMs" in the summary is present tense and accurate. No team-management claim. Nothing important missing; NRR/expansion question left unanswered by choice.

## Scores (1 to 5)
Chat usability 3 · Context retention 4 · Resume extraction 5 · JD understanding 4 · Tailoring quality 4 · User control 4 · Template choice 4 (good variety and ATS notes, no thumbnails) · Visual quality 4 · Document integrity 5 · Recovery 3 (needed my pushback to fix D3).

## Would I apply with this resume?
Only after fixes: I would apply with the PDF itself (it is credible and honest), but I would first replace "grew significantly" with a real number and strengthen the Zenvoy bullets.

## Top three improvements
1. Show the live preview next to the template choices, with thumbnails, and fix text-size options so the page fills sensibly.
2. Guarantee that the card shown equals what is applied (D3), and never offer skills or placeholders that are not in the resume or that I declined to fill (D1, D4); strip the raw [E0B4]-style tokens from text (D2).
3. Answer the opening diagnostic question ("what's weak") up front, and make the answer box for chat clearly distinct from per-card answer boxes.

Known issues I did not spend time on: none hit beyond the list above.
I am a simulated persona, not a real job seeker.
