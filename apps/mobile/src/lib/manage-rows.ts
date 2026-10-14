import { APPROVAL_KIND_SPECS, hasAccessModule, moduleAnywhere, orgHasAddOn, type MobileModule } from '@hbcfield/shared/client';
import { holds, holdsOrgWide } from './permissions';
import { crmCapsOf, drivesRoutes, isExternalMember } from './member-reach';

/**
 * What Manage offers, and to whom.
 *
 * Each row names the permission its screens actually need, and `orgWide` says
 * whether a grant held in ONE space is enough — because the endpoint behind it
 * decides that, not this file. Members, invitations and join requests are
 * `@RequirePermission`: org-wide columns, refused to a space role however
 * senior. Attendance is `@RequirePermissionInSpace`: the same request answers
 * with one site for its supervisor and the whole company for an admin.
 *
 * A row may also name a `module`. A permission says who may look; a module says
 * whether the organization bought the thing at all, and the two are different
 * questions — a member can legitimately hold `crmViewOwn` in an organization
 * that runs no CRM anywhere, and the row then led to a screen that could only
 * ever be empty.
 *
 * The tab and the list read the same array, so a member never opens a Manage
 * tab to find nothing in it, and never sees a row that would refuse them. The
 * list used to be shown to ADMIN alone — a Space Manager holding the rota could
 * not reach the schedules, and the whole management surface was invisible to
 * everyone whose authority comes from a space.
 */
export const MANAGE_ROWS = [
  /*
    Approvals first: everything below that waits for a decision, in one list
    (packages/shared/src/approvals). Offered to whoever can decide ONE kind,
    asked the way that kind's route asks it — the server lists only those.
  */
  { icon: 'file-tray-full', labelKey: 'manage.approvals.label', descKey: 'manage.approvals.desc', route: '/(app)/approvals', color: '#dc2626', permission: '', orgWide: false, gate: { decides: true } },
  { icon: 'stopwatch', labelKey: 'manage.attendance.label', descKey: 'manage.attendance.desc', route: '/(app)/manage/attendance', color: '#0ea5e9', permission: 'canViewSpaceAttendance', orgWide: false },
  // No "Requests" row: waiting requests are in Approvals; the team's record opens from the calendar ("who is off").
  { icon: 'people', labelKey: 'manage.members.label', descKey: 'manage.members.desc', route: '/(app)/manage/members', color: '#8b5cf6', permission: 'canManageUsers', orgWide: true },
  /*
    Clients. `crmViewOwn` alone was the whole gate, so an organization that has
    never switched CRM on anywhere still carried the row — and the screen behind
    it can only say "no clients", which reads as a broken list rather than as a
    feature nobody bought. See `moduleAnywhere` in shared for why the question is
    "is it running in a workspace I can see" and not "has the org got it".
  */
  /*
    ⚠️ Decided by the CRM REACH, not by `crmViewOwn` and not by "internal".
    `holds('crmViewOwn')` missed a member granted `crmViewAll` alone in one
    workspace, and `internal` hid the book from an external member the office
    deliberately gave "view clients" in their workspace — the server serves
    them that workspace's clients (`crmReachOf`), so the phone offers them.
  */
  { icon: 'people-circle', labelKey: 'manage.customers.label', descKey: 'manage.customers.desc', route: '/(app)/customers', color: '#2563eb', permission: '', orgWide: false, module: 'crm', gate: { crmCap: 'canAccess' } },
  /*
    A workspace's equipment and its client requests — for whoever holds the
    permission there, staff or external alike (the server narrows to those
    workspaces and 404s the rest). Not `internal`: running a client's site is
    exactly what an external member may be given. Custody ("What I have",
    Log expense) stays staff-only above.
  */
  { icon: 'construct', labelKey: 'manage.equipment.label', descKey: 'manage.equipment.desc', route: '/(app)/equipment', color: '#0f766e', permission: 'canViewAssets', orgWide: false, module: 'assets' },
  { icon: 'chatbox-ellipses', labelKey: 'manage.clientRequests.label', descKey: 'manage.clientRequests.desc', route: '/(app)/client-requests', color: '#b45309', permission: 'canViewPortal', orgWide: false, module: 'b2c_portal' },
  { icon: 'mail', labelKey: 'manage.invitations.label', descKey: 'manage.invitations.desc', route: '/(app)/manage/invitations', color: '#06b6d4', permission: 'canManageUsers', orgWide: true },
  { icon: 'alert-circle', labelKey: 'manage.issues.label', descKey: 'manage.issues.desc', route: 'sheet:issues', color: '#ef4444', permission: 'canViewAllTasks', orgWide: false },
  /*
    Schedules shows who works when — a staffing fact, read on the leader
    permission (`canViewSpaceAttendance`, in a space) like cover and the live
    floor, not on `canViewAllTasks`, which the €2 observer holds.
  */
  { icon: 'time', labelKey: 'manage.schedules.label', descKey: 'manage.schedules.desc', route: '/(app)/manage/schedules', color: '#10b981', permission: 'canViewSpaceAttendance', orgWide: false },
] as const;

