/**
 * Today's chat and team screens on the LOCAL web app, photographed for the
 * chat/team mockup (docs/design/chat-team-ui). Signs out every session it opens.
 *   node chat-team-web-check.ts <outDir>
 */
import { chromium, type Page } from 'playwright';
import { WEB_URL } from './config.ts';

const [out] = process.argv.slice(2);
const API = (process.env.VIDEO_API_URL ?? 'http://localhost:4000') + '/api/v1';
const errors: string[] = [];
const browser = await chromium.launch();

async function session(email: string) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'light',
    locale: 'en-GB',
    timezoneId: 'Europe/Vienna',
  });
  const page = await ctx.newPage();
  let token = '';
  page.on('response', async (r) => {
    if (r.url().endsWith('/auth/login') && r.status() < 300) {
      try {
        token = (await r.json())?.data?.accessToken ?? (await r.json())?.accessToken ?? token;
      } catch {
        /* ignore */
      }
    }
    if (r.status() >= 400)
      errors.push(`${email} ${r.status()} ${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, '')}`);
  });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  await page.addInitScript(() => {
    const css = 'nextjs-portal{display:none!important}';
    document.addEventListener('DOMContentLoaded', () => {
      const s = document.createElement('style');
      s.textContent = css;
      document.head.appendChild(s);
    });
  });
  await page.goto(`${WEB_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('#login-email').waitFor();
  await page.fill('#login-email', email);
  await page.fill('#login-password', 'password123');
  await page.click('form button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
  const close = async () => {
    try {
      const res = await page.request.post(`${API}/auth/logout`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        data: {},
      });
      console.log(email, 'signed out', res.status());
    } catch (e) {
      console.log(email, 'sign-out failed', String(e));
    }
    await ctx.close();
  };
  return { page, close };
}

const shot = async (page: Page, name: string, sel?: string) => {
  await page.waitForTimeout(1500);
  if (sel)
    await page
      .locator(sel)
      .first()
      .screenshot({ path: `${out}/${name}.png` });
  else await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
};
const drawer = '[role="dialog"], aside:has-text("Messages"), [data-chat-drawer]';

// ── an administrator ──
{
  const { page, close } = await session('client@example.com');
  await page.waitForTimeout(3000);
  await shot(page, 'web-admin-dashboard');
  await page.goto(`${WEB_URL}/team`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await shot(page, 'web-team');
  await page.goto(`${WEB_URL}/members`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  await shot(page, 'web-members');
  const row = page.getByText('Anna Müller', { exact: true }).first();
  if (await row.count()) {
    await row.click();
    await page.waitForURL(/\/members\/[^/]+$/, { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(3500);
    await shot(page, 'web-member-profile');
  }
  // The chat drawer, opened the only way the web offers: Message on a person.
  await page.goto(`${WEB_URL}/team`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const msg = page
    .locator('div.rounded-xl, div.rounded-lg, div.rounded-2xl', { hasText: 'Hassan Berger' })
    .last()
    .locator('button')
    .first();
  if (await msg.count()) {
    await msg.click();
    await page.waitForTimeout(2500);
    await shot(page, 'web-chat-thread');
    const back = page
      .locator('button[aria-label*="ack" i], button:has(svg.lucide-arrow-left), button:has(svg.lucide-chevron-left)')
      .first();
    if (await back.count()) {
      await back.click();
      await page.waitForTimeout(1500);
      await shot(page, 'web-chat-list');
    }
  } else console.log('no Message button on /team');
  await close();
}

// ── an ordinary member ──
{
  const { page, close } = await session('mike@example.com');
  await page.waitForTimeout(3500);
  await shot(page, 'web-member-dashboard');
  const r = await page.goto(`${WEB_URL}/team`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await shot(page, 'web-member-team');
  console.log('member /team status', r?.status());
  await close();
}

console.log('errors:', errors.length ? errors.slice(0, 20) : 'none');
await browser.close();
