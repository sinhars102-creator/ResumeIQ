import { test, expect, seedStore, JD, isPhone } from './fixture';
import { sugg, chatBox, send } from './helpers';

const wsStore = (over: any = {}) => seedStore({ jd: JD, job: { title: 'PM', company: 'X' }, baseScore: 50, suggestions: { s1: { ...sugg(), pin: 1, status: 'pending', source: 'job', before: 'Grew MAU by 40%', target: 'E0B0' } }, pinCount: 1, workspace: true, messages: [{ id: 'm1', role: 'bot', text: 'Hello' }], ...over });

test.describe('Workspace conversation', () => {
  test('[TC-CHAT-001] @P0 message appears, typing indicator shows while waiting, reply appears', async ({ page, boot, api, errs }) => {
    api.handlers['/api/tailor/chat'] = async () => { await new Promise((r) => setTimeout(r, 900)); return { reply: 'Which role was that at?', suggestions: [] }; };
    await boot(wsStore());
    const box = await chatBox(page);
    await box.fill('I led a team of 6 on a forecasting project'); await send(page, box).catch(() => box.press('Enter'));
    await expect(page.locator('.ws-bub-user', { hasText: 'led a team of 6' })).toBeVisible();
    await expect(page.locator('.ws-typing')).toBeVisible();
    await expect(page.locator('.ws-bub-bot', { hasText: 'Which role' })).toBeVisible({ timeout: 8000 });
    await expect(page.locator('.ws-typing')).toHaveCount(0);
    expect(errs.filter((e) => e.startsWith('pageerror'))).toEqual([]);
  });

  test('[TC-CHAT-002] @P0 history sent with the 2nd message has the 1st exchange, in order, no duplicate of the current message', async ({ page, boot, api }) => {
    api.handlers['/api/tailor/chat'] = (b, n) => ({ reply: n === 1 ? 'Which role was that at?' : 'Noted Amazon.', suggestions: [] });
    await boot(wsStore());
    const box = await chatBox(page);
    await box.fill('I led a team of 6'); await send(page, box).catch(() => box.press('Enter'));
    await expect(page.locator('.ws-bub-bot', { hasText: 'Which role' })).toBeVisible();
    const box2 = await chatBox(page);
    await box2.fill('At Amazon'); await send(page, box2).catch(() => box2.press('Enter'));
    await expect(page.locator('.ws-bub-bot', { hasText: 'Noted Amazon' })).toBeVisible();
    const calls = api.calls.filter((c) => c.path === '/api/tailor/chat');
    expect(calls).toHaveLength(2);
    const h = calls[1].body.history.map((x: any) => `${x.role}:${x.text}`);
    expect(h).toContain('user:I led a team of 6');
    expect(h).toContain('bot:Which role was that at?');
    expect(h.indexOf('user:I led a team of 6')).toBeLessThan(h.indexOf('bot:Which role was that at?'));
    expect(h.filter((x: string) => x === 'user:At Amazon'), 'current message must not be in history (it is sent as `message`)').toHaveLength(0);
    expect(calls[1].body.message).toBe('At Amazon');
    expect(calls[1].auth).toBe('Bearer fake.jwt.token');
  });

  test('[TC-CHAT-003] server error: friendly message in the thread, typing indicator gone, input usable', async ({ page, boot, api }) => {
    api.handlers['/api/tailor/chat'] = (b, n) => (n === 1 ? { __status: 500, body: { error: 'Model down' } } : { reply: 'Back now', suggestions: [] });
    await boot(wsStore());
    const box = await chatBox(page);
    await box.fill('hello'); await send(page, box).catch(() => box.press('Enter'));
    await expect(page.locator('.ws-bub-bot', { hasText: /Model down|didn't work|couldn't/i })).toBeVisible({ timeout: 8000 });
    await expect(page.locator('.ws-typing')).toHaveCount(0);
    const box2 = await chatBox(page);
    await box2.fill('again'); await send(page, box2).catch(() => box2.press('Enter'));
    await expect(page.locator('.ws-bub-bot', { hasText: 'Back now' })).toBeVisible();
  });

  test('[TC-CHAT-004] whitespace-only message is not sent', async ({ page, boot, api }) => {
    await boot(wsStore());
    const box = await chatBox(page);
    await box.fill('    '); await box.press('Enter').catch(() => {});
    await page.waitForTimeout(400);
    expect(api.calls.filter((c) => c.path === '/api/tailor/chat')).toHaveLength(0);
  });

  test('[TC-CHAT-005] double-send while busy sends once', async ({ page, boot, api }) => {
    api.handlers['/api/tailor/chat'] = async () => { await new Promise((r) => setTimeout(r, 800)); return { reply: 'ok', suggestions: [] }; };
    await boot(wsStore());
    const box = await chatBox(page);
    await box.fill('add that I led a team of 6'); await send(page, box); await send(page, box).catch(() => {});
    await page.waitForTimeout(1500);
    expect(api.calls.filter((c) => c.path === '/api/tailor/chat')).toHaveLength(1);
  });

  test('[TC-CHAT-006] HTML/script, Hindi and emoji render as text and round-trip', async ({ page, boot, api }) => {
    const msg = 'मैंने 6 लोगों की टीम लीड की 🚀 <img src=x onerror="window.__xss=1"><script>window.__xss=1</script>';
    api.handlers['/api/tailor/chat'] = () => ({ reply: '<b>bold?</b> ठीक है', suggestions: [] });
    await boot(wsStore());
    const box = await chatBox(page);
    await box.fill(msg); await send(page, box);
    await expect(page.locator('.ws-bub-bot', { hasText: 'ठीक है' })).toBeVisible();
    expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
    await expect(page.locator('.ws-bub-bot b')).toHaveCount(0);
    expect(api.calls.find((c) => c.path === '/api/tailor/chat')!.body.message).toBe(msg);
  });

  test('[TC-CHAT-007] only the last 10 messages go as history; long messages do not break the request', async ({ page, boot, api }) => {
    const msgs = Array.from({ length: 30 }, (_, i) => ({ id: 'h' + i, role: i % 2 ? 'bot' : 'user', text: `msg ${i}` }));
    await boot(wsStore({ messages: msgs }));
    const box = await chatBox(page);
    await box.fill('x'.repeat(5000)); await send(page, box);
    await page.waitForTimeout(800);
    const c = api.calls.find((c) => c.path === '/api/tailor/chat')!;
    expect(c.body.history.length).toBeLessThanOrEqual(10);
  });

  test('[TC-CHAT-008] thread keeps newest message in view (scroll) and persists across reload', async ({ page, boot, api }) => {
    api.handlers['/api/tailor/chat'] = (b) => ({ reply: 'reply to ' + b.message, suggestions: [] });
    await boot(wsStore());
    for (let i = 0; i < 6; i++) { const b = await chatBox(page); await b.fill('question number ' + i); await send(page, b); await expect(page.locator('.ws-bub-bot', { hasText: 'reply to question number ' + i })).toBeVisible(); }
    const thread = page.locator('.ws-thread').first();
    const atBottom = await thread.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight < 4);
    expect(atBottom).toBe(true);
    await page.reload({ waitUntil: 'networkidle' });
    if (isPhone(page)) await page.getByRole('button', { name: /Ask for a change/ }).first().click().catch(() => {});
    await expect(page.locator('.ws-bub', { hasText: 'question number 5' }).first()).toBeVisible();
  });
});
