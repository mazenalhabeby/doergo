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
import {
  success,
  SERVICE_NAMES,
  QUEUE_NAMES,
  OVERTIME_JOB_TYPES,
  OVERTIME_CONSTANTS,
  TimeEntryStatus,
} from '@hbcfield/shared';

@Injectable()
export class OvertimeService {
  private readonly logger = new Logger(OvertimeService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION)
    private readonly notificationClient: ClientProxy,
    @InjectQueue(QUEUE_NAMES.OVERTIME)
    private readonly overtimeQueue: Queue,
  ) {}

  /**
   * Initiate an overtime request when shift ends.
   * Called by autoClockOut instead of immediate clock-out.
   */
  async initiateRequest(data: {
    userId: string;
    timeEntryId: string;
    locationId: string;
    organizationId: string;
  }) {
    this.logger.log(`Initiating overtime request for user ${data.userId}, entry ${data.timeEntryId}`);

    // Check if request already exists for this entry
    const existing = await this.prisma.overtimeRequest.findUnique({
      where: { timeEntryId: data.timeEntryId },
    });
    if (existing) {
      this.logger.debug(`Overtime request already exists for entry ${data.timeEntryId}`);
      return success(existing, 'Overtime request already exists');
    }

    const now = new Date();
    const technicianTimeoutAt = new Date(now.getTime() + OVERTIME_CONSTANTS.TECHNICIAN_RESPONSE_TIMEOUT_MS);

    const request = await this.prisma.overtimeRequest.create({
      data: {
        technicianId: data.userId,
        timeEntryId: data.timeEntryId,
        locationId: data.locationId,
        organizationId: data.organizationId,
        status: 'PENDING_TECHNICIAN',
        technicianTimeoutAt,
      },
      include: {
        location: { select: { name: true } },
        technician: { select: { firstName: true, lastName: true } },
      },
    });

    // Send push notification to technician
    this.notificationClient.emit('push_notification', {
      userId: data.userId,
      title: 'Shift Ended',
      body: `Your shift at ${request.location.name} has ended. Do you need overtime?`,
      data: {
        type: 'overtime.shift_ended_prompt',
        overtimeRequestId: request.id,
        action: 'overtime_prompt',
      },
    });

    this.logger.log(`Overtime request ${request.id} created, tech has ${OVERTIME_CONSTANTS.TECHNICIAN_RESPONSE_TIMEOUT_MS / 60000} min to respond`);

    return success(request, 'Overtime request initiated');
  }

  /**
   * Technician responds YES or NO to overtime prompt
   */
  async technicianRespond(data: {
    userId: string;
    response: 'YES' | 'NO';
    reason?: string;
    organizationId: string;
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

    // Notify all admins and dispatchers in the org
    const leaders = await this.prisma.user.findMany({
      where: {
        organizationId: data.organizationId,
        role: { in: ['ADMIN', 'DISPATCHER'] },
        isActive: true,
      },
      select: { id: true },
    });

    for (const leader of leaders) {
      this.notificationClient.emit('push_notification', {
        userId: leader.id,
        title: 'Overtime Request',
        body: `${request.technician.firstName} ${request.technician.lastName} requests overtime at ${request.location.name}`,
        data: {
          type: 'overtime.approval_request',
          overtimeRequestId: request.id,
        },
      });
    }

    this.logger.log(`Overtime ${request.id}: tech said YES, notified ${leaders.length} leaders`);

    return success({ status: 'PENDING_APPROVAL', overtimeRequestId: request.id }, 'Overtime request sent for approval');
  }

  /**
   * Team leader approves remotely (Path A)
   */
  async leaderApprove(data: {
    overtimeRequestId: string;
    approverId: string;
    maxDurationMinutes: number;
    notes?: string;
    organizationId: string;
  }) {
    const request = await this.findPendingApproval(data.overtimeRequestId, data.organizationId);
    return this.approveRequest(request, {
      approverId: data.approverId,
      maxDurationMinutes: data.maxDurationMinutes,
      notes: data.notes,
      method: 'REMOTE',
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
  }) {
    const request = await this.findPendingApproval(data.overtimeRequestId, data.organizationId);

    // Verify the approver is an ADMIN or DISPATCHER in the same org
    const approver = await this.prisma.user.findFirst({
      where: {
        id: data.approverId,
        organizationId: data.organizationId,
        role: { in: ['ADMIN', 'DISPATCHER'] },
        isActive: true,
      },
    });
    if (!approver) {
      throw new BadRequestException('Invalid approver — must be an active admin or dispatcher in the same organization');
    }

    return this.approveRequest(request, {
      approverId: data.approverId,
      maxDurationMinutes: data.maxDurationMinutes,
      notes: data.notes,
      method: 'SIGNATURE',
      leaderName: data.leaderName,
      leaderSignature: data.leaderSignature,
    });
  }

  /**
   * Team leader rejects overtime request
   */
  async leaderReject(data: {
    overtimeRequestId: string;
    approverId: string;
    reason: string;
    organizationId: string;
  }) {
    const request = await this.findPendingApproval(data.overtimeRequestId, data.organizationId);
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
    this.notificationClient.emit('push_notification', {
      userId: request.technicianId,
      title: 'Overtime Rejected',
      body: `Your overtime request was rejected: ${data.reason}`,
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

      this.notificationClient.emit('push_notification', {
        userId: req.technicianId,
        title: 'Auto Clock-Out',
        body: 'You were automatically clocked out because the overtime prompt expired.',
        data: { type: 'overtime.expired' },
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

      this.notificationClient.emit('push_notification', {
        userId: req.technicianId,
        title: 'Auto Clock-Out',
        body: 'You were automatically clocked out because the overtime approval expired.',
        data: { type: 'overtime.expired' },
      });
      processed++;
    }

    if (processed > 0) {
      this.logger.log(`Overtime timeout check: processed ${processed} expired requests`);
    }

    return success({ processed }, `Timeout check complete`);
  }

  /**
   * End an approved overtime session (called by delayed BullMQ job)
   */
  async endOvertime(data: { overtimeRequestId: string }) {
    const request = await this.prisma.overtimeRequest.findUnique({
      where: { id: data.overtimeRequestId },
      include: { technician: { select: { id: true, firstName: true } } },
    });

    if (!request || request.status !== 'APPROVED') {
      return success({ skipped: true }, 'Overtime already ended or not approved');
    }

    const now = new Date();
    const overtimeMinutes = request.overtimeStartAt
      ? Math.round((now.getTime() - request.overtimeStartAt.getTime()) / 60000)
      : 0;

    await this.prisma.overtimeRequest.update({
      where: { id: request.id },
      data: {
        status: 'COMPLETED',
        actualEndAt: now,
        overtimeMinutes,
      },
    });

    await this.clockOutEntry(request.timeEntryId, request.organizationId, `Overtime completed: ${overtimeMinutes} minutes`);

    this.notificationClient.emit('push_notification', {
      userId: request.technicianId,
      title: 'Overtime Ended',
      body: `Your approved overtime has ended (${overtimeMinutes} min). You have been clocked out.`,
      data: { type: 'overtime.ended', overtimeRequestId: request.id },
    });

    this.logger.log(`Overtime ${request.id} ended: ${overtimeMinutes} minutes`);

    return success({ overtimeMinutes }, 'Overtime completed');
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
  async getPendingApprovals(data: { organizationId: string }) {
    const requests = await this.prisma.overtimeRequest.findMany({
      where: {
        organizationId: data.organizationId,
        status: 'PENDING_APPROVAL',
      },
      include: {
        technician: { select: { id: true, firstName: true, lastName: true, email: true } },
        location: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return success(requests, `${requests.length} pending approvals`);
  }

  /**
   * Get overtime history
   */
  async getHistory(data: {
    organizationId: string;
    technicianId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const page = data.page ?? 1;
    const limit = data.limit ?? 20;
    const where: any = { organizationId: data.organizationId };
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
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.overtimeRequest.count({ where }),
    ]);

    return success({ data: requests, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  }

  // =========================================================================
  // PRIVATE HELPERS
  // =========================================================================

  private async findPendingApproval(requestId: string, organizationId: string) {
    const request = await this.prisma.overtimeRequest.findFirst({
      where: {
        id: requestId,
        organizationId,
        status: 'PENDING_APPROVAL',
      },
    });
    if (!request) {
      throw new NotFoundException('Overtime request not found or not pending approval');
    }
    return request;
  }

  private async approveRequest(
    request: any,
    approval: {
      approverId: string;
      maxDurationMinutes: number;
      notes?: string;
      method: 'REMOTE' | 'SIGNATURE';
      leaderName?: string;
      leaderSignature?: string;
    },
  ) {
    const now = new Date();
    const maxMinutes = Math.min(approval.maxDurationMinutes, OVERTIME_CONSTANTS.MAX_OVERTIME_DURATION_MINUTES);
    const overtimeEndAt = new Date(now.getTime() + maxMinutes * 60 * 1000);

    await this.prisma.overtimeRequest.update({
      where: { id: request.id },
      data: {
        status: 'APPROVED',
        approvalMethod: approval.method,
        approvedById: approval.approverId,
        approvedAt: now,
        approverNotes: approval.notes,
        leaderName: approval.leaderName,
        leaderSignature: approval.leaderSignature,
        maxDurationMinutes: maxMinutes,
        overtimeStartAt: now,
        overtimeEndAt,
      },
    });

    // Schedule delayed job to end overtime
    await this.overtimeQueue.add(
      OVERTIME_JOB_TYPES.END_OVERTIME,
      { overtimeRequestId: request.id },
      {
        delay: maxMinutes * 60 * 1000,
        jobId: `overtime-end-${request.id}`,
        removeOnComplete: true,
      },
    );

    // Notify technician
    this.notificationClient.emit('push_notification', {
      userId: request.technicianId,
      title: 'Overtime Approved',
      body: `Your overtime has been approved for ${maxMinutes} minutes.`,
      data: { type: 'overtime.approved', overtimeRequestId: request.id, maxDurationMinutes: maxMinutes },
    });

    this.logger.log(`Overtime ${request.id} approved: ${maxMinutes} min by ${approval.approverId} via ${approval.method}`);

    return success({ status: 'APPROVED', maxDurationMinutes: maxMinutes, overtimeEndAt }, 'Overtime approved');
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
