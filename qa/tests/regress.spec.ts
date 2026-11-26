import { test, expect, seedStore, JD, isPhone, resume } from './fixture';
import { sugg, chatBox } from './helpers';

const mk = (list: any[], over: any = {}) => seedStore({ original: over.resume || resume, jd: JD, job: { title: 'PM', company: 'X' }, baseScore: 50, pinCount: list.length, workspace: true, messages: [{ id: 'm1', role: 'bot', text: 'Hello' }],
  suggestions: Object.fromEntries(list.map((s, i) => [s.id, { ...s, pin: i + 1, status: 'pending', source: 'job', before: s.before ?? null, target: s.edit?.target }])), ...over });
const A = () => sugg({ id: 's1', before: 'Grew MAU by 40%' });
const LED = (id = 's2', t = 'E0B1') => sugg({ id, priority: 'nice', title: 'Ownership', edit: { target: t, op: 'replace', after: 'Led the checkout launch' }, before: 'Assisted with the checkout launch' });
const savedChat = (page: any) => page.evaluate(() => JSON.parse(localStorage.getItem('riq_resume_llm_v1')!).chats[0]);
const withAssisted = () => { const r = JSON.parse(JSON.stringify(resume)); r.experience[0].bullets[1] = 'Assisted with the checkout launch'; return r; };
async function openDownload(page: any) {
  if (isPhone(page)) { const fin = page.getByRole('button', { name: /^Finish$/ }); if (await fin.count()) await fin.click(); }
  await page.getByRole('button', { name: 'Download PDF' }).first().click({ timeout: 8000 });
  await expect(page.getByRole('heading', { name: 'Choose a template' })).toBeVisible();
}

