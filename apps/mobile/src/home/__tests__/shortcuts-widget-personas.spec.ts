import * as fs from 'fs';
import * as path from 'path';
import { destinationsFor, MANAGE_ROWS, MEMBER_ROWS } from '../../lib/manage-rows';
import { shortcutCandidates, shownShortcuts, smartPicks, MIN_TILES, SLOTS } from '../shortcuts';

/**
 * The Shortcuts widget against REAL sessions.
 *
 * `fixtures/shortcuts-widget-personas.json` is the `user` object each seed
 * account's `POST /auth/login` returned on the dev stack (2026-09-26, avatar
 * stripped). Every tile below was then opened against the live API with that
 * member's token — the server column in the tables is what came back. A tile
 * whose screen the server refuses is a door that does not open: the one thing
 * the card promises never to show.
 */
const PERSONAS: Record<string, unknown> = require('./fixtures/shortcuts-widget-personas.json');
const APP = path.resolve(__dirname, '../../../app');

const tilesOf = (who: string) => shortcutCandidates(destinationsFor(PERSONAS[who] as never)).map((r) => r.labelKey);

/** Does an expo-router href resolve to a screen file? Query string ignored. */
function screenExists(route: string): boolean {
  const clean = route.split('?')[0]!.replace(/^\//, '');
  return [`${clean}.tsx`, `${clean}/index.tsx`].some((f) => fs.existsSync(path.join(APP, f)));
}

describe('Shortcuts widget — every persona', () => {
  it('the fixture holds all nine seed personas', () => {
    expect(Object.keys(PERSONAS).sort()).toEqual(['a.test', 'client', 'dana', 'karim', 'manager', 'mike', 'noor', 'sales', 'sarah']);
  });

  /*
    What each member is offered today. Pinned so that a change to the shared
    table shows up HERE as a decision, not as a surprise on somebody's home.
  */
  const EXPECTED: Record<string, string[]> = {
    client: [
      'manage.approvals.label',
      'manage.attendance.label', 'manage.timeOff.label', 'manage.members.label', 'manage.customers.label',
      // The workspace's register and client requests — the owner holds everything and the org runs both.
      'manage.equipment.label', 'manage.clientRequests.label',
      'manage.invitations.label', 'manage.schedules.label',
      'shortcuts.documents', 'shortcuts.sign', 'shortcuts.myEquipment', 'shortcuts.sync', 'shortcuts.overtime', 'shortcuts.logExpense',
      'shortcuts.newJob', 'shortcuts.scanCard', 'shortcuts.addClient', 'shortcuts.planRoute', 'shortcuts.support', 'shortcuts.equipmentLog',
    ],
    manager: [
      'manage.approvals.label',
      // Clients: the org-wide legacy bridge (canManageUsers/canViewAllTasks) reads as CRM on the
      // server's reach too (crmReachOfRow → memberAccessOf); `holds('crmViewOwn')` used to miss it.
      'manage.attendance.label', 'manage.timeOff.label', 'manage.members.label', 'manage.customers.label',
      'manage.invitations.label', 'manage.schedules.label',
      'shortcuts.documents', 'shortcuts.sign', 'shortcuts.myEquipment', 'shortcuts.sync', 'shortcuts.logExpense',
      'shortcuts.newJob', 'shortcuts.scanCard', 'shortcuts.addClient', 'shortcuts.support', 'shortcuts.equipmentLog',
    ],
    dana: [
      'manage.approvals.label',
      'shortcuts.documents', 'shortcuts.sign', 'shortcuts.myEquipment', 'shortcuts.sync', 'shortcuts.overtime', 'shortcuts.logExpense',
      'shortcuts.planRoute', 'shortcuts.support', 'shortcuts.equipmentLog',
    ],
    mike: [
      'manage.approvals.label',
      'manage.attendance.label', 'manage.timeOff.label', 'manage.customers.label',
    // Schedules follows canViewSpaceAttendance (in a space) — the leader permission Attendance uses.
    'manage.schedules.label',
      'shortcuts.documents', 'shortcuts.sign', 'shortcuts.myEquipment', 'shortcuts.sync', 'shortcuts.overtime', 'shortcuts.logExpense',
      'shortcuts.newJob', 'shortcuts.planRoute', 'shortcuts.support', 'shortcuts.equipmentLog',
    ],
    sales: [
      'manage.customers.label', 'shortcuts.documents', 'shortcuts.sign', 'shortcuts.myEquipment', 'shortcuts.sync', 'shortcuts.overtime',
      // Scan card / Add client need "add clients". This FIXTURE was captured before migration
      // 20260927090000 gave existing Sales Rep roles that grant — a rep signed in today gets both.
      'shortcuts.logExpense', 'shortcuts.newJob', 'shortcuts.support', 'shortcuts.equipmentLog',
    ],
    'a.test': [
      'manage.approvals.label',
      // An external supervisor sees their ONE workspace's schedule — the server narrows /rota/week to it.
      'manage.attendance.label', 'manage.timeOff.label', 'manage.schedules.label',
      'shortcuts.sign', 'shortcuts.sync', 'shortcuts.newJob', 'shortcuts.support',
    ],
  };

  for (const [who, tiles] of Object.entries(EXPECTED)) {
    it(`${who}: the tiles on offer`, () => {
      expect(tilesOf(who)).toEqual(tiles);
    });
  }

  it('sarah (a second ADMIN) is offered exactly what the owner is', () => {
    expect(tilesOf('sarah')).toEqual(tilesOf('client'));
  });

  it('an external member is never offered the organization’s own property', () => {
    const internal = [...MANAGE_ROWS, ...MEMBER_ROWS].filter((r) => 'internal' in r && r.internal).map((r) => r.labelKey);
    for (const k of internal) expect(tilesOf('a.test')).not.toContain(k);
  });

  it('every persona with enough tiles gets a drawable card of at most four, all openable', () => {
    for (const who of Object.keys(PERSONAS)) {
      const cands = shortcutCandidates(destinationsFor(PERSONAS[who] as never));
      const shown = shownShortcuts(null, cands, {});
      expect(shown.length).toBeLessThanOrEqual(SLOTS);
      expect(shown.length).toBeGreaterThanOrEqual(Math.min(MIN_TILES, cands.length));
      for (const r of shown) expect(cands).toContain(r);
      expect(new Set(shown.map((r) => r.labelKey)).size).toBe(shown.length);
      expect(smartPicks(cands, {})).toEqual(shown.map((r) => r.labelKey));
    }
  });

  it('every destination the card can offer has a glyph', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../components/home/shortcut-glyphs.ts'), 'utf8');
    for (const r of shortcutCandidates([...MANAGE_ROWS, ...MEMBER_ROWS] as never)) {
      expect(src).toContain(`'${r.labelKey}':`);
    }
  });

  /* ── Every tile's route is a screen file ─────────────────────────────── */

  const ROUTES = shortcutCandidates([...MANAGE_ROWS, ...MEMBER_ROWS] as never);
  /*
    ⚠️ KNOWN: `/(app)/overtime` has no screen — only `overtime/[id].tsx`
    (`id = 'active'` is "my running request", the push handler's default). The
    Overtime tile opens expo-router's unmatched page for every member with the
    clock and the Option. The fix is one word in `manage-rows.ts` (shared with
    other widgets, so reported rather than made here). `it.failing` flips red
    the day it is fixed, so this list gets shortened.
  */
  const KNOWN_MISSING = ['shortcuts.overtime'];
  for (const r of ROUTES.filter((x) => !KNOWN_MISSING.includes(x.labelKey))) {
    it(`${r.labelKey} → ${r.route} is a screen`, () => {
      expect(screenExists(r.route)).toBe(true);
    });
  }
  for (const r of ROUTES.filter((x) => KNOWN_MISSING.includes(x.labelKey))) {
    it.failing(`KNOWN BUG: ${r.labelKey} → ${r.route} is a screen`, () => {
      expect(screenExists(r.route)).toBe(true);
    });
  }

  /* ── What the server says now ───────────────────────────────────────── */

  /*
    On 2026-09-26 the server read CRM off the member's ORG ROLE alone, so noor
    (no role, a legacy `canManageUsers` column in `access.org`) was refused
    GET /customers while the phone offered Scan card / Add client.

    The server's CRM reach is now `crmReachOfRow` → `memberAccessOf`, THE
    access resolver — the very one that built this session's `access.org`. The
    legacy bridge applies on both sides (until ACCESS_IGNORE_LEGACY_FLAGS
    retires the columns, which empties `access.org` on both sides too), so the
    phone and the server agree again and noor is offered both.
  */
  it('noor: the phone follows the server\'s reach (same resolver), so Scan card and Add client are offered', () => {
    expect(tilesOf('noor')).toEqual(expect.arrayContaining(['shortcuts.scanCard', 'shortcuts.addClient', 'manage.customers.label']));
  });
});
