/**
 * Resume tailoring assistant – one conversational turn per call.
 *
 * The model proposes at most a couple of edits per turn, and every edit is
 * checked here before the user sees it: it must target text that exists in
 * the resume, keep the specifics (tools, versions, certifications, numbers),
 * add no numbers the user didn't supply, avoid stock filler, and name a
 * requirement that actually appears in the JD. Failing edits get one repair
 * pass with the reasons; anything still failing is dropped.
 */
import { callLLM } from "./llm.js";

const MAX_JD_CHARS = 8000;
const MAX_EDITS_PER_TURN = 2;

const SECTIONS = new Set(["Summary", "Experience", "Skills"]);
const TYPES = new Set(["Rewrite", "Addition", "Removal"]);

// Filler that reads as generic regardless of the candidate. Allowed only if the original already used it.
const BANNED_PHRASES = [
  "results-driven", "results driven", "track record", "proven ability", "proven track",
  "dynamic", "synergy", "synergies", "go-getter", "detail-oriented", "team player",
  "self-starter", "hard-working", "hardworking", "passionate", "seasoned professional",
  "out-of-the-box", "thought leader", "best-in-class", "world-class", "value-add",
  "spearheaded various", "wide range of", "various stakeholders", "end-to-end ownership",
];

// Verbs that claim ownership or seniority. A rewrite can't upgrade "implemented" to "led" unless the candidate said so.
const OWNERSHIP_VERBS = ["led", "lead", "owned", "own", "owning", "headed", "directed", "spearheaded", "architected", "managed", "drove", "championed", "oversaw", "end-to-end"];

const STOP_WORDS = new Set(
  "a an and or the of to in on for with at by from as is are was were be been this that these those your you our we it its into across over using use used experience years year role team work".split(" ")
);

const SYSTEM_PROMPT = `You are a resume tailoring assistant inside ResumeIQ. You help one candidate tailor their resume to one specific job, through a short conversation.

How you work:
- Be objective and specific. Every claim you make about fit cites concrete evidence: a JD requirement (quote its key words) and the resume line that does or doesn't meet it.
- Work one gap at a time, highest impact first. Propose at most ${MAX_EDITS_PER_TURN} edits per turn; usually 1.
- If the best edit needs a fact the resume doesn't contain (a number, scale, tool, outcome), ASK for it instead of guessing. Ask one precise question for the single most valuable fact – at most 2 questions per gap. After that, draft the edit with the facts you have and put anything still missing in [square-bracket placeholders] for the candidate to fill in.
- Separate gaps wording can fix (the experience is there but undersold or uses different terms) from real gaps (years, certifications, domains the candidate lacks). Say plainly that real gaps can't be closed by rewording; don't try to paper over them.
- Talk to the candidate directly ("you", "your"). Keep your message under 90 words. No pleasantries, no restating the resume back.
- End every message with exactly one clear question or next step.
- When the candidate answers, use the answer: turn it into an edit, or ask a different, narrower follow-up. Never repeat a question you already asked.

Hard rules for every edit:
1. "original" must be copied EXACTLY from the resume: the whole summary or one full sentence of it, one bullet, or for Skills one existing skill. For an Addition, original is "".
2. Never upgrade the candidate's role: don't turn "implemented", "developed" or "worked on" into "led", "owned", "architected" or "end-to-end" unless the candidate confirms it in this conversation. Ask instead.
3. Keep every specific in the original: tools, versions (e.g. "8.x"), product names, certifications, clients, numbers. You may reorder and sharpen, never generalise.
4. Never invent facts. Numbers in "proposed" must come from the resume or from the candidate's messages. If a number would help but you don't have it, use a placeholder like [X users] and ask for it.
5. No filler: never use phrases like "results-driven", "track record", "proven ability", "passionate", "dynamic", "team player", "self-starter".
6. Mirror the JD's exact terminology only where the resume genuinely supports it.
7. A Skills Addition must be a single skill the resume or the candidate's messages already show evidence of.
8. Never propose something already in the resume or already decided: accepted edits are already applied, rejected ones are unwanted (adjust based on the reason). Move on to the next gap instead.
9. "jdRequirement" quotes the specific JD requirement this edit targets.

Respond with ONLY a JSON object:
{
  "message": "your conversational reply (under 90 words)",
  "edits": [
    {
      "section": "Summary" | "Experience" | "Skills",
      "type": "Rewrite" | "Addition" | "Removal",
      "experienceIndex": number (Experience only; index from the resume listing),
      "original": "exact existing text, or \\"\\" for Addition",
      "proposed": "new text (\\"\\" for Removal)",
      "jdRequirement": "the JD requirement this targets, quoted",
      "why": "one sentence: the evidence-based reason"
    }
  ],
  "quickReplies": ["up to 3 short NEUTRAL actions, e.g. \"Next gap\", \"Make it shorter\", \"Skip this one\" – never a factual claim about the candidate"],
  "currentGapId": "id of the chosen gap you are working on now (when the candidate chose gaps), else null",
  "coveredGapIds": ["ids of chosen gaps already resolved: an edit for it was accepted or rejected, or the candidate skipped it or has nothing to add"],
  "done": false
}
Set "done": true only when the important gaps are covered (when the candidate chose gaps: when every chosen gap is resolved); then summarise what changed in the message.`;

