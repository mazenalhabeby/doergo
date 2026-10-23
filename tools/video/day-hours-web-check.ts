/**
 * "Change hours for this day" on the LOCAL web app's Schedule wallchart, looked at
 * (docs/plans/time-counting-model.md, phase 2).
 *   node day-hours-web-check.ts <outDir> [dark|light]
 */
import { chromium } from 'playwright';
import { WEB_URL } from './config.ts';

const [out, scheme = 'light'] = process.argv.slice(2);
const errors: string[] = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: scheme as 'dark' | 'light', locale: 'en-GB' });
page.setDefaultNavigationTimeout(240_000);
page.setDefaultTimeout(120_000);
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('response', (r) => { if (r.status() >= 400 && r.url().includes('/api/')) errors.push(`${r.status()} ${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, '')}`); });
const shot = async (name: string) => {
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.querySelectorAll('nextjs-portal').forEach((n) => n.remove()));
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
};

await page.goto(`${WEB_URL}/login`, { waitUntil: 'domcontentloaded' });
await page.locator('#login-email').waitFor({ state: 'visible' });
await page.fill('#login-email', 'client@example.com');
await page.fill('#login-password', 'password123');
await page.click('form button[type="submit"]');
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60_000 });

await page.goto(`${WEB_URL}/schedule`, { waitUntil: 'domcontentloaded' });
const cells = page.locator('button[aria-label$=": change hours"]');
await cells.first().waitFor();
console.log('day buttons', await cells.count());
await shot('1-wallchart');

// A weekday a few columns in, for somebody who is not the signed-in owner.
const others = page.locator('button[aria-label$=": change hours"]:not([aria-label^="John Owner"])');
const target = (await others.count()) ? others.nth(Math.min(5, (await others.count()) - 1)) : cells.nth(5);
console.log('opening', await target.getAttribute('aria-label'));
await target.hover();
await shot('2-hover');
await target.click();
await page.getByText(/Planned:/).first().waitFor({ timeout: 30_000 }).catch(() => {});
await shot('3-form');

const end = page.locator('#day-hours-end');
if (await end.count()) {
  await page.locator('#day-hours-start').fill('18:00');
  await end.fill('06:00');
  await shot('4-night');
  await end.fill('09:00');
  await page.locator('#day-hours-start').fill('14:00');
  await shot('5-too-long');
}
await page.keyboard.press('Escape');
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