export type ManageRow = (typeof MANAGE_ROWS)[number];

/* ═══════════════════════════════════════════════════════════════════════════
   The member's own half of the table.

   ⚠️ ONE TABLE, THREE SURFACES — the Manage tab, the More sheet, and the home
   screen's shortcuts rail. A second gated list of the same destinations is
   §2.4 rule 1 happening again ("Entitlement is asked once … asked separately
   they drift"), and this file already records what drift cost once:

     "a member can legitimately hold `crmViewOwn` in an organization that runs
      no CRM anywhere, and the row then led to a screen that could only ever
      be empty"

     "that is how a member comes to see Clients on the web and not on the
      phone"

   These twelve rows never had a table at all. Each was reached by ad-hoc
   navigation from wherever somebody happened to put a link, which is why half
   of them are unreachable for the members entitled to them.

   ⚠️ NEVER A TILE FOR A TAB. Home, Jobs, New job, Attendance, Time off, Team
   and Profile are in `(tabs)/`. A tile duplicating a tab is a second door to
   the same room, one of which moves. `home: true` is refused for any of them.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Where a tile's count comes from, or none. The only genuinely new field. */
export type BadgeSource =
  | 'documents.due'
  | 'documents.toSign'
  /* Messages took a tab slot in v2; the pill carries its unread count now. */
  | 'sync.queued'
  | 'overtime.mine'
  | 'assets.due';

/**
 * A gate a permission cannot express.
 *
 * ⚠️ Three kinds of gate and they are NOT interchangeable. A permission says
 * who may look; a module says whether the organization bought the thing at
 * all; and custody says whether this is your van. The first two already live
 * on a row as `permission` and `module`; these are the rest.
 */
export type ExtraGate =
  /** Bought once for the organization — an Option. */
  | { addOn: string }
  /** The offline engine is switched on for this org (the staged rollout). */
  | { offline: true }
  /**
   * The widest CRM caps held anywhere — org-wide, or in a workspace that runs
   * `crm` (`crmCapsOf`, the server's own reach). A space-scoped sales role and
   * an external member's workspace grant both count.
   */
  | { crmCap: 'canAccess' | 'editInfo' | 'create' | 'manage' | 'work' }
  /** They drive a route — the same rule as the Today's route widget (`lib/member-reach.ts`). */
  | { drives: true }
  /** A SECOND permission the screen's own first read needs (in any space). */
  | { alsoHolds: string }
  /** Can decide at least one kind of approval (the approvals inbox). */
  | { decides: true };

