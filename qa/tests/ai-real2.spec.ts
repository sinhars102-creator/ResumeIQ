// REAL-model output-quality pass (7b). Needs: QA_REAL=1, QA_RUN_DIR, BASE_URL (vite copy) whose API is the real server. Laptop only (device independent AI content).
// @ts-nocheck
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { bootReal, snap, checkCards, checkCounts, checkHighlights, storeOf, setLabel, RUN, OUT } from './real';
import * as L from '../llm/lib.mjs';
import { HOSTILE, JD_PM, JD_HINGLISH } from '../llm/fixtures.mjs';

const scenarios: [string, () => Promise<void>][] = [];
const T = (title: string, fn: () => Promise<void>) => scenarios.push([title, fn]);
test.beforeEach(async ({}, ti) => { test.skip(ti.project.name !== 'laptop-chrome' || !process.env.QA_REAL, 'real-model pass: QA_REAL=1 and laptop-chrome only'); });
let page: any; let ctx: any; const turns: any[] = []; let userSaid = '';
const SHOTS = path.join(RUN, 'screens', 'laptop-chrome'); fs.mkdirSync(SHOTS, { recursive: true });
const flush = () => fs.writeFileSync(path.join(OUT, `turns-${process.env.QA_TAG || 'r2'}.json`), JSON.stringify(turns, null, 1));
const CANNOT = /can't|cannot|can not|unable|not able|don't have|do not have|isn't something|not something|only (?:edit|change|work)|no way to|not supported|unfortunately|aren't able|isn't (?:possible|supported)/i;

let browserRef: any;
async function fresh() { await ctx?.close(); ctx = await browserRef.newContext({ viewport: { width: 1440, height: 900 }, baseURL: process.env.BASE_URL }); page = await ctx.newPage(); }
test.beforeAll(async ({ browser }, ti) => {
  if (ti.project.name !== 'laptop-chrome' || !process.env.QA_REAL) return;
  browserRef = browser;
  ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: process.env.BASE_URL });
  page = await ctx.newPage();
});
test.afterAll(async () => { try { const s = await snap(page); fs.writeFileSync(path.join(OUT, 'final-store.json'), JSON.stringify(s.chat)); } catch {} await ctx?.close(); });

async function shot(name: string) { await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); }

async function pasteJob(label: string, jd: string) {
  setLabel(label);
  const box = page.locator('textarea').first();
  await box.fill(jd);
  await page.getByRole('button', { name: 'Send' }).first().click();
  await page.locator('.ws-sub').waitFor({ timeout: 170000 }).catch(() => {});
  await page.waitForTimeout(500);
  const s = await snap(page);
  const rec = { label, kind: 'suggest', jdChars: jd.length, snapshot: s.dom.sub, ok: !!s.dom.sub, botText: s.chat.messages?.filter((m: any) => m.role === 'bot').map((m: any) => m.text).slice(-2), cardChecks: checkCards(s, jd), counts: checkCounts(s), thread: s.chat.thread };
  turns.push(rec); flush(); fs.writeFileSync(path.join(OUT, `${label}.snap.json`), JSON.stringify(s, null, 1)); await shot(label);
  return { s, rec };
}

