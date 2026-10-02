/**
 * The crew screens on the LOCAL web app, looked at: the crew card, Change
 * leader, putting somebody on the job, the history, the Settings switch.
 *   node crew-web-check.ts <taskId> <outDir>
 */
import { chromium } from 'playwright';
import { DEMO_LOGIN, WEB_URL } from './config.ts';
import { signIn } from './capture/screen.ts';

const [taskId, out] = process.argv.slice(2);
const errors: string[] = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark', locale: 'en-GB' });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, '')}`); });
const shot = async (name: string, sel?: string) => {
  await page.waitForTimeout(800);
  await page.evaluate(() => document.querySelectorAll('nextjs-portal').forEach((n) => n.remove()));
  if (sel) await page.locator(sel).first().screenshot({ path: `${out}/${name}.png` });
  else await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
};

await signIn(page, DEMO_LOGIN);
const t0 = Date.now();
await page.goto(`${WEB_URL}/tasks/${taskId}`, { waitUntil: 'domcontentloaded' });
await page.getByText('Crew', { exact: true }).first().waitFor({ timeout: 60_000 });
console.log('task page crew card visible after', Date.now() - t0, 'ms');
await shot('web-1-task', undefined);
const card = page.locator('div.rounded-2xl', { has: page.getByText('Change leader') }).first();
await card.screenshot({ path: `${out}/web-2-crew-card.png` });

await page.getByRole('button', { name: 'Change leader' }).click();
await page.getByRole('dialog').waitFor();
await shot('web-3-change-leader', '[role="dialog"]');
await page.keyboard.press('Escape');

await page.getByRole('button', { name: 'Put on the job' }).first().click();
await page.getByRole('dialog').waitFor();
await page.fill('#crew-member-reason', 'On site with the crew, phone flat');
await shot('web-4-put-on', '[role="dialog"]');
await page.getByRole('dialog').getByRole('button', { name: 'Put on the job' }).click();
await page.getByRole('dialog').waitFor({ state: 'detached' });
await page.waitForTimeout(1500);
await card.screenshot({ path: `${out}/web-5-crew-card-after.png` });

// The history lives in a collapsed section: open it by its title.
const header = page.getByRole('button', { name: /^Activity/ }).first();
if (await header.count()) {
  await header.scrollIntoViewIfNeeded();
  await header.click();
  await page.waitForTimeout(2000);
  const act = page.locator('[data-tour="task-activity"]');
  await (await act.count() ? act : header.locator('xpath=ancestor::div[contains(@class,"rounded")][1]')).screenshot({ path: `${out}/web-6-activity.png` });
} else console.log('activity section not found');

await page.goto(`${WEB_URL}/settings`, { waitUntil: 'domcontentloaded' });
await page.getByText('Crew jobs: the leader moves the steps').waitFor({ timeout: 60_000 }).catch(() => console.log('settings switch NOT visible (Mara is not admin?)'));
await shot('web-7-settings');
console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
