// BUG-014 regression: seniority / short-skill checks must not over-block, and must still block invention. Server logic, run once.
import { test, expect } from '@playwright/test';
// @ts-ignore
import { cleanEdit, claimContext } from '../../server/tailorChat.js';

const base: any = { name: 'Asha Rao', title: 'Product Manager', contact: 'asha@example.com · Bengaluru', summary: 'PM with 5 years in logistics technology.',
  experience: [{ company: 'Acme', role: 'Product Manager', period: '2019-2023', bullets: ['Grew MAU by 40%', 'Ran sprint planning for the checkout team'] }],
  skills: ['SQL', 'Roadmapping'], certifications: [], education: [{ degree: 'B.Tech', school: 'NIT Trichy', year: '2018' }] };
const clone = (o: any = {}) => ({ ...JSON.parse(JSON.stringify(base)), ...o });
const JD = 'We need a Product Manager. Strong SQL and stakeholder management.';
const ok = (r: any) => !!r && !r.unsupported && typeof r.after === 'string' && r.after.length > 0;
const edit = (resume: any, e: any, jd = JD, chat = '', strict = false) => cleanEdit(e, resume, claimContext(resume, jd, chat, { strict }));
test.beforeEach(({}, info) => { test.skip(info.project.name !== 'laptop-chrome', 'device-independent server logic: run once'); });

test.describe('BUG-014: must PASS (no over-blocking)', () => {
  test('[TC-CLAIM-030] title "Product Manager, Lead Generation"', () => {
    const r = edit(base, { target: 'T', op: 'replace', after: 'Product Manager, Lead Generation' });
    expect(ok(r), JSON.stringify(r)).toBe(true);
  });
  test('[TC-CLAIM-031] summary "can lead cross-functional teams"', () => {
    const r = edit(base, { target: 'S', op: 'replace', after: 'PM with 5 years in logistics technology who can lead cross-functional teams.' });
    expect(ok(r), JSON.stringify(r)).toBe(true);
  });
  test('[TC-CLAIM-032] summary "staff scheduling"', () => {
    const r = edit(base, { target: 'S', op: 'replace', after: 'PM with 5 years in logistics technology, including staff scheduling.' });
    expect(ok(r), JSON.stringify(r)).toBe(true);
  });
  const owner = () => { const rs = clone({ title: 'Product Owner' }); rs.experience[0].role = 'Product Owner'; return rs; };
  test('[TC-CLAIM-033] Product Owner -> Product Manager (JD written in lower case)', () => {
    const r = edit(owner(), { target: 'T', op: 'replace', after: 'Product Manager' }, 'We need a product manager with SQL and stakeholder management.');
    expect(ok(r), JSON.stringify(r)).toBe(true);
  });
  test('[TC-CLAIM-033b] Product Owner -> Product Manager when the JD capitalises "Product Manager" mid-sentence (typical JD)', () => {
    // Residual of BUG-014: no longer blocked by the seniority list, but by the "capitalised JD term = a skill name" heuristic in skillLike().
    const r = edit(owner(), { target: 'T', op: 'replace', after: 'Product Manager' }, 'We need a Product Manager with SQL and stakeholder management.');
    expect(ok(r), JSON.stringify(r)).toBe(true);
  });
  test('[TC-CLAIM-034] bullet "Go beyond ..." with a JD that says Go', () => {
    const r = edit(base, { target: 'E0B1', op: 'replace', after: 'Go beyond the brief to run sprint planning for the checkout team' }, 'We use Go and SQL. Product Manager needed.');
    expect(ok(r), JSON.stringify(r)).toBe(true);
  });
  test('[TC-CLAIM-035] lowercase "5 ml" with a JD that asks for ML', () => {
    const r = edit(base, { target: 'E0B1', op: 'replace', after: 'Ran sprint planning for a team dosing 5 ml samples' }, 'Experience with ML models and SQL. Product Manager.');
    expect(ok(r), JSON.stringify(r)).toBe(true);
  });
  test('[TC-CLAIM-036] more over-block probes (annotation only): staff scheduling in title, lead generation manager, go-to-market', () => {
    const out: string[] = [];
    for (const [t, a] of [['T', 'Product Manager, Staff Scheduling'], ['T', 'Lead Generation Product Manager'], ['S', 'PM with 5 years in logistics technology and go-to-market work.'], ['S', 'PM who leads teams and heads sprint planning.'], ['T', 'Product Manager - Leadership'], ['T', 'Product Manager, Team Lead Tools']] as const) {
      const r = edit(base, { target: t, op: 'replace', after: a }); out.push(`${a} => ${ok(r) ? 'PASS' : 'BLOCKED ' + JSON.stringify(r?.unsupported)}`);
    }
    test.info().annotations.push({ type: 'probes', description: out.join(' | ') });
  });
});

