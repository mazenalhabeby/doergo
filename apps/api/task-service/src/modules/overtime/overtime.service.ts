import { Injectable, NotFoundException } from '@nestjs/common';
import { askAboutOwnRequest } from '../approvals/own-request-route';
import {
  success,
  OVERTIME_CONSTANTS,
  scopeWhere,
  type SpaceScopeIds,
  PERSON_BRIEF_SELECT,
  peopleNamesSorted,
} from '@hbcfield/shared';
import { personName } from '@hbcfield/shared';
import { OvertimeBase } from './overtime.base';

@Injectable()
export class OvertimeService extends OvertimeBase {
  /**
   * Technician responds YES or NO to overtime prompt
   *
   * ⚠️ Unreachable today: nothing creates a PENDING_TECHNICIAN round any more —
   * every round is created PENDING_APPROVAL (a request) or APPROVED (a manager
   * adding time) in extra-time.service.ts — so this always answers 404, and the
   * first branch of `checkTimeouts` never matches. Kept while old phones may
   * still call /overtime/respond; it ends a shift through the same close if it
   * ever runs.
   */
  async technicianRespond(data: {
    userId: string;
    response: 'YES' | 'NO';
    reason?: string;
    organizationId: string;
    scopeSpaceIds?: SpaceScopeIds;
  }) {
    const request = await this.prisma.overtimeRequest.findFirst({
      where: {
        technicianId: data.userId,
        status: 'PENDING_TECHNICIAN',
      },
      include: {
        location: { select: { name: true } },
        technician: { select: { firstName: true, lastName: true } },
        timeEntry: true,
      },
    });

    if (!request) {
      throw new NotFoundException('No pending overtime request found');
    }

    const now = new Date();

    if (data.response === 'NO') {
      // Technician declined — clock out
      await this.prisma.overtimeRequest.update({
        where: { id: request.id },
        data: {
          status: 'CANCELED',
          technicianRespondedAt: now,
        },
      });

      await this.endShift(request.timeEntryId, request.organizationId, 'Overtime declined by technician', 'CLOCK_OUT');

      return success({ status: 'CANCELED' }, 'Overtime declined, clocked out');
    }

    // Technician said YES — move to PENDING_APPROVAL
    const approvalTimeoutAt = new Date(now.getTime() + OVERTIME_CONSTANTS.APPROVAL_TIMEOUT_MS);

    await this.prisma.overtimeRequest.update({
      where: { id: request.id },
      data: {
        status: 'PENDING_APPROVAL',
        technicianRespondedAt: now,
        technicianReason: data.reason,
        approvalTimeoutAt,
      },
    });

    /*
      Who is asked: the SAME routing every other attendance notification uses
      (AttendanceService.notifyTargetsFor) — whoever holds canApproveOvertime in
      this workspace by a space role, External Supervisor included; else the
      member's own watchers / configured routing; else nobody.

      It used to be every ADMIN plus everyone with the flat `canViewAllTasks`
      column: the wrong permission (seeing tasks is not approving hours), read
      from the legacy column, and org-wide — the owner was told about every
      shift in every workspace, while the shift leader whose authority comes
      from a space role was never told at all. An unrouted request still shows
      as pending to anybody who looks; what stops is the blast.
    */
    const leaderIds = (
      await this.attendance.notifyTargetsFor(
        { locationId: request.locationId, organizationId: request.organizationId, userId: request.technicianId },
        'canApproveOvertime',
      )
    ).filter((id) => id !== request.technicianId);

    this.notify({
      recipientIds: leaderIds,
      organizationId: request.organizationId,
      kind: 'approvalRequest',
      params: {
        name: personName(request.technician),
        location: request.location.name,
      },
      data: { type: 'overtime.approval_request', overtimeRequestId: request.id },
    });

    this.logger.log(`Overtime ${request.id}: tech said YES, notified ${leaderIds.length} approvers`);

    return success({ status: 'PENDING_APPROVAL', overtimeRequestId: request.id }, 'Overtime request sent for approval');
  }