function normalize(text) {
  return String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function contentTokens(text) {
  return normalize(text)
    .split(/[^a-z0-9+#.]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

/** Crude stem so "designed" / "designing" / "designs" all match "design". */
function stem(token) {
  return token.replace(/(ing|ed|es|s)$/, "");
}

function numbersIn(text) {
  return (String(text || "").match(/\d+(?:[.,]\d+)?%?/g) || []).map((n) => n.replace(/,/g, ""));
}

/** Tokens that make a line specific: anything with a digit, acronyms (KYC, PRPC, NBA), and camel/dotted names. */
function specificTerms(text) {
  const raw = String(text || "").match(/[A-Za-z0-9][A-Za-z0-9.+#/-]*/g) || [];
  const terms = raw.filter((t) => /\d/.test(t) || /^[A-Z]{2,}[A-Za-z]*$/.test(t) || /[a-z][A-Z]/.test(t));
  return [...new Set(terms.map((t) => t.toLowerCase().replace(/[.,]+$/, "")))];
}

function splitSentences(text) {
  return String(text || "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((x) => x.trim()).filter(Boolean);
}

/** Every editable line: the whole summary, each summary sentence, each bullet, each skill. */
function resumeLines(resume) {
  const lines = [];
  if (resume.summary) {
    lines.push({ section: "Summary", text: resume.summary });
    splitSentences(resume.summary).forEach((sentence) => lines.push({ section: "Summary", text: sentence }));
  }
  (resume.experience || []).forEach((exp, i) => {
    (exp.bullets || []).forEach((b) => lines.push({ section: "Experience", experienceIndex: i, text: b }));
  });
  (resume.skills || []).forEach((s) => lines.push({ section: "Skills", text: s }));
  return lines;
}

function resumeAsText(resume) {
  return [
    resume.title,
    resume.summary,
    ...(resume.experience || []).flatMap((e) => [e.role, e.company, ...(e.bullets || [])]),
    ...(resume.skills || []),
    ...(resume.education || []).map((e) => `${e.degree} ${e.school}`),
  ].filter(Boolean).join("\n");
}

/** The resume as the model sees it: indexed so edits can point at an exact role. */
function formatResume(resume) {
  const parts = [
    `Name: ${resume.name || ""}`,
    `Headline: ${resume.title || ""}`,
    `SUMMARY:\n${resume.summary || "(none)"}`,
    "EXPERIENCE:",
    ...(resume.experience || []).map((exp, i) =>
      [`[experienceIndex ${i}] ${exp.role || ""} — ${exp.company || ""} (${exp.period || ""})`, ...(exp.bullets || []).map((b) => `  • ${b}`)].join("\n")
    ),
    `SKILLS: ${(resume.skills || []).join(" | ")}`,
    `EDUCATION: ${(resume.education || []).map((e) => `${e.degree}, ${e.school} ${e.year || ""}`).join("; ")}`,
    `CERTIFICATIONS: ${(resume.certifications || []).join(" | ") || "(none listed)"}`,
    `ACHIEVEMENTS: ${(resume.achievements || []).join(" | ") || "(none listed)"}`,
  ];
  return parts.join("\n");
}

function formatDecisions(decisions) {
  if (!decisions?.length) return "(none yet)";
  return decisions
    .map((d) => `- ${d.decision.toUpperCase()}: ${d.section} "${d.proposed || d.original}"${d.reason ? ` — reason: ${d.reason}` : ""}`)
    .join("\n");
}

function formatConversation(messages) {
  if (!messages?.length) return "(conversation not started)";
  return messages.map((m) => `${m.role === "user" ? "CANDIDATE" : "ASSISTANT"}: ${m.content}`).join("\n");
}

/** Token overlap (Jaccard) – catches the same bullet reworded slightly or with a "•" prefix. */
function similarity(a, b) {
  const ta = new Set(contentTokens(a).map(stem));
  const tb = new Set(contentTokens(b).map(stem));
  if (!ta.size || !tb.size) return 0;
  const shared = [...ta].filter((t) => tb.has(t)).length;
  return shared / (ta.size + tb.size - shared);
}

const DUPLICATE_THRESHOLD = 0.8;

/** Returns a list of reasons the edit fails the objectivity rules (empty = valid). Fixes experienceIndex in place. */
function checkEdit(edit, context) {
  const { resume, jd, candidateText } = context;
  const problems = [];
  if (!SECTIONS.has(edit.section)) problems.push(`section must be Summary, Experience or Skills (got "${edit.section}")`);
  if (!TYPES.has(edit.type)) problems.push(`type must be Rewrite, Addition or Removal (got "${edit.type}")`);
  if (problems.length) return problems;

  const original = String(edit.original || "").trim();
  // Models sometimes prefix bullets with "•" or "-"; the resume renders its own bullets.
  const proposed = String(edit.proposed || "").replace(/^\s*[•\-–*]\s*/, "").trim();
  edit.proposed = proposed;

  if (proposed && edit.type !== "Removal") {
    const duplicate = resumeLines(resume).find(
      (l) => normalize(l.text) !== normalize(original) && similarity(l.text, proposed) >= DUPLICATE_THRESHOLD
    );
    if (duplicate) problems.push(`duplicates text already in the resume ("${duplicate.text.slice(0, 80)}") – propose something new`);
    const repeated = (context.decisions || []).find((d) => d.proposed && similarity(d.proposed, proposed) >= DUPLICATE_THRESHOLD);
    if (repeated) problems.push(`repeats an edit the candidate already ${repeated.decision} – move to a different gap`);
  }

  if (edit.type !== "Addition") {
    const match = resumeLines(resume).find((l) => l.section === edit.section && normalize(l.text) === normalize(original));
    if (!match) problems.push(`"original" is not an exact ${edit.section} line from the resume (for Summary, quote the whole summary or one full sentence)`);
    else {
      // Use the resume's exact text so the client can find and replace it.
      edit.original = match.text;
      if (match.experienceIndex != null) edit.experienceIndex = match.experienceIndex;
    }
  }
  if (edit.type !== "Removal" && !proposed) problems.push(`"proposed" is empty`);
  if (edit.type === "Rewrite" && normalize(original) === normalize(proposed)) problems.push("proposed is identical to original");
  if (edit.section === "Experience" && edit.type === "Addition") {
    const idx = Number(edit.experienceIndex);
    if (!Number.isInteger(idx) || !resume.experience?.[idx]) problems.push("Experience Addition needs a valid experienceIndex");
  }

  if (edit.type !== "Removal") {
    // No stock filler the original didn't already have.
    const lowerProposed = proposed.toLowerCase();
    const lowerOriginal = original.toLowerCase();
    const filler = BANNED_PHRASES.filter((p) => lowerProposed.includes(p) && !lowerOriginal.includes(p));
    if (filler.length) problems.push(`uses generic filler: ${filler.map((f) => `"${f}"`).join(", ")}`);

    // No invented numbers: every number must already be in the resume or in what the candidate said.
    const known = new Set([...numbersIn(resumeAsText(resume)), ...numbersIn(candidateText)]);
    const withoutPlaceholders = proposed.replace(/\[[^\]]*\]/g, "");
    const invented = numbersIn(withoutPlaceholders).filter((n) => !known.has(n));
    if (invented.length) problems.push(`introduces numbers not in the resume or the candidate's messages: ${invented.join(", ")} (use a [placeholder] and ask)`);
  }

  if (edit.type !== "Removal") {
    // No borrowed claims: JD terms the resume and the candidate never mention can't be presented as experience.
    const evidence = new Set([...contentTokens(resumeAsText(resume)), ...contentTokens(candidateText), ...contentTokens(original)].map(stem));
    const jdStems = new Set(contentTokens(jd).map(stem));
    const borrowed = [...new Set(contentTokens(proposed).map(stem))].filter((t) => !evidence.has(t) && jdStems.has(t));
    if (borrowed.length >= 3) {
      problems.push(`claims JD activities the resume doesn't show (${borrowed.slice(0, 8).join(", ")}); ask the candidate whether they did this instead of asserting it`);
    }
  }

  if (edit.type !== "Removal") {
    const has = (text, verb) => new RegExp(`(^|[^a-z])${verb.replaceAll("-", "[- ]")}([^a-z]|$)`, "i").test(text);
    const upgraded = OWNERSHIP_VERBS.filter((v) => has(proposed, v) && !has(original, v) && !has(candidateText, v));
    if (upgraded.length) {
      problems.push(`upgrades the candidate's role with "${upgraded.join('", "')}" – the original doesn't say this and the candidate hasn't confirmed it; ask them instead`);
    }
  }

  if (edit.type === "Rewrite") {
    // Keep the specifics: all numbers, and at least 80% of tools/acronyms/versions.
    const proposedLower = proposed.toLowerCase();
    const lostNumbers = numbersIn(original).filter((n) => !proposedLower.includes(n.toLowerCase()));
    if (lostNumbers.length) problems.push(`drops numbers from the original: ${lostNumbers.join(", ")}`);
    const terms = specificTerms(original);
    const lostTerms = terms.filter((t) => !proposedLower.includes(t));
    if (terms.length && lostTerms.length / terms.length > 0.2) {
      problems.push(`drops specific terms from the original: ${lostTerms.slice(0, 8).join(", ")}`);
    }
  }

  if (edit.section === "Skills" && edit.type === "Addition") {
    const evidence = normalize(`${resumeAsText(resume)}\n${candidateText}`);
    if (!evidence.includes(normalize(proposed))) problems.push(`skill "${proposed}" has no evidence in the resume or the candidate's messages`);
  }

  // The targeted requirement must really be in the JD.
  const reqTokens = contentTokens(edit.jdRequirement);
  const jdTokens = new Set(contentTokens(jd));
  if (!reqTokens.length) problems.push(`"jdRequirement" is missing`);
  else if (reqTokens.filter((t) => jdTokens.has(t)).length / reqTokens.length < 0.5) {
    problems.push(`"jdRequirement" doesn't match the job description's wording`);
  }

  return problems;
}

function parseReply(text) {
  const cleaned = String(text || "").replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned);
  return {
    message: typeof parsed.message === "string" ? parsed.message.trim() : "",
    edits: Array.isArray(parsed.edits) ? parsed.edits.slice(0, MAX_EDITS_PER_TURN) : [],
    quickReplies: Array.isArray(parsed.quickReplies) ? parsed.quickReplies.filter((q) => typeof q === "string").slice(0, 3) : [],
    currentGapId: typeof parsed.currentGapId === "string" ? parsed.currentGapId : null,
    coveredGapIds: Array.isArray(parsed.coveredGapIds) ? parsed.coveredGapIds.filter((id) => typeof id === "string") : [],
    done: parsed.done === true,
  };
}

const GAPS_PROMPT = `You compare one candidate's resume with one job description and list the gaps worth working on.
A gap is a JD requirement the resume doesn't clearly show. Mark each one:
- "wording": the resume already shows the experience but undersells it or uses different terms – rewording can fix it.
- "real": the candidate lacks it (years, certification, domain, tool) – rewording can't fix it, only new facts from the candidate can.
Order by impact on this application, highest first. Quote the JD's own key words. Never list something the resume already shows clearly.

Respond with ONLY a JSON object:
{
  "gaps": [
    { "id": "g1", "title": "short label, max 8 words", "detail": "one sentence: what the JD asks vs what the resume shows", "kind": "wording" | "real" }
  ]
}
List 3 to 6 gaps.`;

/** List the gaps between this resume and job, so the candidate can choose which to work on. */
export async function listGaps({ resume, job }) {
  const jd = String(job?.jd || "").slice(0, MAX_JD_CHARS);
  const user = `JOB: ${job?.role || ""} at ${job?.company || ""}
JOB DESCRIPTION:
${jd}

CANDIDATE RESUME:
${formatResume(resume)}

Return ONLY the JSON object.`;
  const cleaned = String(await callLLM({ system: GAPS_PROMPT, user, maxTokens: 1200, json: true })).replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned);
  const gaps = (Array.isArray(parsed.gaps) ? parsed.gaps : [])
    .filter((g) => g && typeof g.title === "string" && g.title.trim())
    .slice(0, 6)
    .map((g, i) => ({
      id: `g${i + 1}`,
      title: g.title.trim().slice(0, 80),
      detail: String(g.detail || "").trim().slice(0, 300),
      kind: g.kind === "real" ? "real" : "wording",
    }));
  return { gaps };
}

function formatFocusGaps(focusGaps) {
  return focusGaps.map((g, i) => `${i + 1}. [${g.id}] ${g.title} (${g.kind} gap) – ${g.detail}`).join("\n");
}

/**
 * Run one assistant turn.
 * @param resume    the candidate's resume with all accepted edits applied
 * @param job       { role, company, jd }
 * @param messages  [{ role: "user" | "assistant", content }] – the chat so far
 * @param decisions [{ decision: "accepted" | "rejected", section, original, proposed, reason? }]
 */
const MAX_QUESTIONS_PER_GAP = 2;

export async function runAssistantTurn({ resume, job, messages = [], decisions = [], focusGaps = [], questionsOnGap = 0 }) {
  const mustDraft = focusGaps.length > 0 && questionsOnGap >= MAX_QUESTIONS_PER_GAP;
  const jd = String(job?.jd || "").slice(0, MAX_JD_CHARS);
  const candidateText = messages.filter((m) => m.role === "user").map((m) => m.content).join("\n");
  const opening = !messages.length;

  const user = `JOB: ${job?.role || ""} at ${job?.company || ""}
JOB DESCRIPTION:
${jd}

CANDIDATE RESUME (current version, with accepted edits applied):
${formatResume(resume)}

EDIT DECISIONS SO FAR (accepted ones are already in the resume above – never propose them again):
${formatDecisions(decisions)}

CONVERSATION:
${formatConversation(messages)}

${focusGaps.length
    ? `GAPS THE CANDIDATE CHOSE TO WORK ON (work only on these, in this order):
${formatFocusGaps(focusGaps)}

${opening
        ? "Start with the first chosen gap: one short sentence on it, then propose an edit the resume already supports or ask one precise question for the missing fact. For a real gap, say plainly it can't be reworded and ask whether the candidate has experience the resume leaves out."
        : "Reply to the candidate's latest message. Stay on the current chosen gap until it is resolved (edit accepted or rejected, or the candidate skips it or has nothing to add), then move to the next chosen gap. When every chosen gap is resolved, set done to true and summarise what changed in under 60 words."}`
    : opening
      ? "Start the conversation: in 2–3 sentences give an objective fit diagnosis naming the top 2–3 gaps (JD requirement vs resume evidence), marking which are real gaps vs wording gaps. Then propose the single highest-impact edit for a wording gap that the resume already supports. Only if no edit is possible without a missing fact, ask one precise question for it instead."
      : "Reply to the candidate's latest message and continue with the next most important gap."}
${mustDraft ? `QUESTION LIMIT REACHED for the current gap: you have already asked ${questionsOnGap} questions. Do NOT ask another question. Propose the edit now as a draft built from the resume and the candidate's answers; put every missing fact in a [square-bracket placeholder] (e.g. [X%], [number of tickets], [tool name]). In the message, say briefly that they can fill in the brackets.
` : ""}Return ONLY the JSON object.`;

  let reply = parseReply(await callLLM({ system: SYSTEM_PROMPT, user, maxTokens: 1500, json: true }));
  const context = { resume, jd, candidateText, decisions };
  let checked = reply.edits.map((edit) => ({ edit, problems: checkEdit(edit, context) }));

  // One repair pass: tell the model exactly which rules each edit broke.
  if (checked.some((c) => c.problems.length)) {
    const feedback = checked
      .map((c, i) => (c.problems.length ? `Edit ${i + 1} ("${String(c.edit.proposed).slice(0, 80)}") was rejected: ${c.problems.join("; ")}.` : `Edit ${i + 1} passed.`))
      .join("\n");
    try {
      const repaired = parseReply(
        await callLLM({
          system: SYSTEM_PROMPT,
          user: `${user}\n\nYour previous reply:\n${JSON.stringify(reply)}\n\nAutomatic checks failed:\n${feedback}\nFix or drop the failing edits (keep passing ones unchanged) and return the full JSON object again. If you need a fact to fix an edit, ask for it instead.`,
          maxTokens: 1500,
          json: true,
        })
      );
      reply = repaired;
      checked = reply.edits.map((edit) => ({ edit, problems: checkEdit(edit, context) }));
    } catch (e) {
      console.warn("[assistant] repair pass failed:", e.message);
    }
  }

  // Question limit: past it, a reply without an edit gets one strict retry.
  if (mustDraft && !reply.edits.length) {
    try {
      reply = parseReply(
        await callLLM({
          system: SYSTEM_PROMPT,
          user: `${user}\n\nYour reply asked another question but the limit is reached. Return the full JSON object again with exactly one edit for the current gap: a draft from the resume and the candidate's answers, with [placeholders] for anything missing. No question.`,
          maxTokens: 1500,
          json: true,
        })
      );
      checked = reply.edits.map((edit) => ({ edit, problems: checkEdit(edit, context) }));
    } catch (e) {
      console.warn("[assistant] draft retry failed:", e.message);
    }
  }

  // Repeat guard: smaller fallback models sometimes re-ask the question they just asked, ignoring the answer.
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  if (lastAssistant && similarity(reply.message, lastAssistant.content) > 0.7) {
    try {
      reply = parseReply(
        await callLLM({
          system: SYSTEM_PROMPT,
          user: `${user}\n\nYour draft reply repeated your previous question: "${reply.message}". Do not ask it again. Use the candidate's latest message: propose an edit from what they said, or ask one different, narrower question, or if the gap can't be helped, mark it covered and move to the next chosen gap (or set done to true if none remain). Return the full JSON object.`,
          maxTokens: 1500,
          json: true,
        })
      );
      checked = reply.edits.map((edit) => ({ edit, problems: checkEdit(edit, context) }));
    } catch (e) {
      console.warn("[assistant] repeat retry failed:", e.message);
    }
  }

  const dropped = checked.filter((c) => c.problems.length);
  if (dropped.length) console.log("[assistant] dropped edits:", dropped.map((c) => c.problems.join("; ")));

  const decidedTexts = new Set(decisions.map((d) => normalize(d.proposed)));
  const edits = checked
    .filter((c) => !c.problems.length && !decidedTexts.has(normalize(c.edit.proposed)))
    .map(({ edit }) => ({
      section: edit.section,
      type: edit.type,
      experienceIndex: edit.section === "Experience" ? Number(edit.experienceIndex) : undefined,
      original: String(edit.original || "").trim(),
      proposed: String(edit.proposed || "").trim(),
      jdRequirement: String(edit.jdRequirement || "").trim(),
      why: String(edit.why || "").trim(),
    }));

  let message = reply.message;
  if (!message) message = edits.length ? "Here's the next edit." : "What would you like to work on next?";
  if (!edits.length && reply.edits.length) {
    // The model's message refers to edits that were all filtered out – say so rather than leave a dangling reference.
    message += "\n\n(I held back the edit I drafted because it didn't pass the accuracy checks – it would have changed or added facts your resume doesn't support. Tell me more about this point, or say \"next gap\".)";
  }

  const focusIds = new Set(focusGaps.map((g) => g.id));
  return {
    message,
    edits,
    quickReplies: reply.quickReplies,
    currentGapId: focusIds.has(reply.currentGapId) ? reply.currentGapId : null,
    coveredGapIds: reply.coveredGapIds.filter((id) => focusIds.has(id)),
    done: reply.done,
  };
}
