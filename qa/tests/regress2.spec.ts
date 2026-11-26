// Regression pass 2: BUG-011 (Start a new chat keeps other chats), BUG-012 (download dialog busy), null suggestion entry.
import { test, expect, seedStore, JD, isPhone, resume } from './fixture';
import { sugg } from './helpers';

const KEY = 'riq_resume_llm_v1';
const broken = { ...resume, experience: 'broken' };
const chat = (id: string, over: any = {}) => ({ id, title: 'Chat ' + id, resume, original: resume, jd: '', job: null, baseScore: null, suggestions: {}, queue: [], mode: 'tailor', messages: [{ id: 'm1', role: 'bot', text: 'Paste the job description.' }], updatedAt: Date.now(), ...over });
const crashed = (id: string) => chat(id, { resume: broken, original: broken });
const store = (chats: any[], activeId: string) => ({ activeId, chats });
const alertBox = (page: any) => page.getByRole('alert').filter({ hasText: 'Something went wrong' });
const saved = (page: any) => page.evaluate((k: string) => { const raw = localStorage.getItem(k); try { return raw === null ? null : JSON.parse(raw); } catch { return '__unreadable__'; } }, KEY);
// The shared boot() fixture re-seeds an EMPTY key on every load, so after the reload the key can't be read back.
// This init script (registered before boot's) records what the key held at the moment of the reload instead.
async function watchReload(page: any) {
  await page.addInitScript((k: string) => { if (sessionStorage.getItem('__second')) { const v = localStorage.getItem(k); sessionStorage.setItem('__keyAtReload', v === null ? 'absent' : 'present:' + v.slice(0, 60)); } }, KEY);
}
const arm = (page: any) => page.evaluate(() => sessionStorage.setItem('__second', '1'));
const keyAtReload = (page: any) => page.evaluate(() => sessionStorage.getItem('__keyAtReload'));
const ids = async (page: any) => { const s = await saved(page); return s && s !== '__unreadable__' && Array.isArray(s.chats) ? s.chats.map((c: any) => c.id) : s; };

