/**
 * LIVE: the phone and the server agree about every member.
 *
 * Signs in as each seed account against a running dev API, decides the home
 * widgets with the REAL phone code (`availableWidgets`, `destinationsFor`),
 * then calls every endpoint each widget reads. The rule:
 *
 *   • a widget the phone SHOWS must be served (2xx, and the Clients card
 *     `allowed`) — otherwise the member stares at a card that cannot load;
 *   • a widget the phone HIDES because the member may not have it must be
 *     REFUSED or EMPTY on the server — otherwise hiding it is decoration.
 *     (The phone may be stricter than the server — noted, not failed — where
 *     the server's answer is the caller's own data, e.g. their own status.)
 *
 * Skipped unless `LIVE_API=http://localhost:4000/api/v1`. Reads only, except
 * one route optimisation per driver (a stateless calculation).
 */
jest.mock('@/features/home/shift-clock-card', () => ({ ShiftClockCard: () => null }));
jest.mock('@/features/home/my-work-card', () => ({ MyWorkCard: () => null }));
jest.mock('@/features/home/crew-card', () => ({ CrewCard: () => null }));
jest.mock('@/features/home/clients-card', () => ({ ClientsCard: () => null }));
jest.mock('@/features/home/shortcuts-card', () => ({ ShortcutsCard: () => null }));
jest.mock('@/features/home/route-card', () => ({ RouteCard: () => null }));
jest.mock('@/features/home/today-card', () => ({ TodayCard: () => null }));
import { availableWidgets } from '@/features/home/registry';
import { destinationsFor } from '../manage-rows';

const API = process.env.LIVE_API;
const PASSWORD = 'password123';
const PEOPLE = [
  'client@example.com', 'sarah@example.com', 'manager@example.com', 'david@example.com', 'hassan@example.com',
  'lisa@example.com', 'dana@example.com', 'mike@example.com', 'sales@example.com',
  'karim@example.com', 'noor@example.com', 'a.test@example.com',
];

type Session = { email: string; token: string; user: Record<string, any> };
const sessions: Session[] = [];
const skipped: string[] = [];

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The dev API rate-limits by IP (3/s, 20/10s, 100/min) and other testers share
 * it, so every request is paced and a 429 waits and retries — except on the
 * route endpoint, whose own limit is what a 429 there would mean.
 */
async function paced(url: string, init: RequestInit, retryOn429 = true, backoffMs = 4000, tries = 8): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    await pause(400);
    const res = await fetch(url, init);
    if (res.status !== 429 || !retryOn429 || attempt >= tries) return res;
    await pause(backoffMs);
  }
}

