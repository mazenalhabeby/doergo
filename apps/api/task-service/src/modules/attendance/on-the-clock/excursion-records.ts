import { NotFoundException } from '@nestjs/common';
import { GEOFENCE_EXCURSION, scopeAllows, type AttendanceScope, type PrismaService } from '@hbcfield/shared';
import { OPEN_EXCURSION_STATUSES } from '../core/open-shift-close';

/**
 * Reading a member's away-from-site excursions — what the heartbeat, the batched
 * heartbeat and the excursion decisions share.
 */

/** Latest active excursion for a session (OUT_UNREPORTED / PENDING / APPROVED). */
function activeExcursion(prisma: PrismaService, timeEntryId: string) {
  return prisma.geofenceExcursion.findFirst({
    where: { timeEntryId, status: { in: [...OPEN_EXCURSION_STATUSES] } },
    orderBy: { createdAt: 'desc' },
  });
}

/** Asked-for or granted minutes, made sane: a preset when missing, never past the custom ceiling. */
function clampExcursionMinutes(minutes: number): number {
  const n = Math.round(Number(minutes));
  if (!Number.isFinite(n) || n <= 0) return GEOFENCE_EXCURSION.DURATION_PRESETS[0];
  return Math.min(n, GEOFENCE_EXCURSION.CUSTOM_MAX_MINUTES);
}

/** One excursion of this organization, inside the caller's scope — else not found. */
async function loadOrgExcursion(
  prisma: PrismaService,
  excursionId: string,
  organizationId: string,
  scope?: AttendanceScope,
) {
  const excursion = await prisma.geofenceExcursion.findUnique({ where: { id: excursionId } });
  // An excursion names the space whose ring was left, so the check is direct.
  if (!excursion || excursion.organizationId !== organizationId || !scopeAllows(scope, excursion.spaceId)) {
    throw new NotFoundException('Out-of-ring request not found');
  }
  return excursion;
}

export { activeExcursion, clampExcursionMinutes, loadOrgExcursion };
