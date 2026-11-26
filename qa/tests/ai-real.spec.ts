// REAL-model output-quality pass (7b). Needs: QA_REAL=1, QA_RUN_DIR, BASE_URL (vite copy) whose API is the real server. Laptop only (device independent AI content).
// @ts-nocheck
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { bootReal, snap, checkCards, checkCounts, checkHighlights, storeOf, setLabel, RUN, OUT } from './real';
import * as L from '../llm/lib.mjs';
import { HOSTILE, JD_PM, JD_HINGLISH } from '../llm/fixtures.mjs';

const scenarios: [string, () => Promise<void>][] = [];
const T = (title: string, fn: () => Promise<void>) => scenarios.push([title, fn]);
test.beforeEach(async ({}, ti) => { test.skip(ti.project.name !== 'laptop-chrome' || !process.env.QA_REAL, 'real-model pass: QA_REAL=1 and laptop-chrome only'); });
let page: any; let ctx: any; const turns: any[] = []; let userSaid = '';
const SHOTS = path.join(RUN, 'screens', 'laptop-chrome'); fs.mkdirSync(SHOTS, { recursive: true });
const flush = () => fs.writeFileSync(path.join(OUT, `turns${process.env.QA_TAG ? '-' + process.env.QA_TAG : ''}.json`), JSON.stringify(turns, null, 1));
const CANNOT = /can't|cannot|can not|unable|not able|don't have|do not have|isn't something|not something|only (?:edit|change|work)|no way to|not supported|unfortunately|aren't able|isn't (?:possible|supported)/i;

test.beforeAll(async ({ browser }, ti) => {
  if (ti.project.name !== 'laptop-chrome' || !process.env.QA_REAL) return;
  ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: process.env.BASE_URL });
  page = await ctx.newPage();
});
test.afterAll(async () => { try { const s = await snap(page); fs.writeFileSync(path.join(OUT, 'final-store.json'), JSON.stringify(s.chat)); } catch {} await ctx?.close(); });

async function shot(name: string) { await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); }

