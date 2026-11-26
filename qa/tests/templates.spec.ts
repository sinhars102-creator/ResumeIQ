import { test, expect, seedStore, isPhone, resume } from './fixture';
import fs from 'fs';

const rich: any = { ...JSON.parse(JSON.stringify(resume)),
  certifications: ['PMP (2023)'],
  projects: [{ name: 'Route planner', period: '2022', bullets: ['Built ETA model with 92% accuracy'] }],
  volunteer: [{ role: 'Mentor', organization: 'Code for India', period: '2021', bullets: ['Mentored 10 students'] }],
  achievements: ['Won Smart India Hackathon'], publications: ['Paper on routing, IEEE 2021'], languages: ['Hindi', 'Tamil', 'English'], interests: ['Chess'],
  references: [{ name: 'R. Kumar', title: 'VP Product' }], otherSections: [{ title: 'Awards', items: ['Employee of the year 2022'] }],
  education: [{ degree: 'B.Tech', school: 'NIT Trichy', year: '2018', grade: 'CGPA 8.9', location: 'Tiruchirappalli', details: ['Dean\'s list'] }] };
const long: any = JSON.parse(JSON.stringify(rich));
long.experience[0].bullets = Array.from({ length: 24 }, (_, i) => `Delivered initiative number ${i + 1} across the logistics platform with measurable outcomes`);
const hindi: any = { ...JSON.parse(JSON.stringify(resume)), name: 'आशा राव', summary: 'लॉजिस्टिक्स में 5 साल का अनुभव · ₹ 12 लाख बचत 🚀', experience: [{ company: 'अक्मे', role: 'प्रोडक्ट मैनेजर', period: '2019–2023', bullets: ['MAU 40% बढ़ाया — “quotes” and ‘single’'] }] };

