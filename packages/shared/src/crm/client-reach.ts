import { ORG_ACCESS_SELECT, memberAccessOf, type OrgAccessRow } from '../access/org-access';
import { effectiveSpaceModules } from '../types';
import { crmReachOf, crmReachOrgOnly, NO_CRM_CAPS, type CrmReach } from './crm-reach';

/**
 * A member's CRM reach, read from the DATABASE — the CRM's own rule
 * (auth-service `CustomersService.crmReachFor`) and every other service that
 * shows a client (the job report, the calendar) asking it the same way.
 *
 * "Reads the client book" is not the same thing: a rep with own-scope CRM reads
 * THEIR clients, a workspace grant reads THAT workspace's, and an event they
 * were invited to by somebody else must not hand them the name of a client they
 * cannot open.
 *
 * ⚠️ Through `memberAccessOf`, THE access resolver: an inactive role grants
 * nothing, the legacy columns count only until ACCESS_IGNORE_LEGACY_FLAGS
 * retires them, and an ADMIN holds everything. The CRM used to read
 * `memberRole.permissions` by hand and honoured a role that had been switched
 * off.
 *
 * ⚠️ The workspaces come from the organization's OWN rows (the relation on the
 * assignment), active ones only, with the module set the workspace really runs
 * (its own, else the organization's). Built from the database rather than a
 * session payload so no caller can hand a service a reach it assembled itself.
 */
export function crmReachSelect(now: Date = new Date()) {
  return {
    ...ORG_ACCESS_SELECT,
    isExternal: true,
    organizationId: true,
    organization: { select: { enabledModules: true } },
    spaceAssignments: {
      // The same window the session uses (activeAssignmentWhere, minus the user).
      where: { effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] },
      select: {
        spaceId: true,
        role: { select: { permissions: true, isActive: true } },
        space: { select: { organizationId: true, isActive: true, enabledModules: true } },
      },
    },
  };
}

export interface CrmReachRow extends Omit<OrgAccessRow, 'spaceAssignments'> {
  isExternal?: boolean | null;
  organizationId?: string | null;
  organization?: { enabledModules: unknown } | null;
  spaceAssignments?: Array<{
    spaceId: string;
    role?: { permissions: unknown; isActive: boolean } | null;
    space?: { organizationId: string; isActive: boolean; enabledModules: unknown } | null;
  }>;
}

/** The reach from a row loaded with `crmReachSelect`; no row = no CRM at all. */
export function crmReachOfRow(row: CrmReachRow | null | undefined): CrmReach {
  if (!row) return crmReachOrgOnly(NO_CRM_CAPS);
  const orgModules = row.organization?.enabledModules;
  const crmSpaces = new Set(
    (row.spaceAssignments ?? [])
      .filter((a) => a.space && a.space.isActive && a.space.organizationId === row.organizationId)
      .filter((a) => effectiveSpaceModules(a.space!.enabledModules, orgModules).includes('crm'))
      .map((a) => a.spaceId),
  );
  const access = memberAccessOf({
    ...row,
    spaceAssignments: (row.spaceAssignments ?? []).map((a) => ({ spaceId: a.spaceId, role: a.role })),
  });
  return crmReachOf(row.role, access, { crmSpaces, isExternal: !!row.isExternal });
}
