import { Injectable, BadRequestException } from '@nestjs/common';
import { success, TimeEntryStatus, peopleBriefWithEmail } from '@hbcfield/shared';
import { scopeWhereOn, type AttendanceScope } from '@hbcfield/shared';
import { assertNotSelfDecision } from './self-decision';
import { ATTENDANCE_LOCATION_SELECT } from './attendance-selects';
import { HeartbeatBase } from './heartbeat.base';
import type { GeofenceExcursionStatus } from '@prisma/client';

/**
 * Away from the site during a shift: reporting it, approving or refusing it, the
 * list, and the sweep that expires an unanswered one.
 */
@Injectable()
export class ExcursionsService extends HeartbeatBase {
  /**
   * Employee submits a reason + how long they'll be out → OUT_UNREPORTED → PENDING.
   * Notifies the responsible person(s) to approve/reject.
   */
  async reportExcursion(data: {
    userId: string;
    organizationId: string;
    /** Spaces the caller may read; null/undefined = unnarrowed (own history). */
    scopeSpaceIds?: AttendanceScope;
    reason: string;
    requestedMinutes: number;
  }) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: { userId: data.userId, organizationId: data.organizationId, status: TimeEntryStatus.CLOCKED_IN },
      include: { location: { select: ATTENDANCE_LOCATION_SELECT } },
    });
    if (!entry) throw new BadRequestException('You are not currently clocked in');

    const active = await this.getActiveExcursion(entry.id);
    if (!active || active.status !== 'OUT_UNREPORTED') {
      throw new BadRequestException('No pending out-of-ring warning to report');
    }

    const minutes = this.clampExcursionMinutes(data.requestedMinutes);
    // Atomic guard: only flip if it's still OUT_UNREPORTED.
    const res = await this.prisma.geofenceExcursion.updateMany({
      where: { id: active.id, status: 'OUT_UNREPORTED' },
      data: {
        status: 'PENDING',
        reason: data.reason?.trim() || null,
        requestedMinutes: minutes,
        reportedAt: new Date(),
      },
    });
    if (res.count === 0) throw new BadRequestException('This warning was already handled');

    const updated = await this.prisma.geofenceExcursion.findUnique({ where: { id: active.id } });
    await this.emitExcursionEvent('geofence_excursion_requested', entry, updated!, {
      distanceM: updated?.lastDistanceM ?? undefined,
    });
    return success(updated, 'Out-of-ring reason submitted');
  }

  /**
   * Approver approves an out-of-ring request (optionally adjusting the granted
   * time) → PENDING → APPROVED with a countdown to expiresAt.
   */
  async approveExcursion(data: {
    /** Spaces the caller may act in; null = org-wide, [] = none. */
    scopeSpaceIds?: AttendanceScope;
    excursionId: string;
    approverId: string;
    organizationId: string;
    grantedMinutes?: number;
  }) {
    const excursion = await this.loadOrgExcursion(data.excursionId, data.organizationId, data.scopeSpaceIds);
    if (excursion.status !== 'PENDING') {
      throw new BadRequestException('This request is no longer pending');
    }
    // Nobody sanctions their own time away from the site — the rule every other approval follows.
    await assertNotSelfDecision(this.prisma as never, {
      deciderId: data.approverId,
      subjectId: excursion.userId,
      organizationId: data.organizationId,
      message: 'You cannot approve your own request to leave the site. Ask a manager or an administrator.',
    });
    const minutes = this.clampExcursionMinutes(data.grantedMinutes ?? excursion.requestedMinutes ?? 0);
    const expiresAt = new Date(Date.now() + minutes * 60_000);

    const res = await this.prisma.geofenceExcursion.updateMany({
      where: { id: excursion.id, status: 'PENDING' },
      data: {
        status: 'APPROVED',
        grantedMinutes: minutes,
        expiresAt,
        decidedAt: new Date(),
        approvedById: data.approverId,
        timerExpired: false,
      },
    });
    if (res.count === 0) throw new BadRequestException('This request was already handled');

    const entry = await this.prisma.timeEntry.findUnique({
      where: { id: excursion.timeEntryId },
      include: { location: { select: ATTENDANCE_LOCATION_SELECT } },
    });
    const updated = await this.prisma.geofenceExcursion.findUnique({ where: { id: excursion.id } });
    if (entry) await this.emitExcursionEvent('geofence_excursion_approved', entry, updated!, {});
    return success(updated, 'Out-of-ring request approved');
  }

  /**
   * Approver rejects an out-of-ring request → PENDING → REJECTED, then clocks the
   * worker out (the ONLY automatic clock-out in this workflow).
   */
  async rejectExcursion(data: {
    /** Spaces the caller may act in; null = org-wide, [] = none. */
    scopeSpaceIds?: AttendanceScope;
    excursionId: string;
    approverId: string;
    organizationId: string;
  }) {
    const excursion = await this.loadOrgExcursion(data.excursionId, data.organizationId, data.scopeSpaceIds);
    if (excursion.status !== 'PENDING') {
      throw new BadRequestException('This request is no longer pending');
    }
    await assertNotSelfDecision(this.prisma as never, {
      deciderId: data.approverId,
      subjectId: excursion.userId,
      organizationId: data.organizationId,
      message: 'You cannot decide your own request to leave the site. Ask a manager or an administrator.',
    });
    const res = await this.prisma.geofenceExcursion.updateMany({
      where: { id: excursion.id, status: 'PENDING' },
      data: { status: 'REJECTED', decidedAt: new Date(), resolvedAt: new Date(), approvedById: data.approverId },
    });
    if (res.count === 0) throw new BadRequestException('This request was already handled');

    const entry = await this.prisma.timeEntry.findUnique({
      where: { id: excursion.timeEntryId },
      include: { location: { select: ATTENDANCE_LOCATION_SELECT } },
    });
    const updated = await this.prisma.geofenceExcursion.findUnique({ where: { id: excursion.id } });
    if (entry) await this.emitExcursionEvent('geofence_excursion_rejected', entry, updated!, {});

    // Clock the worker out (geofence-exempt; no GPS available server-side).
    try {
      await this.clockOuts.clockOut({
        userId: excursion.userId,
        organizationId: data.organizationId,
        notes: 'Out-of-ring request rejected',
      });
    } catch (err) {
      // Already clocked out (returned / session ended) — the rejection stands.
      this.logger.warn(`rejectExcursion: clock-out skipped for ${excursion.userId}: ${(err as Error).message}`);
    }
    return success(updated, 'Out-of-ring request rejected');
  }

  /** Approver surface: active (PENDING/APPROVED) excursions for the org. */
  async listActiveExcursions(data: {
    organizationId: string;
    status?: 'active' | 'pending' | 'approved';
    scopeSpaceIds?: AttendanceScope;
  }) {
    const statusFilter: GeofenceExcursionStatus[] =
      data.status === 'pending' ? ['PENDING'] : data.status === 'approved' ? ['APPROVED'] : ['PENDING', 'APPROVED'];

    const rows = await this.prisma.geofenceExcursion.findMany({
      where: {
        organizationId: data.organizationId,
        status: { in: statusFilter },
        // GeofenceExcursion names its own space, so it narrows on `spaceId`
        // rather than the `locationId` a time entry uses.
        ...scopeWhereOn('spaceId', data.scopeSpaceIds),
      },
      orderBy: [{ status: 'asc' }, { reportedAt: 'desc' }, { leftRingAt: 'desc' }],
      take: 200,
    });

    // Hydrate user + space (kept off the model to avoid extra FKs; small N).
    const userIds = [...new Set(rows.map((r) => r.userId))];
    const spaceIds = [...new Set(rows.map((r) => r.spaceId))];
    const [users, spaces] = await Promise.all([
      peopleBriefWithEmail(this.prisma, userIds),
      this.prisma.companyLocation.findMany({ where: { id: { in: spaceIds } }, select: { id: true, name: true } }),
    ]);
    const userById = new Map(users.map((u) => [u.id, u]));
    const spaceById = new Map(spaces.map((s) => [s.id, s]));

    return success(
      rows.map((r) => ({ ...r, user: userById.get(r.userId) ?? null, space: spaceById.get(r.spaceId) ?? null })),
    );
  }

  /**
   * Sweep safety-net: flag APPROVED excursions whose grace timer lapsed so the
   * approver sees it even if the phone stopped heart-beating. Does NOT clock
   * anyone out and does NOT decide "still out" (no GPS server-side) — the
   * authoritative EXPIRED→new-cycle happens on the next heartbeat.
   */
  async sweepExpiredExcursions() {
    const now = new Date();
    const due = await this.prisma.geofenceExcursion.findMany({
      where: { status: 'APPROVED', timerExpired: false, expiresAt: { lt: now } },
      take: 200,
    });
    if (due.length === 0) return { flagged: 0 };

    for (const ex of due) {
      const res = await this.prisma.geofenceExcursion.updateMany({
        where: { id: ex.id, status: 'APPROVED', timerExpired: false },
        data: { timerExpired: true },
      });
      if (res.count === 0) continue;
      const entry = await this.prisma.timeEntry.findUnique({
        where: { id: ex.timeEntryId },
        include: { location: { select: ATTENDANCE_LOCATION_SELECT } },
      });
      if (entry) await this.emitExcursionEvent('geofence_excursion_expired', entry, ex, {});
    }
    this.logger.log(`Geofence excursion sweep: flagged ${due.length} lapsed timer(s)`);
    return { flagged: due.length };
  }
}
