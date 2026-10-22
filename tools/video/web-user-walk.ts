/**
 * Walk the LOCAL web app as a real user, one role at a time, and say what a person would hit.
 *   node web-user-walk.ts <outDir> [baseUrl=http://localhost:3001]
 *
 * For every screen: the page loaded (no Next error page), no uncaught error in the browser, no API
 * call answered 5xx (and which 4xx), no raw translation key on screen ("tasks.menu.delete"), how
 * many API requests the first second asked for (the web's budget is 8), and how long until the
 * page went quiet. Screenshots go to <outDir>. Read-only: it opens screens, it changes nothing.
 */
import { chromium, type Page } from 'playwright';
import { writeFileSync } from 'node:fs';

const [out = '/tmp/web-user-walk', BASE = 'http://localhost:3001'] = process.argv.slice(2);
const API = 'http://localhost:4000/api/v1';

const ROLES: Record<string, { email: string; routes: string[] }> = {
  admin: {
    email: 'client@example.com',
    routes: [
      '/dashboard',
      '/tasks',
      '/tasks/:task',
      '/tasks/:task/report',
      '/approvals',
      '/attendance',
      '/schedule',
      '/members',
      '/members/:member',
      '/locations',
      '/locations/:space',
      '/clients',
      '/portals',
      '/assets',
      '/invoices',
      '/invoices/new',
      '/documents/all',
      '/calendar',
      '/reports',
      '/overtime',
      '/issues',
      '/invitations',
      '/messages',
      '/team',
      '/settings',
      '/settings/billing',
      '/my/attendance',
      '/my/time-off',
      '/my/documents',
    ],
  },
  manager: {
    email: 'manager@example.com',
    routes: [
      '/dashboard',
      '/tasks',
      '/tasks/:task',
      '/approvals',
      '/attendance',
      '/schedule',
      '/members',
      '/locations',
      '/clients',
      '/calendar',
      '/messages',
      '/settings',
      '/invoices',
      '/settings/billing',
    ],
  },
  employee: {
    email: 'mike@example.com',
    routes: ['/dashboard', '/tasks', '/my/attendance', '/my/time-off', '/invoices', '/members'],
  },
};

// Real ids for the detail routes, asked of the API as the admin (one sign-in).
async function ids(): Promise<Record<string, string>> {
  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'client@example.com', password: 'password123' }),
  }).then((r) => r.json());
  const h = { Authorization: `Bearer ${login.data.accessToken}` };
  const first = async (p: string) => {
    const b = await fetch(`${API}${p}`, { headers: h }).then((r) => r.json());
    const d = b.data ?? b;
    return (Array.isArray(d) ? d : (d.data ?? d.items ?? []))[0]?.id ?? '';
  };
  return {
    task: await first('/tasks?limit=1'),
    member: await first('/organizations/members?limit=1'),
    space: await first('/locations?limit=1'),
  };
}

type Row = {
  role: string;
  route: string;
  status: string;
  ms: number;
  firstSecondApi: number;
  api: number;
  errors: string[];
  api4xx: string[];
  rawKeys: string[];
  firstSecond?: string[];
};
const rows: Row[] = [];
const RAW_KEY = /\b[a-z][a-zA-Z]+\.[a-z][a-zA-Z]+\.[a-zA-Z][a-zA-Z.]+\b/g;

async function walk(page: Page, role: string, route: string) {
  const errors: string[] = [];
  const api4xx: string[] = [];
  const stamps: number[] = [];
  const urls: string[] = [];
  const onErr = (e: Error) => errors.push(e.message.slice(0, 160));
  const onResp = (r: import('playwright').Response) => {
    if (!r.url().startsWith(API)) return;
    stamps.push(Date.now());
    urls.push(r.url().replace(API, ''));
    const s = r.status();
    const path = r.url().replace(API, '').split('?')[0];
    if (s >= 500) errors.push(`${s} ${r.request().method()} ${path}`);
    else if (s >= 400 && s !== 401) api4xx.push(`${s} ${path}`);
  };
  page.on('pageerror', onErr);
  page.on('response', onResp);
  const t0 = Date.now();
  let status = 'ok';
  try {
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {
      status = 'busy>20s';
    });
  } catch (e) {
    status = 'load-failed';
    errors.push(String(e).slice(0, 160));
  }
  const ms = Date.now() - t0;
  const text = await page
    .locator('body')
    .innerText()
    .catch(() => '');
  if (/Application error|Internal Server Error|This page could not be found/i.test(text)) status = 'error-page';
  const rawKeys = [
    ...new Set((text.match(RAW_KEY) ?? []).filter((k) => !/\.(com|de|at|io|png|jpg|pdf)\b/.test(k))),
  ].slice(0, 5);
  await page.screenshot({ path: `${out}/${role}${route.replace(/\//g, '_')}.png` }).catch(() => {});
  page.off('pageerror', onErr);
  page.off('response', onResp);
  rows.push({
    role,
    route,
    status,
    ms,
    firstSecondApi: stamps.filter((s) => s - t0 <= 1000).length,
    api: stamps.length,
    errors,
    api4xx: [...new Set(api4xx)],
    rawKeys,
    firstSecond: urls.filter((_, i) => stamps[i]! - t0 <= 1000),
  });
}

const real = await ids();
const browser = await chromium.launch();
for (const [role, { email, routes }] of Object.entries(ROLES)) {
  // A production build's CSP allows only https/wss connections — right on the live site, where the
  // API is same-origin https, but it blocks the local http API. The policy is checked on its own;
  // here the test browser is told to skip it so the screens can be walked against localhost.
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'en-GB', bypassCSP: true });
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('#login-email').waitFor({ state: 'visible' });
  await page.fill('#login-email', email);
  await page.fill('#login-password', 'password123');
  await page.click('form button[type="submit"]');
  const signedIn = await page
    .waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 })
    .then(
      () => true,
      () => false,
    );
  if (!signedIn) {
    const said =
      (await page.locator('body').innerText()).split('\n').find((l) => /mobile|app|not|access|denied/i.test(l)) ?? '';
    rows.push({
      role,
      route: '/login',
      status: `stays on login: ${said.slice(0, 90)}`,
      ms: 0,
      firstSecondApi: 0,
      api: 0,
      errors: [],
      api4xx: [],
      rawKeys: [],
    });
    await page.close();
    continue;
  }
  for (const r of routes)
    await walk(page, role, r.replace(':task', real.task).replace(':member', real.member).replace(':space', real.space));
  await page.close();
  await new Promise((r) => setTimeout(r, 15_000)); // the sign-in limit: 5 a minute per address
}
await browser.close();
writeFileSync(`${out}/report.json`, JSON.stringify(rows, null, 1));
for (const r of rows) {
  const flag = [
    r.status !== 'ok' && r.status,
    r.errors.length && `ERR ${r.errors.join(' | ')}`,
    r.rawKeys.length && `KEYS ${r.rawKeys.join(',')}`,
    r.firstSecondApi > 8 && `budget ${r.firstSecondApi}>8`,
  ]
    .filter(Boolean)
    .join('  ');
  console.log(
    `${r.role.padEnd(8)} ${r.route.slice(0, 44).padEnd(44)} ${String(r.ms).padStart(6)}ms  api ${String(r.firstSecondApi).padStart(2)}/1s ${String(r.api).padStart(3)} total` +
      `${r.api4xx.length ? '  4xx ' + r.api4xx.join(',') : ''}${flag ? '  ' + flag : ''}`,
  );
}
