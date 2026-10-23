/**
 * LOCAL ONLY — the time-counting screens on the web, used as Anna (a leader) would
 * (docs/plans/time-counting-model.md, phases 2–3). Prepares a day over the API, then clicks:
 *   1. Approvals → "Time outside the shift" → Count it, 2 h of 3 h 15 m → it is counted, and gone.
 *   2. Schedule → Noor's day → Change hours for this day → Set hours → the mark → the drawer →
 *      Change hours → read back over the API.
 * Puts everything back.   node time-counting-web-e2e.ts <outDir> [light|dark]
 */
import { chromium, type Page } from 'playwright';
import { WEB_URL } from './config.ts';

const API = 'http://localhost:4000/api/v1';
const [out, scheme = 'light'] = process.argv.slice(2);
let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || detail === undefined ? '' : `  → ${JSON.stringify(detail)}`));
  if (!ok) failures++;
};

async function api(method: string, path: string, token?: string, body?: unknown) {
  const r = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await r.json().catch(() => ({}));
  return { status: r.status, data: (json as { data?: unknown }).data ?? json } as { status: number; data: any };
}
async function token(email: string) {
  for (let i = 0; i < 8; i++) {
    const r = await api('POST', '/auth/login', undefined, { email, password: 'password123' });
    if (r.data?.accessToken) return { token: r.data.accessToken as string, user: r.data.user as { id: string } };
    await new Promise((res) => setTimeout(res, 15_000));
  }
  throw new Error(`cannot sign in as ${email}`);
}

const owner = await token('client@example.com');
const noor = await token('noor@example.com');
const places = (await api('GET', '/attendance/clock-in-locations', noor.token)).data as Array<{
  id: string;
  name: string;
  timezone?: string;
}>;
const place = places.find((p) => p.name === 'Other site') ?? places[0]!;
const tz = place.timezone || 'Europe/Vienna';
const dayKey = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toLocaleDateString('en-CA', { timeZone: tz });
const label = (key: string) => {
  const d = new Date(`${key}T12:00:00Z`);
  return `${d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })} ${d.getUTCDate()} ${d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}`;
};
const made = { entries: [] as string[], requests: [] as string[] };

const browser = await chromium.launch();
const page: Page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  colorScheme: scheme as 'light' | 'dark',
  locale: 'en-GB',
});
page.setDefaultTimeout(60_000);
const errors: string[] = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('response', (r) => {
  if (r.status() >= 500 && r.url().includes('/api/')) errors.push(`${r.status()} ${r.url()}`);
});
const shot = async (name: string) => {
  await page.waitForTimeout(900);
  await page.evaluate(() => document.querySelectorAll('nextjs-portal').forEach((n) => n.remove()));
  await page.screenshot({ path: `${out}/${name}.png` });
};

