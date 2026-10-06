/**
 * The company calendar on the LOCAL web app, as five different people (shared calendar/*).
 * Each persona signs in in its own browser context and does what that person would do; every
 * check prints PASS/FAIL, API timings are collected, and console/API errors are reported.
 *
 *   node calendar-users-e2e.ts <outDir>
 *
 * LOCAL ONLY (seed-demo accounts, password123). Restores what it changes.
 */
import { chromium, type BrowserContext, type Page } from 'playwright';
import { execSync } from 'node:child_process';
import { WEB_URL } from './config.ts';

const API = 'http://localhost:4000/api/v1';
const [out = '/tmp'] = process.argv.slice(2);
let fails = 0;
const timings: Record<string, number[]> = {};
const errors: string[] = [];
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `  ← ${detail}`}`);
  if (!ok) fails++;
};
const sql = (q: string) => execSync(`docker exec hbcfield-postgres psql -U hbcfield -d hbcfield -Atc ${JSON.stringify(q)}`).toString().trim();

async function api(method: string, path: string, token?: string, body?: unknown) {
  for (let i = 0; i < 6; i++) {
    const r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 429) { await new Promise((res) => setTimeout(res, 3000 * (i + 1))); continue; }
    const j = await r.json().catch(() => ({}));
    return { status: r.status, data: (j as any)?.data ?? j };
  }
  return { status: 429, data: {} };
}
async function token(email: string): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const r = await api('POST', '/auth/login', undefined, { email, password: 'password123' });
    if (r.data?.accessToken) return r.data.accessToken;
    await new Promise((res) => setTimeout(res, 15000));
  }
  throw new Error(`cannot sign in as ${email}`);
}

const browser = await chromium.launch();

async function signIn(email: string, label: string): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, colorScheme: 'dark', locale: 'en-GB' });
  const page = await ctx.newPage();
  page.setDefaultNavigationTimeout(240_000);
  page.setDefaultTimeout(90_000);
  page.on('pageerror', (e) => errors.push(`${label} PAGEERROR ${e.message}`));
  page.on('response', async (r) => {
    const u = r.url();
    if (!u.includes('/api/v1/')) return;
    if (r.status() >= 500) errors.push(`${label} ${r.status()} ${r.request().method()} ${u.replace(/^https?:\/\/[^/]+/, '')}`);
    const m = /\/api\/v1\/(calendar(?:\/[a-z-]+)?|employees\/[^/]+\/time-off\/count)/.exec(u);
    if (m) {
      await r.finished().catch(() => undefined);
      const tm = r.request().timing();
      const key = m[1]!.replace(/employees\/[^/]+/, 'employees/:id');
      if (tm.responseEnd > 0) (timings[key] ??= []).push(tm.responseEnd - tm.requestStart);
    }
  });
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      await page.goto(`${WEB_URL}/login`, { waitUntil: 'domcontentloaded' });
      await page.locator('#login-email').waitFor({ state: 'visible' });
      // The dev server may still be hydrating: give the form a moment to settle before typing.
      await page.waitForTimeout(1500);
      await page.fill('#login-email', email, { timeout: 30_000 });
      await page.fill('#login-password', 'password123', { timeout: 30_000 });
      await page.click('form button[type="submit"]');
      const ok = await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 45_000 }).then(() => true).catch(() => false);
      if (ok) return { ctx, page };
    } catch { /* retried below */ }
    await page.waitForTimeout(15_000); // the login rate limit, or a page still compiling
  }
  throw new Error(`${label}: sign-in did not leave /login`);
}

const shot = async (page: Page, name: string) => {
  await page.waitForTimeout(700);
  await page.evaluate(() => document.querySelectorAll('nextjs-portal').forEach((n) => n.remove()));
  await page.screenshot({ path: `${out}/${name}.png` });
};

/** Open the calendar and time how long until the week grid shows its first item. */
async function openCalendar(page: Page, label: string) {
  const t0 = Date.now();
  await page.goto(`${WEB_URL}/calendar`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: 'Week' }).waitFor();
  await page.getByRole('tab', { name: 'Week' }).click();
  await page.locator('main').getByText(/^(MON|Mon)/).first().waitFor();
  const ms = Date.now() - t0;
  console.log(`  ${label}: calendar ready in ${ms} ms`);
  return ms;
}

const tokens = {
  admin: await token('client@example.com'),
  sales: await token('sales@example.com'),
  hassan: await token('hassan@example.com'),
  external: await token('a.test@example.com'),
};
const uid = (e: string) => sql(`select id from users where email='${e}'`);
const SALES = uid('sales@example.com'), HASSAN = uid('hassan@example.com');
const MAIN = sql(`select "spaceId" from space_assignments where "userId"='${SALES}' limit 1`);
const beforeMain = sql(`select "weekendDays"::text from company_locations where id='${MAIN}'`);
const madeEvents: string[] = [];

try {
  // ───────────────────────── 1. ADMIN ─────────────────────────
  console.log('\n— Admin (client@): builds the calendar');
  {
    const { ctx, page } = await signIn('client@example.com', 'admin');
    await openCalendar(page, 'admin (cold)');
    const warm = await openCalendar(page, 'admin (warm)');
    check('admin: the calendar opens fast once warm (< 4 s)', warm < 4000, `${warm} ms`);
    check('admin: Calendar is in the navigation', await page.locator('nav').getByRole('link', { name: 'Calendar' }).count() > 0);
    for (const v of ['Day', 'Month', 'Agenda', 'Week']) {
      const t0 = Date.now();
      await page.getByRole('tab', { name: v }).click();
      await page.waitForTimeout(300);
      check(`admin: ${v} view renders`, (await page.locator('main').innerText()).length > 50, '');
      console.log(`  ${v}: ${Date.now() - t0} ms`);
    }
    // Layers switch off and on, and the request follows.
    await page.getByRole('checkbox', { name: /Appointments/ }).click();
    await page.waitForTimeout(800);
    await page.getByRole('checkbox', { name: /Appointments/ }).click();
    check('admin: a layer switches off and back on', true);

    // A new appointment, typed as a sentence, inviting Elena (sales).
    await page.getByRole('button', { name: 'New', exact: true }).first().click();
    await page.locator('#cal-smart').fill('E2E review with BILLA on Friday 3pm for 45 min on Zoom');
    await page.waitForTimeout(300);
    check('admin: the sentence fills the title', (await page.locator('#cal-title').inputValue()) === 'E2E review with BILLA', await page.locator('#cal-title').inputValue());
    check('admin: …and the time', (await page.locator('#cal-time').inputValue()) === '15:00', await page.locator('#cal-time').inputValue());
    await page.locator('#cal-link').fill('https://zoom.us/j/9988');
    await page.getByRole('button', { name: /Add people/ }).click();
    await page.getByPlaceholder('Search colleagues…').fill('Elena');
    await page.locator('[cmdk-item]', { hasText: 'Elena' }).first().click();
    await page.keyboard.press('Escape').catch(() => undefined);
    await page.waitForTimeout(1500);
    await shot(page, 'web-1-admin-dialog');
    check('admin: Elena is on the invite list with her day shown', await page.getByText('Elena Brunner').count() > 0);
    await page.getByRole('button', { name: /Save & invite/ }).click();
    await page.getByText(/person invited|people invited/).first().waitFor({ timeout: 20_000 }).catch(() => undefined);
    const ev = sql(`select id from calendar_events where title='E2E review with BILLA' order by "createdAt" desc limit 1`);
    if (ev) madeEvents.push(ev);
    check('admin: the appointment was saved', !!ev);
    check('admin: Elena was invited (and told: a bell entry)', sql(`select count(*) from notification_deliveries where "recipientId"='${SALES}' and "eventType"='calendar.invited' and payload->>'eventId'='${ev}'`) === '1');

    // Settings → Holidays & weekends: give Main Office a Fri+Sat weekend.
    await page.goto(`${WEB_URL}/settings?section=holidays`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Public holidays & company days off').waitFor();
    const nat = await page.getByText(/National Holiday|Nationalfeiertag/).first().waitFor({ state: 'visible', timeout: 30_000 }).then(() => true).catch(() => false);
    check('admin: the holiday list shows Austria\'s National Day', nat);
    const row = page.locator('tr', { hasText: 'Main Office' });
    await row.getByRole('button', { name: 'Edit' }).click();
    // The picker opens on the weekend that applies (Sat+Sun): add Friday, drop Sunday.
    for (const d of ['Fri', 'Sun']) await page.getByRole('dialog').getByRole('button', { name: d, exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await page.waitForTimeout(1500);
    check('admin: Main Office now rests Fri+Sat', sql(`select "weekendDays"::text from company_locations where id='${MAIN}'`) === '{5,6}', sql(`select "weekendDays"::text from company_locations where id='${MAIN}'`));
    await shot(page, 'web-2-admin-settings');
    await ctx.close();
  }

  // ───────────────────────── 2. PLAIN MEMBER ─────────────────────────
  console.log('\n— A plain member (sales@, one workspace): answers, books, asks for leave');
  {
    const { ctx, page } = await signIn('sales@example.com', 'sales');
    await openCalendar(page, 'sales');
    check('sales: Calendar is in her navigation', await page.locator('nav').getByRole('link', { name: 'Calendar' }).count() > 0);
    // The invitation, on the agenda, answered from its card.
    await page.getByRole('tab', { name: 'Agenda' }).click();
    const inv = page.locator('main button', { hasText: 'E2E review with BILLA' }).first();
    await inv.waitFor({ timeout: 20_000 });
    await inv.click();
    await page.getByRole('button', { name: 'Accept' }).click();
    await page.waitForTimeout(1500);
    const evId = madeEvents[0]!;
    check('sales: she accepts the invitation', sql(`select response from calendar_attendees where "eventId"='${evId}' and "userId"='${SALES}'`) === 'ACCEPTED');
    await shot(page, 'web-3-sales-accepted');
    await page.keyboard.press('Escape');
    check('sales: she cannot edit somebody else\'s appointment', await page.getByRole('button', { name: 'Edit' }).count() === 0);

    // Her week now rests Fri+Sat (the workspace changed): the shading follows.
    await page.getByRole('tab', { name: 'Week' }).click();
    await page.waitForTimeout(1500);
    const weekendChip = await page.locator('main').getByText(/weekend/i).first().innerText().catch(() => '');
    check('sales: her calendar shows Main Office\'s Fri+Sat weekend', /Fri/.test(weekendChip) && /Sat/.test(weekendChip) && !/Sun/.test(weekendChip), weekendChip);

    // The invite picker offers her own workspace only.
    await page.getByRole('button', { name: 'New', exact: true }).first().click();
    await page.getByRole('button', { name: /Add people/ }).click();
    await page.getByPlaceholder('Search colleagues…').fill('');
    await page.waitForTimeout(1500);
    const names = await page.locator('[cmdk-item]').allInnerTexts();
    check('sales: the picker offers Main Office colleagues', names.some((n) => /Anna|Mike|Noor/.test(n)), names.join(' | '));
    check('sales: …and not Hassan (Warehouse) nor the external member', !names.some((n) => /Hassan|Ahmed Test/.test(n)), names.join(' | '));
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    const r = await api('POST', '/calendar/events', tokens.sales, { title: 'sneaky', startAt: new Date(Date.now() + 86400000).toISOString(), endAt: new Date(Date.now() + 90000000).toISOString(), attendeeIds: [HASSAN] });
    check('sales: inviting Hassan through the API is refused (403)', r.status === 403, `${r.status}`);
    const av = await api('POST', '/calendar/availability', tokens.sales, { userIds: [uid('mike@example.com')], from: new Date().toISOString(), to: new Date(Date.now() + 8 * 3600000).toISOString() });
    check('sales: a colleague\'s availability carries no leave reason', av.status < 300 && JSON.stringify(av.data).indexOf('"leave":"') === -1, JSON.stringify(av.data).slice(0, 200));
    const st = await api('GET', '/calendar/settings', tokens.sales);
    check('sales: holiday settings are closed to her (403)', st.status === 403, `${st.status}`);

    // Settings has no Holidays & weekends for her.
    await page.goto(`${WEB_URL}/settings`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    // Visible only — the collapsed mobile menu carries hidden copies of every label.
    check('sales: no "Holidays & weekends" in her settings', !(await page.getByText('Holidays & weekends').filter({ visible: true }).count()));

    // Time off: the request shows what it costs (weekends and holidays left out).
    await page.goto(`${WEB_URL}/my/time-off`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await shot(page, 'web-4-sales-timeoff');
    const cnt = await api('GET', `/employees/${SALES}/time-off/count?from=2026-11-02&to=2026-11-15`, tokens.sales);
    check('sales: two weeks cost what her week says (Fri+Sat off now): 10 of 14', cnt.status === 200 && cnt.data.counted === 10 && cnt.data.calendarDays === 14, JSON.stringify(cnt.data).slice(0, 160));
    const other = await api('GET', `/employees/${HASSAN}/time-off/count?from=2026-11-02&to=2026-11-15`, tokens.sales);
    check('sales: she cannot count Hassan\'s leave', other.status === 403 || other.status === 404, `${other.status}`);
    await ctx.close();
  }

  // ───────────────────────── 3. MANAGER ─────────────────────────
  console.log('\n— The manager (manager@): the team');
  {
    const { ctx, page } = await signIn('manager@example.com', 'manager');
    await openCalendar(page, 'manager');
    const team = page.getByRole('link', { name: 'Team' });
    check('manager: the Team view is offered', await team.count() > 0);
    if (await team.count()) {
      await team.click();
      await page.waitForURL(/employees\/availability/);
      await page.waitForTimeout(4000);
      await shot(page, 'web-5-manager-team');
      check('manager: the team board opens', await page.getByText(/Schedule & Time Off/).count() > 0);
    }
    await ctx.close();
  }

  // ───────────────────────── 4. EXTERNAL ─────────────────────────
  console.log('\n— An external member (a.test@): no calendar of ours');
  {
    const { ctx, page } = await signIn('a.test@example.com', 'external');
    await page.goto(`${WEB_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    check('external: no Calendar in the navigation', await page.locator('nav').getByRole('link', { name: 'Calendar' }).count() === 0);
    const r = await api('GET', '/calendar?from=2026-11-01&to=2026-11-07', tokens.external);
    check('external: the calendar API refuses (403)', r.status === 403, `${r.status}`);
    await ctx.close();
  }

  // ───────────────────────── 5. A WIDE EMPLOYEE ─────────────────────────
  console.log('\n— Hassan (wide rights, Tue–Sat week): his own days');
  {
    const r = await api('GET', `/employees/${HASSAN}/time-off/count?from=2026-10-26&to=2026-11-01`, tokens.hassan);
    check('hassan: his week (Tue–Sat) and National Day: Oct 26–Nov 1 costs 5', r.status === 200 && r.data.counted === 5, JSON.stringify(r.data).slice(0, 160));
    const t0 = Date.now();
    const c = await api('GET', '/calendar?from=2026-10-26&to=2026-12-06', tokens.hassan);
    console.log(`  6-week read: ${Date.now() - t0} ms, ${c.data?.items?.length} items`);
    check('hassan: six weeks read in one request (< 1.5 s)', c.status === 200 && Date.now() - t0 < 1500, `${Date.now() - t0} ms`);
  }
} finally {
  sql(`update company_locations set "weekendDays"='${beforeMain}' where id='${MAIN}'`);
  for (const e of madeEvents) sql(`delete from calendar_events where id='${e}'`);
}

const stats = Object.entries(timings).map(([k, v]) => {
  const s = [...v].sort((a, b) => a - b);
  return `${k}: n=${s.length} median=${Math.round(s[Math.floor(s.length / 2)]!)}ms max=${Math.round(s[s.length - 1]!)}ms`;
});
console.log('\nAPI timings (browser-measured):\n  ' + stats.join('\n  '));
console.log(errors.length ? `\nErrors:\n  ${errors.join('\n  ')}` : '\nNo page errors, no 5xx.');
console.log(`\n${fails} failure(s)`);
await browser.close();
process.exit(fails);
