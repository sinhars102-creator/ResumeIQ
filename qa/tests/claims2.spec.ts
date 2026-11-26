import { test, expect } from '@playwright/test';
// @ts-ignore
import { cleanEdit, claimContext } from '../../server/tailorChat.js';
const resume: any = { name: 'Asha Rao', title: 'Product Manager', contact: 'a@b.com', summary: 'PM.', experience: [{ company: 'Acme', role: 'PM', period: '2019-2023', bullets: ['Grew MAU by 40%', 'Assisted with the checkout launch'] }], skills: ['SQL'], certifications: [], education: [] };
test.beforeEach(({}, info) => { test.skip(info.project.name !== 'laptop-chrome', 'device-independent server logic: run once'); });
for (const skill of ['Go', 'R', 'C#', 'AI', 'ML', 'K8s', 'Rust', 'Kafka']) {
  test(`[TC-CLAIM-016] add_skills "${skill}" with no evidence on the resume is blocked`, () => {
    const r = cleanEdit({ target: 'K', op: 'add_skills', skills: [skill] }, resume, claimContext(resume, `Need ${skill} experience`, ''));
    expect(r?.skills ?? [], `${skill} was added to Skills without any evidence`).toEqual([]);
  });
}
test('[TC-CLAIM-017] bullet rewrite adding "C#"/"Go" the job asks for is blocked', () => {
  const r = cleanEdit({ target: 'E0B1', op: 'replace', after: 'Assisted with the checkout launch using C# and Go' }, resume, claimContext(resume, 'Strong C# and Go engineer wanted', ''));
  expect(r.unsupported).toBeTruthy();
});