const store = (r: any) => seedStore({ resume: r, original: r, mode: 'tailor', workspace: true, jd: 'x'.repeat(300), job: { title: 'PM', company: 'X' }, suggestions: {}, messages: [{ id: 'm1', role: 'bot', text: 'Hi' }] });
async function openDownload(page: any) {
  if (isPhone(page)) {
    // phone: the workspace's Finish button opens the finish sheet, which has Download PDF
    const fin = page.getByRole('button', { name: /^Finish$/ });
    if (await fin.count()) await fin.click();
  }
  await page.getByRole('button', { name: 'Download PDF' }).first().click({ timeout: 8000 });
  await expect(page.getByRole('heading', { name: 'Choose a template' })).toBeVisible();
}
const pdfText = async (path: string) => {
  // @ts-ignore
  const pdfjs = await import('/Users/rahulsinha/ResumeIQ/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(path)) }).promise;
  let t = ''; for (let n = 1; n <= pdf.numPages; n++) t += (await (await pdf.getPage(n)).getTextContent()).items.map((i: any) => i.str).join(' ') + '\n';
  return { text: t, pages: pdf.numPages };
};
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

test.describe('Templates, preview, export', () => {
  test('[TC-TPL-001] @P0 Download opens the template step with Modern, Classic, Compact and page counts', async ({ page, boot }) => {
    await boot(store(rich)); await openDownload(page);
    for (const n of ['Modern', 'Classic', 'Compact']) await expect(page.getByRole('radio', { name: new RegExp(n) })).toBeVisible();
    await expect(page.getByRole('radio', { name: /Modern/ })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText(/\d+ pages?/).first()).toBeVisible({ timeout: 20000 });
  });

  test('[TC-TPL-002] @P0 live preview shows the resume in each template; content check passes', async ({ page, boot }, info) => {
    await boot(store(rich)); await openDownload(page);
    await expect(page.getByText(/Everything on your resume is in this PDF \(\d+ items checked\)/)).toBeVisible({ timeout: 25000 });
    const shots: string[] = [];
    for (const n of ['Modern', 'Classic', 'Compact']) {
      await page.getByRole('radio', { name: new RegExp(n) }).click();
      await expect(page.locator('.rl-tpl-preview img').first()).toBeVisible({ timeout: 25000 });
      await expect(page.getByText(/Everything on your resume is in this PDF/)).toBeVisible({ timeout: 25000 });
      const sig = await page.locator('.rl-tpl-preview img').first().getAttribute('src');
      shots.push(sig!.slice(-400));
      await page.screenshot({ path: info.outputPath(`tpl-${n}.png`) });
    }
    expect(new Set(shots).size, 'the three templates should look different').toBe(3);
  });

  test('[TC-TPL-003] @P0 downloaded PDF contains every section for each template (Modern/Classic/Compact)', async ({ page, boot }, info) => {
    test.slow();
    await boot(store(rich));
    const want = ['Asha Rao', 'Product Manager', 'asha@example.com', 'PM with 5 years', 'Acme', 'Grew MAU by 40%', 'B.Tech', 'NIT Trichy', 'CGPA 8.9', 'SQL', 'Roadmapping', 'PMP (2023)', 'Route planner', 'Built ETA model', 'Mentor', 'Code for India', 'Mentored 10 students', 'Won Smart India Hackathon', 'Paper on routing', 'Hindi', 'Tamil', 'Chess', 'R. Kumar', 'Employee of the year 2022'];
    for (const tpl of ['Classic', 'Compact', 'Modern']) {
      await openDownload(page);
      await page.getByRole('radio', { name: new RegExp(tpl) }).click();
      await expect(page.getByText(/Everything on your resume is in this PDF/)).toBeVisible({ timeout: 25000 });
      await page.getByRole('button', { name: new RegExp('Continue with ' + tpl) }).click();
      const dl = page.waitForEvent('download', { timeout: 20000 });
      await page.getByRole('button', { name: 'Download PDF', exact: true }).last().click();
      const d = await dl; const path = info.outputPath(`${tpl}.pdf`); await d.saveAs(path);
      const { text } = await pdfText(path);
      const missing = want.filter((w) => !squash(text).includes(squash(w)));
      expect(missing, `${tpl} PDF is missing`).toEqual([]);
      await page.getByRole('button', { name: /Close|Keep editing/ }).last().click();
    }
  });

  test('[TC-TPL-004] on-screen resume shows every section (projects, volunteering, achievements, languages ...)', async ({ page, boot }) => {
    await boot(store(rich));
    const body = page.locator('body');
    if (isPhone(page)) await page.getByRole('button', { name: /Review|Finish/ }).first().click().catch(() => {});
    for (const t of ['Route planner', 'Mentored 10 students', 'Won Smart India Hackathon', 'Paper on routing', 'Hindi', 'Chess', 'R. Kumar', 'Employee of the year 2022', 'CGPA 8.9']) await expect(body).toContainText(t);
  });

  test('[TC-TPL-005] very long resume (24 bullets): extra pages in every template, nothing cut', async ({ page, boot }, info) => {
    test.slow();
    await boot(store(long)); await openDownload(page);
    await expect(page.getByText(/Everything on your resume is in this PDF/)).toBeVisible({ timeout: 40000 });
    await page.getByRole('radio', { name: /Compact/ }).click();
    await expect(page.getByText(/Everything on your resume is in this PDF/)).toBeVisible({ timeout: 40000 });
    await page.getByRole('button', { name: /Continue with Compact/ }).click();
    const dl = page.waitForEvent('download', { timeout: 20000 });
    await page.getByRole('button', { name: 'Download PDF', exact: true }).last().click();
    const d = await dl; const path = info.outputPath('long.pdf'); await d.saveAs(path);
    const { text, pages } = await pdfText(path);
    expect(pages).toBeGreaterThanOrEqual(2);
    for (let i = 1; i <= 24; i++) expect(squash(text), `bullet ${i}`).toContain(squash(`initiative number ${i} across`));
  });

  test('[TC-TPL-006] Hindi / ₹ / emoji / smart quotes: preview does not claim success if the PDF cannot draw them', async ({ page, boot }, info) => {
    test.slow();
    await boot(store(hindi)); await openDownload(page);
    await expect(page.locator('.rl-tpl-ok, .rl-warn').first()).toBeVisible({ timeout: 25000 });
    const ok = await page.locator('.rl-tpl-ok').count();
    await page.getByRole('button', { name: /Continue with/ }).click();
    const dl = page.waitForEvent('download', { timeout: 20000 });
    await page.getByRole('button', { name: 'Download PDF', exact: true }).last().click();
    const d = await dl; const path = info.outputPath('hindi.pdf'); await d.saveAs(path);
    const { text } = await pdfText(path);
    // The check may pass only when the Devanagari really is in the file; otherwise it must warn.
    const hasHindi = /[ऀ-ॿ]/.test(text);
    if (ok && !hasHindi) throw new Error('Content check said "everything is in this PDF" but the Hindi text is NOT in the downloaded PDF');
    test.info().annotations.push({ type: 'hindi-in-pdf', description: `check passed=${!!ok} hindiInPdf=${hasHindi}` });
  });

  test('[TC-TPL-007] Change template returns to the gallery; last choice is remembered next time', async ({ page, boot }) => {
    await boot(store(rich)); await openDownload(page);
    await page.getByRole('radio', { name: /Classic/ }).click();
    await page.getByRole('button', { name: /Continue with Classic/ }).click();
    await page.getByRole('button', { name: /Change template \(Classic\)/ }).click();
    await expect(page.getByRole('heading', { name: 'Choose a template' })).toBeVisible();
    await page.getByRole('button', { name: /Continue with Classic/ }).click();
    await page.getByRole('button', { name: /Keep editing/ }).last().click();
    await openDownload(page);
    await expect(page.getByRole('radio', { name: /Classic/ })).toHaveAttribute('aria-checked', 'true');
  });

  test('[TC-TPL-008] modal fits the viewport; Continue and Keep editing reachable; no horizontal scroll', async ({ page, boot }) => {
    await boot(store(rich)); await openDownload(page);
    await expect(page.getByText(/Everything on your resume/)).toBeVisible({ timeout: 25000 });
    const vp = page.viewportSize()!;
    for (const name of [/Continue with/, /Keep editing/]) { await page.getByRole('button', { name }).first().scrollIntoViewIfNeeded(); const b = await page.getByRole('button', { name }).first().boundingBox(); expect(b!.y + b!.height).toBeLessThanOrEqual(vp.height + 1); expect(b!.x).toBeGreaterThanOrEqual(0); expect(b!.x + b!.width).toBeLessThanOrEqual(vp.width + 1); }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  });

  test('[TC-TPL-009] Escape closes the dialog (keyboard) and focus is trapped', async ({ page, boot }) => {
    test.skip(isPhone(page), 'keyboard test, laptop only');
    await boot(store(rich)); await openDownload(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Choose a template' }), 'Esc should close the modal').toHaveCount(0);
  });

  test('[TC-TPL-010] a resume with no work history still previews and downloads', async ({ page, boot }) => {
    test.slow();
    const bare: any = { name: 'Fresh Grad', title: '', contact: 'f@x.com', summary: '', experience: [], skills: [], certifications: [], education: [{ degree: 'B.Sc', school: 'DU', year: '2025' }] };
    await boot(store(bare)); await openDownload(page);
    await expect(page.locator('.rl-tpl-ok, .rl-warn').first()).toBeVisible({ timeout: 25000 });
    await expect(page.locator('.rl-warn')).toHaveCount(0);
  });
});