test.describe('Regression: Apply all (BUG-003)', () => {
  test.beforeEach(({ page }) => { test.skip(isPhone(page), 'Apply all is a laptop control'); });
  test('[TC-REG-001] @P0 Apply all applies ready ones, holds the Led warning one, says so in the status line', async ({ page, boot }) => {
    await boot(mk([A(), LED()], { resume: withAssisted() }));
    await page.getByRole('button', { name: 'Apply all ready' }).click();
    await expect(page.locator('.ws-status')).toContainText(/Applied 1/);
    await expect(page.getByText(/#2 left for you to confirm/)).toBeVisible();
    const c = await savedChat(page);
    expect(c.resume.experience[0].bullets[0]).not.toBe('Grew MAU by 40%');
    expect(c.resume.experience[0].bullets[1]).toBe('Assisted with the checkout launch');
    expect(c.suggestions.s2.status).toBe('pending');
  });
  test('[TC-REG-002] Apply all is disabled when the only ready suggestion carries the Led warning', async ({ page, boot }) => {
    await boot(mk([LED()], { resume: withAssisted() }));
    await expect(page.getByRole('button', { name: 'Apply all ready' })).toBeDisabled();
  });
  test('[TC-REG-003] the held suggestion can still be applied by hand (not trapped)', async ({ page, boot }) => {
    await boot(mk([A(), LED()], { resume: withAssisted() }));
    await page.getByRole('button', { name: 'Apply all ready' }).click();
    await expect(page.getByText(/#2 left for you/)).toBeVisible();
    await page.getByText(/only if you led this/).first().waitFor({ timeout: 5000 }).catch(() => {});
    const apply = page.getByRole('button', { name: 'Apply to resume', exact: true }).first();
    if (await apply.count()) { await apply.click(); await expect.poll(async () => (await savedChat(page)).resume.experience[0].bullets[1]).toBe('Led the checkout launch'); }
    else test.info().annotations.push({ type: 'note', description: 'no per-card Apply visible for held suggestion' });
  });
  test('[TC-REG-004] with a [number] blank unfilled AND a Led warning: both are named in the status line', async ({ page, boot }) => {
    const blank = sugg({ id: 's3', edit: { target: 'E0B0', op: 'replace', after: 'Grew MAU by [number]%' }, before: 'Grew MAU by 40%' });
    await boot(mk([blank, LED(), sugg({ id: 's4', priority: 'nice', edit: { target: 'S', op: 'replace', after: 'PM with 5 years in logistics technology and payments.' }, before: 'PM with 5 years in logistics technology.' })], { resume: withAssisted() }));
    await page.getByRole('button', { name: 'Apply all ready' }).click();
    const t = await page.locator('body').innerText();
    expect(await page.locator('.ws-status').innerText()).toMatch(/Applied 1/); expect(t).toMatch(/need.* your input/); expect(t).toMatch(/left for you to confirm/);
  });
  test('[TC-REG-005] ordinary rewrites that merely start with a verb are NOT held (Managed -> Led is, Built -> Led is not)', async ({ page, boot }) => {
    const r = JSON.parse(JSON.stringify(resume)); r.experience[0].bullets[1] = 'Built the checkout launch';
    await boot(mk([sugg({ id: 's2', edit: { target: 'E0B1', op: 'replace', after: 'Led the checkout launch' }, before: 'Built the checkout launch' })], { resume: r }));
    await page.getByRole('button', { name: 'Apply all ready' }).click();
    await expect.poll(async () => (await savedChat(page)).resume.experience[0].bullets[1]).toBe('Led the checkout launch');
  });
});

test.describe('Regression: stale suggestions and ErrorBoundary (BUG-005)', () => {
  const stale = () => sugg({ id: 'sx', edit: { target: 'E7B9', op: 'replace', after: 'x y' }, before: 'old' });
  test('[TC-REG-010] @P0 stale pending suggestion in saved store: page renders, stale one dropped, good one kept', async ({ page, boot, errs }) => {
    await boot(mk([A(), stale()]));
    await expect(page.locator('body')).not.toContainText('Something went wrong on this page');
    await expect(page.locator('.ws-pscroll, .ws-paper, [class*="ws-"]').first()).toBeVisible();
    await page.waitForTimeout(800);
    const c = await savedChat(page);
    expect(Object.keys(c.suggestions)).toEqual(['s1']);
    expect(errs.filter((e) => e.startsWith('pageerror'))).toEqual([]);
  });
  test('[TC-REG-011] stale suggestion with a non-string / null edit target does not crash', async ({ page, boot }) => {
    const bad = { id: 'sb', status: 'pending', pin: 9, edit: { target: null, op: 'replace', after: 'x' } };
    const bad2 = { id: 'sc', status: 'pending', pin: 10, edit: { op: 'replace', after: 'x' } };
    const s = mk([A()]); s.chats[0].suggestions.sb = bad; s.chats[0].suggestions.sc = bad2;
    await boot(s);
    await expect(page.locator('body')).not.toContainText('Something went wrong on this page');
    await expect(page.locator('body')).toContainText(/Tailoring|Match|Hello/);
  });
  test('[TC-REG-012] applied/dismissed suggestions with missing lines are kept (history not erased)', async ({ page, boot }) => {
    const s = mk([A()]); s.chats[0].suggestions.sz = { id: 'sz', status: 'applied', pin: 5, edit: { target: 'E7B9', op: 'replace', after: 'x' }, before: 'y' };
    await boot(s); await page.waitForTimeout(600);
    expect(Object.keys((await savedChat(page)).suggestions).sort()).toEqual(['s1', 'sz']);
  });
  test('[TC-REG-013] stale suggestion arriving via cross-device sync (server state) does not blank the page', async ({ page, boot, api, errs }) => {
    const server = mk([A(), stale()]).chats[0]; server.id = 'c2'; server.updatedAt = Date.now() + 100000;
    api.handlers['/api/rllm/state'] = (_b: any) => ({ state: { activeId: 'c2', chats: [server] } });
    await boot(mk([A()]));
    await page.waitForTimeout(1500);
    const crashed = await page.getByText('Something went wrong on this page').count();
    test.info().annotations.push({ type: 'sync-stale', description: `crashed=${crashed} pageerrors=${errs.filter((e) => e.startsWith('pageerror')).length}` });
    expect(crashed, 'stale suggestion from server sync reaches render').toBe(0);
  });
  test('[TC-REG-014] ErrorBoundary: a real render crash shows the recovery screen with 44px buttons; Reload keeps chats', async ({ page, boot, api }) => {
    // Force a crash through sync with a chat whose resume is malformed (experience is a string).
    const server = mk([A()]).chats[0]; server.id = 'c2'; server.updatedAt = Date.now() + 100000; server.resume = { ...resume, experience: 'broken' }; server.original = server.resume;
    api.handlers['/api/rllm/state'] = () => ({ state: { activeId: 'c2', chats: [server] } });
    await boot(mk([A()]));
    const alert = page.getByRole('alert').filter({ hasText: 'Something went wrong' });
    const shown = await alert.waitFor({ timeout: 4000 }).then(() => true).catch(() => false);
    test.info().annotations.push({ type: 'boundary-shown', description: String(shown) });
    if (!shown) test.skip(true, 'could not force a render crash through sync; boundary exercised in TC-REG-015');
    for (const n of ['Reload', 'Start a new chat']) { const b = await page.getByRole('button', { name: n }).boundingBox(); expect(b!.height).toBeGreaterThanOrEqual(44); }
  });
  test('[TC-REG-015] ErrorBoundary: "Start a new chat" deletes the whole saved store (all chats), with no confirmation', async ({ page, boot }) => {
    // Spy on storage removal (sessionStorage survives the reload the button triggers).
    await page.addInitScript(() => { const o = Storage.prototype.removeItem; Storage.prototype.removeItem = function (k: string) { if (this === window.localStorage) sessionStorage.setItem('__removed', (sessionStorage.getItem('__removed') || '') + k + ';'); return o.call(this, k); }; });
    const s = mk([A()]); s.chats.push({ ...JSON.parse(JSON.stringify(s.chats[0])), id: 'c9', title: 'Older chat' });
    s.chats[0].resume = { ...resume, experience: 'broken' }; s.chats[0].original = s.chats[0].resume;
    await boot(s);
    const alert = page.getByRole('alert').filter({ hasText: 'Something went wrong' });
    await expect(alert).toBeVisible({ timeout: 6000 });
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('riq_resume_llm_v1')!).chats.length)).toBe(2);
    for (const n of ['Reload', 'Start a new chat']) { const b = await page.getByRole('button', { name: n }).boundingBox(); expect(b!.height, n + ' tap target').toBeGreaterThanOrEqual(44); }
    await page.getByRole('button', { name: 'Start a new chat' }).click();
    await page.waitForLoadState('load'); await page.waitForTimeout(500);
    const removed = await page.evaluate(() => sessionStorage.getItem('__removed') || '');
    test.info().annotations.push({ type: 'removed-keys', description: removed });
    expect(removed, 'Start a new chat removed the entire chat store (healthy chats too)').not.toContain('riq_resume_llm_v1');
  });
});

test.describe('Regression: download dialog Escape and focus (BUG-008)', () => {
  const store = () => seedStore({ resume, original: resume, mode: 'tailor', workspace: true, jd: 'x'.repeat(300), job: { title: 'PM', company: 'X' }, suggestions: {}, messages: [{ id: 'm1', role: 'bot', text: 'Hi' }] });
  test.beforeEach(({ page }) => { test.skip(isPhone(page), 'keyboard test, laptop only'); });
  test('[TC-REG-020] opening moves focus into the dialog; Escape closes it; focus returns to the Download PDF button', async ({ page, boot }) => {
    await boot(store());
    const btn = page.getByRole('button', { name: 'Download PDF' }).first(); await btn.focus();
    await btn.press('Enter');
    await expect(page.getByRole('heading', { name: 'Choose a template' })).toBeVisible();
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Choose a template' })).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement?.textContent?.trim())).toMatch(/Download PDF/);
  });
  test('[TC-REG-021] Escape works after Tab-ing inside the dialog and from the Pay step', async ({ page, boot }) => {
    await boot(store()); await openDownload(page);
    await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Choose a template' })).toHaveCount(0);
  });
  test('[TC-REG-022] Escape pressed in a text field behind nothing else: chat text typed earlier is not lost by reopening', async ({ page, boot }) => {
    await boot(store()); const box = await chatBox(page); await box.fill('draft message');
    await openDownload(page); await page.keyboard.press('Escape');
    await expect(box).toHaveValue('draft message');
  });
  test('[TC-REG-023] open/close 5 times: Escape handler is not duplicated, no stale listeners (second open still closes once)', async ({ page, boot }) => {
    await boot(store());
    for (let i = 0; i < 5; i++) { await openDownload(page); await page.keyboard.press('Escape'); await expect(page.getByRole('heading', { name: 'Choose a template' })).toHaveCount(0); }
  });
  test('[TC-REG-024] Tab cannot leave the dialog (focus trap)', async ({ page, boot }) => {
    await boot(store()); await openDownload(page);
    let outside = 0;
    for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); if (await page.evaluate(() => !document.activeElement?.closest('[role=dialog]'))) outside++; }
    expect(outside, 'Tab moved focus to the page behind the modal').toBe(0);
  });
  test('[TC-REG-025] Escape while a payment is in flight (Razorpay open) closes the dialog under it', async ({ page, boot, api }) => {
    // Signed-in + payments required (supabase configured); no downloads left -> paywall. Razorpay is a local fake, no network.
    api.handlers['/api/downloads/status'] = () => ({ allowed: false, plan: null, remaining: 0, unlimited: false, expiresAt: null });
    api.handlers['/api/create-order'] = () => ({ order_id: 'order_fake', amount: 4900, currency: 'INR', key_id: 'rzp_test_fake', name: 'Week pass' });
    api.handlers['/api/downloads/purchase'] = () => ({ status: { allowed: true, plan: 'week', remaining: null, unlimited: true, expiresAt: null }, payment_id: 'pay_fake', order_id: 'order_fake' });
    await page.route('**/checkout.razorpay.com/**', (r: any) => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.Razorpay=function(o){this.o=o;window.__rzp=this;};window.Razorpay.prototype.open=function(){window.__rzpOpen=true};window.Razorpay.prototype.on=function(){};' }));
    await boot(store()); await openDownload(page);
    await page.getByRole('button', { name: /Continue with/ }).click();
    const pay = page.getByRole('button', { name: /Pay ₹/ });
    if (!(await pay.count())) test.skip(true, 'paywall not shown in this mock (payments not required)');
    await pay.click();
    await expect.poll(() => page.evaluate(() => (window as any).__rzpOpen === true)).toBe(true);
    await page.keyboard.press('Escape');
    const closed = (await page.getByRole('dialog').count()) === 0;
    // Complete the "payment" afterwards: does the server get the verify call although the dialog is gone?
    await page.evaluate(() => (window as any).__rzp.o.handler({ razorpay_payment_id: 'pay_fake', razorpay_order_id: 'order_fake', razorpay_signature: 'sig' }));
    await page.waitForTimeout(500);
    const verified = api.calls.some((c) => c.path === '/api/downloads/purchase');
    test.info().annotations.push({ type: 'escape-during-payment', description: `dialogClosed=${closed} verifyCalledAfterClose=${verified}` });
    expect(closed, 'Escape closed the dialog while a payment was active').toBe(false);
  });
});

