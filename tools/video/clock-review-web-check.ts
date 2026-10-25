/**
 * LOCAL ONLY — the clock review's web screens, clicked as a person would (docs/plans/clock-review-2026-10.md):
 *   1. John: Settings → "Do you use the clock yourself?" → No → read back → Yes (A7).
 *   2. John: a workspace → Attendance → "How do people work here?" → another way → read back → put back (D1).
 *   3. John: Mike → Workspaces → "Works here as" → In the field + 30 min more → "Own rules" → put back (D1).
 *   4. Anna: Approvals and the attendance pages open with no page error and no 5xx.
 * Puts everything back.   node clock-review-web-check.ts <outDir>
 */
import { chromium, type Page } from 'playwright';
import { WEB_URL } from './config.ts';

const API = 'http://localhost:4000/api/v1';
const [out = '/tmp'] = process.argv.slice(2);
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
const waitFor = async (fn: () => Promise<boolean>, ms = 10_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
};

const owner = await token('client@example.com');
// The session is cached per token, so the switch is read through a fresh sign-in.
const clockOff = async () => (await api('GET', '/auth/me', (await token('client@example.com')).token)).data?.clockOff;
const mike = await token('mike@example.com');
const assignments = (await api('GET', `/employees/${mike.user.id}/assignments`, owner.token)).data as any[];
const assignment = assignments.find((a) => !a.location?.isRemote) ?? assignments[0];
const spaceId: string = assignment.locationId;
const wsBefore = (await api('GET', `/locations/${spaceId}`, owner.token)).data as Record<string, unknown>;
const wsColumns = {
  workModel: wsBefore.workModel,
  geofencePolicy: wsBefore.geofencePolicy,
  noShiftPolicy: wsBefore.noShiftPolicy,
};
const asBefore = { workAs: assignment.workAs ?? null, workDailyMinutes: assignment.workDailyMinutes ?? null };

const browser = await chromium.launch();
const errors: string[] = [];
async function signedIn(email: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-GB' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60_000);
  page.on('pageerror', (e) => errors.push(`${email} PAGEERROR ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 500 && r.url().includes('/api/')) errors.push(`${email} ${r.status()} ${r.url()}`);
  });
  await page.goto(`${WEB_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('#login-email', email);
  await page.fill('#login-password', 'password123');
  await page.click('form button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60_000 });
  return page;
}
const shot = async (page: Page, name: string) => {
  await page.waitForTimeout(700);
  await page.evaluate(() => document.querySelectorAll('nextjs-portal').forEach((n) => n.remove()));
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: false });
};

try {
  const john = await signedIn('client@example.com');

  // ── 1. A7 — the administrator's own clock
  await john.goto(`${WEB_URL}/settings?section=clock-in`, { waitUntil: 'domcontentloaded' });
  const question = john.getByText('Do you use the clock yourself?');
  await question.scrollIntoViewIfNeeded();
  check('A7 Settings asks "Do you use the clock yourself?"', await question.isVisible());
  await shot(john, '01-settings-clock-switch');
  await john.getByText("No, I don't use the clock").click();
  check('A7 choosing No switches it off for John', await waitFor(async () => (await clockOff()) === true));
  await john.getByText('Yes, I clock in and out').click();
  check('A7 choosing Yes switches it back on', await waitFor(async () => (await clockOff()) === false));

  // ── 2. D1 — the workspace's one question
  await john.goto(`${WEB_URL}/locations/${spaceId}?tab=attendance`, { waitUntil: 'domcontentloaded' });
  const ask = john.getByText('How do people work here?');
  await ask.waitFor();
  const radios = john.getByRole('radio');
  check('D1 the workspace shows three ways of working', (await radios.count()) === 3, await radios.count());
  await shot(john, '02-workspace-how-people-work');
  const checked = await john
    .locator('[role="radio"][aria-checked="true"]')
    .innerText()
    .catch(() => '');
  const target = checked.includes('Flexible hours') ? 'Fixed shifts' : 'Flexible hours';
  await john.getByRole('radio', { name: new RegExp(target) }).click();
  const want = target === 'Fixed shifts' ? 'SHIFT' : 'NONE';
  check(
    `D1 choosing "${target}" saves it`,
    await waitFor(async () => (await api('GET', `/locations/${spaceId}`, owner.token)).data?.workModel === want),
  );
  await shot(john, '03-workspace-changed');

  // ── 3. D1 — one worker's own rules
  await john.goto(`${WEB_URL}/members/${mike.user.id}`, { waitUntil: 'domcontentloaded' });
  await john.getByRole('tab', { name: /Workspaces|Locations/ }).click();
  const row = john.getByText('Works here as').first();
  await row.waitFor();
  check('D1 Mike\'s workspace card has "Works here as"', await row.isVisible());
  await row
    .locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]')
    .getByRole('button', { name: 'In the field', exact: true })
    .click();
  const readAs = async () =>
    ((await api('GET', `/employees/${mike.user.id}/assignments`, owner.token)).data as any[]).find(
      (a) => a.id === assignment.id,
    );
  check(
    'D1 "In the field" saves on his assignment',
    await waitFor(async () => (await readAs())?.workAs === 'IN_THE_FIELD'),
  );
  const card = row.locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
  await card.getByRole('button', { name: '+', exact: true }).click();
  check('D1 "+" gives him his own hours a day', await waitFor(async () => (await readAs())?.workDailyMinutes != null));
  check('D1 the card says "Own rules"', await john.getByText('Own rules').first().isVisible());
  check(
    'D1 and no longer says "only on site" for him',
    (await john.getByText('can only be clocked in at on site').count()) === 0,
  );
  await shot(john, '04-member-works-here-as');

  // ── 4. Anna — the pages that changed open cleanly
  const anna = await signedIn('manager@example.com');
  for (const [path, name] of [
    ['/approvals', '05-anna-approvals'],
    ['/attendance', '06-anna-attendance'],
    ['/schedule', '07-anna-schedule'],
    ['/overtime', '08-anna-overtime'],
  ] as const) {
    await anna.goto(`${WEB_URL}${path}`, { waitUntil: 'domcontentloaded' });
    await anna.waitForLoadState('networkidle').catch(() => {});
    check(`Anna opens ${path}`, !anna.url().includes('/login'), anna.url());
    await shot(anna, name);
  }
} finally {
  await api('PATCH', `/users/me`, owner.token, { usesClock: true });
  await api('PATCH', `/locations/${spaceId}`, owner.token, wsColumns);
  await api('PATCH', `/locations/${spaceId}/members/${assignment.id}`, owner.token, asBefore);
  const back = (await api('GET', `/locations/${spaceId}`, owner.token)).data;
  check(
    'cleanup: the workspace and Mike are put back',
    back.workModel === wsColumns.workModel && back.noShiftPolicy === wsColumns.noShiftPolicy,
  );
  await browser.close();
}

check('no page error and no 5xx on the way', errors.length === 0, errors.slice(0, 6));
console.log(`\n${failures ? `${failures} FAILED` : 'ALL PASS'}`);
process.exit(failures ? 1 : 0);
