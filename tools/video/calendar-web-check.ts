/**
 * The company calendar on the LOCAL web app, looked at (shared calendar/*).
 *   node calendar-web-check.ts <outDir> [dark|light]
 */
import { chromium } from 'playwright';
import { WEB_URL } from './config.ts';

const [out, scheme = 'dark'] = process.argv.slice(2);
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

await page.goto(`${WEB_URL}/calendar`, { waitUntil: 'domcontentloaded' });
await page.getByRole('tab', { name: 'Week' }).waitFor();
await page.getByRole('tab', { name: 'Week' }).click();
await page.waitForTimeout(3000);
await shot('1-week');

const ev = page.locator('main button', { hasText: 'Client review' }).first();
if (await ev.count()) { await ev.click(); await shot('2-popover'); await page.keyboard.press('Escape'); }

await page.getByRole('tab', { name: 'Month' }).click();
await shot('3-month');
await page.getByRole('tab', { name: 'Agenda' }).click();
await shot('4-agenda');
await page.getByRole('tab', { name: 'Week' }).click();

await page.getByRole('button', { name: 'New', exact: true }).first().click();
await page.locator('#cal-smart').fill('Client review with BILLA on Saturday 3pm for 30 min on Zoom');
await page.getByRole('button', { name: /Add people/ }).click();
await page.waitForTimeout(1500);
await page.locator('[cmdk-item]').first().click();
await page.keyboard.press('Escape').catch(() => {});
await shot('5-new-dialog');
await page.keyboard.press('Escape');

await page.goto(`${WEB_URL}/settings?section=holidays`, { waitUntil: 'domcontentloaded' });
await page.getByText('Public holidays & company days off').waitFor();
await shot('6-settings');
await page.mouse.wheel(0, 900);
await shot('7-settings-list');

await page.goto(`${WEB_URL}/employees/availability`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
await shot('8-wallchart');

console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
