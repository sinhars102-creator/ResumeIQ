Usability: 6/10 - Resume read and downloaded cleanly, but stale suggestions and "Apply all ready" undid my own correction.
Ease of use: 6/10 - Quick start, but the cramped chat panel, 11 unguided templates and open-suggestion warnings slowed a rushed user.
Helpfulness: 7/10 - Extraction was accurate, it kept my numbers and refused SAP, but the summary stayed thin and I had to ask twice for scale.
Would you come back and use this again: YES - It got me a usable one-page resume in about 20 minutes, provided the correction bug is fixed.

# Persona 4 - Vikram Singh (simulated), Regional Sales Manager, Gurugram
Target: National Sales Manager, Everbright Consumer Brands (invented FMCG JD that I wrote, pasted in two messages).
Outcome: Completed with defects (one critical).
Steps: chat yes, resume intake yes, JD intake yes, tailoring yes, template (Executive) yes, final review partial, download yes (1 page PDF, twice).
Model calls: 7 (corpus/_count.json).

## What worked well
- PDF upload read perfectly: 3 roles, all dates (including "2012 - May 2015"), every figure (Rs 180 to 310 crore, 140 distributors, 12 key accounts, 48 to 31 days, 112%). It asked me nothing already in the resume.
- Pasting only the first half of the JD immediately started tailoring, and the second half was folded in next turn with context kept: 7 suggestions became 14 and the chat acknowledged the later requirements. The JD was never lost.
- JD understanding was good: it noticed the 40+ team, e-commerce and channel strategy gaps and asked targeted questions rather than inventing.
- Truthfulness: it refused SAP ("I won't add it") and asked about e-commerce rather than claiming it. No fabricated employers, skills or numbers. The match score (66% to 72%) gives visible progress.
- Suggestions show Current vs Suggested with highlights; applied text is highlighted on the resume; Undo exists.
- State recovery: closing the browser and reopening between scripts restored the resume, chat, suggestions and applied state.
- Design dialog: Executive template (navy) matches my taste; live preview; "36 items checked, everything is in this PDF" reassurance; "Unlimited downloads"; PDF text matched the on-screen resume exactly, no clipping.
- Chat changes worked: the SKU bullet came back in my exact wording, the summary got Rs 310 crore + 42-person team, and the template and other content stayed (behaviour 15).

## Critical failure
- My correction was reverted. I corrected 24 to 42 (applied bullet 1 and a summary suggestion), then pressed "Apply all ready". An older pending suggestion (written before my correction) re-applied "multi-state team of 24" over the 42, while the summary said 42-person: inconsistent figures. The chat even admitted "an older suggestion may have overwritten the fix". Screens: 11-after-apply16, 12-apply-all. Fixed only after I asked again (14, 15). Stale suggestions (24-person summary version, bullet 9, question card 2) still sit in the list and would reintroduce the old number.

## Defects and friction
1. Stale suggestions are not retired when a fact is corrected (above). Apply-all applies conflicting suggestions for the same line (three different summaries queued, 1, 8, 15).
2. Chat leaks internal ids: "[E0B0]", "[S]", "[E2B0]" (09-team-fix, 13-fix-again).
3. Placeholders in suggestions: "Grew regional revenue about [number]..." and "a ~[number] compound annual growth rate" with "The number for this result" chip. Good that it did not invent a figure, but it is ugly and wasteful when 180 to 310 over 4 years is calculable by me.
4. Chat said "Done: now uses your exact wording" but these are only pending suggestions; the resume was unchanged until I applied. Misleading.
5. My first message (typed with the upload) was not sent; it stayed in the box. I then had to start again via the Tailor step.
6. The chat and suggestion list share one cramped scrolling panel; the chat shows only a few lines (08, 09).
7. I asked for the best two templates for a senior sales role: there is no guidance, 11 templates with labels only (16-design). "Some suggestions are still open" in red appears in the design and download dialogs, even after most were applied, and does not say which or block anything.
8. Final PDF: 1 page, small type, big empty lower half; "Pune" sits as an orphan line under the MBA entry (also in the original extraction); "ResumeIQ" footer text on the PDF (21-pdf). The initial summary did not show revenue scale until I asked.
9. Phone (24-phone): pencil edit buttons overlap each other and the contact line, and section toolbars (up/down/Rename/Remove) take a whole screen row on each section. Hard to scan. The compact header with a match % and "Review 5" button is good. Touch scroll via mouse wheel was not testable.
10. Some suggestion wording is mild inflation: "Lead a multi-state team" (true, 5 states), "Improved working capital" (rejected variant, not applied). Defensible but I would not use "growing revenue to Rs 310 crore" without the starting point.

## Corrections
- Team 24 to 42: fixed in the first attempt only as new suggestions; reverted by apply-all; fixed on the second ask; final PDF correct everywhere (summary, bullet 1).
- SAP: honoured. SKU bullet and summary scale: honoured, only those two changed.

## Visual review (Executive, PDF)
Navy top rule and navy heading colour, clean hierarchy, name large, dates right-aligned, bullets concise. One page, tight spacing, small font, lower 40% blank. Not the two-page leadership look I wanted, but it is readable and professional. No clipped text.

## Content review
All metrics kept; no unsupported claims; SAP and e-commerce left out. Missing: no revenue scale in the summary by default, skills list gains "General trade / Modern trade" (supported by the resume).

## Scores (1-5)
Chat usability 3 · Context retention 5 · Resume extraction 5 · JD understanding 4 · Tailoring quality 3 · User control 4 · Template choice 3 · Visual quality 3 · Document integrity 4 (5 except the revert) · Recovery 5

## Would I apply with this resume?
Only after fixes: yes for the final PDF I got, but I had to babysit the 24/42 conflict.

## Top three improvements
1. Retire or rewrite pending suggestions when I correct a fact, and make "Apply all ready" skip conflicts so a correction can never be reverted.
2. Recommend two templates for the role and give a clear, short list of what is still open; stop leaking [E0B0] ids and [number] placeholders (compute the CAGR from my numbers).
3. Give a wider chat with the suggestions on a separate tab, a better phone layout (no overlapping edit buttons, collapsible section tools), and a fuller default use of the page.

I am a simulated persona, not a real job seeker.
