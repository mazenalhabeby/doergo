/**
 * The right widgets and the right shortcut tiles for the right member.
 *
 * ⚠️ THE GAPS THIS PINS (2026-09-26 audit):
 *   • Today's route asked only "does tracking run somewhere I can see", so it
 *     reached members who carry no jobs, and external members;
 *   • Plan route, Documents, My equipment, Log expense and Scan card reached
 *     external members, whose server answer is always a refusal;
 *   • Scan card creates a client and did not ask for the right to add one;
 *   • Overtime asked for the Option and not for the clock.
 *
 * And the one that matters most: the widget and the tile that lead to the
 * same place must answer the same question — `drivesRoutes`, once.
 */
// The cards are React components the node test runner cannot load; the
// registry's ROWS (and their `requires`) are what is under test.
jest.mock('../../components/home/shift-clock-card', () => ({ ShiftClockCard: () => null }));
jest.mock('../../components/home/my-work-card', () => ({ MyWorkCard: () => null }));
jest.mock('../../components/home/crew-card', () => ({ CrewCard: () => null }));
jest.mock('../../components/home/clients-card', () => ({ ClientsCard: () => null }));
jest.mock('../../components/home/shortcuts-card', () => ({ ShortcutsCard: () => null }));
jest.mock('../../components/home/route-card', () => ({ RouteCard: () => null }));
import { availableWidgets } from '../../home/registry';
import { destinationsFor } from '../manage-rows';
import { drivesRoutes, isExternalMember } from '../member-reach';

const profile = (modules: string[]) => ({ modules });
const member = (over: Record<string, unknown> = {}) => ({
  role: 'EMPLOYEE',
  // CRM comes from the ORG ROLE (as on the server) — a member with none has no CRM.
  memberRoleId: 'role-1',
  access: { org: {}, perSpace: {} },
  enabledModules: profile(['tasks', 'clock']),
  spaceModules: ['tracking', 'assets', 'crm'],
  orgModules: [],
  orgAddOns: ['overtime'],
  ...over,
});
const widgets = (u: object) => availableWidgets(u as never).map((w) => w.key);
const tiles = (u: object) => destinationsFor(u as never).map((d) => d.labelKey);

describe('Today\'s route and Plan route ask one question', () => {
  it('a driver with jobs in a tracking workspace gets both', () => {
    const u = member();
    expect(drivesRoutes(u as never)).toBe(true);
    expect(widgets(u)).toContain('my-route');
    expect(tiles(u)).toContain('shortcuts.planRoute');
  });

  it('no tracking in any of their workspaces: neither', () => {
    const u = member({ spaceModules: ['assets'] });
    expect(widgets(u)).not.toContain('my-route');
    expect(tiles(u)).not.toContain('shortcuts.planRoute');
  });

  it('works on site with no jobs (clock only): neither', () => {
    const u = member({ enabledModules: profile(['clock']) });
    expect(widgets(u)).not.toContain('my-route');
    expect(tiles(u)).not.toContain('shortcuts.planRoute');
  });

  it('an external member: neither, whatever runs where', () => {
    const u = member({ isExternal: true });
    expect(isExternalMember(u as never)).toBe(true);
    expect(widgets(u)).not.toContain('my-route');
    expect(tiles(u)).not.toContain('shortcuts.planRoute');
  });

  it('a session from an older server (no isExternal) is not read as external', () => {
    expect(isExternalMember(member() as never)).toBe(false);
  });
});

describe('the organization\'s own property is never an external member\'s', () => {
  const ext = member({ isExternal: true, access: { org: { crmViewAll: true, crmEditInfo: true, crmCreateClients: true, canCreateTasks: true }, perSpace: {} } });

  it('hides equipment, documents and the client book', () => {
    const t = tiles(ext);
    for (const k of ['shortcuts.documents', 'shortcuts.myEquipment', 'shortcuts.logExpense', 'shortcuts.equipmentLog', 'shortcuts.scanCard', 'shortcuts.addClient', 'manage.customers.label']) {
      expect(t).not.toContain(k);
    }
    expect(widgets(ext)).not.toContain('clients');
  });

  it('keeps what is about the work they are there for', () => {
    expect(tiles(ext)).toContain('shortcuts.newJob');
    expect(widgets(ext)).toContain('my-work');
  });

  it('the same member, internal, keeps all of it', () => {
    const t = tiles({ ...ext, isExternal: false });
    for (const k of ['shortcuts.documents', 'shortcuts.myEquipment', 'shortcuts.scanCard', 'shortcuts.addClient']) {
      expect(t).toContain(k);
    }
  });
});

describe('a tile asks what its screen needs', () => {
  it('Scan card needs the right to add a client, like Add client', () => {
    const noEdit = member();
    expect(tiles(noEdit)).not.toContain('shortcuts.scanCard');
    expect(tiles(noEdit)).not.toContain('shortcuts.addClient');
    const rep = member({ access: { org: { crmViewOwn: true, crmCreateClients: true }, perSpace: {} } });
    expect(tiles(rep)).toContain('shortcuts.scanCard');
    expect(tiles(rep)).toContain('shortcuts.addClient');
  });

  it('BUG FIXED: no org role → no CRM tiles, as the server answers (a legacy canManageUsers column is not a CRM grant)', () => {
    const legacy = member({ memberRoleId: null, canManageUsers: true, access: { org: { canManageUsers: true }, perSpace: {} } });
    const t = tiles(legacy);
    for (const k of ['shortcuts.scanCard', 'shortcuts.addClient', 'manage.customers.label']) expect(t).not.toContain(k);
  });

  it('Overtime needs the clock, not only the Option', () => {
    expect(tiles(member())).toContain('shortcuts.overtime');
    expect(tiles(member({ enabledModules: profile(['tasks']) }))).not.toContain('shortcuts.overtime');
  });
});
