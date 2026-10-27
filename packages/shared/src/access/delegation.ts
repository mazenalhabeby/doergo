import { localDateKey } from '../utils/date';
import { orgFlagFields } from './org-flags';
import { memberAccessOf, ORG_ACCESS_SELECT, type OrgAccessRow } from './org-access';
import type { AccessPermissionKey, ResolvedAccess } from '../types/permissions';
import { zoneOf } from '../utils/workspace-zone';
import { activeWindowWhere } from './assignment-window';
export { DELEGATION_MAX_DAYS } from '../approvals/approval-routing';

/**
 * A STAND-IN: a leader on leave hands their approval decisions to somebody for
 * whole days (`ApprovalDelegation`). For those days the stand-in holds the
 * leader's own approval keys, in the leader's own scope — org-wide where the
 * leader holds them org-wide, in a workspace where the leader holds them there.
 *
 * ⚠️ ONLY THESE KEYS travel: deciding about people's time. Money, documents,
 * new people, clients and workspaces are never handed over by a stand-in.
 * `canViewSpaceAttendance` rides along because those decisions are made from
 * lists only a leader can read.
 *
 * ⚠️ NEVER A CEILING. What a stand-in holds is added to the SESSION (`access`)
 * and kept apart (`access.own` = the member's own), so no role-granting path
 * can hand it on: grant ceilings read `ownAccess()`. A stand-in's grant is
 * computed from the leader's OWN access, so it never chains.
 */
export const DELEGATABLE_KEYS = [
  'canApproveAttendance',
  'canApproveOvertime',
  'canManageRota',
  'canReconcileAttendance',
  'canViewSpaceAttendance',
] as const satisfies readonly AccessPermissionKey[];

export interface DelegatedGrant {
  org: Partial<Record<AccessPermissionKey, true>>;
  perSpace: Record<string, Partial<Record<AccessPermissionKey, true>>>;
}

/** A session's access plus what it stands in for, and its own access kept apart. */
export type AccessWithStandIn = ResolvedAccess & {
  /** The member's OWN access, before any stand-in. Present only while standing in. */
  own?: { org: ResolvedAccess['org']; perSpace: ResolvedAccess['perSpace'] };
  /** Whose decisions they hold today. */
  standingInFor?: Array<{ userId: string; name: string }>;
};

/** What a leader's access hands to a stand-in: the delegatable keys, where the leader holds them. */
export function delegatedGrant(leader: ResolvedAccess, leaderIsAdmin: boolean): DelegatedGrant {
  const out: DelegatedGrant = { org: {}, perSpace: {} };
  const flags = leaderIsAdmin ? null : orgFlagFields(leader);
  for (const key of DELEGATABLE_KEYS) {
    if (leaderIsAdmin || flags?.[key]) {
      out.org[key] = true;
      continue;
    }
    for (const spaceId in leader.perSpace) {
      if (leader.perSpace[spaceId]?.[key] === true) (out.perSpace[spaceId] ??= {})[key] = true;
    }
  }
  return out;
}

/** Several leaders' grants as one (a stand-in for two people holds both). */
export function combineGrants(grants: DelegatedGrant[]): DelegatedGrant {
  const out: DelegatedGrant = { org: {}, perSpace: {} };
  for (const g of grants) {
    Object.assign(out.org, g.org);
    for (const s in g.perSpace) out.perSpace[s] = { ...(out.perSpace[s] ?? {}), ...g.perSpace[s] };
  }
  return out;
}

export function grantIsEmpty(g: DelegatedGrant): boolean {
  return Object.keys(g.org).length === 0 && Object.keys(g.perSpace).length === 0;
}

/** The session's access with a stand-in's grant added; the member's own kept as `own`. Pure. */
export function withStandIn(
  access: ResolvedAccess,
  grant: DelegatedGrant,
  from: Array<{ userId: string; name: string }>,
): AccessWithStandIn {
  if (grantIsEmpty(grant)) return access;
  const perSpace: ResolvedAccess['perSpace'] = { ...access.perSpace };
  for (const s in grant.perSpace) perSpace[s] = { ...(perSpace[s] ?? {}), ...grant.perSpace[s] };
  return {
    ...access,
    org: { ...access.org, ...grant.org },
    perSpace,
    own: { org: access.org, perSpace: access.perSpace },
    standingInFor: from,
  };
}

/** The member's OWN access — what every grant ceiling must read. */
export function ownAccess<T extends ResolvedAccess | null | undefined>(access: T): T {
  const own = (access as AccessWithStandIn | null | undefined)?.own;
  return (
    own ? { ...access, org: own.org, perSpace: own.perSpace, own: undefined, standingInFor: undefined } : access
  ) as T;
}