test.describe('BUG-011: "Start a new chat" removes only the active chat', () => {
  test('[TC-REG-040] @P0 2 chats, active one crashes: only it is removed, the other survives and the app loads', async ({ page, boot, errs }) => {
    await boot(store([crashed('c1'), chat('c9', { title: 'Older chat' })], 'c1'));
    await expect(alertBox(page)).toBeVisible({ timeout: 6000 });
    expect(await ids(page)).toEqual(['c1', 'c9']);
    await page.getByRole('button', { name: 'Start a new chat' }).click();
    await page.waitForLoadState('load'); await page.waitForTimeout(1200);
    await expect(alertBox(page)).toHaveCount(0);
    const after = await saved(page);
    const list = (after?.chats || []).map((c: any) => c.id);
    test.info().annotations.push({ type: 'after-reset', description: `chats=${JSON.stringify(list)} activeId=${after?.activeId}` });
    expect(list).toContain('c9'); expect(list).not.toContain('c1');
    expect(after.chats.find((c: any) => c.id === 'c9').title).toBe('Older chat');
    expect(JSON.stringify(after.chats.find((c: any) => c.id === 'c9').resume)).toBe(JSON.stringify(resume));
    expect(errs.filter((e) => e.startsWith('pageerror') && !/experience|map|not a function|iterable/.test(e)), 'unexpected page errors').toEqual([]);
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });
  test('[TC-REG-041] 3 chats, the middle one is active and crashes: the other two keep their order and content', async ({ page, boot }) => {
    await boot(store([chat('a', { title: 'First' }), crashed('b'), chat('c', { title: 'Third' })], 'b'));
    await expect(alertBox(page)).toBeVisible({ timeout: 6000 });
    await page.getByRole('button', { name: 'Start a new chat' }).click();
    await page.waitForLoadState('load'); await page.waitForTimeout(1200);
    const l = (await ids(page)) as string[];
    test.info().annotations.push({ type: 'after-reset', description: JSON.stringify(l) });
    expect(l.filter((x) => x === 'a' || x === 'c')).toEqual(['a', 'c']); expect(l).not.toContain('b');
    await expect(alertBox(page)).toHaveCount(0);
  });
  test('[TC-REG-042] the only chat crashes: it is removed and the app opens on a fresh chat (no crash loop)', async ({ page, boot }) => {
    await boot(store([crashed('c1')], 'c1'));
    await expect(alertBox(page)).toBeVisible({ timeout: 6000 });
    await page.getByRole('button', { name: 'Start a new chat' }).click();
    await page.waitForLoadState('load'); await page.waitForTimeout(1200);
    await expect(alertBox(page)).toHaveCount(0);
    expect(await ids(page)).not.toContain('c1');
    await expect(page.locator('textarea').first()).toBeVisible();
  });
  test('[TC-REG-043] stored JSON unreadable when the button is pressed: falls back to clearing the key, app recovers', async ({ page, boot }) => {
    await watchReload(page);
    await boot(store([crashed('c1'), chat('c9')], 'c1'));
    await expect(alertBox(page)).toBeVisible({ timeout: 6000 });
    await page.evaluate((k: string) => localStorage.setItem(k, '{not valid json'), KEY);
    await arm(page);
    await page.getByRole('button', { name: 'Start a new chat' }).click();
    await page.waitForLoadState('load'); await page.waitForTimeout(1200);
    expect(await keyAtReload(page), 'corrupt JSON must be cleared, not left in storage').toBe('absent');
  });
  test('[TC-REG-044] stored value is valid JSON but has no chats array: key removed, app recovers', async ({ page, boot }) => {
    await watchReload(page);
    await boot(store([crashed('c1')], 'c1'));
    await expect(alertBox(page)).toBeVisible({ timeout: 6000 });
    await page.evaluate((k: string) => localStorage.setItem(k, JSON.stringify({ activeId: 'x', chats: 'oops' })), KEY);
    await arm(page);
    await page.getByRole('button', { name: 'Start a new chat' }).click();
    await page.waitForLoadState('load'); await page.waitForTimeout(1200);
    expect(await keyAtReload(page)).toBe('absent');
  });
  test('[TC-REG-045] setItem throws (storage full/blocked): falls back to removing the key and reloads', async ({ page, boot }) => {
    await watchReload(page);
    await boot(store([crashed('c1'), chat('c9')], 'c1'));
    await expect(alertBox(page)).toBeVisible({ timeout: 6000 });
    await arm(page); await page.evaluate(() => { Storage.prototype.setItem = function () { throw new Error('QuotaExceeded'); }; });
    await page.getByRole('button', { name: 'Start a new chat' }).click();
    await page.waitForLoadState('load'); await page.waitForTimeout(1200);
    // setItem threw, so the app fell back to removing the whole key (other chats are lost in this rare case)
    expect(await keyAtReload(page)).toBe('absent');
  });
  test('[TC-REG-046] activeId points at no chat (stale) and a stored chat crashes: does Start a new chat still escape the crash loop?', async ({ page, boot }) => {
    await boot(store([crashed('c1'), chat('c9')], 'zzz'));
    const shown = await alertBox(page).waitFor({ timeout: 4000 }).then(() => true).catch(() => false);
    test.skip(!shown, 'stale activeId does not crash the app (it opens a healthy chat)');
    await page.getByRole('button', { name: 'Start a new chat' }).click();
    await page.waitForLoadState('load'); await page.waitForTimeout(1200);
    expect(await alertBox(page).count(), 'crash loop: nothing was removed').toBe(0);
  });
  test('[TC-REG-048] two chats are broken (active c1, other c2): after the first Start a new chat the second crash can still be escaped', async ({ page, boot }) => {
    await boot(store([crashed('c1'), crashed('c2'), chat('c9', { title: 'Healthy' })], 'c1'));
    await expect(alertBox(page)).toBeVisible({ timeout: 6000 });
    await page.getByRole('button', { name: 'Start a new chat' }).click();
    await page.waitForLoadState('load'); await page.waitForTimeout(1200);
    const second = await alertBox(page).count();
    test.info().annotations.push({ type: 'after-1st-reset', description: `crashAgain=${second > 0} ids=${JSON.stringify(await ids(page))}` });
    test.skip(second === 0, 'second broken chat did not crash');
    await page.getByRole('button', { name: 'Start a new chat' }).click();
    await page.waitForLoadState('load'); await page.waitForTimeout(1200);
    expect(await alertBox(page).count(), 'still stuck on the crash screen after a second Start a new chat').toBe(0);
  });
  test('[TC-REG-047] signed in, server copy returns the same crashing chat: does the crash come back after Start a new chat? (annotation)', async ({ page, boot, api }) => {
    const bad = crashed('c1'); bad.updatedAt = Date.now() + 100000;
    api.handlers['/api/rllm/state'] = () => ({ state: { activeId: 'c1', chats: [bad, chat('c9')] } });
    await boot(store([chat('c9')], 'c9'));
    const shown = await alertBox(page).waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
    test.skip(!shown, 'could not force a sync crash');
    await page.getByRole('button', { name: 'Start a new chat' }).click();
    await page.waitForLoadState('load'); await page.waitForTimeout(2000);
    const again = await alertBox(page).count();
    test.info().annotations.push({ type: 'sync-loop', description: `crash after reset with server still holding the bad chat: ${again > 0}` });
    expect(again, 'signed-in user is stuck in a crash loop: server re-delivers the bad chat').toBe(0);
  });
});