try {
  // ── prepare: Noor worked 06:30–17:45 two days ago, the plan that day is 08:00–16:00
  const past = dayKey(-2);
  await api('POST', '/attendance/entries/manual', owner.token, {
    userId: noor.user.id,
    locationId: place.id,
    startDate: past,
    endDate: past,
    startTime: '06:30',
    endTime: '17:45',
    reason: 'web e2e',
  });
  const histRes = await api('GET', '/attendance/history?limit=40', noor.token);
  if (!Array.isArray(histRes.data))
    throw new Error(`history: ${histRes.status} ${JSON.stringify(histRes.data).slice(0, 200)}`);
  const hist = histRes.data;
  const rows = (Array.isArray(hist) ? hist : hist.entries) as Array<{
    id: string;
    clockInAt: string;
    paidMinutes?: number;
  }>;
  const entry = rows.find((r) => new Date(r.clockInAt).toLocaleDateString('en-CA', { timeZone: tz }) === past);
  if (!entry) throw new Error('the prepared entry was not found');
  made.entries.push(entry.id);
  const plan = await api('PUT', `/employees/${noor.user.id}/day-hours`, owner.token, {
    date: past,
    spaceId: place.id,
    startTime: '08:00',
    endTime: '16:00',
  });
  if (plan.data?.id) made.requests.push(plan.data.id);

  // ── sign in as Anna
  await page.goto(`${WEB_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('#login-email', 'manager@example.com');
  await page.fill('#login-password', 'password123');
  await page.click('form button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60_000 });

  // ── 1. Approvals
  await page.goto(`${WEB_URL}/approvals?kind=outside&id=${encodeURIComponent(entry.id)}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.getByText('Time outside the shift', { exact: false }).first().waitFor();
  const body = await page.locator('body').innerText();
  check('Approvals opens the item: before 1h 30m, after 1h 45m', body.includes('1h 30m') && body.includes('1h 45m'));
  await shot('w1-outside-item');
  await page.getByRole('button', { name: 'Count it' }).first().click();
  const minutes = page.locator('#approval-minutes');
  await minutes.waitFor();
  check('the minutes box opens on all of it (195)', (await minutes.inputValue()) === '195', await minutes.inputValue());
  await minutes.fill('120');
  await shot('w2-count-120');
  await page.getByRole('button', { name: 'Count it' }).first().click();
  await page.waitForTimeout(2500);
  const after = (await api('GET', '/attendance/history?limit=40', noor.token)).data;
  const counted = ((Array.isArray(after) ? after : after.entries) as typeof rows).find((r) => r.id === entry.id);
  check('8 h planned + 2 h counted = 600 min on the timesheet', counted?.paidMinutes === 600, counted?.paidMinutes);
  const still = (await api('GET', '/attendance/outside/pending', owner.token)).data as Array<{ id: string }>;
  check('and it is gone from the list', !still.some((r) => r.id === entry.id));
  await shot('w3-after-count');

  // ── 2. Schedule
  const day = dayKey(2);
  await page.goto(`${WEB_URL}/schedule`, { waitUntil: 'domcontentloaded' });
  await page.getByText(place.name, { exact: true }).first().click();
  await page.waitForTimeout(1500);
  const cell = page.locator(`button[aria-label="Noor Shah, ${label(day)}: change hours"]`).first();
  await cell.waitFor();
  await cell.click();
  await page.locator('#day-hours-start').waitFor();
  await page.locator('#day-hours-start').fill('07:00');
  await page.locator('#day-hours-end').fill('16:00');
  await page.locator('#day-hours-reason').fill('web e2e: delivery');
  check('the form adds it up: 07:00 → 16:00 · 9h', (await page.getByText('9h', { exact: false }).count()) > 0);
  await shot('w4-form');
  await page.getByRole('button', { name: 'Set hours' }).click();
  await page
    .getByText(/Hours set for Noor/)
    .waitFor({ timeout: 15_000 })
    .catch(() => undefined);
  check('a toast says it was set, and Noor is told', (await page.getByText(/Hours set for Noor/).count()) > 0);
  const read = await api('GET', `/employees/${noor.user.id}/day-hours?date=${day}&spaceId=${place.id}`, owner.token);
  if (read.data?.changed?.id) made.requests.push(read.data.changed.id);
  check(
    'the server has 07:00–16:00, set by Anna',
    read.data?.changed?.startTime === '07:00' && read.data?.changed?.setBy === 'Anna Müller',
    read.data?.changed,
  );
  await shot('w5-marked');

  const dayShort = `${new Date(`${day}T12:00:00Z`).getUTCDate()} ${new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}`;
  const mark = page.locator(`button[title*="Noor Shah"][title*="${dayShort}"][title*="Approved"]`).first();
  if (await mark.count()) {
    await mark.click();
    await page
      .getByText(/Set by Anna Müller/)
      .waitFor({ timeout: 10_000 })
      .catch(() => undefined);
    check('the drawer says who set it', (await page.getByText(/Set by Anna Müller/).count()) > 0);
    await shot('w6-drawer');
    await page.getByRole('button', { name: 'Change hours' }).click();
    await page.locator('#day-hours-end').waitFor();
    await page.locator('#day-hours-end').fill('17:00');
    await page.getByRole('button', { name: 'Change hours' }).last().click();
    await page.waitForTimeout(2000);
    const again = await api('GET', `/employees/${noor.user.id}/day-hours?date=${day}&spaceId=${place.id}`, owner.token);
    check(
      'changed from the drawer: now ends 17:00, still one answer for the day',
      again.data?.changed?.endTime === '17:00' && again.data?.changed?.id === read.data?.changed?.id,
      again.data?.changed,
    );
  } else {
    check('the mark appears on the day', false, 'no mark found');
  }
  check('no page errors and no server errors', errors.length === 0, errors);
} catch (e) {
  check('the run completes', false, String(e));
  await shot('w-error').catch(() => undefined);
} finally {
  for (const id of made.entries) await api('DELETE', `/attendance/entries/${id}`, owner.token);
  for (const id of made.requests) await api('DELETE', `/employees/time-off/${id}/manage`, owner.token);
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
}