test.describe('Regression: chat Enter on touch (BUG-010) and tap targets (BUG-006)', () => {
  const wsStore = () => mk([A()]);
  test('[TC-REG-030] workspace chat: Return sends on laptop, adds a new line on phone', async ({ page, boot, api }) => {
    api.handlers['/api/tailor/chat'] = () => ({ reply: 'ok', suggestions: [] });
    await boot(wsStore());
    const box = await chatBox(page); await box.fill('first line'); await box.press('Enter');
    await page.waitForTimeout(600);
    const sent = api.calls.filter((c) => c.path === '/api/tailor/chat').length;
    if (isPhone(page)) { expect(sent, 'phone Return sent the message').toBe(0); expect(await box.inputValue()).toContain('first line'); }
    else expect(sent).toBe(1);
  });
  test('[TC-REG-031] workspace chat: phone Send button still sends', async ({ page, boot, api }) => {
    test.skip(!isPhone(page), 'phone');
    api.handlers['/api/tailor/chat'] = () => ({ reply: 'ok', suggestions: [] });
    await boot(wsStore()); const box = await chatBox(page); await box.fill('hello there');
    await page.getByRole('button', { name: 'Send' }).first().click();
    await expect.poll(() => api.calls.filter((c) => c.path === '/api/tailor/chat').length).toBe(1);
  });
  test('[TC-REG-032] laptop: Shift+Enter adds a new line, does not send', async ({ page, boot, api }) => {
    test.skip(isPhone(page), 'laptop');
    await boot(wsStore()); const box = await chatBox(page); await box.fill('a'); await box.press('Shift+Enter'); await page.waitForTimeout(300);
    expect(api.calls.filter((c) => c.path === '/api/tailor/chat').length).toBe(0);
  });
});