async function turn(label: string, text: string, opt: { section?: string } = {}) {
  setLabel(label);
  const before = await snap(page);
  const prevThread = (before.chat.thread || []).length; userSaid += '\n' + text;
  await page.locator('.ws-askbox textarea').fill(text);
  await page.locator('.ws-askbox button[type=submit]').click();
  await page.waitForFunction((n) => document.querySelectorAll('.ws-bub').length >= n + 2 && !document.querySelector('.ws-typing'), prevThread, { timeout: 170000 }).catch(() => {});
  await page.waitForTimeout(400);
  const after = await snap(page);
  const thread = (after.chat.thread || []).slice(prevThread);
  const reply = [...thread].reverse().find((m: any) => m.role === 'bot')?.text || '';
  const bsug = before.chat.suggestions || {}, asug = after.chat.suggestions || {};
  const newCards = Object.values(asug).filter((x: any) => !bsug[x.id]) as any[];
  const jd = after.chat.jd || '';
  const rec: any = { label, kind: 'ask', user: text, reply, newCards: newCards.map((c) => ({ id: c.id, pin: c.pin, target: c.edit?.target || c.target, op: c.edit?.op, title: c.title, before: c.before, after: c.edit?.after ?? c.edit?.skills ?? c.edit?.items, status: c.status })) };
  rec.sectionsTouched = [...new Set(newCards.map(L.sectionOfCard).filter(Boolean))];
  rec.claim = L.claimCheck(reply, newCards);
  const m = /(?:added|adding)\s+(\d+)\s+suggestion/i.exec(reply); rec.replyCount = m ? +m[1] : null; rec.countMismatch = m && +m[1] !== newCards.length ? { says: +m[1], real: newCards.length } : null;
  rec.resumeChangedWithoutApply = L.changedSections(before.chat.resume, after.chat.resume);
  // repeats (7): a new card that duplicates an earlier one (any status) on the same line with the same text
  const key = (c: any) => `${c.edit?.target}|${L.norm(JSON.stringify(c.edit?.after ?? c.edit?.skills ?? c.edit?.items ?? c.edit?.op))}`;
  const old = Object.values(bsug) as any[];
  rec.repeats = newCards.filter((c) => old.some((o) => o.id !== c.id && key(o) === key(c))).map((c) => ({ id: c.id, target: c.edit?.target, status_of_earlier: old.find((o) => key(o) === key(c)).status }));
  rec.sameLineAsEarlier = newCards.filter((c) => old.some((o) => (o.edit?.target || o.target) === (c.edit?.target || c.target) && ['applied', 'dismissed'].includes(o.status))).map((c) => c.edit?.target);
  rec.inTurnDup = newCards.filter((c, i) => newCards.findIndex((d) => (d.edit?.target) === (c.edit?.target) && c.edit?.op === d.edit?.op && c.edit?.op === 'replace') !== i).map((c) => c.edit?.target);
  // capability honesty (5/6)
  if (opt.section) {
    const touched = rec.sectionsTouched; const hit = touched.includes(opt.section) || touched.some((t: string) => t.startsWith(opt.section));
    const cannot = CANNOT.test(reply);
    rec.capability = { requested: opt.section, touchedRequested: hit, saysCannot: cannot, touchedOther: touched.filter((t: string) => !t.startsWith(opt.section)), claimsRequested: rec.claim.claims && rec.claim.mentioned.includes(opt.section) };
    rec.capability.verdict = hit ? 'PASS (changed that section)' : cannot && !rec.claim.falseClaim.length ? 'PASS (said it cannot)' : rec.claim.falseClaim.length ? 'FAIL (claims a change no suggestion makes)' : touched.length ? 'FAIL (changed another section, did not say so)' : 'FAIL (nothing changed, nothing explained)';
  }
  rec.cardChecks = checkCards(after, jd, userSaid);
  rec.counts = checkCounts(after);
  rec.status = after.dom.status; rec.thread = thread.map((m: any) => `${m.role}: ${m.text}`);
  rec.domAfter = { sub: after.dom.sub, tabs: after.dom.tabs, cards: after.dom.cards.slice(-Math.max(newCards.length, 1)) };
  turns.push(rec); flush(); await shot(label); fs.writeFileSync(path.join(OUT, `${label}.snap.json`), JSON.stringify(after, null, 1));
  return { before, after, rec, newCards };
}
const bad = (rec: any) => ({
  inv1_noop: rec.cardChecks?.flatMap((c: any) => c.issues.filter((i: any) => i.inv === 1).map((i: any) => `#${c.pin} ${i.kind}`)) ?? [],
  inv2_diff: rec.cardChecks?.flatMap((c: any) => c.issues.filter((i: any) => i.inv === 2).map((i: any) => `#${c.pin}`)) ?? [],
  inv3_chip: rec.cardChecks?.flatMap((c: any) => c.issues.filter((i: any) => i.inv === 3).map((i: any) => `#${c.pin} ${JSON.stringify(i.detail)}`)) ?? [],
  inv4_claim: rec.claim?.falseClaim ?? [], inv4_count: rec.countMismatch ? [JSON.stringify(rec.countMismatch)] : [],
  inv7_repeat: rec.repeats ?? [], inv8_counts: rec.counts?.issues ?? [],
});


