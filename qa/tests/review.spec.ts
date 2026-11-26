import { test, expect, seedStore, JD, isPhone, resume } from './fixture';
import { sugg } from './helpers';

const mk = (list: any[], over: any = {}) => seedStore({ original: over.resume || resume, jd: JD, job: { title: 'PM', company: 'X' }, baseScore: 50, pinCount: list.length, workspace: true, messages: [{ id: 'm1', role: 'bot', text: 'Hello' }],
  suggestions: Object.fromEntries(list.map((s, i) => [s.id, { ...s, pin: i + 1, status: 'pending', source: 'job', before: s.before ?? null, target: s.edit?.target }])), ...over });
const A = () => sugg({ id: 's1', before: 'Grew MAU by 40%' });
const B = () => sugg({ id: 's2', priority: 'nice', title: 'Ownership', edit: { target: 'E0B1', op: 'replace', after: 'Led the checkout launch' }, before: 'Cut failures from 8% to 3%' });
const store = () => JSON.parse(JSON.stringify({}));
const saved = (page: any) => page.evaluate(() => JSON.parse(localStorage.getItem('riq_resume_llm_v1')!).chats[0]);

async function openFirst(page: any) { if (isPhone(page)) await page.getByRole('button', { name: /Review/ }).first().click(); }
const applyBtn = (page: any) => page.getByRole('button', { name: isPhone(page) ? 'Apply' : 'Apply to resume', exact: true }).first();