  /**
   * Check for timed-out overtime requests (runs every minute)
   */
  async checkTimeouts() {
    const now = new Date();
    let processed = 0;

    // 1. Technician didn't respond in 15 min
    const expiredTechRequests = await this.prisma.overtimeRequest.findMany({
      where: {
        status: 'PENDING_TECHNICIAN',
        technicianTimeoutAt: { lt: now },
      },
      include: { technician: { select: { id: true, firstName: true, lastName: true } } },
    });

    for (const req of expiredTechRequests) {
      // Claimed, so two replicas running the sweep cannot both act on one request.
      const claim = await this.prisma.overtimeRequest.updateMany({
        where: { id: req.id, status: 'PENDING_TECHNICIAN' },
        data: { status: 'EXPIRED_NO_RESPONSE' },
      });
      if (claim.count === 0) continue;
      // Unanswered: still clocked in, nudged; nothing after the planned end counts.
      await this.afterRefusal(req.timeEntryId, now);

      this.notify({
        recipientIds: [req.technicianId],
        organizationId: req.organizationId,
        kind: 'expiredPrompt',
        params: {},
        data: { type: 'overtime.expired', overtimeRequestId: req.id },
      });
      processed++;
    }

    // 2. Leader didn't respond in 10 min
    const expiredApprovalRequests = await this.prisma.overtimeRequest.findMany({
      where: {
        status: 'PENDING_APPROVAL',
        approvalTimeoutAt: { lt: now },
      },
    });

    for (const req of expiredApprovalRequests) {
      const claim = await this.prisma.overtimeRequest.updateMany({
        where: { id: req.id, status: 'PENDING_APPROVAL' },
        data: { status: 'EXPIRED_NO_APPROVAL' },
      });
      if (claim.count === 0) continue;
      /*
        Path B: the signature drawn on the technician's phone was never confirmed
        in time. The member stays clocked in (decided 2026-10-18) and is nudged;
        what COUNTS still stops at the planned end, because a request nobody
        approved never moved it.
      */
      await this.afterRefusal(req.timeEntryId, now);

      this.notify({
        recipientIds: [req.technicianId],
        organizationId: req.organizationId,
        kind: 'expiredApproval',
        params: {},
        data: { type: 'overtime.expired', overtimeRequestId: req.id },
      });
      processed++;
    }

    if (processed > 0) {
      this.logger.log(`Overtime timeout check: processed ${processed} expired requests`);
    }

    return success({ processed }, `Timeout check complete`);
  }

  /**
   * Get active overtime request for a technician
   */
  async getActive(data: { userId: string }) {
    const request = await this.prisma.overtimeRequest.findFirst({
      where: {
        technicianId: data.userId,
        status: { in: ['PENDING_TECHNICIAN', 'PENDING_APPROVAL', 'APPROVED'] },
      },
      include: {
        location: { select: { id: true, name: true, timezone: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true } },
        // What the page says under the workspace: the shift's end, or that there was none.
        timeEntry: { select: { clockInAt: true, clockOutAt: true, expectedClockOutAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!request || request.status !== 'PENDING_APPROVAL') {
      return success(request, request ? 'Active overtime request found' : 'No active overtime');
    }

    /*
      WHO it waits for, so the phone can say "Waiting for Anna to approve your
      extra time" instead of "your leader" — the same answer the request was
      sent with (the own-request rule over the workspace's routing).
    */
    const ask = await askAboutOwnRequest(this.prisma, {
      organizationId: request.organizationId,
      subjectId: request.technicianId,
      kind: 'extraTime',
      spaceIds: [request.locationId],
      usual: await this.attendance.notifyTargetsFor(
        { locationId: request.locationId, organizationId: request.organizationId, userId: request.technicianId },
        'canApproveOvertime',
      ),
    });
    const people = ask.ids.length ? await peopleNamesSorted(this.prisma, ask.ids.slice(0, 3)) : [];
    return success(
      {
        ...request,
        askedOf: {
          names: people.map((p) => p.firstName || personName(p)),
          more: Math.max(0, ask.ids.length - people.length),
        },
      },
      'Active overtime request found',
    );
  }

  /**
   * Get pending overtime approvals for admins/dispatchers
   */
  async getPendingApprovals(data: { organizationId: string; scopeSpaceIds?: SpaceScopeIds }) {
    const requests = await this.prisma.overtimeRequest.findMany({
      where: {
        organizationId: data.organizationId,
        status: 'PENDING_APPROVAL',
        ...scopeWhere(data.scopeSpaceIds),
      },
      include: {
        technician: { select: PERSON_BRIEF_SELECT },
        location: { select: { id: true, name: true } },
        // The shift itself. An approver deciding on overtime needs to know how
        // long this person has ALREADY been working — a request after eight
        // hours and one after thirteen are not the same decision, and the
        // screen could not tell them apart.
        timeEntry: { select: { clockInAt: true, clockOutAt: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return success(requests, `${requests.length} pending approvals`);
  }
}
