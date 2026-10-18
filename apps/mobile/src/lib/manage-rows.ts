import { APPROVAL_KIND_SPECS, hasAccessModule, moduleAnywhere, orgHasAddOn, type MobileModule } from '@hbcfield/shared/client';
import { holds, holdsOrgWide } from './permissions';
import { crmCapsOf, drivesRoutes, isExternalMember } from './member-reach';
import { MANAGE_ROWS, type Destination, type DestinationSubject, asDestination, opens } from './manage-row';
export {
  MANAGE_ROWS,
  type Destination,
  type ManageRow,
  type BadgeSource,
  manageRowsFor,
  hasManageSurface,
} from './manage-row';

/**
 * The member's own screens.
 *
 * ⚠️ `home` is a JUDGEMENT and it belongs in this table where it can be argued
 * about, not in the widget where it would be invisible. Support and the
 * equipment log are real screens nobody opens twice a week; they are reachable
 * and they are not tiles.
 */
export const MEMBER_ROWS: Destination[] = [
  /*
    Both behind the Documents OPTION, like the profile row and the badges they
    carry — without it they led to a screen with nothing on it.
    ⚠️ Sign opens Documents, where anything waiting on a signature is the first
    section. It used to open the signing screen with no document at all, which
    can sign nothing.
  */
  {
    icon: 'document-text',
    labelKey: 'shortcuts.documents',
    descKey: 'shortcuts.documentsDesc',
    route: '/(app)/documents',
    color: '#0b8168',
    permission: '',
    orgWide: false,
    internal: true,
    gate: { addOn: 'documents' },
    home: true,
    badge: 'documents.due',
  },
  {
    icon: 'create',
    labelKey: 'shortcuts.sign',
    descKey: 'shortcuts.signDesc',
    route: '/(app)/documents',
    color: '#0b8168',
    permission: '',
    orgWide: false,
    gate: { addOn: 'documents' },
    home: true,
    badge: 'documents.toSign',
  },
  {
    icon: 'cube',
    labelKey: 'shortcuts.myEquipment',
    descKey: 'shortcuts.myEquipmentDesc',
    route: '/(app)/my-assets',
    color: '#0f766e',
    permission: '',
    orgWide: false,
    module: 'assets',
    internal: true,
    home: true,
    badge: 'assets.due',
  },
  /*
    ⚠️ MESSAGES IS NOT HERE ANY MORE. It took a permanent slot in the tab pill
    in v2, and a tile that duplicates a tab is a second door to the same room,
    one of which moves. The route is `/(app)/(tabs)/chat` now; the old
    `/(app)/chat` file is gone — it resolved to the same `/chat` and shadowed
    the real screen. `/(app)/chat`
    is a redirect kept for every push notification already delivered.
  */
  {
    icon: 'sync',
    labelKey: 'shortcuts.sync',
    descKey: 'shortcuts.syncDesc',
    route: '/(app)/sync',
    color: '#8b5cf6',
    permission: '',
    orgWide: false,
    gate: { offline: true },
    home: true,
    badge: 'sync.queued',
  },
  {
    icon: 'timer',
    labelKey: 'shortcuts.overtime',
    descKey: 'shortcuts.overtimeDesc',
    route: '/(app)/overtime/active',
    color: '#a855f7',
    permission: '',
    orgWide: false,
    accessModule: 'clock',
    gate: { addOn: 'overtime' },
    home: true,
    badge: 'overtime.mine',
  },
  /*
    ⚠️ Filing an expense is authorised by CUSTODY on the receipt's date, never
    by `canManageAssets` — a driver is not an asset manager and never will be.
    The tile cannot ask that question without a request, so it gates on the
    module and the SCREEN enforces custody, which it already does.
  */
  {
    icon: 'receipt',
    labelKey: 'shortcuts.logExpense',
    descKey: 'shortcuts.logExpenseDesc',
    route: '/(app)/asset-expense',
    color: '#8a5a10',
    permission: '',
    orgWide: false,
    module: 'assets',
    internal: true,
    home: true,
    act: true,
  },
  /*
    ⚠️ NEW JOB IS A TILE NOW, and it could not have been one a week ago.

    "Never a tile for a tab" refused it while `create-task` held a permanent
    slot. v2's fixed set is Home · Jobs · Clock · Messages, so it does not any
    more — and creating a job was always a better tile than a place: it is an
    action, and the tab bar is a set of rooms.
  */
  {
    icon: 'add-circle',
    labelKey: 'shortcuts.newJob',
    descKey: 'shortcuts.newJobDesc',
    route: '/(app)/(tabs)/create-task',
    color: '#0b8168',
    permission: 'canCreateTasks',
    orgWide: false,
    home: true,
    act: true,
  },
  {
    icon: 'scan',
    labelKey: 'shortcuts.scanCard',
    descKey: 'shortcuts.scanCardDesc',
    route: '/(app)/scan-card',
    color: '#2563eb',
    permission: '',
    orgWide: false,
    module: 'crm',
    internal: true,
    gate: { crmCap: 'create' },
    home: true,
    act: true,
  },
  /*
    Scan card stays `internal`: it is a staff member's own phone and camera
    feeding the organization's book (as importing the address book is,
    `@DenyExternal` on the server). Add client is not — an external member given
    "add clients" in their workspace adds one there, and the server files it.
  */
  {
    icon: 'person-add',
    labelKey: 'shortcuts.addClient',
    descKey: 'shortcuts.addClientDesc',
    route: '/(app)/customers?new=1',
    color: '#2563eb',
    permission: '',
    orgWide: false,
    module: 'crm',
    gate: { crmCap: 'create' },
    home: true,
    act: true,
  },
  /*
    No "Send a contract" tile: a contract for a vehicle is handed in from
    Documents → Add a document ("For the office"), or from My equipment where
    the organization has no Documents option — one door, not three.
  */
  {
    icon: 'map',
    labelKey: 'shortcuts.planRoute',
    descKey: 'shortcuts.planRouteDesc',
    route: '/(app)/route-planner',
    color: '#0ea5e9',
    permission: '',
    orgWide: false,
    gate: { drives: true },
    home: true,
  },
  // Reachable, and not a tile: nobody opens support twice a week.
  {
    icon: 'help-buoy',
    labelKey: 'shortcuts.support',
    descKey: 'shortcuts.supportDesc',
    route: '/(app)/support',
    color: '#64748b',
    permission: '',
    orgWide: false,
  },
  /*
    ⚠️ Still `internal`, like My equipment and Log expense: on the phone the
    logbook is reached through what the member HOLDS (`/assets/mine`, the
    picker), and custody is staff-only. An external member granted
    `canLogAssets` logs from the register (Manage → Equipment).
  */
  {
    icon: 'list',
    labelKey: 'shortcuts.equipmentLog',
    descKey: 'shortcuts.equipmentLogDesc',
    route: '/(app)/asset-log',
    color: '#0f766e',
    permission: '',
    orgWide: false,
    module: 'assets',
    internal: true,
  },
];

/**
 * Every destination this member can actually open — both halves of the table.
 *
 * ⚠️ NOTHING IS VISIBLE-THEN-REFUSED. A row checks its module AND its
 * permission AND its scope before it is returned. The whole point of a rail of
 * doorways is that every door opens.
 */
export function destinationsFor(user: DestinationSubject): Destination[] {
  return [...MANAGE_ROWS.map(asDestination), ...MEMBER_ROWS].filter((row) => opens(user, row));
}
