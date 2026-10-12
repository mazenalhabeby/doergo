import { ownsClient, resolveCrmCaps, type CrmCaps, type CrmViewScope, type PermissionSet, type ResolvedAccess } from '../types/permissions';

/**
 * WHERE a member may work the client book — org-wide, and workspace by workspace.
 *
 * `resolveCrmCaps` answers one permission set. A member holds several: their
 * org role, and a space role in each workspace they are assigned to. The CRM
 * read only the first, so a Sales Rep role given in ONE workspace granted
 * nothing while looking configured, and an external member — whose whole
 * authority is a single space role — could never be given clients at all.
 *
 * A client belongs to at most one workspace (`Customer.spaceId`). What a member
 * may do to it is the org caps ∪ the caps of THAT workspace; a client filed in no
 * workspace answers to the org caps alone, because it belongs to all of them and
 * a workspace grant must not reach past its own walls.
 *
 * ⚠️ NO LEGACY BRIDGE PER WORKSPACE. Org-wide, `canManageUsers`/`canViewAllTasks`
 * still read as CRM keys (existing managers keep their book). In a workspace
 * they do not: every space manager and every external supervisor holds them
 * there, and the bridge would have handed each of them that workspace's clients
 * on the day this shipped. A workspace grants CRM only through the crm* keys.
 *
 * ⚠️ A workspace grant counts only where the workspace RUNS the `crm` module —
 * `crmSpaces` is that set, resolved by the caller from the organization's own
 * workspaces (so a cross-org shared space, which also sits in `perSpace`, can
 * never qualify: it is not one of ours).
 *
 * Pure and client-safe: the web and the phone build the same reach from the
 * session to decide what to offer; the server builds it from the database to
 * decide what to allow.
 */
export interface CrmReach {
  /** Org-wide caps (legacy bridge applied). An external member's are always none. */
  org: CrmCaps;
  /** Per-workspace caps from that workspace's crm* keys only. Absent = nothing there. */
  spaces: Record<string, CrmCaps>;
}

export const NO_CRM_CAPS: CrmCaps = Object.freeze({
  view: 'none',
  work: false,
  editInfo: false,
  create: false,
  manage: false,
  canAccess: false,
}) as CrmCaps;

const VIEW_RANK: Record<CrmViewScope, number> = { none: 0, own: 1, all: 2 };

/** The wider of two cap sets — what holding both grants. */
export function mergeCrmCaps(a: CrmCaps, b: CrmCaps | undefined): CrmCaps {
  if (!b) return a;
  const view = VIEW_RANK[a.view] >= VIEW_RANK[b.view] ? a.view : b.view;
  return {
    view,
    work: a.work || b.work,
    editInfo: a.editInfo || b.editInfo,
    create: a.create || b.create,
    manage: a.manage || b.manage,
    canAccess: view !== 'none',
  };
}

export interface CrmReachOptions {
  /**
   * The workspaces (of the caller's OWN organization) that run the `crm`
   * module. A set, an array, or a predicate. Required on purpose: forgetting it
   * must not mean "every workspace".
   */
  crmSpaces: Iterable<string> | ((spaceId: string) => boolean);
  /** An external member holds no org-wide authority — their org caps are none. */
  isExternal?: boolean;
}

/** Build the reach from a resolved session access. */
export function crmReachOf(
  systemRole: string | null | undefined,
  access: Pick<ResolvedAccess, 'org' | 'perSpace'> | null | undefined,
  opts: CrmReachOptions,
): CrmReach {
  const runsCrm =
    typeof opts.crmSpaces === 'function'
      ? opts.crmSpaces
      : ((set) => (id: string) => set.has(id))(new Set(opts.crmSpaces));
  // An admin is never external; an external member is never org-wide anything.
  const org = opts.isExternal && systemRole !== 'ADMIN'
    ? NO_CRM_CAPS
    : resolveCrmCaps(systemRole, access?.org ?? {});
  const spaces: Record<string, CrmCaps> = {};
  for (const spaceId in access?.perSpace ?? {}) {
    if (!runsCrm(spaceId)) continue;
    const caps = resolveCrmCaps(null, (access!.perSpace[spaceId] ?? {}) as PermissionSet, { legacyBridge: false });
    if (caps.canAccess) spaces[spaceId] = caps;
  }
  return { org, spaces };
}

/** A reach made of org caps alone — for a caller whose workspaces do not matter (and tests). */
export function crmReachOrgOnly(org: CrmCaps): CrmReach {
  return { org, spaces: {} };
}

/** What the member may do to a client filed in `spaceId` (null = filed nowhere → org only). */
export function crmCapsIn(reach: CrmReach, spaceId: string | null | undefined): CrmCaps {
  return spaceId ? mergeCrmCaps(reach.org, reach.spaces[spaceId]) : reach.org;
}

/** The widest caps held anywhere — "is there a CRM for me at all", and what to offer. */
export function crmCapsAnywhere(reach: CrmReach): CrmCaps {
  let out = reach.org;
  for (const id in reach.spaces) out = mergeCrmCaps(out, reach.spaces[id]);
  return out;
}

/** May the member see SOMETHING of the client book, anywhere? */
export function crmCanAccess(reach: CrmReach): boolean {
  return crmCapsAnywhere(reach).canAccess;
}

/** The workspaces where a test holds (org-wide grants are not listed here — ask `reach.org`). */
export function crmSpacesWhere(reach: CrmReach, test: (caps: CrmCaps) => boolean): string[] {
  return Object.keys(reach.spaces).filter((id) => { const c = reach.spaces[id]; return !!c && test(c); });
}

/**
 * Where the member may ADD a client: anywhere (org-wide create, a client may be
 * filed nowhere), or only in these workspaces — and then the client must be
 * filed in one of them.
 */
export function crmCreateScope(reach: CrmReach): { anywhere: boolean; spaceIds: string[] } {
  return { anywhere: reach.org.create, spaceIds: crmSpacesWhere(reach, (c) => c.create) };
}

/** May the member reach this client? View-all where it is filed, or own/co-manage it with view-own there. */
export function crmReachesClientIn(
  reach: CrmReach,
  client: { spaceId?: string | null; ownerId?: string | null; managerIds?: string[] | null },
  userId: string | null | undefined,
): boolean {
  const caps = crmCapsIn(reach, client.spaceId);
  if (caps.view === 'all') return true;
  if (caps.view === 'own') return !!userId && ownsClient(client, userId);
  return false;
}

/** Owned or co-managed by this member, as a Prisma `where`. */
export function crmOwnedWhere(userId: string) {
  return { OR: [{ ownerId: userId }, { managerIds: { has: userId } }] };
}

/**
 * `crmReachesClientIn` as a Prisma `where` over customers — ONE rule, so a list
 * and a single-record check cannot disagree. `{}` = every client of the
 * organization (the caller still adds `organizationId`); a where that matches
 * nothing when the member reaches nothing.
 */
export function crmReachWhere(reach: CrmReach, userId: string | null | undefined): Record<string, unknown> {
  if (reach.org.view === 'all') return {};
  const or: Record<string, unknown>[] = [];
  if (reach.org.view === 'own' && userId) or.push(crmOwnedWhere(userId));
  const all = crmSpacesWhere(reach, (c) => c.view === 'all');
  if (all.length) or.push({ spaceId: { in: all } });
  const own = crmSpacesWhere(reach, (c) => c.view === 'own');
  if (own.length && userId) or.push({ spaceId: { in: own }, ...crmOwnedWhere(userId) });
  if (!or.length) return { id: { in: [] as string[] } };
  return or.length === 1 ? or[0]! : { OR: or };
}