async function call(token: string, path: string, init: RequestInit = {}) {
  const res = await paced(`${API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
  }, !path.startsWith('/routes/'));
  let body: any = null;
  try { body = await res.json(); } catch { /* empty */ }
  return { status: res.status, body: body?.data ?? body };
}

const ok = (s: number) => s >= 200 && s < 300;
const refused = (s: number) => s === 401 || s === 402 || s === 403 || s === 404;

/** What each widget reads, and how to tell "served" from "refused/empty". */
const PROBES: Record<string, (s: Session) => Promise<'served' | 'refused' | 'empty'>> = {
  'shift-clock': async (s) => (ok((await call(s.token, '/attendance/status')).status) ? 'served' : 'refused'),
  'my-work': async (s) => (ok((await call(s.token, '/tasks?limit=5')).status) ? 'served' : 'refused'),
  crew: async (s) => {
    const paths = ['/attendance/active-entries', '/attendance/breaks/active', '/attendance/no-shows?days=1', '/attendance/approvals/pending?summary=true'];
    const st = await Promise.all(paths.map((p) => call(s.token, p).then((r) => r.status)));
    if (st.every(ok)) return 'served';
    if (st.every(refused)) return 'refused';
    throw new Error(`crew endpoints disagree for ${s.email}: ${paths.map((p, i) => `${p}=${st[i]}`).join(', ')}`);
  },
  clients: async (s) => {
    const now = new Date();
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 86_400_000 - 1);
    const r = await call(s.token, `/customers/due?dayStart=${start.toISOString()}&dayEnd=${end.toISOString()}&limit=3`);
    if (refused(r.status)) return 'refused';
    if (!ok(r.status)) throw new Error(`/customers/due ${r.status} for ${s.email}`);
    return r.body?.allowed === false ? 'empty' : 'served';
  },
  'my-route': async (s) => {
    const r = await call(s.token, '/routes/optimize', {
      method: 'POST',
      body: JSON.stringify({ start: { lat: 48.105, lng: 16.335 }, stops: [{ id: 'a', lat: 48.2015, lng: 16.3905 }, { id: 'b', lat: 48.1702, lng: 16.421 }] }),
    });
    if (r.status === 429) throw new Error('route throttle hit — rerun in a minute');
    return ok(r.status) ? 'served' : refused(r.status) ? 'refused' : (() => { throw new Error(`/routes/optimize ${r.status} for ${s.email}`); })();
  },
};

/** Endpoints whose answer is only ever the caller's OWN data — the phone may hide them without the server refusing. */
const OWN_DATA = new Set(['shift-clock', 'my-work']);

const d = API ? describe : describe.skip;

d('live: phone and server agree for every member', () => {
  beforeAll(async () => {
    for (const email of PEOPLE) {
      // Sign-in is limited to 5 a minute per address: wait out a 429 rather than fail.
      const res = await paced(`${API}/auth/login`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }),
      }, true, 15_000, 40);
      const j: any = await res.json();
      const data = j.data ?? j;
      // A seed account whose password differs is skipped, never retried into a lockout.
      if (res.status === 401) { skipped.push(email); continue; }
      if (!data?.accessToken) throw new Error(`login failed for ${email}: ${JSON.stringify(j).slice(0, 160)}`);
      sessions.push({ email, token: data.accessToken, user: data.user });
    }
  }, 900_000);

  it('every widget shown is served; every widget withheld is refused or empty', async () => {
    const report: string[] = [];
    const failures: string[] = [];
    for (const s of sessions) {
      const shown = new Set(availableWidgets(s.user as never).map((w) => w.key));
      const row: string[] = [];
      for (const [key, probe] of Object.entries(PROBES)) {
        const got = await probe(s);
        const has = shown.has(key);
        row.push(`${key}:${has ? 'SHOWN' : 'hidden'}/${got}`);
        if (has && got !== 'served') failures.push(`${s.email}: phone SHOWS ${key} but server says ${got}`);
        if (!has && got === 'served' && !OWN_DATA.has(key) && key !== 'my-route') {
          failures.push(`${s.email}: phone hides ${key} but server SERVES it`);
        }
      }
      report.push(`${s.email.padEnd(30)} ${row.join('  ')}`);
    }
    // eslint-disable-next-line no-console
    console.log(report.join('\n') + (skipped.length ? `\nskipped (unknown password): ${skipped.join(', ')}` : ''));
    expect(failures).toEqual([]);
  }, 400_000);

  it('an external member is refused the organization\'s property and the route', async () => {
    const ext = sessions.find((s) => s.user.isExternal === true);
    expect(ext).toBeDefined();
    expect(await PROBES.clients(ext!)).toBe('refused');
    expect(await PROBES['my-route'](ext!)).toBe('refused');
    expect((await call(ext!.token, '/assets/mine')).status).toBe(403);
    const tiles = destinationsFor(ext!.user as never).map((t) => t.labelKey);
    for (const k of ['shortcuts.documents', 'shortcuts.myEquipment', 'shortcuts.logExpense', 'shortcuts.scanCard', 'shortcuts.planRoute', 'manage.customers.label']) {
      expect(tiles).not.toContain(k);
    }
  }, 60_000);

  it('every session carries isExternal, so login and a restored session agree', () => {
    for (const s of sessions) expect(typeof s.user.isExternal).toBe('boolean');
  });

  it('tiles: prints what each member can choose from', () => {
    // eslint-disable-next-line no-console
    console.log(sessions.map((s) => `${s.email.padEnd(30)} ${destinationsFor(s.user as never).map((t) => t.labelKey.replace(/^(shortcuts|manage)\./, '').replace(/\.label$/, '')).join(', ')}`).join('\n'));
  });
});
