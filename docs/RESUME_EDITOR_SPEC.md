# ResumeIQ — Resume + Chat Editor redesign (handoff for Claude Code)

## Prompt to paste into Claude Code

> Read `RESUME_EDITOR_SPEC.md` and the mockups in `design-reference/`. Rebuild the resume tailoring screen to match this spec, using the stack, component library and styling approach this repo already uses (don't add a new UI framework). Start by finding the current editor screen (the one with the "All / To review / Applied / Dismissed" tabs and the half-chat, half-suggestion panel) and the code that produces suggestions and chat replies. Plan first, show me the plan and the files you'll touch, then build in this order: (1) desktop layout, (2) suggestion state + pins + chat binding, (3) mobile bottom sheet, (4) copy fixes. Keep existing APIs and data shapes. If a field this spec needs doesn't exist, add it in the smallest way and tell me. When done, test at 1440×900, 1024×768 and 390×844, and list anything you couldn't match.

Live mockups: https://claude.ai/artifact/G31vVPj1Dif2RsYP8T2pdA (board A = desktop, Phone 1–3 = mobile). The HTML files in `design-reference/` are the same mockups. Read them for layout, spacing and colours; don't copy their runtime syntax (`{{ }}`, `<sc-for>`, `<x-dc>`).

---

## 1. The problem being fixed

The current screen splits the right panel in two: a suggestion card on top and the chat below. Both get cramped, and it isn't clear which suggestion the chat is talking about. It's also hard to see what actually changed on the resume.

**Target:** resume on the left, chat on the right at full height, and suggestions shown **on the resume itself** as numbered pins. Exactly one suggestion is "active" at a time, and the chat is scoped to it.

## 2. Desktop layout (≥ 1024px) — see `design-reference/Main.dc.html`

```
┌────────────────────────── Header 56px ──────────────────────────────┐
│ ResumeIQ │ Tailoring for: <job> │ Match 72 → 81 │  ··· │ 3 of 6 applied │ [Fits 1 page] │ [Download PDF] │
├──────────────────────────────────────────────┬──────────────────────┤
│  Resume canvas (grey bg #F4F5F7)             │ Chat panel           │
│   ┌──────── A4/Letter page ───────┐  ① pins  │ 400–460px wide       │
│   │ white, shadow, 40/44px pad    │  ②       │ full height          │
│   │ highlighted bullets           │  ③ …     │                      │
│   └───────────────────────────────┘          │                      │
└──────────────────────────────────────────────┴──────────────────────┘
```

- **Header:** product name, target job chip, match score before → after, applied count, "Fits 1 page" status chip (green when it fits, amber "1.2 pages" when it doesn't), primary "Download PDF".
- **Resume canvas:** flexes; page max-width ~680px, centred. A 32px **pin rail** runs to the right of the page.
- **Chat panel:** `flex: 1 1 400px; max-width: 460px`, white, 1px left border. Three stacked parts:
  1. **Panel header:** "Assistant" plus filter pills `All 6 / To review / Applied` (they filter the pins and the ‹ › navigation).
  2. **Active-suggestion strip** (pinned under the header, tinted `#EEF2FF`): number badge, title ("Show SRE/DevOps experience"), meta ("Blinkit · new bullet · To review"), ‹ › buttons.
  3. **Thread** (scrolls), then a **composer** with quick chips (`Make it shorter`, `Add a metric`, `Keep to 1 page`) and an input whose placeholder is `Reply about #N, or ask anything`.
- **Proposal card** in the thread: header "Proposed for Blinkit · shown on the resume", a diff body (green `+` line for added text, strikethrough for removed text), and actions `Accept` (primary), `Edit`, `Skip`. After Accept the button reads `Applied ✓ (undo)` in green.

## 3. Suggestion pins and highlights on the resume

Each suggestion maps to a target on the resume: a section, a bullet, or an insertion point.

| State | Pin | Text treatment on the resume |
|---|---|---|
| Active | solid `#3B5BDB`, white number | bg `#EEF2FF` + 2px `#3B5BDB` ring |
| To review | `#FFF7E6` bg, `#F0C97A` border, `#8A5A00` number | bg `#FFF7E6` |
| Applied | `#E6F4EA` bg, `#A8D5B5` border, `#1E7B3A` number | bg `#F0F8F2` (subtle) |
| Dismissed | hidden by default | none |

- **New-bullet suggestions** render as a "ghost" bullet: 1.5px dashed border, small caps label `PROPOSED BULLET`, `#F7F9FF` fill. It becomes a normal bullet once accepted.
- **Pin alignment:** pins in the rail line up vertically with their target. Measure the target's offset (`getBoundingClientRect` or a ref) and position the pin absolutely, then nudge pins so they never overlap (minimum 8px gap). Recompute on resize and whenever the resume content changes.
- **Interactions:**
  - Clicking a pin or a highlighted bullet sets it active, scrolls the chat thread to it, and focuses the composer.
  - Selecting a suggestion from the chat (‹ › or the list) scrolls the resume so the target is in view.
  - Keyboard: `J`/`K` (or ↓/↑) move to the next/previous suggestion, `A` accepts, `S` skips. Only active when focus is not inside a text input.

## 4. State model

```ts
type SuggestionStatus = 'todo' | 'applied' | 'dismissed';
type Suggestion = {
  id: string; n: number;               // display number
  title: string;                       // "Show SRE/DevOps experience"
  section: string;                     // "Blinkit (formerly Grofers)"
  kind: 'rewrite' | 'new_bullet' | 'add' | 'trim';
  targetId: string;                    // resume node id the pin anchors to
  before?: string; after?: string;     // diff
  status: SuggestionStatus;
  thread: ChatMessage[];               // messages scoped to this suggestion
};
type EditorState = {
  suggestions: Suggestion[];
  activeId: string | null;
  filter: 'all' | 'todo' | 'applied';
  generalThread: ChatMessage[];        // messages not tied to one suggestion
};
```

- **Routing messages:** while a suggestion is active, composer messages go to that suggestion's thread. A "Clear" link in the strip sets `activeId = null`, and messages then go to `generalThread`.
- **Whole-resume requests** ("make it 1 page") always go to `generalThread`. They return an "N edits applied · View" receipt chip, and each edit is highlighted on the resume for about 3 seconds.
- **Accept / Undo** must be instant (optimistic) and reversible. Keep a per-suggestion undo.
- **After Accept or Skip**, auto-advance to the next `todo` suggestion. When none are left, show "All done — download your resume".

## 5. Mobile (< 768px) — see `PhoneResume`, `PhoneChat`, `PhoneQueue`

No side-by-side layout. The resume is full screen and the chat lives in a **bottom sheet with 3 snap points**:

1. **Peek (~170px)** — `PhoneResume.dc.html`
   - Shows the active suggestion's number, title and meta, ‹ › buttons, and `Accept` / `Discuss ↑` / `Skip`.
   - Most suggestions can be handled here without opening the chat.
2. **Chat (~92% height)** — `PhoneChat.dc.html`
   - Scoped thread, proposal card with `Accept` / `Edit` / 👁 "show on resume" (snaps back to peek and scrolls to the bullet).
   - Horizontal quick chips, then the input and a send button. The resume is dimmed behind; tapping it closes the sheet.
3. **List (~75%)** — `PhoneQueue.dc.html`
   - Opened by tapping the progress bar.
   - Filter pills, then one 64px row per suggestion (pin, title, section, status), then a sticky `Review next (#N)` button.

Other mobile rules:
- Under the header there's a 6-segment progress bar (green = applied, blue = active, grey = to review) and a "1 page ✓" label.
- Pins sit **inline** at the left of each bullet (18px), not in a rail.
- Tap targets are ≥ 44px. The sheet supports drag + velocity snapping, and its open state is reflected in history so the Android back button closes the sheet first.
- Use `dvh` for the sheet height so the iOS address bar doesn't cut it off. Keep the input above the keyboard (`visualViewport`).

**Tablet (768–1023px):** keep the desktop split, but narrow the chat to 360px and move the pin rail inline as on mobile.

## 6. Visual tokens (map to the repo's existing theme if it has one)

| Token | Value |
|---|---|
| Font | Inter 400/500/600/700 |
| Ink | `#16181D` |
| Body text | `#2B2F38` |
| Muted | `#555B66` |
| Border | `#E3E5EA` / input `#D5D8DF` |
| App bg | `#F4F5F7` |
| Surface | `#FFFFFF` |
| Accent | `#3B5BDB` (hover `#2B44A8`), tint `#EEF2FF` |
| Success | `#1E7B3A`, tint `#E6F4EA` |
| Pending | text `#8A5A00`, tint `#FFF7E6`, border `#F0C97A` |

- **Radii:** buttons 8–10px, cards 12px, pills 999px, sheet 16px top corners.
- **Type sizes:** UI 13–14px; resume body 12px desktop, 11px mobile; section labels 11px bold with letter-spacing .06em.
- **Shadows:** page `0 1px 3px rgba(22,24,29,.08), 0 8px 24px rgba(22,24,29,.06)`; sheet `0 -8px 24px rgba(22,24,29,.12)`.
- **Icons:** stroke SVG, never emoji.

## 7. Copy and behaviour fixes (from the current build)

- **Assistant reply copy:**
  - Replace the template text "The job mentions score, implementing. Have you worked with any of these?" with real terms from the JD in plain words, e.g. "The job asks for incident response and post-mortems. Have you done either? Tell me where."
  - When the assistant holds back an unverified claim, say what was left out and why, in one line: "I didn't add 'incident response' — you haven't said you ran it."
- **Chat placeholder:** "Message – e.g. 'add that I led a team of 6'" becomes `Reply about #N, or ask anything` while a suggestion is active.
- **Page fit:** "Can you make it within 1 page" should be handled as a whole-resume action (see §4), and the header chip should update.

## 8. Accessibility

- Pins are `<button>`s with `aria-label="Suggestion 2: Show SRE/DevOps experience, to review"`.
- The active strip is an `aria-live="polite"` region.
- Diff lines are announced as "Added: …" / "Removed: …".
- Contrast is ≥ 4.5:1 for all text, including the 11–12px muted labels.
- Status is never shown by colour alone: pins also carry a ✓ for applied, or a text status in the list.

## 9. Done when

- [ ] 1440×900: matches board A; clicking a pin and ‹ › stay in sync between the resume and the chat.
- [ ] Accept / Undo / Skip work optimistically and auto-advance.
- [ ] A whole-resume request produces a receipt chip and temporary highlights; the 1-page chip updates.
- [ ] 390×844: the peek / chat / list sheet works with drag, the back button and the keyboard open.
- [ ] No layout shift when pins recompute; no pin overlaps.
- [ ] Existing suggestion and chat APIs are unchanged, or the changes are listed.
