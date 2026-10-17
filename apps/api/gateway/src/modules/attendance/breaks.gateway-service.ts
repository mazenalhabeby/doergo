import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';

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
  async startBreak(data: {
    userId: string;
    organizationId: string;
    /** Spaces the caller may see; null = org-wide, [] = none. */
    scopeSpaceIds?: string[] | null;
    type?: string;
    notes?: string;
    /** The planned rest this satisfies; omitted = whichever is next. */
    ruleId?: string;
    id?: string;
    entryId?: string;
    evidence?: unknown;
  }) {
    return this.sendOnce({ cmd: 'start_break' }, data);
  }

  /** "Later" — the count is kept server-side, so this is a real answer. */
  async snoozeBreak(data: { userId: string; organizationId: string; ruleId?: string }) {
    return this.sendOnce({ cmd: 'snooze_break' }, data);
  }

  // ── Rest rules ───────────────────────────────────────────────────────────

  async listBreakRules(data: { organizationId: string; spaceId?: string; shiftId?: string }) {
    return this.send({ cmd: 'list_break_rules' }, data);
  }

  async createBreakRule(data: Record<string, unknown> & { organizationId: string }) {
    return this.send({ cmd: 'create_break_rule' }, data);
  }

  async updateBreakRule(data: Record<string, unknown> & { id: string; organizationId: string }) {
    return this.send({ cmd: 'update_break_rule' }, data);
  }

  async deleteBreakRule(data: { id: string; organizationId: string; scopeSpaceIds?: string[] | null }) {
    return this.send({ cmd: 'delete_break_rule' }, data);
  }

  /**
   * End current break
   */
  async endBreak(data: {
    userId: string;
    organizationId: string;
    /** Spaces the caller may see; null = org-wide, [] = none. */
    scopeSpaceIds?: string[] | null;
    notes?: string;
    breakId?: string;
    evidence?: unknown;
  }) {
    return this.sendOnce({ cmd: 'end_break' }, data);
  }

  /**
   * Get current break status
   */
  async getBreakStatus(data: { userId: string; organizationId: string }) {
    return this.send({ cmd: 'get_break_status' }, data);
  }

  /**
   * Get breaks for a time entry
   */
  async getBreaksForEntry(data: { timeEntryId: string; organizationId: string; requesterId: string; scopeSpaceIds: string[] | null }) {
    return this.send({ cmd: 'get_breaks_for_entry' }, data);
  }

  /**
   * Get all active breaks in the organization (admin)
   */
  async getActiveBreaks(data: { organizationId: string; scopeSpaceIds?: string[] | null }) {
    return this.send({ cmd: 'get_active_breaks' }, data);
  }

  /**
   * Get break history with filters (admin)
   */
  async getBreakHistory(data: {
    organizationId: string;
    /** Spaces the caller may see; null = org-wide, [] = none. */
    scopeSpaceIds?: string[] | null;
    date?: string;
    userId?: string;
    type?: string;
    page?: number;
    limit?: number;
  }) {
    return this.send({ cmd: 'get_break_history' }, data);
  }

  /**
   * End a break manually (admin)
   */
  /**
   * Add a break to a member's shift. `sendOnce`, not `send`: this is a write, and
   * a retried request would record the same break twice.
   */
  async addBreakForMember(data: {
    timeEntryId: string;
    organizationId: string;
    /** Spaces the caller may see; null = org-wide, [] = none. */
    scopeSpaceIds?: string[] | null;
    editorId: string;
    type?: string;
    startedAt: string;
    endedAt: string;
    reason: string;
  }) {
    return this.sendOnce({ cmd: 'add_break_for_member' }, data);
  }

  /** Remove a break. `sendOnce` — a retried delete must not race a re-add. */
  async deleteBreak(data: { breakId: string; organizationId: string; scopeSpaceIds?: string[] | null; editorId: string }) {
    return this.sendOnce({ cmd: 'delete_break' }, data);
  }

  async endBreakManually(data: {
    breakId: string;
    adminId: string;
    organizationId: string;
    /** Spaces the caller may see; null = org-wide, [] = none. */
    scopeSpaceIds?: string[] | null;
    notes?: string;
  }) {
    return this.send({ cmd: 'end_break_manually' }, data);
  }

  /**
   * Get break summary statistics for a date range
   */
  async getBreakSummary(data: {
    organizationId: string;
    /** Spaces the caller may see; null = org-wide, [] = none. */
    scopeSpaceIds?: string[] | null;
    startDate: string;
    endDate: string;
    userId?: string;
  }) {
    return this.send({ cmd: 'get_break_summary' }, data);
  }
}
