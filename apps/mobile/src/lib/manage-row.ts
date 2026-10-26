import type { IconName } from '@hbcfield/shared/client';
import {
  APPROVAL_KIND_SPECS,
  hasAccessModule,
  moduleAnywhere,
  orgHasAddOn,
  type MobileModule,
} from '@hbcfield/shared/client';
import { holds, holdsOrgWide } from './permissions';
import { crmCapsOf, drivesRoutes, isExternalMember } from './member-reach';
import { MANAGE_ROWS } from './manage-row-table';
export { MANAGE_ROWS } from './manage-row-table';

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
  /** The destination's mark in the shared library — the home shortcuts and the More page draw it. */
  icon: IconName;
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
export type ManageSubject =
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
    k.orgWide ? holdsOrgWide(user, k.decideKey) : holds(user, k.decideKey),
  );
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
export type DestinationSubject = ManageSubject & {
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
export function passesGate(user: DestinationSubject, gate: ExtraGate | undefined): boolean {
  if (!gate) return true;
  if ('addOn' in gate) return orgHasAddOn(user?.orgAddOns ?? null, gate.addOn);
  if ('offline' in gate) return user?.offlineMode === true;
  if ('drives' in gate) return drivesRoutes(user as never);
  if ('alsoHolds' in gate) return holds(user as never, gate.alsoHolds);
  if ('decides' in gate) return decidesAnything(user);
  const caps = crmCapsOf(user as never);
  return caps[gate.crmCap] === true;
}

/** A Manage row read as a destination (its optional fields made explicit). */
export function asDestination(r: ManageRow): Destination {
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
export function opens(user: DestinationSubject | ManageSubject, row: Destination): boolean {
  if (row.permission) {
    const allowed = row.orgWide ? holdsOrgWide(user, row.permission) : holds(user, row.permission);
    if (!allowed) return false;
  }
  if (row.module !== undefined && !moduleAnywhere(user, row.module)) return false;
  if (row.internal && isExternalMember(user as never)) return false;
  if (row.accessModule && !hasAccessModule(user as never, row.accessModule)) return false;
  return passesGate(user as DestinationSubject, row.gate);
}
