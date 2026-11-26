import { test, expect, seedStore, JD } from './fixture';
import { sugg, send, workspaceUp } from './helpers';

const failedStore = () => seedStore({ messages: [
  { id: 'm1', role: 'bot', text: 'Paste the job description.' },
  { id: 'u1', role: 'user', text: JD.slice(0, 220) + '…', full: JD, note: 'Job description' },
  { id: 'e1', role: 'bot', text: "I couldn't read that job just now (Request failed (500)).", retryOf: 'u1' },
] });

test.describe('JD paste, Try again, auth token', () => {
  test('[TC-JD-001] @P0 pasting a JD sends the sign-in token and shows suggestions', async ({ page, boot, api }) => {
    api.handlers['/api/tailor/suggest'] = () => ({ jobTitle: 'PM', company: 'X', intro: 'Here you go.', suggestions: [sugg()] });
    await boot();
    const box = page.locator('textarea').first();
    await box.fill(JD); await send(page, box);
    await workspaceUp(page);
    const c = api.calls.find((x) => x.path === '/api/tailor/suggest')!;
    expect(c.auth).toBe('Bearer fake.jwt.token');
    expect(c.body.jd.endsWith('END-OF-JD-MARKER')).toBe(true);
  });

  test('[TC-JD-002] @P0 failed JD read shows Try again; retry succeeds with the FULL text', async ({ page, boot, api }) => {
    api.handlers['/api/tailor/suggest'] = (b, n) => (n === 1 ? { __status: 500, body: { error: 'Boom' } } : { jobTitle: 'PM', company: 'X', suggestions: [sugg()] });
    await boot();
    const box = page.locator('textarea').first();
    await box.fill(JD); await send(page, box);
    await expect(page.getByText(/couldn't read that job just now \(Boom\)/)).toBeVisible();
    await page.getByRole('button', { name: 'Try again' }).click();
    await workspaceUp(page);
    const calls = api.calls.filter((x) => x.path === '/api/tailor/suggest');
    expect(calls).toHaveLength(2);
    expect(calls[1].body.jd).toBe(JD);
  });

  test('[TC-JD-003] stale error bubble does not keep offering Try again after a successful retry', async ({ page, boot, api }) => {
    api.handlers['/api/tailor/suggest'] = () => ({ jobTitle: 'PM', company: 'X', suggestions: [sugg()] });
    await boot(failedStore());
    await page.getByRole('button', { name: 'Try again' }).click();
    await workspaceUp(page);
    // The old failure message should not still show a live Try again button once the job was read
    await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);
  });

  test('[TC-JD-004] Try again with no network keeps the message and the button', async ({ page, boot, api }) => {
    api.handlers['/api/tailor/suggest'] = () => ({ __status: 401, body: { error: 'Sign in to continue' } });
    await boot(failedStore());
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText(/Sign in to continue/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' }).last()).toBeEnabled();
  });

  test('[TC-JD-005] @P0 signed-out user: no Authorization header is invented', async ({ page, boot, api }) => {
    api.handlers['/api/tailor/suggest'] = () => ({ __status: 401, body: { error: 'Sign in to continue' } });
    await boot(seedStore(), { signedIn: false });
    const box = page.locator('textarea').first();
    await box.fill(JD); await send(page, box);
    await expect(page.getByText(/Sign in to continue|couldn't read/).first()).toBeVisible({ timeout: 8000 });
    const c = api.calls.find((x) => x.path === '/api/tailor/suggest');
    if (c) expect(c.auth).toBeNull();
  });

  test('[TC-JD-006] a JD with Hinglish, emoji and <script> is sent intact and not executed', async ({ page, boot, api }) => {
    const hj = 'Hume ek PM chahiye jo SQL jaanta ho 🚀 <script>window.__xss=1</script> ' + 'kaam '.repeat(40);
    api.handlers['/api/tailor/suggest'] = () => ({ jobTitle: 'PM', company: 'X', suggestions: [] });
    await boot();
    const box = page.locator('textarea').first();
    await box.fill(hj); await send(page, box);
    await workspaceUp(page);
    expect(api.calls.find((x) => x.path === '/api/tailor/suggest')!.body.jd).toBe(hj.trim());
    expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
  });

  test('[TC-JD-007] double Enter on a JD sends it once', async ({ page, boot, api }) => {
    api.handlers['/api/tailor/suggest'] = async () => { await new Promise((r) => setTimeout(r, 600)); return { jobTitle: 'PM', company: 'X', suggestions: [] }; };
    await boot();
    const box = page.locator('textarea').first();
    await box.fill(JD); await send(page, box); await send(page, box).catch(() => {});
    await page.waitForTimeout(1500);
    expect(api.calls.filter((x) => x.path === '/api/tailor/suggest').length).toBe(1);
  });
});

test.describe('Message actions', () => {
  test('[TC-MSG-001] Copy puts the FULL job text on the clipboard', async ({ page, boot, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'clipboard permission API is chromium-only; covered by fallback test TC-MSG-002');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await boot(failedStore());
    await page.locator('.rl-msg-actions button', { hasText: 'Copy' }).first().click();
    await expect(page.locator('.rl-msg-actions button', { hasText: 'Copied' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(JD);
  });

  test('[TC-MSG-002] Copy falls back when the clipboard API is blocked', async ({ page, boot }) => {
    await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) }, configurable: true }); (document as any).execCommand = () => { (window as any).__copied = (document.activeElement as any)?.value; return true; }; });
    await boot(failedStore());
    await page.locator('.rl-msg-actions button', { hasText: 'Copy' }).first().click();
    await expect(page.locator('.rl-msg-actions button', { hasText: 'Copied' })).toBeVisible();
  });

  test('[TC-MSG-003] Edit puts the full text (not the truncated bubble) in the box', async ({ page, boot }) => {
    await boot(failedStore());
    await page.locator('.rl-msg-actions button', { hasText: 'Edit' }).first().click();
    expect(await page.locator('textarea').first().inputValue()).toBe(JD);
  });

  test('[TC-MSG-004] Rerun re-sends the full JD and does not add a second user bubble', async ({ page, boot, api }) => {
    api.handlers['/api/tailor/suggest'] = () => ({ jobTitle: 'PM', company: 'X', suggestions: [] });
    await boot(failedStore());
    const userMsgs = () => page.evaluate(() => JSON.parse(localStorage.getItem('riq_resume_llm_v1')!).chats[0].messages.filter((m: any) => m.role === 'user').length);
    const before = await userMsgs();
    await page.locator('.rl-msg-actions button', { hasText: 'Rerun' }).first().click();
    await workspaceUp(page);
    expect(api.calls.find((x) => x.path === '/api/tailor/suggest')!.body.jd).toBe(JD);
    expect(await userMsgs()).toBe(before);
  });

  test('[TC-MSG-005] Rerun is disabled while a request is running (no double send)', async ({ page, boot, api }) => {
    api.handlers['/api/tailor/suggest'] = async () => { await new Promise((r) => setTimeout(r, 1200)); return { jobTitle: 'PM', company: 'X', suggestions: [] }; };
    await boot(failedStore());
    const rerun = page.locator('.rl-msg-actions button', { hasText: 'Rerun' }).first();
    await rerun.click();
    await expect(rerun).toBeDisabled();
    await page.waitForTimeout(1800);
    expect(api.calls.filter((x) => x.path === '/api/tailor/suggest').length).toBe(1);
  });

  test('[TC-MSG-006] older job message saved without full text shows Paste it again (no Copy/Rerun of a truncated text)', async ({ page, boot }) => {
    await boot(seedStore({ messages: [
      { id: 'm1', role: 'bot', text: 'Paste the job description.' },
      { id: 'u1', role: 'user', text: 'About the job. We need a product manager with SQL and stakeh…', note: 'Job description' },
    ] }));
    await expect(page.getByRole('button', { name: 'Paste it again' })).toBeVisible();
    // Truncated text must not be offered for rerun
    await expect(page.locator('.rl-msg-actions button', { hasText: 'Rerun' })).toHaveCount(0);
    await page.locator('textarea').first().fill('leftover');
    await page.getByRole('button', { name: 'Paste it again' }).click();
    await expect(page.locator('textarea').first()).toBeFocused();
    expect(await page.locator('textarea').first().inputValue()).toBe('');
  });

  test('[TC-MSG-007] Paste it again on an old error with no retry link', async ({ page, boot }) => {
    await boot(seedStore({ messages: [
      { id: 'm1', role: 'bot', text: 'Paste the job description.' },
      { id: 'u1', role: 'user', text: 'About the job…', note: 'Job description' },
      { id: 'e1', role: 'bot', text: "I couldn't read that job just now (Sign in to continue)." },
    ] }));
    await expect(page.getByRole('button', { name: 'Paste the job again' })).toBeVisible();
  });

  test('[TC-MSG-008] Edit of a bot message / action buttons are 44px tap targets on phone', async ({ page, boot, }, info) => {
    await boot(failedStore());
    const btns = page.locator('.rl-msg-actions button');
    const n = await btns.count(); const small: string[] = [];
    for (let i = 0; i < n; i++) { const b = await btns.nth(i).boundingBox(); if (b && (b.height < 44)) small.push(`${await btns.nth(i).innerText()} h=${Math.round(b.height)}`); }
    test.info().annotations.push({ type: 'tap-target-heights', description: small.join(', ') || 'all >=44' });
    if (info.project.use.isMobile) expect(small, 'tap targets < 44px').toEqual([]);
  });
});
