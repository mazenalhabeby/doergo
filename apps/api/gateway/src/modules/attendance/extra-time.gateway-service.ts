import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';

/** Forgot to clock out, extra time and overtime, asked of task-service. */
@Injectable()
export class ExtraTimeGatewayService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy) {
    super(taskClient, ExtraTimeGatewayService.name);
  }

  // ── Shift reminder responses (worker actions + leader approval) ──

  /** Worker self-reports their leave time after forgetting to clock out. */
  async resolveForgotClockOut(data: {
    userId: string;
    entryId: string;
    clockOutAt: string;
    organizationId: string;
    /** Spaces the caller may see; null = org-wide, [] = none. */
    scopeSpaceIds?: string[] | null;
  }) {
    return this.send({ cmd: 'resolve_forgot_clock_out' }, data);
  }

  /** Worker requests to keep working past the shift end (routes to a leader). */
  async requestExtraTime(data: { userId: string; entryId: string; organizationId: string; occurredAt?: string | null }) {
    // A write: `send` retries on a slow reply and would open a second round.
    return this.sendOnce({ cmd: 'request_extra_time' }, data);
  }

  /** Leader approves N more minutes of overtime for an open shift. */
  async approveExtraTime(data: {
    approverId: string;
    entryId: string;
    minutes: number;
    organizationId: string;
    signature?: string | null;
    notes?: string | null;
    /** Spaces the caller may see; null = org-wide, [] = none. */
    scopeSpaceIds?: string[] | null;
  }) {
    return this.send({ cmd: 'approve_extra_time' }, data);
  }

  /** A manager adds overtime to a closed shift. A write: never retried. */
  async addOvertimeToEntry(data: { approverId: string; entryId: string; minutes: number; reason?: string | null; organizationId: string; scopeSpaceIds?: string[] | null }) {
    return this.sendOnce({ cmd: 'add_overtime_to_entry' }, data);
  }

  /** Remove an approved overtime as if it never was. A write: never retried. */
  async removeApprovedOvertime(data: { actorId: string; overtimeId: string; organizationId: string; scopeSpaceIds?: string[] | null }) {
    return this.sendOnce({ cmd: 'remove_approved_overtime' }, data);
  }

  /** Leader rejects an extra-time request. */
  async rejectExtraTime(data: {
    approverId: string;
    entryId: string;
    organizationId: string;
    /** Reaches the member, so it is worth asking for. */
    reason?: string | null;
  }) {
    return this.send({ cmd: 'reject_extra_time' }, data);
  }

  /** Open extra-time requests awaiting approval (scoped to the caller's spaces). */
  async listPendingExtraTime(data: { userId: string; organizationId: string; isAdmin?: boolean }) {
    return this.send({ cmd: 'list_pending_extra_time' }, data);
  }
}
