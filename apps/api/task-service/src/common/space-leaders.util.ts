import { activeAssignmentWhere } from '@hbcfield/shared';

/**
 * "Who leads this workspace?" — one query, asked by attendance (who is told
 * about a late departure, an overtime request) and by assets (who decides a
 * page a driver sent in, who is reminded of a service).
 *
 * The two used to ask it differently. Attendance read every assignment row of
 * the space, so a member who LEFT the workspace last month, a deactivated
 * account, or an external supervisor kept receiving its pushes; assets asked
 * the stricter question. One rule now:
 *
 *   - the assignment is active NOW (`activeAssignmentWhere` — the same window
 *     the clock-in check and the roster use),
 *   - the person is an active member — internal only unless the caller opts
 *     in (`includeExternal`: attendance, for the External Supervisor),
 *   - their space role is active and grants what the caller asks about.
 *
 * `grants` is the caller's question about a role's permissions, so each feature
 * keeps its own meaning of "leads" (canApproveOvertime, canManageAssets, …)
 * while the WHO is decided once.
 *
 * `prisma` is structurally typed so a test double can pass without the module.
 */
export interface SpaceLeadersPrisma {
  spaceAssignment: {
    findMany(args: unknown): Promise<Array<{ userId: string; role: { isActive: boolean; permissions: unknown } | null }>>;
  };
}

export async function spaceRoleHolders(
  prisma: SpaceLeadersPrisma,
  params: {
    organizationId: string;
    spaceId: string | null | undefined;
    grants: (permissions: Record<string, unknown>) => boolean;
    now?: Date;
    /**
     * Count an EXTERNAL member holding the role. Attendance does: the External
     * Supervisor exists precisely to approve overtime and reconcile shifts in
     * the space they supervise, so leaving them off those pushes defeats the
     * role. Assets does not — an outsider never decides about the
     * organization's property.
     */
    includeExternal?: boolean;
  },
): Promise<string[]> {
  if (!params.spaceId) return [];
  const window = activeAssignmentWhere('', params.now ?? new Date());
  const assignments = await prisma.spaceAssignment.findMany({
    where: {
      organizationId: params.organizationId,
      spaceId: params.spaceId,
      roleId: { not: null },
      effectiveFrom: window.effectiveFrom,
      OR: window.OR,
      user: params.includeExternal ? { isActive: true } : { isActive: true, isExternal: false },
    },
    select: { userId: true, role: { select: { isActive: true, permissions: true } } },
    take: 200,
  });
  return [
    ...new Set(
      assignments
        .filter((a) => a.role?.isActive && params.grants((a.role.permissions ?? {}) as Record<string, unknown>))
        .map((a) => a.userId),
    ),
  ];
}
