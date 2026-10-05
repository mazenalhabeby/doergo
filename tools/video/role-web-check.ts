/**
 * Tasks open to a work role, on the LOCAL web app, looked at (shared tasks/role-pool.ts):
 * the task page card, the list badge + per-role report, the New Task "Person / Role" choice.
 *   node role-web-check.ts <openTaskId> <spaceName> <outDir>
 */
import { chromium } from 'playwright';
import { WEB_URL } from './config.ts';

const [taskId, spaceName, out] = process.argv.slice(2);
const errors: string[] = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark', locale: 'en-GB' });
page.setDefaultNavigationTimeout(240_000);
page.setDefaultTimeout(120_000);
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('response', (r) => { if (r.status() >= 400 && r.url().includes('/api/')) errors.push(`${r.status()} ${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, '')}`); });
const shot = async (name: string, loc?: ReturnType<typeof page.locator>) => {
  await page.waitForTimeout(900);
  await page.evaluate(() => document.querySelectorAll('nextjs-portal').forEach((n) => n.remove()));
  if (loc) await loc.screenshot({ path: `${out}/${name}.png` }); else await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
};

await page.goto(`${WEB_URL}/login`, { waitUntil: 'domcontentloaded' });
await page.locator('#login-email').waitFor({ state: 'visible' });
await page.fill('#login-email', 'client@example.com');
await page.fill('#login-password', 'password123');
await page.click('form button[type="submit"]');
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60_000 }).catch(async () => {
  await page.screenshot({ path: `${out}/0-login-stuck.png` });
  throw new Error('sign-in did not leave /login');
});

// 3. New Task: Person / Role.
await page.goto(`${WEB_URL}/tasks`, { waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: /new task/i }).first().waitFor();
await page.getByRole('button', { name: /new task/i }).first().click();
await page.waitForTimeout(4000);
await page.screenshot({ path: `${out}/4a-after-new-task.png` });
const panel = page.locator('div', { has: page.getByText('New Service Request', { exact: true }) }).last();
await page.getByRole('combobox').filter({ hasText: 'Main Office' }).first().click();
await page.getByRole('option', { name: spaceName }).first().click();
await page.getByText('Assignment', { exact: true }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/4b-assignment-people.png` });
await page.getByRole('button', { name: 'Role', exact: true }).click();
await page.getByRole('combobox').filter({ hasText: 'Choose a role' }).first().click();
await page.getByRole('option').first().click();
await page.waitForTimeout(2500);
await page.getByRole('button', { name: 'More', exact: true }).click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/4c-assignment-role.png` });
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
