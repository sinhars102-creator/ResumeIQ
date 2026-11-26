import { Page } from '@playwright/test';
import { isPhone } from './fixture';
export async function chatBox(page: Page) {
  // workspace: laptop has an ask box; phones show the chat in the main column (or behind "Ask for a change")
  const ask = page.getByRole('button', { name: /Ask for a change/ }).first();
  if (isPhone(page) && (await ask.count())) await ask.click().catch(() => {});
  const sel = isPhone(page) ? '.ws-chatform textarea, .rl-composer textarea, textarea' : '.ws-askbox textarea, .rl-composer textarea, textarea';
  return page.locator(sel).first();
}
export const sugg = (over: any = {}) => ({ id: 's1', priority: 'must', title: 'Sharpen this bullet', why: 'Clearer wording', where: 'Acme · bullet 1', category: 'experience', edit: { target: 'E0B0', op: 'replace', after: 'Grew monthly active users by 40%' }, ...over });
/** Send the message in the composer: the round Send button (works on phone and laptop; phones do not send on Enter). */
export async function send(page: Page, box: any) {
  const btn = page.getByRole('button', { name: 'Send' }).first();
  if (await btn.count()) await btn.click({ timeout: 3000 }); else await box.press('Enter');
}
/** The tailoring workspace is showing (after a successful job read). */
export async function workspaceUp(page: Page) {
  await page.getByText(/suggestions? applied|Tailoring for|Match/).first().waitFor({ timeout: 10000 });
}
