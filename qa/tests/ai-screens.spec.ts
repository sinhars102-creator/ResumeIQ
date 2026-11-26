// Screens of the REAL-model result (recorded store from the real run) on every device: no model call, no network. Evidence for the "look at the screens" rule.
// @ts-nocheck
import { test, expect, session, REF, isPhone } from './fixture';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUN = process.env.QA_RUN_DIR || path.join(__dirname, '..', 'runs');
const storeFile = path.join(RUN, 'scenarios', 'final-store-run1.json');

test.describe('real-run screens', () => {
  test.skip(!fs.existsSync(storeFile), 'no recorded real-run store');
  test('[TC-AIQ-040] workspace screens with the real-model suggestions (resume, Core Competencies section, card/sheet, chat)', async ({ page, boot, api }, ti) => {
    const chat = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
    await boot({ activeId: chat.id, chats: [chat] });
    const dir = path.join(RUN, 'screens', ti.project.name); fs.mkdirSync(dir, { recursive: true });
    const shot = (n: string, full = false) => page.screenshot({ path: path.join(dir, `${n}.png`), fullPage: full });
    await page.waitForTimeout(800);
    await shot('S1-workspace-top');
    // horizontal scroll check
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect.soft(overflow, 'horizontal scroll').toBeLessThanOrEqual(1);
    // scroll the resume to the Core Competencies section: is it on the resume the user sees?
    const cc = page.locator('.ws-paper h3', { hasText: /Core Competencies/i }).first();
    await expect(cc, 'Core Competencies is shown on the resume').toHaveCount(1);
    await cc.scrollIntoViewIfNeeded(); await page.waitForTimeout(300); await shot('S2-core-competencies-on-resume');
    const counts = await page.evaluate(() => ({ sub: document.querySelector('.ws-sub')?.textContent || '', phone: document.querySelector('.ws-psc')?.textContent || '', top: document.querySelector('.ws-ptop-row')?.textContent || '' }));
    test.info().annotations.push({ type: 'counts', description: JSON.stringify(counts) });
    if (isPhone(page)) {
      await page.getByText(/Ask for a change/).first().click(); await page.waitForTimeout(600); await shot('S4-ask-panel-thread');
      await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(500);
      await page.getByRole('button', { name: /Review \d+/ }).first().click(); await page.waitForTimeout(700); await shot('S3-sheet-first-card');
      const sheetBox = await page.locator('.ws-sheet').boundingBox(); const vp = page.viewportSize()!;
      test.info().annotations.push({ type: 'sheet', description: JSON.stringify({ sheetBox, vp }) });
    } else {
      await page.locator('.ws-card').first().scrollIntoViewIfNeeded(); await shot('S3-first-card');
      await page.locator('.ws-thread').scrollIntoViewIfNeeded().catch(() => {}); await shot('S4-chat-thread');
    }
  });
});