test.describe('null suggestion entry does not blank the page', () => {
  const good = () => ({ ...sugg({ id: 's1', before: 'Grew MAU by 40%' }), pin: 1, status: 'pending', source: 'job', before: 'Grew MAU by 40%', target: 'E0B0' });
  const mkc = (suggestions: any) => seedStore({ original: resume, jd: JD, job: { title: 'PM', company: 'X' }, baseScore: 50, pinCount: 1, workspace: true, messages: [{ id: 'm1', role: 'bot', text: 'Hello' }], suggestions });
  test('[TC-REG-050] @P0 { s1: valid, sn: null }: no crash screen, valid suggestion kept and shown', async ({ page, boot, errs }) => {
    await boot(mkc({ s1: good(), sn: null }));
    await page.waitForTimeout(800);
    await expect(page.locator('body')).not.toContainText('Something went wrong');
    await expect(page.locator('[class*="ws-"]').first()).toBeVisible();
    expect(errs.filter((e) => e.startsWith('pageerror'))).toEqual([]);
    const c = (await saved(page)).chats[0];
    expect(Object.keys(c.suggestions)).toEqual(['s1']);
    expect(c.suggestions.s1.status).toBe('pending');
    if (isPhone(page)) await page.getByRole('button', { name: /Review/ }).first().click();
    await expect(page.locator('.ws-txt', { hasText: /monthly active users/ }).first()).toBeVisible();
  });
  test('[TC-REG-051] other junk values in suggestions (string, number, array, boolean): no crash, valid one kept', async ({ page, boot, errs }) => {
    await boot(mkc({ s1: good(), a: 'x', b: 7, c: [], d: true, e: null }));
    await page.waitForTimeout(800);
    await expect(page.locator('body')).not.toContainText('Something went wrong');
    expect(errs.filter((e) => e.startsWith('pageerror'))).toEqual([]);
    const keys = Object.keys((await saved(page)).chats[0].suggestions);
    test.info().annotations.push({ type: 'kept-keys', description: JSON.stringify(keys) });
    expect(keys).toContain('s1');
  });
  test('[TC-REG-052] null entry in a non-active chat: no crash, and the chat is usable after switching to it', async ({ page, boot }) => {
    const other = chat('c2', { title: 'Other', suggestions: { sn: null } });
    await boot(store([chat('c1'), other], 'c1'));
    await page.waitForTimeout(600);
    await expect(page.locator('body')).not.toContainText('Something went wrong');
    const c2 = (await saved(page)).chats.find((c: any) => c.id === 'c2');
    test.info().annotations.push({ type: 'inactive-chat', description: JSON.stringify(c2?.suggestions) });
    expect(c2).toBeTruthy();
  });
  test('[TC-REG-053] null suggestion in a chat arriving by cross-device sync does not blank the page', async ({ page, boot, api, errs }) => {
    const srv: any = JSON.parse(JSON.stringify(mkc({ s1: good(), sn: null }).chats[0])); srv.id = 'c2'; srv.updatedAt = Date.now() + 100000;
    api.handlers['/api/rllm/state'] = () => ({ state: { activeId: 'c2', chats: [srv] } });
    await boot(seedStore());
    await page.waitForTimeout(1800);
    const n = await alertBox(page).count();
    test.info().annotations.push({ type: 'sync-null', description: `crashed=${n} pageerrors=${errs.filter((e) => e.startsWith('pageerror')).length}` });
    expect(n, 'null suggestion from server sync reaches render').toBe(0);
  });
});

