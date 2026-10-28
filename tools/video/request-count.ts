/**
 * How many API requests every signed-in web page sends — LOCAL web app (CLAUDE.md §15: ≤ 8 in the first second).
 *   node request-count.ts [--json out.json] [email ...]      (default: the admin, the manager and an employee)
 *
 * Every signed-in page of the app (record pages opened on a real record), visited twice per person — the first visit
 * lets `next dev` compile it, the second is measured with page-load-check's rules: requests within 1 s of the first,
 * the total until the network is quiet for 2 s, and the same request twice (a duplicate is always a bug).
 */
import fs from 'node:fs';
import { chromium, type Page } from 'playwright';
import { WEB_URL } from './config.ts';

const API = process.env.API ?? 'http://localhost:4000/api/v1';
const args = process.argv.slice(2);
const jsonAt = args.indexOf('--json');
const jsonOut = jsonAt >= 0 ? args[jsonAt + 1] : undefined;
const people = args.filter((a, i) => !a.startsWith('--') && i !== jsonAt + 1);
const EMAILS = people.length ? people : ['client@example.com', 'manager@example.com', 'mike@example.com'];
const BUDGET = 8;

async function api(token: string, path: string): Promise<any> {
  const r = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${token}` } });
  const b: any = await r.json().catch(() => null);
  return b?.data ?? b;
}
const first = (x: any) => (Array.isArray(x) ? x[0] : (x?.items ?? x?.data ?? [])[0])?.id as string | undefined;

/** One real record of each kind, read as the admin, so record pages open on something. */
async function recordIds() {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'client@example.com', password: 'password123' }),
  });
  const token = ((await r.json()) as any).data.accessToken as string;
  return {
    task: first(await api(token, '/tasks?limit=1')),
    asset: first(await api(token, '/assets?limit=1')),
    client: first(await api(token, '/customers?limit=1')),
    invoice: first(await api(token, '/invoices?limit=1')),
    workspace: first(await api(token, '/locations')),
    member: first(await api(token, '/organizations/members?limit=1')),
  };
}

function pages(ids: Awaited<ReturnType<typeof recordIds>>): [string, string][] {
  const fixed = [
    '/dashboard', '/tasks', '/tasks/recurring', '/approvals', '/attendance', '/my/attendance', '/my/time-off',
    '/schedule', '/overtime', '/calendar', '/members', '/members/new', '/members/leave-opening', '/members/phone-sync',
    '/team', '/invitations', '/locations', '/portals', '/clients', '/assets', '/invoices', '/invoices/new', '/messages',
    '/documents', '/documents/all', '/documents/compliance', '/documents/review', '/documents/templates',
    '/documents/types', '/my/documents', '/reports', '/reports/job-time', '/issues', '/manage', '/help', '/settings',
    '/settings/billing',
  ];
  const rec: [string, string | undefined][] = [
    ['/tasks/:id', ids.task && `/tasks/${ids.task}`],
    ['/tasks/:id/report', ids.task && `/tasks/${ids.task}/report`],
    ['/assets/:id', ids.asset && `/assets/${ids.asset}`],
    ['/clients/:id', ids.client && `/clients/${ids.client}`],
    ['/invoices/:id', ids.invoice && `/invoices/${ids.invoice}`],
    ['/locations/:id', ids.workspace && `/locations/${ids.workspace}`],
    ['/members/:id', ids.member && `/members/${ids.member}`],
  ];
  return [...fixed.map((p) => [p, p] as [string, string]), ...rec.filter((r): r is [string, string] => !!r[1])];
}

const isApi = (url: string) => url.includes('/api/v1/');

async function measure(page: Page, path: string) {
  const seen: { at: number; key: string }[] = [];
  const onReq = (r: { url(): string; method(): string }) => {
    if (isApi(r.url())) seen.push({ at: Date.now(), key: `${r.method()} ${r.url().replace(/^https?:\/\/[^/]+\/api\/v1/, '')}` });
  };
  page.on('request', onReq);
  const start = Date.now();
  await page.goto(`${WEB_URL}${path}`, { waitUntil: 'domcontentloaded' });
  let last = seen.length;
  let quietSince = Date.now();
  while (Date.now() - start < 12_000) {
    await page.waitForTimeout(250);
    if (seen.length !== last) {
      last = seen.length;
      quietSince = Date.now();
    } else if (Date.now() - quietSince > 2_000 && seen.length) break;
  }
  page.off('request', onReq);
  const t0 = seen[0]?.at ?? start;
  const counts = new Map<string, number>();
  for (const s of seen) counts.set(s.key, (counts.get(s.key) ?? 0) + 1);
  return {
    landed: new URL(page.url()).pathname,
    firstSecond: seen.filter((s) => s.at - t0 <= 1000).length,
    total: seen.length,
    dupes: [...counts].filter(([, n]) => n > 1).map(([k, n]) => `${n}× ${k}`),
    urls: seen.map((s) => s.key),
  };
}

const ids = await recordIds();
const browser = await chromium.launch();
const out: Record<string, Record<string, Awaited<ReturnType<typeof measure>>>> = {};
for (const email of EMAILS) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'en-GB' });
  page.setDefaultNavigationTimeout(240_000);
  await page.goto(`${WEB_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('#login-email').waitFor({ state: 'visible', timeout: 120_000 });
  await page.fill('#login-email', email);
  await page.fill('#login-password', 'password123');
  await page.click('form button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60_000 });
  out[email] = {};
  console.log(`\n── ${email}`);
  for (const [name, path] of pages(ids)) {
    try {
      await measure(page, path);
      const r = await measure(page, path);
      out[email][name] = r;
      const moved = r.landed !== path ? `  (→ ${r.landed})` : '';
      const flag = r.firstSecond > BUDGET || r.dupes.length ? ' ⚠' : '';
      console.log(
        `${name.padEnd(26)} 1s ${String(r.firstSecond).padStart(2)}  total ${String(r.total).padStart(2)}  dupes ${r.dupes.length}${flag}${moved}`,
      );
    } catch (e) {
      console.log(`${name.padEnd(26)} FAILED ${(e as Error).message.split('\n')[0]}`);
    }
  }
  await page.close();
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ ids, budget: BUDGET, results: out }, null, 2));
await browser.close();