const SD = path.resolve(__dirname, '..', '..', 'test-data', 'sample-resumes-pdf');
async function uploadSample(label: string, file: string) {
  setLabel(label);
  await page.locator('input[type=file]').first().setInputFiles(path.join(SD, file));
  await page.getByText(/^Got it|couldn't read that resume/).first().waitFor({ timeout: 170000 }).catch(() => {});
  await page.waitForTimeout(500);
  const st = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('riq_resume_llm_v1') || '{}'); const c = (s.chats || []).find((x: any) => x.id === s.activeId) || s.chats?.[0]; return c; });
  fs.writeFileSync(path.join(OUT, `${label}.parsed.json`), JSON.stringify(st?.resume || null, null, 1));
  await page.screenshot({ path: path.join(SHOTS, `${label}.png`) });
  return st?.resume;
}
T('[TC-AIQ-030] Hinglish job description gets suggestions in English that stay inside the resume facts', async () => {
  await fresh(); await bootReal(page, storeOf(HOSTILE, { mode: 'tailor' }));
  const { rec } = await pasteJob('H1-hinglish-jd', JD_HINGLISH);
  expect.soft(rec.ok, 'workspace opened').toBe(true);
  const b = bad(rec); expect.soft(b.inv1_noop, 'inv1').toEqual([]); expect.soft(b.inv3_chip, 'inv3').toEqual([]); expect.soft(b.inv8_counts, 'inv8').toEqual([]);
  expect.soft(rec.cardChecks.flatMap((c: any) => c.issues.filter((i: any) => i.inv === 9)), 'inv9 new facts').toEqual([]);
});
T('[TC-AIQ-031] "Improve my resume" (review pipeline) on the hostile resume: suggestions pass invariants 1,2,3,8,9', async () => {
  setLabel('I1-improve');
  await page.getByRole('button', { name: 'Improve my resume' }).first().click();
  await page.waitForFunction(() => /Improving your resume/.test(document.querySelector('.ws-head h1')?.textContent || ''), null, { timeout: 170000 }).catch(() => {});
  await page.waitForTimeout(600);
  const s = await snap(page);
  const rec = { label: 'I1-improve', kind: 'improve', h1: s.dom.h1, sub: s.dom.sub, cardChecks: checkCards(s, ''), counts: checkCounts(s), score: s.dom.score, cards: s.dom.cards.map((c: any) => ({ pin: c.pin, where: c.where, tag: c.tag, blocks: c.blocks.map((b: any) => b.text) })) };
  turns.push(rec); flush(); fs.writeFileSync(path.join(OUT, 'I1-improve.snap.json'), JSON.stringify(s, null, 1)); await shot('I1-improve');
  const b = bad(rec); expect.soft(b.inv1_noop, 'inv1').toEqual([]); expect.soft(b.inv2_diff, 'inv2').toEqual([]); expect.soft(b.inv3_chip, 'inv3').toEqual([]); expect.soft(b.inv8_counts, 'inv8').toEqual([]);
  expect.soft(rec.cardChecks.flatMap((c: any) => c.issues.filter((i: any) => i.inv === 9)), 'inv9').toEqual([]);
});
T('[TC-AIQ-032] a sample resume with a real "Core Competencies" heading (09 Fatima, .pdf) is read, tailored, and "trim core competencies" is honest', async () => {
  await fresh(); await bootReal(page, seedStoreEmpty());
  const parsed = await uploadSample('P1-parse-09-fatima', '09_Fatima_Sheikh_Talent_Acquisition.pdf');
  expect.soft(!!parsed, 'resume parsed').toBe(true);
  if (!parsed) return;
  const where = { skills: (parsed.skills || []).length, other: (parsed.otherSections || []).map((o: any) => `${o.title}(${o.items.length})`), }; turns.push({ label: 'P1-parse-where-core-competencies-went', kind: 'parse', where }); flush();
  await page.getByRole('button', { name: /Tailor it to a job/ }).first().click();
  const { rec } = await pasteJob('P2-suggest-fatima', `Talent Acquisition Lead, Noida. We are hiring a Talent Acquisition Lead to build and run end-to-end recruitment for technology and business hires. You will own hiring plans with business heads, manage a team of recruiters, improve time-to-fill and quality of hire, run employer branding and campus drives, and use an ATS and hiring analytics to report to leadership. 8+ years of talent acquisition experience, stakeholder management, vendor management and strong sourcing skills required. Experience with diversity hiring and offer negotiation preferred.`);
  expect.soft(rec.ok, 'workspace opened').toBe(true);
  const hasCC = (parsed.otherSections || []).some((o: any) => /competenc/i.test(o.title));
  const t = await turn('P3-ask-core-competencies-fatima', 'trim the core competencies, make it ATS ready', hasCC ? { section: 'otherSections:' + (parsed.otherSections || []).find((o: any) => /competenc/i.test(o.title)).title } : { section: 'skills' });
  expect.soft(t.rec.capability.verdict, JSON.stringify({ hasCoreCompetenciesSection: hasCC, reply: t.rec.reply })).toMatch(/^PASS/);
  const t2 = await turn('P4-correction-fatima', 'no you trimmed skills, not core competencies', hasCC ? { section: 'otherSections:' + (parsed.otherSections || []).find((o: any) => /competenc/i.test(o.title)).title } : {});
  expect.soft(bad(t2.rec).inv4_claim, 'reply: ' + t2.rec.reply).toEqual([]);
});
T('[TC-AIQ-033] a resume with projects + publications (03 Priya, .pdf) is read and "shorten publications" is honest', async () => {
  await fresh(); await bootReal(page, seedStoreEmpty());
  const parsed = await uploadSample('Q1-parse-03-priya', '03_Priya_Nair_Data_Scientist.pdf');
  expect.soft(!!parsed, 'resume parsed').toBe(true);
  if (!parsed) return;
  turns.push({ label: 'Q1-parse-where', kind: 'parse', keys: Object.keys(parsed).filter((k) => { const v = (parsed as any)[k]; return Array.isArray(v) ? v.length : !!v; }), projects: (parsed.projects || []).length, publications: (parsed.publications || []).length, other: (parsed.otherSections || []).map((o: any) => o.title) }); flush();
  await page.getByRole('button', { name: /Tailor it to a job/ }).first().click();
  const { rec } = await pasteJob('Q2-suggest-priya', `Data Scientist, Hyderabad. Build NLP and recommendation models for a consumer platform. Own the full lifecycle: problem framing, feature engineering, training, evaluation, A/B testing and deployment with ML engineers. Strong Python, SQL, PyTorch or TensorFlow. Experience with ranking, embeddings and LLM-based applications. 3+ years of experience. Publications or open-source contributions are a plus. Communicate results to product managers and leadership.`);
  expect.soft(rec.ok, 'workspace opened').toBe(true);
  if (!(parsed.publications || []).length) return;
  const t = await turn('Q3-shorten-publications', 'shorten my publications list to the best one', { section: 'publications' });
  expect.soft(t.rec.capability.verdict, t.rec.reply).toMatch(/^PASS/);
});
T('[TC-AIQ-034] answering a question card and "Another version" (regenerate) on the hostile resume stay honest', async () => {
  await fresh(); await bootReal(page, storeOf(HOSTILE, { mode: 'tailor' }));
  await pasteJob('R1-suggest-again', JD_PM);
  setLabel('R2-answer-question');
  const q = page.locator('.ws-card').filter({ has: page.locator('.ws-q') }).first();
  if (await q.count()) {
    const before = await snap(page);
    await q.locator('textarea').fill('Yes, I mentored 3 associate product managers at PayNest and two of them were promoted.');
    userSaid += '\nYes, I mentored 3 associate product managers at PayNest and two of them were promoted.';
    await q.getByRole('button', { name: 'Send' }).click();
    await page.waitForFunction(() => !document.querySelector('.ws-typing') && !/…/.test(document.querySelector('.ws-card .ws-qa-row .ws-pri')?.textContent || ''), null, { timeout: 170000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const after = await snap(page);
    const rec = { label: 'R2-answer-question', kind: 'answer', cardChecks: checkCards(after, JD_PM, userSaid), counts: checkCounts(after), thread: after.dom.thread, newPending: Object.values(after.chat.suggestions).filter((x: any) => !before.chat.suggestions[x.id] || before.chat.suggestions[x.id].edit !== x.edit).map((x: any) => ({ pin: x.pin, target: x.edit?.target, after: x.edit?.after })) };
    turns.push(rec); flush(); await shot('R2-answer-question'); fs.writeFileSync(path.join(OUT, 'R2-answer-question.snap.json'), JSON.stringify(after, null, 1));
    expect.soft(bad(rec).inv8_counts, 'inv8').toEqual([]);
    expect.soft(rec.cardChecks.flatMap((c: any) => c.issues.filter((i: any) => i.inv === 9)), 'inv9: numbers beyond the 3 the user gave').toEqual([]);
  }
  setLabel('R3-another-version');
  const card = page.locator('.ws-card').filter({ has: page.getByRole('button', { name: /Another version/ }) }).first();
  if (await card.count()) {
    const before = await snap(page);
    await card.getByRole('button', { name: /Another version/ }).click();
    await page.waitForFunction(() => !document.querySelector('.ws-typing') && /Working/.test(document.querySelector('.ws-status')?.textContent || '') === false, null, { timeout: 170000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const after = await snap(page);
    const rec = { label: 'R3-another-version', kind: 'regenerate', status: after.dom.status, cardChecks: checkCards(after, JD_PM, userSaid), counts: checkCounts(after) };
    turns.push(rec); flush(); await shot('R3-another-version');
    expect.soft(bad(rec).inv8_counts, 'inv8').toEqual([]);
  }
});

T('[TC-AIQ-035] ESC-003 variant: the (wrong) trimmed Skills change is APPLIED, then "no you trimmed skills not core competencies"', async () => {
  const P = process.env.QA_LABEL_PREFIX || '';
  const base = JSON.parse(fs.readFileSync(path.join(OUT, 'A0-suggest-hostile.snap.json'), 'utf8')).chat;
  await fresh(); await bootReal(page, { activeId: base.id, chats: [base] });
  await page.waitForSelector('.ws-sub');
  const a = await turn('E3-ask-core-competencies', 'We can reduce the long list of core competencies, make it ATS ready', { section: 'otherSections:Core Competencies' });
  const kcard = a.newCards.find((c: any) => c.edit?.target === 'K');
  if (kcard) {
    await page.locator(`#ws-card-${kcard.id}`).getByRole('button', { name: 'Apply to resume' }).click();
    await page.waitForTimeout(600);
  }
  const before = await snap(page);
  const b = await turn('E3-correction-after-apply', 'no you trimmed skills not core competencies', { section: 'otherSections:Core Competencies' });
  const restores = /\brestor|\bput (?:it|them) back|\bbring(?:ing)? (?:it|them) back|\brevert|\bundo/i.test(b.rec.reply);
  turns.push({ label: P + 'E3-verdict', kind: 'verdict', skillsAppliedBeforeCorrection: !!kcard, replyClaimsRestore: restores, newCardsTouchCoreCompetencies: b.rec.sectionsTouched, skillsStillTrimmed: before.chat.resume.skills.length, originalSkills: before.chat.original.skills.length }); flush();
  expect.soft(b.rec.capability.verdict, b.rec.reply).toMatch(/^PASS/);
  if (restores) expect.soft(b.newCards.some((c: any) => (c.edit?.target === 'K' && c.edit?.op !== 'set_skills') || c.edit?.target === 'K'), 'claims to restore: some card must undo the skills trim').toBe(true);
});
const seedStoreEmpty = () => ({ activeId: 'c1', chats: [{ id: 'c1', title: 'New chat', resume: null, jd: '', job: null, baseScore: null, suggestions: {}, queue: [], mode: null, messages: [], updatedAt: Date.now() }] });
test('[TC-AIQ-101] real-model scenario run 2 (each step is one TC; soft failures are product findings)', async () => {
  test.setTimeout(3_600_000);
  const only = (process.env.QA_ONLY || '').split(',').filter(Boolean);
  for (const [title, fn] of scenarios.filter(([t]) => !only.length || only.some((o) => t.includes(o)))) {
    await test.step(title, async () => {
      try { await fn(); } catch (e: any) { expect.soft(false, 'step threw: ' + String(e?.message || e).slice(0, 400)).toBe(true); }
    });
  }
});