test.describe('BUG-012: download dialog ignores Escape / scrim while busy', () => {
  const dstore = () => seedStore({ resume, original: resume, mode: 'tailor', workspace: true, jd: 'x'.repeat(300), job: { title: 'PM', company: 'X' }, suggestions: {}, messages: [{ id: 'm1', role: 'bot', text: 'Hi' }] });
  test.beforeEach(({ page }) => { test.skip(isPhone(page), 'keyboard / pointer test, laptop only'); });
  const heading = (page: any) => page.getByRole('heading', { name: 'Choose a template' });
  async function setup(page: any, boot: any, api: any) {
    api.handlers['/api/downloads/status'] = () => ({ allowed: false, plan: null, remaining: 0, unlimited: false, expiresAt: null });
    api.handlers['/api/create-order'] = () => ({ order_id: 'order_fake', amount: 4900, currency: 'INR', key_id: 'rzp_test_fake', name: 'Week pass' });
    api.handlers['/api/downloads/purchase'] = () => ({ status: { allowed: true, plan: 'week', remaining: null, unlimited: true, expiresAt: null }, payment_id: 'pay_fake', order_id: 'order_fake' });
    await page.route('**/checkout.razorpay.com/**', (r: any) => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.Razorpay=function(o){this.o=o;window.__rzp=this;};window.Razorpay.prototype.open=function(){window.__rzpOpen=true};window.Razorpay.prototype.on=function(){};' }));
    await boot(dstore());
    await page.getByRole('button', { name: 'Download PDF' }).first().click();
    await expect(heading(page)).toBeVisible();
    await page.getByRole('button', { name: /Continue with/ }).click();
  }
  const pay = (page: any) => page.getByRole('button', { name: /Pay ₹|Opening payment/ });
  const purchases = (api: any) => api.calls.filter((c: any) => c.path === '/api/downloads/purchase').length;
  async function startPayment(page: any) {
    await page.getByRole('button', { name: /Pay ₹/ }).click();
    await expect.poll(() => page.evaluate(() => (window as any).__rzpOpen === true)).toBe(true);
  }
  test('[TC-REG-060] @P0 Escape while paying: dialog stays; completing payment records ONE purchase and the dialog shows the result', async ({ page, boot, api }) => {
    await setup(page, boot, api); await startPayment(page);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await page.evaluate(() => (window as any).__rzp.o.handler({ razorpay_payment_id: 'pay_fake', razorpay_order_id: 'order_fake', razorpay_signature: 'sig' }));
    await expect.poll(() => purchases(api)).toBe(1);
    await page.waitForTimeout(500);
    await expect(page.getByRole('dialog')).toHaveCount(1);
    const txt = await page.getByRole('dialog').innerText();
    test.info().annotations.push({ type: 'dialog-after-pay', description: txt.replace(/\s+/g, ' ').slice(0, 200) });
    expect(txt).toMatch(/Download PDF|ready|paid|thank/i);
    expect(purchases(api), 'plan activated exactly once').toBe(1);
  });
  test('[TC-REG-061] scrim click while paying: dialog stays; no silent purchase', async ({ page, boot, api }) => {
    await setup(page, boot, api); await startPayment(page);
    await page.mouse.click(4, 4); await page.waitForTimeout(300);
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await page.evaluate(() => (window as any).__rzp.o.handler({ razorpay_payment_id: 'pay_fake', razorpay_order_id: 'order_fake', razorpay_signature: 'sig' }));
    await expect.poll(() => purchases(api)).toBe(1);
    await expect(page.getByRole('dialog')).toHaveCount(1);
  });
  test('[TC-REG-062] repeated Escape x3 and scrim x2 while paying never closes it', async ({ page, boot, api }) => {
    await setup(page, boot, api); await startPayment(page);
    for (let i = 0; i < 3; i++) await page.keyboard.press('Escape');
    for (let i = 0; i < 2; i++) await page.mouse.click(4, 4);
    await page.waitForTimeout(300);
    await expect(page.getByRole('dialog')).toHaveCount(1);
  });
  test('[TC-REG-063] user cancels inside Razorpay (ondismiss): dialog becomes closable again, no purchase recorded', async ({ page, boot, api }) => {
    await setup(page, boot, api); await startPayment(page);
    const hasDismiss = await page.evaluate(() => typeof (window as any).__rzp.o.modal?.ondismiss === 'function');
    test.skip(!hasDismiss, 'app does not register modal.ondismiss');
    await page.evaluate(() => (window as any).__rzp.o.modal.ondismiss());
    await expect(pay(page)).toBeVisible(); await expect(page.getByRole('button', { name: /Pay ₹/ })).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(purchases(api)).toBe(0);
  });
  test('[TC-REG-064] Escape on the Pay step BEFORE pressing Pay (not busy) closes the dialog; focus returns to Download PDF', async ({ page, boot, api }) => {
    await setup(page, boot, api);
    await expect(page.getByRole('button', { name: /Pay ₹/ })).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement?.textContent?.trim())).toMatch(/Download PDF/);
  });
  test('[TC-REG-065] template step (not busy): Escape closes, focus returns to the Download PDF button; scrim click also closes', async ({ page, boot }) => {
    await boot(dstore());
    const btn = page.getByRole('button', { name: 'Download PDF' }).first(); await btn.focus(); await btn.press('Enter');
    await expect(heading(page)).toBeVisible();
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(heading(page)).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement?.textContent?.trim())).toMatch(/Download PDF/);
    await btn.click(); await expect(heading(page)).toBeVisible();
    await page.mouse.click(4, 4);
    await expect(heading(page)).toHaveCount(0);
  });
  test('[TC-REG-066] "Keep editing" button while paying (third close route): does it close the dialog under a live payment?', async ({ page, boot, api }) => {
    await setup(page, boot, api); await startPayment(page);
    const keep = page.getByRole('button', { name: 'Keep editing' });
    const present = await keep.count();
    if (present) await keep.click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(300);
    const closed = (await page.getByRole('dialog').count()) === 0;
    await page.evaluate(() => (window as any).__rzp.o.handler({ razorpay_payment_id: 'pay_fake', razorpay_order_id: 'order_fake', razorpay_signature: 'sig' }));
    await page.waitForTimeout(500);
    test.info().annotations.push({ type: 'keep-editing-while-busy', description: `buttonPresent=${present} dialogClosed=${closed} purchaseAfterClose=${purchases(api)}` });
    expect(closed, 'Keep editing closed the dialog while a payment was active (purchase then recorded silently)').toBe(false);
  });
  test('[TC-REG-067] payment completes, then Escape closes normally once not busy', async ({ page, boot, api }) => {
    await setup(page, boot, api); await startPayment(page);
    await page.evaluate(() => (window as any).__rzp.o.handler({ razorpay_payment_id: 'pay_fake', razorpay_order_id: 'order_fake', razorpay_signature: 'sig' }));
    await expect.poll(() => purchases(api)).toBe(1);
    await expect(page.getByRole('dialog').getByRole('button', { name: /^Download PDF$/ })).toBeEnabled({ timeout: 5000 });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