async function pasteJob(label: string, jd: string) {
  label = (process.env.QA_LABEL_PREFIX || '') + label;
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
  label = (process.env.QA_LABEL_PREFIX || '') + label;
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

T('[TC-AIQ-001] real pipeline: paste a job description on a hostile resume -> suggestions pass invariants 1,2,3,8,9', async () => {
  await bootReal(page, storeOf(HOSTILE, { mode: 'tailor' }));
  const { rec } = await pasteJob('A0-suggest-hostile', JD_PM);
  expect(rec.ok, 'workspace opened with suggestions from the real model').toBe(true);
  const b = bad(rec); expect.soft(b.inv1_noop, 'inv1 no-op / low-value suggestions').toEqual([]); expect.soft(b.inv2_diff, 'inv2 diff strikes identical-looking words').toEqual([]); expect.soft(b.inv3_chip, 'inv3 chip for a word already on the resume').toEqual([]); expect.soft(b.inv8_counts, 'inv8 counts').toEqual([]);
});
T('[TC-AIQ-002] ESC-002 "reduce the long list of core competencies, make it ATS ready" changes Core Competencies or says it cannot', async () => {
  const { rec } = await turn('A1-ESC002-core-competencies', 'We can reduce the long list of core competencies, make it ATS ready', { section: 'otherSections:Core Competencies' });
  expect.soft(rec.capability.verdict, JSON.stringify(rec.capability) + ' | reply: ' + rec.reply).toMatch(/^PASS/);
  expect.soft(bad(rec).inv4_claim, 'reply claims a change to a section no suggestion touches: ' + rec.reply).toEqual([]);
});
T('[TC-AIQ-003] ESC-003 after "no you trimmed skills not core competencies" it must not claim a restore that no suggestion makes', async () => {
  const { rec } = await turn('A2-ESC003-correction', 'no you trimmed skills not core competencies', { section: 'otherSections:Core Competencies' });
  expect.soft(rec.capability.verdict, JSON.stringify(rec.capability) + ' | reply: ' + rec.reply).toMatch(/^PASS/);
  expect.soft(bad(rec).inv4_claim, 'reply: ' + rec.reply).toEqual([]);
});
T('[TC-AIQ-004] same request twice: the second answer does not duplicate the first (invariant 7)', async () => {
  const { rec } = await turn('A3-repeat-ask', 'We can reduce the long list of core competencies, make it ATS ready', { section: 'otherSections:Core Competencies' });
  expect.soft(bad(rec).inv7_repeat, 'repeat cards').toEqual([]);
  expect.soft(rec.inTurnDup, 'two cards on the same line in one turn').toEqual([]);
  expect.soft(bad(rec).inv8_counts, 'counts').toEqual([]);
});
T('[TC-AIQ-005] Apply all, then ask again: applied suggestions do not come back, highlights only on real changes, counts agree', async () => {
  setLabel('A4-applyall');
  const pre = await snap(page);
  await page.getByRole('button', { name: 'Apply all ready' }).click(); await page.waitForTimeout(800);
  const post = await snap(page);
  const changed = L.changedSections(pre.chat.resume, post.chat.resume);
  const hl = checkHighlights(post, pre.chat.resume); const counts = checkCounts(post);
  const pending = Object.values(pre.chat.suggestions).filter((x: any) => x.status === 'pending' && x.edit && !x.question).length;
  const appliedN = Object.values(post.chat.suggestions).filter((x: any) => x.status === 'applied').length;
  turns.push({ label: 'A4-applyall', kind: 'applyAll', pendingBefore: pending, appliedAfter: appliedN, status: post.dom.status, changedSections: changed, highlightsWrong: hl, counts, highlightedLines: post.dom.hl.map((h: any) => ({ line: h.line, ins: h.ins })) }); flush(); await shot('A4-applyall');
  fs.writeFileSync(path.join(OUT, 'A4-applyall.snap.json'), JSON.stringify(post, null, 1));
  expect.soft(hl, 'inv10 highlights on unchanged words').toEqual([]); expect.soft(counts.issues, 'inv8').toEqual([]);
  const { rec } = await turn('A5-ask-after-applyall', 'reduce the core competencies to the 8 most relevant ones', { section: 'otherSections:Core Competencies' });
  expect.soft(rec.repeats, 'applied suggestion came back').toEqual([]);
  expect.soft(bad(rec).inv8_counts, 'counts').toEqual([]);
});
T('[TC-AIQ-006] Reset, then ask again: counts reset and answers still honest', async () => {
  await page.getByRole('button', { name: 'Reset' }).click(); await page.waitForTimeout(600);
  const post = await snap(page); const counts = checkCounts(post);
  turns.push({ label: 'A6-reset', kind: 'reset', counts, resumeEqualsOriginal: JSON.stringify(post.chat.resume) === JSON.stringify(post.chat.original), changedVsOriginal: L.changedSections(post.chat.original, post.chat.resume) }); flush(); await shot('A6-reset');
  expect.soft(counts.issues, 'inv8 after reset').toEqual([]);
  expect.soft(L.changedSections(post.chat.original, post.chat.resume), 'reset restores original').toEqual([]);
  const { rec } = await turn('A7-ask-after-reset', 'shorten the summary', { section: 'summary' });
  expect.soft(rec.capability.verdict, rec.reply).toMatch(/^PASS/);
  expect.soft(bad(rec).inv8_counts).toEqual([]);
});
for (const [id, label, text, section] of [
  ['007', 'B1-onepage', 'can you make it fit one page?', null],
  ['008', 'B2-weakest-bullets', 'remove the weakest bullets', 'experience bullets'],
  ['009', 'B3-led-team-6', 'add that I led a team of 6', null],
  ['010', 'B4-skills-top10', 'reduce skills to the top 10', 'skills'],
  ['011', 'B5-unsupported', 'add a profile photo and switch the whole resume to German', null],
] as any[]) {
  T(`[TC-AIQ-${id}] scripted scenario: "${text}"`, async () => {
    const { rec, newCards } = await turn(label, text, section ? { section } : {});
    const b = bad(rec);
    expect.soft(b.inv1_noop, 'inv1').toEqual([]); expect.soft(b.inv2_diff, 'inv2').toEqual([]); expect.soft(b.inv3_chip, 'inv3').toEqual([]); expect.soft(b.inv4_claim, 'inv4 reply: ' + rec.reply).toEqual([]); expect.soft(b.inv4_count, 'inv4 count').toEqual([]); expect.soft(b.inv8_counts, 'inv8').toEqual([]);
    expect.soft(rec.cardChecks.flatMap((c: any) => c.issues.filter((i: any) => i.inv === 9)), 'inv9 new facts').toEqual([]);
    if (section) expect.soft(rec.capability.verdict, rec.reply).toMatch(/^PASS/);
    if (label === 'B5-unsupported') expect.soft(CANNOT.test(rec.reply) || newCards.length === 0, 'an impossible request must be declined plainly: ' + rec.reply).toBe(true);
    if (label === 'B3-led-team-6') expect.soft(rec.cardChecks.flatMap((c: any) => c.issues.filter((i: any) => i.inv === 9 && /\b(7|8|9|10|12)\b/.test(JSON.stringify(i)))), 'invented a different team size').toEqual([]);
  });
}
// Capability honesty for EVERY section type (invariant 5): one "trim/shorten" ask per section.
const SECTIONS: [string, string, string][] = [
  ['012', 'C1-core-competencies', 'otherSections:Core Competencies'], ['013', 'C2-projects', 'projects'], ['014', 'C3-volunteer', 'volunteer'], ['015', 'C4-achievements', 'achievements'],
  ['016', 'C5-languages', 'languages'], ['017', 'C6-interests', 'interests'], ['018', 'C7-publications', 'publications'], ['019', 'C8-references', 'references'], ['020', 'C9-positions', 'otherSections:Positions of Responsibility'], ['021', 'C10-certifications', 'certifications'],
];
const ASKS: Record<string, string> = { 'otherSections:Core Competencies': 'trim the core competencies section to the 8 strongest', projects: 'shorten the projects section', volunteer: 'remove the volunteering section', achievements: 'trim my achievements to the top 2', languages: 'remove Tamil from my languages', interests: 'remove the interests section', publications: 'remove the publications section', references: 'remove the references section', 'otherSections:Positions of Responsibility': 'trim positions of responsibility to the top 2', certifications: 'remove the Google Data Analytics certificate' };
for (const [id, label, section] of SECTIONS) {
  T(`[TC-AIQ-${id}] capability honesty: "${ASKS[section]}" changes THAT section or says it cannot`, async () => {
    const { rec } = await turn(label, ASKS[section], { section });
    expect.soft(rec.capability.verdict, JSON.stringify({ touched: rec.sectionsTouched, reply: rec.reply })).toMatch(/^PASS/);
  });
}

test('[TC-AIQ-100] real-model scenario run (each step is one TC; soft failures are product findings)', async () => {
  test.setTimeout(3_600_000);
  const only = (process.env.QA_ONLY || '').split(',').filter(Boolean);
  for (const [title, fn] of scenarios.filter(([t]) => !only.length || only.some((o) => t.includes(o)))) {
    await test.step(title, async () => {
      try { await fn(); } catch (e: any) { expect.soft(false, 'step threw: ' + String(e?.message || e).slice(0, 400)).toBe(true); }
    });
  }
});
