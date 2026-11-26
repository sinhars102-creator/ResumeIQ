// Server-side claim check / honesty rules, called directly (no LLM, no browser). Logic is device independent: runs once.
import { test, expect } from '@playwright/test';
// @ts-ignore
import { cleanEdit, claimContext, unsupportedClaims } from '../../server/tailorChat.js';

const resume: any = { name: 'Asha Rao', title: 'Product Manager', contact: 'asha@example.com · Bengaluru', summary: 'PM with 5 years in logistics technology.',
  experience: [{ company: 'Acme', role: 'Product Manager', period: '2019-2023', bullets: ['Grew MAU by 40%', 'Assisted with the checkout launch', 'Helped the data team build dashboards in SQL'] }],
  skills: ['SQL', 'Roadmapping'], certifications: [], education: [{ degree: 'B.Tech', school: 'NIT Trichy', year: '2018' }] };
const JD = 'We need a Product Manager with Kubernetes, Kafka and SAP experience. Strong SQL and stakeholder management. Lead a team of engineers.';
const ctx = () => claimContext(resume, JD, '');
test.beforeEach(({}, info) => { test.skip(info.project.name !== 'laptop-chrome', 'device-independent server logic: run once'); });

test('[TC-CLAIM-001] @P0 invented numbers become [number] blanks', () => {
  const r = cleanEdit({ target: 'E0B0', op: 'replace', after: 'Grew monthly active users by 73% across 12 markets' }, resume, ctx());
  expect(r.after).toContain('[number]');
  expect(r.after).not.toMatch(/73|12 markets/);
});
test('[TC-CLAIM-002] @P0 known numbers from the resume are kept', () => {
  const r = cleanEdit({ target: 'E0B0', op: 'replace', after: 'Grew monthly active users by 40%' }, resume, ctx());
  expect(r.after).toBe('Grew monthly active users by 40%');
});
test('[TC-CLAIM-003] @P0 a job tool the candidate never claimed is blocked (Kubernetes)', () => {
  const r = cleanEdit({ target: 'E0B1', op: 'replace', after: 'Assisted with the checkout launch on Kubernetes' }, resume, ctx());
  expect(r.unsupported).toBeTruthy();
});
test('[TC-CLAIM-004] a tool the candidate states in chat becomes allowed', () => {
  const c = claimContext(resume, JD, 'I used Kubernetes at Acme');
  const r = cleanEdit({ target: 'E0B1', op: 'replace', after: 'Assisted with the checkout launch on Kubernetes' }, resume, c);
  expect(r.unsupported).toBeUndefined();
});
test('[TC-CLAIM-005] add_skills for a skill with no evidence is blocked', () => {
  const r = cleanEdit({ target: 'K', op: 'add_skills', skills: ['Kafka', 'SAP'] }, resume, ctx());
  expect(r.unsupported).toEqual(['Kafka', 'SAP']);
});
test('[TC-CLAIM-006] invented certification is blocked', () => {
  const r = cleanEdit({ target: 'Z', op: 'add_certifications', items: ['PMP (2023)'] }, resume, ctx());
  expect(r.unsupported).toBeTruthy();
});
test('[TC-CLAIM-007] invented new bullet (strict) is blocked', () => {
  const r = cleanEdit({ target: 'E0', op: 'add_bullet', after: 'Managed a team of engineers building payment gateway' }, resume, ctx());
  expect(r.unsupported || r.after).toBeTruthy();
  expect(r.unsupported, 'new bullet with new facts must be blocked').toBeTruthy();
});
test('[TC-CLAIM-008] @P0 ownership inflation: "Assisted" must not become "Led/Owned" (prompt rule; is it enforced in code?)', () => {
  const r = cleanEdit({ target: 'E0B1', op: 'replace', after: 'Led the checkout launch' }, resume, ctx());
  expect(r.unsupported, 'rewrite that upgrades Assisted -> Led should be flagged or blocked').toBeTruthy();
});
test('[TC-CLAIM-009] @P0 title/seniority inflation: Product Manager -> Senior Product Manager', () => {
  const r = cleanEdit({ target: 'T', op: 'replace', after: 'Senior Product Manager' }, resume, ctx());
  expect(r === null || r.unsupported, 'adding "Senior" to the title should be blocked').toBeTruthy();
});
test('[TC-CLAIM-010] set_skills cannot add a skill', () => {
  expect(cleanEdit({ target: 'K', op: 'set_skills', skills: ['SQL', 'Kafka'] }, resume, ctx())).toBeNull();
});
test('[TC-CLAIM-011] edits on lines that do not exist are dropped', () => {
  expect(cleanEdit({ target: 'E9B9', op: 'replace', after: 'x y z' }, resume, ctx())).toBeNull();
});
test('[TC-CLAIM-012] ordinary job words (powered, optimal) are not treated as claims', () => {
  const r = cleanEdit({ target: 'E0B0', op: 'replace', after: 'Grew monthly active users by 40% with strong stakeholder management' }, resume, ctx());
  expect(r.unsupported).toBeUndefined();
});
test('[TC-CLAIM-013] contact edit: invented phone number is blanked, city change is allowed', () => {
  const ok = cleanEdit({ target: 'C', op: 'replace', after: 'asha@example.com · Bangalore' }, resume, ctx());
  expect(ok.after).toContain('Bangalore');
  const bad = cleanEdit({ target: 'C', op: 'replace', after: 'asha@example.com · +91 98765 43210 · Bengaluru' }, resume, ctx());
  expect(bad.after).not.toMatch(/98765/);
});
test('[TC-CLAIM-014] Hinglish/Unicode text in an edit does not crash the check', () => {
  expect(() => cleanEdit({ target: 'E0B0', op: 'replace', after: 'MAU 40% badhaya — टीम के साथ 🚀' }, resume, ctx())).not.toThrow();
});
test('[TC-CLAIM-015] stemming bypass: "Kubernetes" disguised as "K8s"/"kubernetes-based" ', () => {
  const r1 = cleanEdit({ target: 'E0B1', op: 'replace', after: 'Assisted with the checkout launch using K8s' }, resume, claimContext(resume, 'Experience with K8s required', ''));
  expect(r1.unsupported, 'K8s is a job-description tool and should be flagged').toBeTruthy();
});
