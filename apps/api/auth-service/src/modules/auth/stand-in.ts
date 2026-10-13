import { delegationDay, standInFor, withStandIn, type ResolvedAccess } from '@hbcfield/shared';

/**
 * A session's access with today's stand-ins added (shared `access/delegation.ts`).
 *
 * ⚠️ THREE places build a request context — login, refresh, validate. All
 * three call this, or a stand-in would see the leader's lists on one path and
 * be refused on another. One indexed query; nothing for the vast majority.
 */
export async function sessionAccess(
  prisma: unknown,
  user: { id: string; organizationId?: string | null },
  timeZone: string | null | undefined,
  access: ResolvedAccess,
): Promise<ResolvedAccess> {
  if (!user.organizationId) return access;
  try {
    const { grant, from } = await standInFor(prisma as never, user.id, user.organizationId, delegationDay(new Date(), timeZone));
    return withStandIn(access, grant, from);
  } catch {
    // A stand-in is an addition: when it cannot be read, the member keeps exactly their own access.
    return access;
  }
}
