/**
 * Page-load budget on the LOCAL web app (CLAUDE.md §15: ≤ 8 API requests in the first second).
 *   node page-load-check.ts <email> [taskId] [--json out.json]
 *
 * Each page is visited twice (the first visit lets `next dev` compile it); the second is measured:
 * API requests within 1 s of the FIRST API request, the total until the network has been quiet for
 * 2 s (cap 12 s), and duplicates (the same method + URL more than once in that window).
 */
import fs from 'node:fs';
import { chromium, type Page } from 'playwright';
import { WEB_URL } from './config.ts';

const args = process.argv.slice(2);
const email = args[0] ?? 'client@example.com';
const taskId = args[1] && !args[1].startsWith('--') ? args[1] : undefined;
const jsonAt = args.indexOf('--json');
const jsonOut = jsonAt > 0 ? args[jsonAt + 1] : undefined;
const only = process.env.ONLY?.split(',');

const PAGES: [string, string][] = [
  ['dashboard', '/dashboard'],
  ['tasks', '/tasks'],
  ...(taskId ? ([['task detail', `/tasks/${taskId}`]] as [string, string][]) : []),
  ['approvals', '/approvals'],
  ['attendance', '/attendance'],
  ['calendar', '/calendar'],
  ['members', '/members'],
  ['workspaces', '/locations'],
  ['invoices', '/invoices'],
  ['clients', '/clients'],
  ['team', '/team'],
  ['messages', '/messages'],
  ['settings', '/settings'],
];

const isApi = (url: string) => url.includes('/api/v1/');

async function measure(page: Page, path: string) {
  const seen: { at: number; key: string }[] = [];
  const onReq = (r: { url(): string; method(): string }) => {
    if (isApi(r.url())) seen.push({ at: Date.now(), key: `${r.method()} ${r.url().replace(/^https?:\/\/[^/]+/, '')}` });
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
  const first = seen[0]?.at ?? start;
  const counts = new Map<string, number>();
  for (const s of seen) counts.set(s.key, (counts.get(s.key) ?? 0) + 1);
  const dupes = [...counts].filter(([, n]) => n > 1).map(([k, n]) => `${n}× ${k}`);
  return {
    firstSecond: seen.filter((s) => s.at - first <= 1000).length,
    total: seen.length,
    dupes,
    urls: seen.map((s) => s.key),
  };
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'en-GB' });
page.setDefaultNavigationTimeout(240_000);
page.setDefaultTimeout(120_000);

await page.goto(`${WEB_URL}/login`, { waitUntil: 'domcontentloaded' });
await page.locator('#login-email').waitFor({ state: 'visible' });
await page.fill('#login-email', email);
await page.fill('#login-password', 'password123');
await page.click('form button[type="submit"]');
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60_000 });

const results: Record<string, Awaited<ReturnType<typeof measure>>> = {};
for (const [name, path] of PAGES) {
  if (only && !only.includes(name)) continue;
  let r: Awaited<ReturnType<typeof measure>>;
  try {
    await measure(page, path); // warm: next dev compiles the route
    r = await measure(page, path);
  } catch (e) {
    console.log(`${name.padEnd(12)} FAILED ${(e as Error).message.split('\n')[0]}`);
    continue;
  }
  results[name] = r;
  console.log(
    `${name.padEnd(12)} first-1s ${String(r.firstSecond).padStart(2)}  total ${String(r.total).padStart(2)}  dupes ${r.dupes.length}${r.dupes.length ? '  ' + r.dupes.join(' | ') : ''}`,
  );
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ email, results }, null, 2));
await browser.close();
