import { test, expect, seedStore, JD, resume } from './fixture';
import AxeBuilder from '@axe-core/playwright';
import { sugg } from './helpers';

const ws = () => seedStore({ original: resume, jd: JD, job: { title: 'PM', company: 'X' }, baseScore: 50, pinCount: 1, workspace: true, suggestions: { s1: { ...sugg(), pin: 1, status: 'pending', source: 'job', before: 'Grew MAU by 40%', target: 'E0B0' } }, messages: [{ id: 'm1', role: 'bot', text: 'Hello' }] });
const serious = (r: any) => r.violations.filter((v: any) => ['critical', 'serious'].includes(v.impact)).map((v: any) => `${v.id} (${v.impact}) x${v.nodes.length}: ${v.help} -> ${v.nodes.map((n: any) => n.target.join(' ') + ' [' + (n.any[0]?.message || '').slice(0, 90) + ']').join('; ')}`);

test('[TC-A11Y-001] chat start screen: no critical/serious axe violations', async ({ page, boot }) => {
  await boot(seedStore());
  expect(serious(await new AxeBuilder({ page }).analyze())).toEqual([]);
});
test('[TC-A11Y-002] workspace: no critical/serious axe violations', async ({ page, boot }) => {
  await boot(ws());
  expect(serious(await new AxeBuilder({ page }).analyze())).toEqual([]);
});
test('[TC-A11Y-003] template dialog: no critical/serious axe violations', async ({ page, boot }) => {
  await boot(ws());
  if ((page.viewportSize()?.width || 0) < 900) { await page.getByRole('button', { name: /Review/ }).first().click(); await page.getByRole('button', { name: 'Skip' }).click().catch(() => {}); await page.getByRole('button', { name: 'Download PDF' }).first().click(); }
  else await page.getByRole('button', { name: 'Download PDF' }).first().click();
  await expect(page.getByText(/Everything on your resume/)).toBeVisible({ timeout: 25000 });
  expect(serious(await new AxeBuilder({ page }).analyze())).toEqual([]);
});