/** "Today" as the organization reads it — the date the stand-in's days are compared with. */
export function delegationDay(now: Date, timeZone: string | null | undefined): Date {
  return new Date(`${localDateKey(now, zoneOf(timeZone))}T00:00:00.000Z`);
}

/** Active on `day`: not revoked, the day within its whole days. */
export function activeDelegationWhere(day: Date) {
  return { revokedAt: null, startsOn: { lte: day }, endsOn: { gte: day } };
}

/** Structural, so both services pass their own client. */
interface DelegationPrisma {
  approvalDelegation: { findMany(args: unknown): Promise<Array<{ toUserId: string; fromUser: unknown }>> };
}

const LEADER_SELECT = (now: Date) => ({
  id: true,
  firstName: true,
  lastName: true,
  ...ORG_ACCESS_SELECT,
  spaceAssignments: {
    where: { ...activeWindowWhere(now) },
    select: { spaceId: true, role: { select: { permissions: true, isActive: true } } },
  },
});

/**
 * Today's stand-ins in an organization — or for one member — by stand-in id,
 * each with the grant it gives and whose decisions they are. ONE query (the
 * leaders' own access comes with it). Used by the session builders, by the
 * few services that check permissions in the database themselves, and by
 * "who else can decide".
 */
export async function standInsOn(
  prisma: DelegationPrisma,
  organizationId: string,
  day: Date,
  toUserId?: string,
): Promise<Map<string, { grant: DelegatedGrant; from: Array<{ userId: string; name: string }> }>> {
  const rows = await prisma.approvalDelegation.findMany({
    where: {
      organizationId,
      ...(toUserId ? { toUserId } : {}),
      ...activeDelegationWhere(day),
      fromUser: { isActive: true, organizationId },
    },
    select: { toUserId: true, fromUser: { select: LEADER_SELECT(new Date()) } },
  });
  const byTo = new Map<string, { grants: DelegatedGrant[]; from: Array<{ userId: string; name: string }> }>();
  for (const r of rows) {
    const leader = r.fromUser as OrgAccessRow & { id: string; firstName: string | null; lastName: string | null };
    const entry = byTo.get(r.toUserId) ?? { grants: [], from: [] };
    entry.grants.push(delegatedGrant(memberAccessOf(leader), leader.role === 'ADMIN'));
    entry.from.push({ userId: leader.id, name: [leader.firstName, leader.lastName].filter(Boolean).join(' ') });
    byTo.set(r.toUserId, entry);
  }
  return new Map([...byTo].map(([id, e]) => [id, { grant: combineGrants(e.grants), from: e.from }]));
}

/** Who ONE member stands in for today, and the grant that gives them. */
export async function standInFor(
  prisma: DelegationPrisma,
  userId: string,
  organizationId: string,
  day: Date,
): Promise<{ grant: DelegatedGrant; from: Array<{ userId: string; name: string }> }> {
  return (
    (await standInsOn(prisma, organizationId, day, userId)).get(userId) ?? {
      grant: { org: {}, perSpace: {} },
      from: [],
    }
  );
}

/**
 * Is one of these people standing in for the other — either way round — around `day` (a day either side, like
 * `STAND_IN_FOR_SUBJECT`)? Two approvals given by a leader and their stand-in are ONE authority, not two.
 */
export async function standInBetween(
  prisma: { approvalDelegation: { count(args: unknown): Promise<number> } },
  organizationId: string,
  userId: string,
  others: string[],
  day: Date,
): Promise<boolean> {
  if (!others.length) return false;
  const DAY = 86_400_000;
  const n = await prisma.approvalDelegation.count({
    where: {
      organizationId,
      revokedAt: null,
      startsOn: { lte: new Date(day.getTime() + DAY) },
      endsOn: { gte: new Date(day.getTime() - DAY) },
      OR: [
        { fromUserId: userId, toUserId: { in: others } },
        { toUserId: userId, fromUserId: { in: others } },
      ],
    },
  });
  return n > 0;
}

/** Does a stand-in grant hold `key` here (or anywhere, with no workspace)? */
export function grantHolds(grant: DelegatedGrant, key: AccessPermissionKey, spaceId?: string | null): boolean {
  if (grant.org[key]) return true;
  if (spaceId) return grant.perSpace[spaceId]?.[key] === true;
  return Object.values(grant.perSpace).some((p) => p[key] === true);
}
