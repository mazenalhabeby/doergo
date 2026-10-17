import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';
import {
  pattern,
  type RpcRequest,
  startBreak,
  snoozeBreak,
  listBreakRules,
  createBreakRule,
  updateBreakRule,
  deleteBreakRule,
  endBreak,
  getBreakStatus,
  getBreaksForEntry,
  getActiveBreaks,
  getBreakHistory,
  addBreakForMember,
  deleteBreak,
  endBreakManually,
  getBreakSummary,
} from '@hbcfield/shared/microservices';

/** Rests, asked of task-service: taking and ending one, the prompt, the rules, reading and correcting. */
@Injectable()
export class BreaksGatewayService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy) {
    super(taskClient, BreaksGatewayService.name);
  }

  // =========================================================================
  // BREAKS
  // =========================================================================

  /**
   * Start a break
   */
  async startBreak(data: RpcRequest<typeof startBreak>) {
    return this.sendOnce(pattern(startBreak), data);
  }

  /** "Later" — the count is kept server-side, so this is a real answer. */
  async snoozeBreak(data: RpcRequest<typeof snoozeBreak>) {
    return this.sendOnce(pattern(snoozeBreak), data);
  }

  // ── Rest rules ───────────────────────────────────────────────────────────

  async listBreakRules(data: RpcRequest<typeof listBreakRules>) {
    return this.send(pattern(listBreakRules), data);
  }

  async createBreakRule(data: RpcRequest<typeof createBreakRule>) {
    return this.send(pattern(createBreakRule), data);
  }

  async updateBreakRule(data: RpcRequest<typeof updateBreakRule>) {
    return this.send(pattern(updateBreakRule), data);
  }

  async deleteBreakRule(data: RpcRequest<typeof deleteBreakRule>) {
    return this.send(pattern(deleteBreakRule), data);
  }

  /**
   * End current break
   */
  async endBreak(data: RpcRequest<typeof endBreak>) {
    return this.sendOnce(pattern(endBreak), data);
  }

  /**
   * Get current break status
   */
  async getBreakStatus(data: RpcRequest<typeof getBreakStatus>) {
    return this.send(pattern(getBreakStatus), data);
  }

  /**
   * Get breaks for a time entry
   */
  async getBreaksForEntry(data: RpcRequest<typeof getBreaksForEntry>) {
    return this.send(pattern(getBreaksForEntry), data);
  }

  /**
   * Get all active breaks in the organization (admin)
   */
  async getActiveBreaks(data: RpcRequest<typeof getActiveBreaks>) {
    return this.send(pattern(getActiveBreaks), data);
  }

  /**
   * Get break history with filters (admin)
   */
  async getBreakHistory(data: RpcRequest<typeof getBreakHistory>) {
    return this.send(pattern(getBreakHistory), data);
  }

  /**
   * End a break manually (admin)
   */
  /**
   * Add a break to a member's shift. `sendOnce`, not `send`: this is a write, and
   * a retried request would record the same break twice.
   */
  async addBreakForMember(data: RpcRequest<typeof addBreakForMember>) {
    return this.sendOnce(pattern(addBreakForMember), data);
  }

  /** Remove a break. `sendOnce` — a retried delete must not race a re-add. */
  async deleteBreak(data: RpcRequest<typeof deleteBreak>) {
    return this.sendOnce(pattern(deleteBreak), data);
  }

  async endBreakManually(data: RpcRequest<typeof endBreakManually>) {
    return this.send(pattern(endBreakManually), data);
  }

  /**
   * Get break summary statistics for a date range
   */
  async getBreakSummary(data: RpcRequest<typeof getBreakSummary>) {
    return this.send(pattern(getBreakSummary), data);
  }
}
