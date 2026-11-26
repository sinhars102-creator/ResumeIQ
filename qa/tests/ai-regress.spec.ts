// Permanent regression tests for the founder-reported escapes (ESC-001..003). No model needed: they use the real product code
// with hostile text, and (for ESC-002/003) the model output recorded from the real model in qa/runs/*/llm-corpus.
// @ts-nocheck
import { test, expect, seedStore, JD, isPhone } from './fixture';
import { chatBox } from './helpers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { HOSTILE, JD_PM } from '../llm/fixtures.mjs';
import * as L from '../llm/lib.mjs';
import { cleanEdit, claimContext, resumeLines, chatTurn } from '../../server/tailorChat.js';
import { wordDiff } from '../../src/wordDiff.js';

const nodeOnly = (ti: any) => test.skip(ti.project.name !== 'laptop-chrome', 'device independent (server/pure-code check): runs once on laptop-chrome');
const H = '‑';

test.describe('ESC-001 hostile hyphens, quotes, no-op suggestions', () => {
  test('[TC-AIQ-R01] wordDiff does not strike and re-add words that differ only by lookalike characters', async ({}, ti) => {
    nodeOnly(ti);
    const d = wordDiff(`Owned supply${H}side growth for a “high‐scale” marketplace`, 'Owned supply-side growth for a "high-scale" marketplace');
    expect(d.filter((p) => p.t !== '='), 'only lookalike characters differ, so the diff should show no change at all').toEqual([]);
  });
  test('[TC-AIQ-R02] server drops a suggestion whose only change is hyphen/quote variants plus one trivial word (low-value)', async ({}, ti) => {
    nodeOnly(ti);
    const before = `Owned supply${H}side growth for a high${H}scale marketplace`;
    const resume = { title: 'PM', summary: 's', experience: [{ company: 'A', role: 'PM', period: '2020', bullets: [before] }], skills: ['SQL'] };
    const e = cleanEdit({ target: 'E0B0', op: 'replace', after: 'Owned supply-side growth for high-scale marketplace' }, resume, claimContext(resume, ''));
    expect(e, 'low-value edit (dash variants + dropped article) must not become a card').toBeNull();
  });
  test('[TC-AIQ-R03] the no-op filter does not treat two different non-Latin lines as equal', async ({}, ti) => {
    nodeOnly(ti);
    const resume = { title: 'PM', summary: 's', experience: [{ company: 'A', role: 'PM', period: '2020', bullets: ['उत्पाद प्रबंधन किया'] }], skills: ['SQL'] };
    const e = cleanEdit({ target: 'E0B0', op: 'replace', after: 'विपणन रणनीति बनाई' }, resume, claimContext(resume, ''));
    expect(e, 'a genuine Hindi rewrite was silently dropped because the no-op filter strips every non a-z0-9 character').not.toBeNull();
  });
  const uiStore = (over: any = {}) => seedStore({ resume: { ...HOSTILE, experience: [{ company: 'PayNest', role: 'Senior PM', period: '2021', bullets: [`Owned supply${H}side growth for a high${H}scale merchant marketplace`] }] }, jd: JD_PM, job: { title: 'Senior PM', company: 'X' }, baseScore: 60, workspace: true, pinCount: 1, messages: [{ id: 'm1', role: 'bot', text: 'Hi' }],
    suggestions: { s1: { id: 's1', priority: 'must', title: 'Sharpen this bullet', why: 'Matches the job', where: 'PayNest · bullet 1', category: 'experience', source: 'job', pin: 1, status: 'pending', target: 'E0B0', before: `Owned supply${H}side growth for a high${H}scale merchant marketplace`, edit: { target: 'E0B0', op: 'replace', after: 'Owned supply-side growth for high-scale merchant marketplace' } } }, ...over });
  test('[TC-AIQ-R04] card shows no struck-and-re-added identical-looking words and no "Adds" chip for words already on the resume', async ({ page, boot, api }) => {
    await boot(uiStore());
    if (isPhone(page)) { await page.getByRole('button', { name: /Review/ }).first().click(); }
    const dels = await page.locator('.ws-card del, .ws-sheet del').allTextContents(); const inss = await page.locator('.ws-card .ws-txt:nth-of-type(2) ins, .ws-sheet ins').allTextContents();
    const lies = dels.flatMap((d) => inss.filter((i) => d !== i && L.fold(d) === L.fold(i)).map((i) => [d, i]));
    expect(lies, 'struck word and added word look identical').toEqual([]);
    const chips = await page.locator('.ws-kw span').allTextContents();
    expect(chips, 'chips for words already on the resume').toEqual([]);
  });
});

