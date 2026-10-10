import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AttendanceService } from '../attendance/attendance.service';
import {
  success,
  SERVICE_NAMES,
  QUEUE_NAMES,
  OVERTIME_CONSTANTS,
  TimeEntryStatus,
  scopeWhere,
  type SpaceScopeIds,
  OVERTIME_NOTICE_EVENT,
  type OvertimeNotice,
  paginated,
  PERSON_BRIEF_SELECT,
} from '@hbcfield/shared';
import { clampListLimit, clampListPage, personName } from '@hbcfield/shared';

/** How long the person who signed on a technician's phone has to confirm it from their own. */
const SIGNED_CONFIRM_WINDOW_MINUTES = 30;

@Injectable()
export class OvertimeService {
  private readonly logger = new Logger(OvertimeService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION)
    private readonly notificationClient: ClientProxy,
    @InjectQueue(QUEUE_NAMES.OVERTIME)
    private readonly overtimeQueue: Queue,
    private readonly attendance: AttendanceService,
  ) {}

  /**
   * Every push this flow sends, as a catalogue reference (shared
   * attendance/overtime-notice.ts). Never a sentence: the notification service
   * writes it in each reader's language. Nobody to tell → nothing emitted.
   */
  private notify(notice: Omit<OvertimeNotice, 'recipientIds'> & { recipientIds: string[] }): void {
    if (notice.recipientIds.length === 0) return;
    this.notificationClient.emit(OVERTIME_NOTICE_EVENT, notice satisfies OvertimeNotice);
  }

  /**
   * Technician responds YES or NO to overtime prompt
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

      await this.clockOutEntry(request.timeEntryId, request.organizationId, 'Overtime declined by technician');

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
   * Team leader approves remotely (Path A)
   */
  async leaderApprove(data: {
    /** Spaces the caller may act in; null = org-wide, [] = none. */
    scopeSpaceIds?: SpaceScopeIds;
    overtimeRequestId: string;
    approverId: string;
    maxDurationMinutes: number;
    notes?: string;
    organizationId: string;
  }) {
    const request = await this.findPendingApproval(data.overtimeRequestId, data.organizationId, data.scopeSpaceIds);
    // Confirming a signature they drew on the technician's phone: the approval
    // is the signed one — their signature, the minutes they agreed on there.
    const confirmsOwnSignature = !!request.leaderSignature && request.signedById === data.approverId;
    return this.approveRequest(request, {
      approverId: data.approverId,
      maxDurationMinutes: data.maxDurationMinutes ?? request.maxDurationMinutes ?? 0,
      notes: data.notes ?? request.approverNotes ?? undefined,
      method: confirmsOwnSignature ? 'SIGNATURE' : 'REMOTE',
      leaderName: confirmsOwnSignature ? request.leaderName ?? undefined : undefined,
      leaderSignature: confirmsOwnSignature ? request.leaderSignature ?? undefined : undefined,
    });
  }

  /**
   * Team leader approves with signature on technician's phone (Path B)
   */
  async leaderApproveSignature(data: {
    overtimeRequestId: string;
    approverId: string;
    leaderName: string;
    leaderSignature: string;
    maxDurationMinutes: number;
    notes?: string;
    userId: string; // technician's userId (request comes from their device)
    organizationId: string;
    scopeSpaceIds?: SpaceScopeIds;
  }) {
    const request = await this.findPendingApproval(data.overtimeRequestId, data.organizationId, data.scopeSpaceIds);

    /*
      Path B is signed on the technician's OWN phone, about their OWN shift.
      Without this, any member could approve a colleague's overtime by naming a
      real approver — the approver check below says who may approve, not whose
      request this is. Not found, not forbidden: a 403 would confirm it exists.
    */
    if (request.technicianId !== data.userId) {
      throw new NotFoundException('Overtime request not found or not pending approval');
    }

    /*
      Is the person whose signature this is allowed to approve it?

      Path B is signed on the TECHNICIAN's device, so the request is
      authenticated as the technician and names the approver in the body. This
      is the only thing standing between that and any member naming anyone.

      It used to test `canViewAllTasks` — the wrong permission, and read from
      the flat ORG column. Two consequences: somebody who may merely SEE all
      tasks counted as an approver, and a shift leader or site supervisor whose
      `canApproveOvertime` comes from a SPACE role was refused outright, which
      is exactly the person standing next to the technician holding the phone.
      They are the whole reason Path B exists.

      Now it asks the permission the other approval routes ask, and accepts it
      held org-wide OR in the space this request belongs to.
    */
    const approver = await this.prisma.user.findFirst({
      where: { id: data.approverId, organizationId: data.organizationId, isActive: true },
      // `canApproveOvertime` is not a column — the five flat ones are the legacy
      // set. It lives in a role's permission JSON, org-wide via memberRole or
      // per-space via the assignment's role.
      select: { id: true, role: true, memberRole: { select: { permissions: true } } },
    });
    if (!approver) {
      throw new BadRequestException('Invalid approver — must be an active member of this organization');
    }

    const orgWide =
      approver.role === 'ADMIN' ||
      (approver.memberRole?.permissions as Record<string, unknown> | null)?.canApproveOvertime === true;

    if (!orgWide) {
      // Does a space role grant it where this overtime actually happened?
      const grantedHere = request.locationId
        ? await this.prisma.spaceAssignment.findFirst({
            where: {
              userId: approver.id,
              spaceId: request.locationId,
              OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
              role: { permissions: { path: ['canApproveOvertime'], equals: true } },
            },
            select: { id: true },
          })
        : null;
      if (!grantedHere) {
        throw new BadRequestException('That person may not approve overtime here');
      }
    }

    /*
      ⚠️ A SIGNATURE ON THIS PHONE IS A REQUEST, NOT AN APPROVAL.

      The request is authenticated as the TECHNICIAN; the approver is only a
      name they picked from a list and a drawing anybody can make. Approving
      on that alone let a member approve their own overtime by naming a
      supervisor. So the signature is kept, addressed to that person, and they
      confirm it from their own session — the same route as a remote approval
      (`leaderApprove`), which then records it as a signed approval. Nothing is
      counted until they do. Works offline: the phone queues this call as before.
    */
    const signedAt = new Date();
    await this.prisma.overtimeRequest.update({
      where: { id: request.id },
      data: {
        leaderName: data.leaderName,
        leaderSignature: data.leaderSignature,
        maxDurationMinutes: Math.min(data.maxDurationMinutes, OVERTIME_CONSTANTS.MAX_OVERTIME_DURATION_MINUTES),
        approverNotes: data.notes ?? null,
        signedById: approver.id,
        signedAt,
        // The person who signed is standing there; give them time to confirm before the
        // auto clock-out — ONCE. Signing again must not keep postponing the deadline.
        ...(request.signedAt ? {} : { approvalTimeoutAt: new Date(signedAt.getTime() + SIGNED_CONFIRM_WINDOW_MINUTES * 60_000) }),
      },
    });
    // Asked once per signer: a repeated signature does not push them again.
    if (!request.signedAt || request.signedById !== approver.id) {
      this.notify({
        recipientIds: [approver.id],
        organizationId: data.organizationId,
        kind: 'confirmSignature',
        params: {},
        data: { type: 'overtime.approval_request', overtimeRequestId: request.id },
      });
    }
    return success(
      { status: 'PENDING_APPROVAL', overtimeRequestId: request.id, awaitingConfirmationBy: approver.id },
      'Signed — waiting for the approver to confirm',
    );
  }

  /**
   * Team leader rejects overtime request
   */
  async leaderReject(data: {
    /** Spaces the caller may act in; null = org-wide, [] = none. */
    scopeSpaceIds?: SpaceScopeIds;
    overtimeRequestId: string;
    approverId: string;
    reason: string;
    organizationId: string;
  }) {
    const request = await this.findPendingApproval(data.overtimeRequestId, data.organizationId, data.scopeSpaceIds);
    const now = new Date();

    await this.prisma.overtimeRequest.update({
      where: { id: request.id },
      data: {
        status: 'REJECTED',
        approvedById: data.approverId,
        rejectedAt: now,
        rejectionReason: data.reason,
      },
    });

    // Clock out the technician
    await this.clockOutEntry(request.timeEntryId, data.organizationId, `Overtime rejected: ${data.reason}`);

    // Notify technician
    this.notify({
      recipientIds: [request.technicianId],
      organizationId: data.organizationId,
      kind: 'rejected',
      params: { reason: data.reason },
      data: { type: 'overtime.rejected', overtimeRequestId: request.id },
    });

    return success({ status: 'REJECTED' }, 'Overtime request rejected');
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
      await this.prisma.overtimeRequest.update({
        where: { id: req.id },
        data: { status: 'EXPIRED_NO_RESPONSE' },
      });
      await this.clockOutEntry(req.timeEntryId, req.organizationId, 'Auto clock-out: no response to overtime prompt');

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
      await this.prisma.overtimeRequest.update({
        where: { id: req.id },
        data: { status: 'EXPIRED_NO_APPROVAL' },
      });
      await this.clockOutEntry(req.timeEntryId, req.organizationId, 'Auto clock-out: overtime approval expired');

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
        location: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return success(request, request ? 'Active overtime request found' : 'No active overtime');
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

  /**
   * Get overtime history
   */
  async getHistory(data: {
    /** Spaces the caller may act in; null = org-wide, [] = none. */
    scopeSpaceIds?: SpaceScopeIds;
    organizationId: string;
    technicianId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const page = clampListPage(data.page);
    const limit = clampListLimit(data.limit, 20);
    const where: any = { organizationId: data.organizationId, ...scopeWhere(data.scopeSpaceIds) };
    if (data.technicianId) where.technicianId = data.technicianId;
    if (data.status) where.status = data.status;

    const [requests, total] = await Promise.all([
      this.prisma.overtimeRequest.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          technician: { select: { id: true, firstName: true, lastName: true } },
          location: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, firstName: true, lastName: true } },
          // So history can say how much overtime was actually worked, rather
          // than only that it happened.
          timeEntry: { select: { clockInAt: true, clockOutAt: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.overtimeRequest.count({ where }),
    ]);

    // The shared meta (`paginated`), nested under `data` as this route always answered.
    const { data: rows, meta } = paginated(requests, { page, limit, total });
    return success({ data: rows, meta });
  }

  // =========================================================================
  // PRIVATE HELPERS
  // =========================================================================

  private async findPendingApproval(requestId: string, organizationId: string, scope?: SpaceScopeIds) {
    const request = await this.prisma.overtimeRequest.findFirst({
      where: {
        id: requestId,
        organizationId,
        status: 'PENDING_APPROVAL',
        // Only the caller's granted spaces. One loader serves approve and
        // reject, so the check cannot be present on one and missing from the
        // other — a request outside their spaces reads as 'not found'.
        ...scopeWhere(scope),
      },
    });
    if (!request) {
      throw new NotFoundException('Overtime request not found or not pending approval');
    }
    return request;
  }

  /*
    ⚠️ APPROVING IS ONE RULE, AND IT LIVES IN ATTENDANCE.

    This used to mark the round APPROVED from the click, schedule a job that
    clocked the member out when the minutes ran out, and never touch the shift.
    Counted time stops at `expectedClockOutAt`, so an approval from the web
    Overtime page or a signature read "Approved" and counted nothing — and on a
    shift sent in the next day from a phone without signal, the job had nobody
    to clock out and recorded minutes since the click. The phone's extra-time
    screen already did it right: minutes from the shift end, the expected end
    moved, a closed shift recounted. Every approval goes through that now.
  */
  private async approveRequest(
    request: { id: string; timeEntryId: string; organizationId: string },
    approval: {
      approverId: string;
      maxDurationMinutes: number;
      notes?: string;
      method: 'REMOTE' | 'SIGNATURE';
      leaderName?: string;
      leaderSignature?: string;
    },
  ) {
    const minutes = Math.min(approval.maxDurationMinutes, OVERTIME_CONSTANTS.MAX_OVERTIME_DURATION_MINUTES);
    const result = await this.attendance.approveExtraTime({
      approverId: approval.approverId,
      entryId: request.timeEntryId,
      minutes,
      organizationId: request.organizationId,
      signature: approval.method === 'SIGNATURE' ? approval.leaderSignature ?? null : null,
      notes: approval.notes ?? null,
    });
    if (approval.leaderName) {
      await this.prisma.overtimeRequest.update({ where: { id: request.id }, data: { leaderName: approval.leaderName } });
    }

    this.logger.log(`Overtime ${request.id} approved: ${minutes} min by ${approval.approverId} via ${approval.method}`);
    return result;
  }

  private async clockOutEntry(timeEntryId: string, organizationId: string, notes: string) {
    const entry = await this.prisma.timeEntry.findUnique({ where: { id: timeEntryId } });
    if (!entry || entry.status !== TimeEntryStatus.CLOCKED_IN) return;

    const now = new Date();
    const totalMinutes = Math.round((now.getTime() - entry.clockInAt.getTime()) / 60000);
    const existingFlags = (entry as any).flagReasons || [];

    await this.prisma.timeEntry.update({
      where: { id: timeEntryId },
      data: {
        status: TimeEntryStatus.AUTO_OUT,
        clockOutAt: now,
        totalMinutes,
        notes,
        flagReasons: [...new Set([...existingFlags, 'MISSED_CLOCK_OUT'])],
        approvalStatus: 'PENDING',
      },
    });
  }
}
