import { test as base, expect, Page, Route } from '@playwright/test';

export const REF = process.env.FAKE_SUPABASE_REF || 'qafake';
const NOW = Date.now();
export const session = { access_token: 'fake.jwt.token', refresh_token: 'r', token_type: 'bearer', expires_in: 36000, expires_at: Math.floor(NOW / 1000) + 36000, user: { id: '00000000-0000-0000-0000-000000000001', email: 'qa@example.com', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };

export const resume = {
  name: 'Asha Rao', title: 'Product Manager', contact: 'asha@example.com · Bengaluru',
  summary: 'PM with 5 years in logistics technology.',
  experience: [{ company: 'Acme', role: 'Product Manager', period: '2019-2023', bullets: ['Grew MAU by 40%', 'Cut failures from 8% to 3%'] }],
  skills: ['SQL', 'Roadmapping'], certifications: [], education: [{ degree: 'B.Tech', school: 'NIT Trichy', year: '2018' }],
};
export const JD = 'About the job. We need a product manager with SQL and stakeholder management experience. '.repeat(4) + 'END-OF-JD-MARKER';

export function seedStore(over: any = {}) {
  return { activeId: 'c1', chats: [{ id: 'c1', title: 'Test', resume, jd: '', job: null, baseScore: null, suggestions: {}, queue: [], mode: 'tailor', messages: [{ id: 'm1', role: 'bot', text: 'Paste the job description.' }], updatedAt: NOW, ...over }] };
}

export type Api = { calls: { method: string; path: string; auth: string | null; body: any }[]; handlers: Record<string, (body: any, n: number) => any> };

/** Seeds a fake signed-in session + chat store, blocks the fake Supabase host, mocks /api/**; records every call. */
export const test = base.extend<{ api: Api; errs: string[]; boot: (store?: any, opts?: { signedIn?: boolean }) => Promise<void> }>({
  errs: async ({ page }, use) => {
    const errs: string[] = [];
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
    await use(errs);
  },
  api: async ({ page }, use) => {
    const api: Api = { calls: [], handlers: {} };
    const counts: Record<string, number> = {};
    await page.route('**/*.supabase.co/**', (r: Route) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.route('**/api/**', async (route: Route) => {
      const req = route.request(); const p = new URL(req.url()).pathname;
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      let body: any = null; try { body = req.postDataJSON(); } catch {}
      api.calls.push({ method: req.method(), path: p, auth: req.headers()['authorization'] || null, body });
      counts[p] = (counts[p] || 0) + 1;
      const h = api.handlers[p];
      if (h) { const out = await h(body, counts[p]); if (out?.__status) return route.fulfill({ status: out.__status, contentType: 'application/json', headers: cors, body: JSON.stringify(out.body) }); return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(out) }); }
      if (p === '/api/rllm/state') return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ state: { chats: [] } }) });
      if (p.startsWith('/api/downloads/status')) return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ allowed: true, plan: 'unl', remaining: null, unlimited: true, expiresAt: null }) });
      return route.fulfill({ status: 404, contentType: 'application/json', headers: cors, body: '{"error":"unmocked"}' });
    });
    await use(api);
  },
  boot: async ({ page, api }, use) => {
    void api;
    await use(async (store = seedStore(), opts = {}) => {
      await page.addInitScript(([ref, s, st, signedIn]) => {
        if (signedIn) localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(s));
        if (!localStorage.getItem('riq_resume_llm_v1')) localStorage.setItem('riq_resume_llm_v1', JSON.stringify(st));
        localStorage.setItem('riq_cookie_ok', '1');
      }, [REF, session, store, opts.signedIn !== false] as const);
      await page.goto('/app/editor', { waitUntil: 'networkidle' });
    });
  },
});
export { expect };
export const isPhone = (page: Page) => (page.viewportSize()?.width || 1000) < 900;
