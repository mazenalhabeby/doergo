/**
 * "Open to a role" on an EXISTING task, on the LOCAL web app, looked at.
 *   node role-existing-check.ts <taskId> <outDir>
 */
import { chromium } from 'playwright';
import { WEB_URL } from './config.ts';

const [taskId, out] = process.argv.slice(2);
const errors: string[] = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark', locale: 'en-GB' });
page.setDefaultNavigationTimeout(240_000);
page.setDefaultTimeout(120_000);
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('response', (r) => { if (r.status() >= 400 && r.url().includes('/api/')) errors.push(`${r.status()} ${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, '')}`); });

await page.goto(`${WEB_URL}/login`, { waitUntil: 'domcontentloaded' });
await page.fill('#login-email', 'client@example.com');
await page.fill('#login-password', 'password123');
await page.click('form button[type="submit"]');
await page.waitForURL((u) => !u.pathname.startsWith('/login'));

await page.goto(`${WEB_URL}/tasks/${taskId}`, { waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: 'Open to a role' }).waitFor();
await page.getByRole('button', { name: 'Open to a role' }).click();
await page.getByRole('combobox').filter({ hasText: 'Choose a role' }).first().click();
await page.getByRole('option').first().click();
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/5-existing-dialog.png` });
await page.getByRole('button', { name: 'Open to the role' }).click();
await page.getByText(/Open to /).first().waitFor();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/6-existing-after.png` });
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
