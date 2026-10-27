import { standInGrant } from '../approvals/stand-in';
import { notEndedWhere, grantHolds, approverFacts } from '@hbcfield/shared';
import { Injectable, Inject, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { assertNotSelfDecision } from '../attendance/core/self-decision';
import {
  PrismaService,
  SERVICE_NAMES,
  success,
  OVERTIME_CONSTANTS,
  scopeWhere,
  type SpaceScopeIds,
} from '@hbcfield/shared';
import { AttendanceService } from '../attendance/attendance.service';
import { SIGNED_CONFIRM_WINDOW_MINUTES, afterOvertimeRefusal, notifyOvertime } from './overtime-helpers';
import { ApprovalRulesService } from '../approvals/rules/approval-rules.service';

/** The leader's decision on overtime: approve, approve with the member's signature in person, refuse. */
@Injectable()
export class OvertimeDecisionService {
  private readonly logger = new Logger(OvertimeDecisionService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION)
    private readonly notificationClient: ClientProxy,
    // Approving is ONE rule, owned by attendance (approveExtraTime) — see approveRequest.
    private readonly attendance: AttendanceService,
    // A refusal ends the office rules' approvals given for this round (keyed by its shift).
    private readonly rules: ApprovalRulesService,
  ) {}

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
      leaderName: confirmsOwnSignature ? (request.leaderName ?? undefined) : undefined,
      leaderSignature: confirmsOwnSignature ? (request.leaderSignature ?? undefined) : undefined,
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
    const approver = await approverFacts(this.prisma, data.approverId, data.organizationId);
    if (!approver) {
      throw new BadRequestException('Invalid approver — must be an active member of this organization');
    }

    const orgWide =
      approver.role === 'ADMIN' ||
      (approver.memberRole?.permissions as Record<string, unknown> | null)?.canApproveOvertime === true;

    // Standing in for a leader who approves overtime everywhere / here today.
    const standIn = orgWide ? null : await standInGrant(this.prisma, approver.id, data.organizationId);
    // A request with no workspace needs the org-wide grant, never "some workspace".
    const coveredByStandIn =
      !!standIn &&
      (request.locationId
        ? grantHolds(standIn, 'canApproveOvertime', request.locationId)
        : !!standIn.org.canApproveOvertime);
    if (!orgWide && !coveredByStandIn) {
      // Does a space role grant it where this overtime actually happened?
      const grantedHere = request.locationId
        ? await this.prisma.spaceAssignment.findFirst({
            where: {
              userId: approver.id,
              spaceId: request.locationId,
              ...notEndedWhere(),
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
        ...(request.signedAt
          ? {}
          : { approvalTimeoutAt: new Date(signedAt.getTime() + SIGNED_CONFIRM_WINDOW_MINUTES * 60_000) }),
      },
    });
    // Asked once per signer: a repeated signature does not push them again.
    if (!request.signedAt || request.signedById !== approver.id) {
      notifyOvertime(this.notificationClient, {
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

    /*
      Nobody refuses their own overtime — a leader deciding about their own time is
      no decision at all (refusing once ENDED the shift, which made it worse). The approve path has carried the
      second-party rule since AT-B1 (through attendance's approveExtraTime);
      the reject path never did. A true org admin is exempt, as everywhere.
    */
    await assertNotSelfDecision(this.prisma, {
      deciderId: data.approverId,
      subjectId: request.technicianId,
      organizationId: data.organizationId,
      message: 'You cannot decide on your own overtime',
    });

    const now = new Date();
    // Claimed: an approval or a second reject arriving together must not both act.
    const claimed = await this.prisma.overtimeRequest.updateMany({
      where: { id: request.id, status: 'PENDING_APPROVAL' },
      data: {
        status: 'REJECTED',
        approvedById: data.approverId,
        rejectedAt: now,
        rejectionReason: data.reason,
      },
    });
    if (claimed.count === 0) {
      throw new NotFoundException('Overtime request not found or not pending approval');
    }
    // Refused: every rejection ends the office rules' approvals half-way.
    await this.rules.clear(data.organizationId, 'overtime', request.timeEntryId);

    // A refusal never clocks anyone out: the time after the planned end is not counted, and they are nudged.
    await afterOvertimeRefusal(this.prisma, request.timeEntryId, now);

    // Notify technician
    notifyOvertime(this.notificationClient, {
      recipientIds: [request.technicianId],
      organizationId: data.organizationId,
      kind: 'rejected',
      params: { reason: data.reason },
      data: { type: 'overtime.rejected', overtimeRequestId: request.id },
    });

    return success({ status: 'REJECTED' }, 'Overtime request rejected');
  }

  /** A pending round the caller may decide — one loader for approve and reject. */
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
      signature: approval.method === 'SIGNATURE' ? (approval.leaderSignature ?? null) : null,
      notes: approval.notes ?? null,
    });
    if (approval.leaderName) {
      await this.prisma.overtimeRequest.update({
        where: { id: request.id },
        data: { leaderName: approval.leaderName },
      });
    }

    this.logger.log(`Overtime ${request.id} approved: ${minutes} min by ${approval.approverId} via ${approval.method}`);
    return result;
  }
}