test.describe('Review and edits', () => {
  test('[TC-REV-001] @P0 word diff marks removed and added words', async ({ page, boot }) => {
    await boot(mk([A()])); await openFirst(page);
    await expect(page.locator('del', { hasText: 'MAU' }).first()).toBeVisible();
    await expect(page.locator('ins', { hasText: 'monthly active users' }).first()).toBeVisible();
  });

  test('[TC-REV-002] @P0 Apply changes the resume line and the saved chat; Undo restores it (laptop)', async ({ page, boot }) => {
    test.skip(isPhone(page), 'undo link is laptop-only; phone covered by TC-REV-003');
    await boot(mk([A()]));
    await applyBtn(page).click();
    await expect(page.locator('.ws-left, [aria-label=Resume]').first()).toContainText('Grew monthly active users by 40%');
    expect((await saved(page)).resume.experience[0].bullets[0]).toBe('Grew monthly active users by 40%');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('[aria-label=Resume]').first()).toContainText('Grew MAU by 40%');
  });

  test('[TC-REV-003] @P0 phone: Apply shows confirmation then moves on; resume updated', async ({ page, boot }) => {
    test.skip(!isPhone(page), 'phone sheet only');
    await boot(mk([A(), B()])); await openFirst(page);
    await applyBtn(page).click();
    await expect(page.getByText('Applied to your resume')).toBeVisible();
    expect((await saved(page)).resume.experience[0].bullets[0]).toBe('Grew monthly active users by 40%');
  });

  test('[TC-REV-004] Dismiss keeps the original line; Restore brings the suggestion back (laptop)', async ({ page, boot }) => {
    test.skip(isPhone(page), 'laptop cards');
    await boot(mk([A()]));
    await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
    await expect(page.getByText('Dismissed, your original line is kept')).toBeVisible();
    expect((await saved(page)).resume.experience[0].bullets[0]).toBe('Grew MAU by 40%');
    await page.getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByRole('button', { name: 'Apply to resume' })).toBeVisible();
  });

  test('[TC-REV-005] Edit: edited text is what gets applied, not the AI text', async ({ page, boot }) => {
    await boot(mk([A()])); await openFirst(page);
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    const ta = page.getByLabel('Edit suggestion'); await ta.fill('Grew monthly active users by 40% in 6 months');
    await page.getByRole('button', { name: 'Save edit' }).click();
    await applyBtn(page).click();
    await expect.poll(async () => (await saved(page)).resume.experience[0].bullets[0]).toBe('Grew monthly active users by 40% in 6 months');
  });

  test('[TC-REV-006] Edit then Cancel leaves the suggestion unchanged', async ({ page, boot }) => {
    await boot(mk([A()])); await openFirst(page);
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    await page.getByLabel('Edit suggestion').fill('garbage');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('ins', { hasText: 'monthly active users' }).first()).toBeVisible();
  });

  test('[TC-REV-007] @P0 [number] blank must be filled before Apply is enabled', async ({ page, boot }) => {
    await boot(mk([sugg({ id: 's1', before: 'Grew MAU by 40%', edit: { target: 'E0B0', op: 'replace', after: 'Grew MAU by [number]% in a year' } })])); await openFirst(page);
    await expect(applyBtn(page)).toBeDisabled();
    await page.getByLabel(/number for this result/i).fill('25');
    await expect(applyBtn(page)).toBeEnabled();
    await applyBtn(page).click();
    await expect.poll(async () => (await saved(page)).resume.experience[0].bullets[0]).toBe('Grew MAU by 25% in a year');
  });

  test('[TC-REV-008] blank number accepts junk: letters / script / negative are not written into the resume', async ({ page, boot }) => {
    await boot(mk([sugg({ id: 's1', before: 'Grew MAU by 40%', edit: { target: 'E0B0', op: 'replace', after: 'Grew MAU by [number]% in a year' } })])); await openFirst(page);
    await page.getByLabel(/number for this result/i).fill('<b>abc</b>');
    const enabled = await applyBtn(page).isEnabled();
    if (enabled) { await applyBtn(page).click(); await page.waitForTimeout(300); const b = (await saved(page)).resume.experience[0].bullets[0]; expect(b, 'non-numeric input was written into a resume figure').not.toMatch(/[a-z<>]{3}/i.source.length ? /<b>|abc/ : /x/); }
  });

  test('[TC-REV-009] ownership upgrade (Cut -> Led/Helped -> Led) shows the "only if you led this" warning', async ({ page, boot }) => {
    const r = JSON.parse(JSON.stringify(resume)); r.experience[0].bullets[1] = 'Assisted with the checkout launch';
    await boot(mk([{ ...B(), before: 'Assisted with the checkout launch' }], { resume: r })); await openFirst(page);
    await expect(page.getByText(/only if you led this/)).toBeVisible();
  });

  test('[TC-REV-010] @P0 "Apply all ready" must not silently apply a warned ownership upgrade', async ({ page, boot }) => {
    test.skip(isPhone(page), 'Apply all is a laptop control');
    const r = JSON.parse(JSON.stringify(resume)); r.experience[0].bullets[1] = 'Assisted with the checkout launch';
    await boot(mk([A(), { ...B(), before: 'Assisted with the checkout launch' }], { resume: r }));
    await page.getByRole('button', { name: 'Apply all ready' }).click();
    await page.waitForTimeout(500);
    const bullets = (await saved(page)).resume.experience[0].bullets;
    expect(bullets[1], 'Apply all applied "Led ..." over "Assisted ..." with no confirmation').not.toBe('Led the checkout launch');
  });

  test('[TC-REV-011] Reset restores every original line', async ({ page, boot }) => {
    test.skip(isPhone(page), 'Reset is a laptop control');
    await boot(mk([A()]));
    await applyBtn(page).click();
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect.poll(async () => (await saved(page)).resume.experience[0].bullets[0]).toBe('Grew MAU by 40%');
  });

  test('[TC-REV-012] sections the suggestions never touch are preserved byte-for-byte after applying', async ({ page, boot }) => {
    const r = { ...JSON.parse(JSON.stringify(resume)), projects: [{ name: 'Route planner', period: '2022', bullets: ['Built ETA model'] }], languages: ['Hindi', 'Tamil'], achievements: ['Won hackathon'] };
    await boot(mk([A()], { resume: r })); await openFirst(page);
    await applyBtn(page).click();
    await page.waitForTimeout(1200);
    const after = (await saved(page)).resume;
    for (const k of ['education', 'skills', 'projects', 'languages', 'achievements', 'summary', 'contact', 'name', 'title']) expect(after[k], k).toEqual((r as any)[k]);
    await expect(page.locator('body')).toContainText('Route planner');
  });

  test('[TC-REV-013] @P0 an edit pointing at a missing line does not crash the page', async ({ page, boot, errs }) => {
    await boot(mk([sugg({ id: 's1', edit: { target: 'E7B9', op: 'replace', after: 'x y' } })]));
    await page.waitForTimeout(500);
    expect(errs.filter((e) => e.startsWith('pageerror'))).toEqual([]);
  });

  test('[TC-REV-014] phone: no horizontal scroll in workspace', async ({ page, boot }) => {
    test.skip(!isPhone(page), 'phone only');
    await boot(mk([A(), B()]));
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over).toBeLessThanOrEqual(1);
  });
});