test.describe('BUG-014: must still be BLOCKED', () => {
  for (const t of ['Senior Product Manager', 'Lead Product Manager', 'Principal Product Manager', 'Director, Product', 'Director of Product Management', 'Head of Product', 'Sr. Product Manager', 'VP Product', 'Staff Product Manager']) {
    test(`[TC-CLAIM-040] title "${t}" with no evidence is blocked`, () => {
      const r = edit(base, { target: 'T', op: 'replace', after: t });
      expect(ok(r), `accepted: ${JSON.stringify(r)}`).toBe(false);
    });
  }
  test('[TC-CLAIM-041] summary "Senior PM ..." with no evidence is blocked', () => {
    const r = edit(base, { target: 'S', op: 'replace', after: 'Senior PM with 5 years in logistics technology.' });
    expect(ok(r), JSON.stringify(r)).toBe(false);
  });
  for (const s of ['Go', 'C#', 'K8s', 'AI']) {
    test(`[TC-CLAIM-042] add_skills "${s}" with no evidence is blocked`, () => {
      const r = edit(base, { target: 'K', op: 'add_skills', skills: [s] }, `Need ${s} experience`);
      expect(r?.skills ?? [], JSON.stringify(r)).toEqual([]);
    });
    test(`[TC-CLAIM-043] bullet claiming "${s}" the JD asks for, no evidence, is blocked`, () => {
      const word = s === 'Go' ? 'Go and SQL' : s;
      const r = edit(base, { target: 'E0B1', op: 'replace', after: `Ran sprint planning for the checkout team using ${word}` }, `We need ${s} and SQL. Product Manager.`);
      expect(ok(r), JSON.stringify(r)).toBe(false);
    });
  }
});

test.describe('BUG-014: accepted when the resume or the chat shows it', () => {
  const evid = clone(); evid.experience[0].bullets.push('Built services in Go and C#, deployed on K8s, shipped an AI assistant');
  for (const s of ['Go', 'C#', 'K8s', 'AI']) {
    test(`[TC-CLAIM-044] add_skills "${s}" accepted when the resume shows it`, () => {
      const r = edit(evid, { target: 'K', op: 'add_skills', skills: [s] }, `Need ${s}`);
      expect(r?.skills, JSON.stringify(r)).toEqual([s]);
    });
    test(`[TC-CLAIM-045] add_skills "${s}" accepted when the user said so in chat`, () => {
      const chat = { Go: 'I wrote services in Go last year', 'C#': 'I used C# for the billing API', K8s: 'I ran our K8s clusters', AI: 'I shipped an AI feature' }[s]!;
      const r = edit(base, { target: 'K', op: 'add_skills', skills: [s] }, `Need ${s}`, chat);
      expect(r?.skills, JSON.stringify(r)).toEqual([s]);
    });
  }
  test('[TC-CLAIM-046] "Senior Product Manager" accepted when the resume already shows Senior', () => {
    const rs = clone(); rs.experience[0].role = 'Senior Product Manager';
    expect(ok(edit(rs, { target: 'T', op: 'replace', after: 'Senior Product Manager' }))).toBe(true);
  });
  test('[TC-CLAIM-047] "Lead Product Manager" accepted when the resume or the chat shows it', () => {
    const rs = clone(); rs.experience[0].role = 'Lead Product Manager';
    expect(ok(edit(rs, { target: 'T', op: 'replace', after: 'Lead Product Manager' })), 'resume').toBe(true);
    expect(ok(edit(base, { target: 'T', op: 'replace', after: 'Lead Product Manager' }, JD, 'My title at Acme was Lead Product Manager')), 'chat').toBe(true);
  });
  test('[TC-CLAIM-048] "Director" accepted when the chat says so; "Principal" accepted from resume', () => {
    expect(ok(edit(base, { target: 'T', op: 'replace', after: 'Director, Product' }, JD, 'I was Director, Product at a startup'))).toBe(true);
    const rs = clone(); rs.experience[0].role = 'Principal Product Manager';
    expect(ok(edit(rs, { target: 'T', op: 'replace', after: 'Principal Product Manager' }))).toBe(true);
  });
  test('[TC-CLAIM-049] no-JD (strict) mode: "Go beyond" bullet and plain rewrite still handled (annotation)', () => {
    const r = edit(base, { target: 'E0B1', op: 'replace', after: 'Go beyond the brief on sprint planning for the checkout team' }, '', '', true);
    test.info().annotations.push({ type: 'strict-go-beyond', description: ok(r) ? 'PASS' : 'BLOCKED ' + JSON.stringify(r) });
  });
});