export interface Destination {
  icon: string;
  labelKey: string;
  descKey: string;
  route: string;
  color: string;
  /** Empty string = no permission needed: everyone, about themselves. */
  permission: string;
  orgWide: boolean;
  module?: string;
  /** An Access Profile module the member must hold (the phone's own gate: `clock`, `tasks`). */
  accessModule?: MobileModule;
  /**
   * The organization's own property, or something reached through CUSTODY or
   * the member's own clock — never an external member's, whatever they hold.
   * Mirrors `@DenyExternal` on the server. ⚠️ NOT a shorthand for "sensitive":
   * clients, equipment and portal requests are given to externals per
   * workspace by permission, and a row that can be granted asks THAT instead.
   */
  internal?: true;
  gate?: ExtraGate;
  /** Eligible for the home rail. NOT every destination is a tile. */
  home?: true;
  /** An ACTION (make, log, send), not a place — the rail's smart picks take these after anything waiting. */
  act?: true;
  /** Belongs in the Manage list / More sheet. */
  manage?: true;
  badge?: BadgeSource;
}

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
  { icon: 'document-text', labelKey: 'shortcuts.documents', descKey: 'shortcuts.documentsDesc', route: '/(app)/documents', color: '#0b8168', permission: '', orgWide: false, internal: true, gate: { addOn: 'documents' }, home: true, badge: 'documents.due' },
  { icon: 'create', labelKey: 'shortcuts.sign', descKey: 'shortcuts.signDesc', route: '/(app)/documents', color: '#0b8168', permission: '', orgWide: false, gate: { addOn: 'documents' }, home: true, badge: 'documents.toSign' },
  { icon: 'cube', labelKey: 'shortcuts.myEquipment', descKey: 'shortcuts.myEquipmentDesc', route: '/(app)/my-assets', color: '#0f766e', permission: '', orgWide: false, module: 'assets', internal: true, home: true, badge: 'assets.due' },
  /*
    ⚠️ MESSAGES IS NOT HERE ANY MORE. It took a permanent slot in the tab pill
    in v2, and a tile that duplicates a tab is a second door to the same room,
    one of which moves. The route is `/(app)/(tabs)/chat` now; the old
    `/(app)/chat` file is gone — it resolved to the same `/chat` and shadowed
    the real screen. `/(app)/chat`
    is a redirect kept for every push notification already delivered.
  */
  { icon: 'sync', labelKey: 'shortcuts.sync', descKey: 'shortcuts.syncDesc', route: '/(app)/sync', color: '#8b5cf6', permission: '', orgWide: false, gate: { offline: true }, home: true, badge: 'sync.queued' },
  { icon: 'timer', labelKey: 'shortcuts.overtime', descKey: 'shortcuts.overtimeDesc', route: '/(app)/overtime/active', color: '#a855f7', permission: '', orgWide: false, accessModule: 'clock', gate: { addOn: 'overtime' }, home: true, badge: 'overtime.mine' },
  /*
    ⚠️ Filing an expense is authorised by CUSTODY on the receipt's date, never
    by `canManageAssets` — a driver is not an asset manager and never will be.
    The tile cannot ask that question without a request, so it gates on the
    module and the SCREEN enforces custody, which it already does.
  */
  { icon: 'receipt', labelKey: 'shortcuts.logExpense', descKey: 'shortcuts.logExpenseDesc', route: '/(app)/asset-expense', color: '#8a5a10', permission: '', orgWide: false, module: 'assets', internal: true, home: true, act: true },
  /*
    ⚠️ NEW JOB IS A TILE NOW, and it could not have been one a week ago.

    "Never a tile for a tab" refused it while `create-task` held a permanent
    slot. v2's fixed set is Home · Jobs · Clock · Messages, so it does not any
    more — and creating a job was always a better tile than a place: it is an
    action, and the tab bar is a set of rooms.
  */
  { icon: 'add-circle', labelKey: 'shortcuts.newJob', descKey: 'shortcuts.newJobDesc', route: '/(app)/(tabs)/create-task', color: '#0b8168', permission: 'canCreateTasks', orgWide: false, home: true, act: true },
  { icon: 'scan', labelKey: 'shortcuts.scanCard', descKey: 'shortcuts.scanCardDesc', route: '/(app)/scan-card', color: '#2563eb', permission: '', orgWide: false, module: 'crm', internal: true, gate: { crmCap: 'create' }, home: true, act: true },
  /*
    Scan card stays `internal`: it is a staff member's own phone and camera
    feeding the organization's book (as importing the address book is,
    `@DenyExternal` on the server). Add client is not — an external member given
    "add clients" in their workspace adds one there, and the server files it.
  */
  { icon: 'person-add', labelKey: 'shortcuts.addClient', descKey: 'shortcuts.addClientDesc', route: '/(app)/customers?new=1', color: '#2563eb', permission: '', orgWide: false, module: 'crm', gate: { crmCap: 'create' }, home: true, act: true },
  /*
    No "Send a contract" tile: a contract for a vehicle is handed in from
    Documents → Add a document ("For the office"), or from My equipment where
    the organization has no Documents option — one door, not three.
  */
  { icon: 'map', labelKey: 'shortcuts.planRoute', descKey: 'shortcuts.planRouteDesc', route: '/(app)/route-planner', color: '#0ea5e9', permission: '', orgWide: false, gate: { drives: true }, home: true },
  // Reachable, and not a tile: nobody opens support twice a week.
  { icon: 'help-buoy', labelKey: 'shortcuts.support', descKey: 'shortcuts.supportDesc', route: '/(app)/support', color: '#64748b', permission: '', orgWide: false },
  /*
    ⚠️ Still `internal`, like My equipment and Log expense: on the phone the
    logbook is reached through what the member HOLDS (`/assets/mine`, the
    picker), and custody is staff-only. An external member granted
    `canLogAssets` logs from the register (Manage → Equipment).
  */
  { icon: 'list', labelKey: 'shortcuts.equipmentLog', descKey: 'shortcuts.equipmentLogDesc', route: '/(app)/asset-log', color: '#0f766e', permission: '', orgWide: false, module: 'assets', internal: true },
];


/*
  Two surfaces a supervisor holds the permission for and had no door to.

  Extra-time approvals live on the CLOCK tab, which an external member does not
  have; shift issues live on the clock card, likewise. Both were therefore
  reachable only by tapping a push notification — the permission was real, the
  route was not. Approving somebody's overtime should not depend on still having
  the notification.
*/

