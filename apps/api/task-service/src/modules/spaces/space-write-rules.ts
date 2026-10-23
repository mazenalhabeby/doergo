import { BadRequestException } from '@nestjs/common';
import {
  PrismaService,
  validateGeofencePolygon,
  type GeofencePolygonError,
  COST_ON_PROFILE_MESSAGE,
  writeRateChange,
  RateChangeError,
  usableLegalEntityId,
  COMPANY_UNKNOWN_MESSAGE,
} from '@hbcfield/shared';

/** What creating and updating a workspace both check: its company, its drawn boundary and its rates. */

/** A workspace's company: one of this organization's active companies, or null. Anything else is refused. */
export async function spaceCompany(
  prisma: PrismaService,
  organizationId: string,
  value: unknown,
): Promise<string | null | undefined> {
  const r = await usableLegalEntityId(prisma, organizationId, value);
  if (!r.ok) throw new BadRequestException({ message: COMPANY_UNKNOWN_MESSAGE, code: 'COMPANY_UNKNOWN' });
  return r.id;
}

/**
 * A drawn boundary decides whether people can start their shift, and it
 * arrives as free-form JSON, so it is validated here rather than trusted.
 *
 * The area cap is the security-relevant one: a boundary drawn around half a
 * city would leave the control looking configured while accepting anybody
 * anywhere. The vertex cap bounds the stored JSON and the per-clock-in scan.
 *
 * `null` clears the boundary and returns the site to its radius.
 */
export function cleanPolygon(input: unknown): { lat: number; lng: number }[] | null {
  if (input === null || input === undefined) return null;

  const result = validateGeofencePolygon(input);
  if (result.ok) return result.ring;

  const reason: Record<GeofencePolygonError, string> = {
    TOO_FEW_POINTS: 'A site boundary needs at least three points.',
    TOO_MANY_POINTS: 'A site boundary can have at most 60 points.',
    INVALID_COORDINATE: 'The site boundary contains a point that is not a valid coordinate.',
    AREA_TOO_LARGE:
      'That boundary covers more than 5 km² — too large to be a single site. Draw the property, not the district.',
  };
  throw new BadRequestException(reason[result.error]);
}

/**
 * A workspace's hourly rates, through the shared dated writer.
 *
 * Undefined leaves a rate alone; null clears it back to "inherit". Each one
 * written is a history row from `rateEffectiveFrom` (default today) and then
 * the column set to whatever is in force today — in one transaction.
 */
export async function writeSpaceRates(
  prisma: PrismaService,
  spaceId: string,
  organizationId: string,
  data: { billableRateCents?: number | null; costRateCents?: number | null; rateEffectiveFrom?: string },
  createdById?: string,
) {
  if (data.billableRateCents === undefined && data.costRateCents === undefined) return;
  // What a person costs lives on their profile (rate-ladder LEVELS_BY_KIND), never on a workspace.
  if (data.costRateCents !== undefined) throw new BadRequestException(COST_ON_PROFILE_MESSAGE);
  try {
    await prisma.$transaction(async (tx) => {
      const patch: Record<string, number | null> = {};
      const write = (kind: 'BILL_HOUR' | 'COST_HOUR', cents: number | null | undefined) =>
        writeRateChange(tx, {
          organizationId,
          target: 'SPACE',
          targetId: spaceId,
          kind,
          cents,
          effectiveFrom: data.rateEffectiveFrom,
          createdById: createdById ?? null,
        });
      if (data.billableRateCents !== undefined)
        patch.billableRateCents = (await write('BILL_HOUR', data.billableRateCents)).nowCents;
      if (data.costRateCents !== undefined)
        patch.costRateCents = (await write('COST_HOUR', data.costRateCents)).nowCents;
      await tx.companyLocation.update({ where: { id: spaceId }, data: patch });
    });
  } catch (e) {
    if (e instanceof RateChangeError) throw new BadRequestException(e.message);
    throw e;
  }
}
