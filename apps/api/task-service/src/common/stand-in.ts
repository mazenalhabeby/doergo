import { delegationDay, standInFor, type DelegatedGrant } from '@hbcfield/shared';

/**
 * Today's stand-in grant for one member, for the services that check an
 * approval permission in the DATABASE rather than from the gateway's scope
 * (extra time, a phone-signed overtime). Without this a stand-in would see the
 * leader's items and be refused at the button. Empty when there is none or it
 * cannot be read — a stand-in only ever adds.
 */
export async function standInGrant(prisma: any, userId: string, organizationId: string): Promise<DelegatedGrant> {
  const empty: DelegatedGrant = { org: {}, perSpace: {} };
  if (!userId || !organizationId) return empty;
  try {
    const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { timezone: true } });
    return (await standInFor(prisma, userId, organizationId, delegationDay(new Date(), org?.timezone))).grant;
  } catch {
    return empty;
  }
}
