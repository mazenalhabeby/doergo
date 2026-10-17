import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { BreakService } from './break.service';
import { BreakRulesService } from './break-rules.service';
import { BreakStatusService } from './break-status.service';
import { BreakReadService } from './break-read.service';
import { OfficeBreaksService } from './office-breaks.service';

/** Rests over RPC: taking one, the prompt, the rules, reading and correcting them. */
@Controller()
export class BreaksRpcController {
  constructor(
    private readonly breakService: BreakService,
    private readonly officeBreaks: OfficeBreaksService,
    private readonly breakRead: BreakReadService,
    private readonly breakStatus: BreakStatusService,
    private readonly breakRules: BreakRulesService,
  ) {}

  // =========================================================================
  // BREAKS
  // =========================================================================

  @MessagePattern({ cmd: 'start_break' })
  async startBreak(
    @Payload()
    data: {
      userId: string;
      organizationId: string;
      /** Spaces the caller may act in; null = org-wide, [] = none. */
      scopeSpaceIds?: string[] | null;
      type?: string;
      notes?: string;
      /** The planned rest this satisfies; omitted = whichever is next. */
      ruleId?: string;
    },
  ) {
    return this.breakService.startBreak(data);
  }

  /** "Later." Moves the rest out by its own interval; the COUNT is kept here. */
  @MessagePattern({ cmd: 'snooze_break' })
  async snoozeBreak(@Payload() data: { userId: string; organizationId: string; ruleId?: string }) {
    return this.breakStatus.snoozeBreak(data);
  }

  // =========================================================================
  // REST RULES — the workspace's planned rests
  // =========================================================================

  @MessagePattern({ cmd: 'list_break_rules' })
  async listBreakRules(@Payload() data: { organizationId: string; spaceId?: string; shiftId?: string }) {
    return this.breakRules.list(data);
  }

  @MessagePattern({ cmd: 'create_break_rule' })
  async createBreakRule(@Payload() data: any) {
    return this.breakRules.create(data);
  }

  @MessagePattern({ cmd: 'update_break_rule' })
  async updateBreakRule(@Payload() data: any) {
    return this.breakRules.update(data);
  }

  @MessagePattern({ cmd: 'delete_break_rule' })
  async deleteBreakRule(@Payload() data: { id: string; organizationId: string; scopeSpaceIds?: string[] | null }) {
    return this.breakRules.remove(data);
  }

  @MessagePattern({ cmd: 'end_break' })
  async endBreak(
    @Payload()
    data: {
      userId: string;
      organizationId: string;
      /** Spaces the caller may act in; null = org-wide, [] = none. */
      scopeSpaceIds?: string[] | null;
      notes?: string;
    },
  ) {
    return this.breakService.endBreak(data);
  }

  @MessagePattern({ cmd: 'get_break_status' })
  async getBreakStatus(
    @Payload()
    data: {
      userId: string;
      organizationId: string;
      /** Spaces the caller may act in; null = org-wide, [] = none. */
      scopeSpaceIds?: string[] | null;
    },
  ) {
    return this.breakStatus.getBreakStatus(data);
  }

  @MessagePattern({ cmd: 'get_breaks_for_entry' })
  async getBreaksForEntry(
    @Payload()
    data: {
      timeEntryId: string;
      organizationId: string;
      requesterId: string;
      /** Spaces the caller may read attendance in; null = org-wide, [] = none. */
      scopeSpaceIds: string[] | null;
    },
  ) {
    return this.breakRead.getBreaksForEntry(data);
  }

  @MessagePattern({ cmd: 'get_active_breaks' })
  async getActiveBreaks(
    @Payload()
    data: {
      organizationId: string;
      /** Spaces the caller may act in; null = org-wide, [] = none. */
      scopeSpaceIds?: string[] | null;
    },
  ) {
    return this.breakRead.getActiveBreaks(data);
  }

  @MessagePattern({ cmd: 'get_break_history' })
  async getBreakHistory(
    @Payload()
    data: {
      organizationId: string;
      /** Spaces the caller may act in; null = org-wide, [] = none. */
      scopeSpaceIds?: string[] | null;
      date?: string;
      userId?: string;
      type?: string;
      page?: number;
      limit?: number;
    },
  ) {
    return this.breakRead.getBreakHistory(data);
  }

  @MessagePattern({ cmd: 'add_break_for_member' })
  async addBreakForMember(
    @Payload()
    data: {
      timeEntryId: string;
      organizationId: string;
      /** Spaces the caller may act in; null = org-wide, [] = none. */
      scopeSpaceIds?: string[] | null;
      editorId: string;
      type?: any;
      startedAt: string;
      endedAt: string;
      reason: string;
    },
  ) {
    return this.officeBreaks.addBreakForMember(data);
  }

  @MessagePattern({ cmd: 'delete_break' })
  async deleteBreak(@Payload() data: { breakId: string; organizationId: string; editorId: string }) {
    return this.officeBreaks.deleteBreak(data);
  }

  @MessagePattern({ cmd: 'end_break_manually' })
  async endBreakManually(
    @Payload()
    data: {
      breakId: string;
      adminId: string;
      organizationId: string;
      /** Spaces the caller may act in; null = org-wide, [] = none. */
      scopeSpaceIds?: string[] | null;
      notes?: string;
    },
  ) {
    return this.breakStatus.endBreakManually(data);
  }

  @MessagePattern({ cmd: 'get_break_summary' })
  async getBreakSummary(
    @Payload()
    data: {
      organizationId: string;
      /** Spaces the caller may act in; null = org-wide, [] = none. */
      scopeSpaceIds?: string[] | null;
      startDate: string;
      endDate: string;
      userId?: string;
    },
  ) {
    return this.breakRead.getBreakSummary(data);
  }
}