/**
 * The session fields a row can be decided from: whatever `holds` reads, plus
 * the two module lists the server resolves with the session.
 *
 * Declared here rather than on the mobile `User` interface because this is the
 * only thing that asks — and because `manageRowsFor` is called with `user || {}`
 * at one site, which a required field would break.
 */
type ManageSubject =
  | (NonNullable<Parameters<typeof holds>[0]> & {
      /** The union of enabled modules across the workspaces this member can see. */
      spaceModules?: string[] | null;
      /** The organization's own list — the fallback, and never the first answer. */
      orgModules?: string[] | null;
    })
  /*
    ⚠️ The nullable arms are part of the type, not an oversight. `holds` accepts
    null and undefined because a screen asks this while the session is still
    loading; intersecting the extra fields onto `Parameters<typeof holds>[0]`
    silently drops them and breaks both call sites.
  */
  | null
  | undefined;

/**
 * Whether a module runs in a workspace this member can see.
 *
 * ⚠️ Not "has the organization got it" — a module is bought per space, so the
 * org-wide list answers a different question and is wrong in both directions.
 * The rule and every caveat behind it (absent ≠ empty, most of all) live once
 * in `moduleAnywhere` in shared, because the web navbar asks the same question
 * and the two clients must not answer it differently — that is how a member
 * comes to see Clients on the web and not on the phone.
 */

/** Can this member decide any kind of approval — each kind asked the way its route asks it? */
export function decidesAnything(user: Parameters<typeof holds>[0]): boolean {
  return Object.values(APPROVAL_KIND_SPECS).some((k) =>
    k.orgWide ? holdsOrgWide(user, k.decideKey) : holds(user, k.decideKey));
}

/** The rows this member can actually open. */
export function manageRowsFor(user: ManageSubject): ManageRow[] {
  return MANAGE_ROWS.filter((row) => opens(user, asDestination(row)));
}

/** Is there a Manage tab for this member at all? */
export function hasManageSurface(user: ManageSubject): boolean {
  return manageRowsFor(user).length > 0;
}

/* ═══════════════════════════════════════════════════════════════════════════
   The third surface — the home screen's shortcuts rail.
   ═══════════════════════════════════════════════════════════════════════════ */

/** The extra session fields the member rows are decided from. */
type DestinationSubject = ManageSubject & {
  orgAddOns?: string[] | null;
  offlineMode?: boolean;
};

/**
 * A gate a permission and a module together cannot express.
 *
 * The CRM gate reads `crmCapsOf` — the server's own reach (org caps ∪ the
 * crm* keys of each workspace that runs CRM) — so the phone and the API
 * answer the same member the same way.
 */
function passesGate(user: DestinationSubject, gate: ExtraGate | undefined): boolean {
  if (!gate) return true;
  if ('addOn' in gate) return orgHasAddOn(user?.orgAddOns ?? null, gate.addOn);
  if ('offline' in gate) return user?.offlineMode === true;
  if ('drives' in gate) return drivesRoutes(user as never);
  if ('alsoHolds' in gate) return holds(user as never, gate.alsoHolds);
  if ('decides' in gate) return decidesAnything(user);
  const caps = crmCapsOf(user as never);
  return caps[gate.crmCap] === true;
}

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

/** A Manage row read as a destination (its optional fields made explicit). */
function asDestination(r: ManageRow): Destination {
  return {
    ...r,
    module: 'module' in r ? (r.module as string) : undefined,
    internal: 'internal' in r ? (r.internal as true) : undefined,
    gate: 'gate' in r ? (r.gate as ExtraGate) : undefined,
    manage: true as const,
  };
}

/**
 * ONE answer to "may this member open this row" — the Manage tab, the More
 * sheet and the home rail all ask it, so they cannot disagree.
 *
 *   • permission — empty = none needed; else org-wide or in any space, as the
 *     row's endpoint decides;
 *   • module — runs in a workspace the member can see (rows naming none are the
 *     organization itself: members, invitations, the rota);
 *   • internal — never an external member's;
 *   • the Access Profile module, and the row's extra gate.
 */
function opens(user: DestinationSubject | ManageSubject, row: Destination): boolean {
  if (row.permission) {
    const allowed = row.orgWide ? holdsOrgWide(user, row.permission) : holds(user, row.permission);
    if (!allowed) return false;
  }
  if (row.module !== undefined && !moduleAnywhere(user, row.module)) return false;
  if (row.internal && isExternalMember(user as never)) return false;
  if (row.accessModule && !hasAccessModule(user as never, row.accessModule)) return false;
  return passesGate(user as DestinationSubject, row.gate);
}
