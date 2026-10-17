import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';
import {
  pattern,
  type RpcRequest,
  resolveForgotClockOut,
  requestExtraTime,
  approveExtraTime,
  addOvertimeToEntry,
  removeApprovedOvertime,
  rejectExtraTime,
  listPendingExtraTime,
} from '@hbcfield/shared/microservices';

/** Forgot to clock out, extra time and overtime, asked of task-service. */
@Injectable()
export class ExtraTimeGatewayService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy) {
    super(taskClient, ExtraTimeGatewayService.name);
  }

  // ── Shift reminder responses (worker actions + leader approval) ──

  /** Worker self-reports their leave time after forgetting to clock out. */
  async resolveForgotClockOut(data: RpcRequest<typeof resolveForgotClockOut>) {
    return this.send(pattern(resolveForgotClockOut), data);
  }

  /** Worker requests to keep working past the shift end (routes to a leader). */
  async requestExtraTime(data: RpcRequest<typeof requestExtraTime>) {
    // A write: `send` retries on a slow reply and would open a second round.
    return this.sendOnce(pattern(requestExtraTime), data);
  }

  /** Leader approves N more minutes of overtime for an open shift. */
  async approveExtraTime(data: RpcRequest<typeof approveExtraTime>) {
    return this.send(pattern(approveExtraTime), data);
  }

  /** A manager adds overtime to a closed shift. A write: never retried. */
  async addOvertimeToEntry(data: RpcRequest<typeof addOvertimeToEntry>) {
    return this.sendOnce(pattern(addOvertimeToEntry), data);
  }

  /** Remove an approved overtime as if it never was. A write: never retried. */
  async removeApprovedOvertime(data: RpcRequest<typeof removeApprovedOvertime>) {
    return this.sendOnce(pattern(removeApprovedOvertime), data);
  }

  /** Leader rejects an extra-time request. The reason reaches the member, so it is worth asking for. */
  async rejectExtraTime(data: RpcRequest<typeof rejectExtraTime>) {
    return this.send(pattern(rejectExtraTime), data);
  }

  /** Open extra-time requests awaiting approval (scoped to the caller's spaces). */
  async listPendingExtraTime(data: RpcRequest<typeof listPendingExtraTime>) {
    return this.send(pattern(listPendingExtraTime), data);
  }
}