const corpus = (() => {
  const runs = path.join(__dirname, '..', 'runs'); const out: any = {};
  if (!fs.existsSync(runs)) return out;
  for (const r of fs.readdirSync(runs).sort()) { const d = path.join(runs, r, 'llm-corpus'); if (!fs.existsSync(d)) continue; const idx = path.join(d, 'index.json'); if (fs.existsSync(idx)) Object.assign(out, Object.fromEntries(JSON.parse(fs.readFileSync(idx, 'utf8')).map((e: any) => [e.label, { ...e, dir: d }]))); }
  return out;
})();
/** Replay: feed the model output recorded from the REAL model into the real chatTurn, with the network stubbed. */
async function replay(label: string, history: any[] = []) {
  const e = corpus[label]; if (!e) return null;
  const http = JSON.parse(fs.readFileSync(path.join(e.dir, e.http), 'utf8'));
  const models = e.models.map((m: string) => JSON.parse(fs.readFileSync(path.join(e.dir, m), 'utf8')));
  let i = 0; const real = globalThis.fetch;
  const groq = /groq/.test(models[0].url); delete process.env.LLM_PROVIDER; if (groq) { process.env.GROQ_API_KEY = 'replay-stub'; delete process.env.ANTHROPIC_API_KEY; } else { process.env.ANTHROPIC_API_KEY = 'replay-stub'; delete process.env.GROQ_API_KEY; }
  globalThis.fetch = (async (url: any) => { if (!/api\.(anthropic|groq)\.com/.test(String(url))) return real(url); const m = models[Math.min(i++, models.length - 1)]; return new Response(JSON.stringify(m.response), { status: m.status, headers: { 'content-type': 'application/json' } }); }) as any;
  try { const b = http.request; return { out: await chatTurn({ resume: b.resume, jd: b.jd || '', jobTitle: b.jobTitle || '', history: b.history || [], message: b.message, answerTo: b.answerTo || '' }), request: b }; } finally { globalThis.fetch = real; }
}
test.describe('ESC-002 / ESC-003 capability honesty (replaying recorded real-model output)', () => {
  test('[TC-AIQ-R05] the model is shown every section of the resume, including Core Competencies', async ({}, ti) => {
    nodeOnly(ti);
    expect(resumeLines(HOSTILE), 'the prompt omits otherSections, so the model cannot see Core Competencies at all').toContain('Product Strategy & Vision');
  });
  for (const [id, label, claimed] of [['R06', 'A1-ESC002-core-competencies', 'core competencies']] as any[]) {
    test(`[TC-AIQ-${id}] ${label}: reply does not claim a change to ${claimed} unless a suggestion touches it, or says plainly it cannot`, async ({}, ti) => {
      nodeOnly(ti);
      const r = await replay(label); test.skip(!r, 'no recorded corpus for ' + label);
      const cards = r.out.suggestions; const check = L.claimCheck(r.out.reply, cards.map((c: any) => ({ edit: c.edit })));
      const touchesIt = cards.some((c: any) => L.sectionOfCard(c)?.includes('Core Competencies') || L.sectionOfCard(c) === 'core competencies');
      const cannot = /can't|cannot|unable|not able|isn't something|don't have/i.test(r.out.reply);
      expect(check.falseClaim, `reply: ${r.out.reply} | cards touch: ${check.touched}`).toEqual([]);
      expect(touchesIt || cannot, `neither changes ${claimed} nor says it cannot. reply: ${r.out.reply}`).toBe(true);
    });
  }

  const DENY = (name: string) => new RegExp(`(doesn't|does not|don't|do not|isn't|no)\\b[^.]{0,60}\\b${name}`, 'i');
  test('[TC-AIQ-R07] ESC-003 after "no you trimmed skills not core competencies" the assistant must not deny the section exists, and must change it or say it cannot', async ({}, ti) => {
    nodeOnly(ti);
    const r = await replay('A2-ESC003-correction'); test.skip(!r, 'no recorded corpus');
    expect(r.out.reply, 'the resume on screen has a Core Competencies section').not.toMatch(DENY('(separate )?core competenc'));
    const touches = r.out.suggestions.some((c: any) => /Core Competencies/i.test(L.sectionOfCard(c) || ''));
    expect(touches || /can't|cannot|unable|not able/i.test(r.out.reply), r.out.reply).toBe(true);
  });
  // Capability honesty on every section that exists on the resume (invariant 5): never say "you have no X section" when X is on screen.
  for (const [id, label, name] of [['R08', 'C2-projects', 'projects'], ['R09', 'C3-volunteer', 'volunteer(ing)?'], ['R10', 'C4-achievements', 'achievements'], ['R11', 'C5-languages', 'languages'], ['R12', 'C6-interests', 'interests'], ['R13', 'C7-publications', 'publications'], ['R14', 'C8-references', 'references'], ['R15', 'C9-positions', 'positions of responsibility'], ['R16', 'Q3-shorten-publications', 'publications'], ['R17', 'G-C7-publications', 'publications']] as any[]) {
    test(`[TC-AIQ-${id}] ${label}: assistant must not say the ${name} section does not exist when it is on the resume`, async ({}, ti) => {
      nodeOnly(ti);
      const r = await replay(label); test.skip(!r, 'no recorded corpus for ' + label);
      expect(r.out.reply, `reply: ${r.out.reply}`).not.toMatch(DENY(name));
    });
  }
  test('[TC-AIQ-R18] Groq/gpt-oss: "shorten the projects section" must not claim to have trimmed projects while the cards edit experience bullets', async ({}, ti) => {
    nodeOnly(ti);
    const r = await replay('G-C2-projects'); test.skip(!r, 'no recorded corpus');
    const touched = r.out.suggestions.map((c: any) => L.sectionOfCard(c));
    expect(!( /\btrimmed (the )?projects/i.test(r.out.reply) && !touched.includes('projects')), `reply: ${r.out.reply} | cards touch: ${touched}`).toBe(true);
  });
});
