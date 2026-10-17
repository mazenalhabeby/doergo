import { RequestPrecheckService } from './request-precheck.service';
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { success } from '@hbcfield/shared';
import { TechniciansService } from './technicians.service';
import { MemberPerformanceService } from './member-performance.service';
import { MemberScheduleService } from './member-schedule.service';
import { TimeOffRequestService } from './time-off-request.service';
import { LeaveRecordsService } from './leave-records.service';
import { TimeOffDecisionService } from './time-off-decision.service';
import { CoverService } from './cover.service';
import { LeaveLedgerService } from './leave-ledger.service';
import {
  GetEmployeeStatsDto,
  GetEmployeePerformanceDto,
  GetEmployeeTaskHistoryDto,
  SetScheduleDto,
  GetScheduleDto,
  RequestTimeOffDto,
  GetTimeOffDto,
  GetOrgTimeOffDto,
  ApproveTimeOffDto,
  CancelTimeOffDto,
  GetAvailabilityDto,
} from './dto';
import { LeaveOpeningService } from './leave-opening.service';
import { CoverFloorService } from './cover-floor.service';

@Controller()
export class TechniciansController {
  constructor(
    private readonly techniciansService: TechniciansService,
    private readonly coverService: CoverService,
    private readonly coverFloor: CoverFloorService,
    private readonly leaveLedger: LeaveLedgerService,
    private readonly leaveOpening: LeaveOpeningService,
    private readonly precheck: RequestPrecheckService,
    private readonly performance: MemberPerformanceService,
    private readonly schedule: MemberScheduleService,
    private readonly requests: TimeOffRequestService,
    private readonly leaveRecords: LeaveRecordsService,
    private readonly decisions: TimeOffDecisionService,
  ) {}

  // ========================================================================
  // THE LEAVE LEDGER (leave-ledger.service.ts) — scope and caller come from the gateway
  // ========================================================================

  @MessagePattern({ cmd: 'list_leave_adjustments' })
  async listLeaveAdjustments(@Payload() dto: Parameters<LeaveLedgerService['listAdjustments']>[0]) {
    return success(await this.leaveLedger.listAdjustments(dto));
  }

  @MessagePattern({ cmd: 'add_leave_adjustment' })
  async addLeaveAdjustment(@Payload() dto: Parameters<LeaveLedgerService['addAdjustment']>[0]) {
    return success(await this.leaveLedger.addAdjustment(dto));
  }

  @MessagePattern({ cmd: 'void_leave_adjustment' })
  async voidLeaveAdjustment(@Payload() dto: Parameters<LeaveLedgerService['voidAdjustment']>[0]) {
    return success(await this.leaveLedger.voidAdjustment(dto));
  }

  @MessagePattern({ cmd: 'get_leave_opening' })
  async getLeaveOpening(@Payload() dto: Parameters<LeaveOpeningService['getOpening']>[0]) {
    return success(await this.leaveOpening.getOpening(dto));
  }

  @MessagePattern({ cmd: 'save_leave_opening' })
  async saveLeaveOpening(@Payload() dto: Parameters<LeaveOpeningService['saveOpening']>[0]) {
    return success(await this.leaveOpening.saveOpening(dto));
  }

  @MessagePattern({ cmd: 'match_leave_opening' })
  async matchLeaveOpening(@Payload() dto: Parameters<LeaveOpeningService['matchOpening']>[0]) {
    return success(await this.leaveOpening.matchOpening(dto));
  }

  // ========================================================================
  // PERFORMANCE & STATS
  // ========================================================================

  @MessagePattern({ cmd: 'get_technician_stats' })
  async getStats(@Payload() data: GetEmployeeStatsDto) {
    return this.techniciansService.getStats(data);
  }

  @MessagePattern({ cmd: 'get_technician_performance' })
  async getPerformance(@Payload() data: GetEmployeePerformanceDto) {
    return this.performance.getPerformance(data);
  }

  @MessagePattern({ cmd: 'get_technician_task_history' })
  async getTaskHistory(@Payload() data: GetEmployeeTaskHistoryDto) {
    return this.techniciansService.getTaskHistory(data);
  }

  // ========================================================================
  // SCHEDULE MANAGEMENT
  // ========================================================================

  @MessagePattern({ cmd: 'set_technician_schedule' })
  async setSchedule(@Payload() data: SetScheduleDto) {
    return this.schedule.setSchedule(data);
  }

  @MessagePattern({ cmd: 'get_technician_schedule' })
  async getSchedule(@Payload() data: GetScheduleDto) {
    return this.schedule.getSchedule(data);
  }

  // ========================================================================
  // TIME-OFF MANAGEMENT
  // ========================================================================

  @MessagePattern({ cmd: 'request_time_off' })
  async requestTimeOff(@Payload() data: RequestTimeOffDto) {
    return this.requests.requestTimeOff(data);
  }

  /** What the caller may request, and at which workspaces a remote day (requests/request-kinds.ts). */
  /** What a leader would check, for the member's OWN request before sending (advice only). */
  @MessagePattern({ cmd: 'request_precheck' })
  requestPrecheck(@Payload() data: { userId: string; organizationId: string; body: unknown }) {
    return this.precheck.precheck(data);
  }

  @MessagePattern({ cmd: 'get_request_options' })
  async getRequestOptions(@Payload() data: { userId: string; organizationId: string }) {
    return this.requests.requestOptions(data);
  }

  @MessagePattern({ cmd: 'get_time_off' })
  async getTimeOff(@Payload() data: GetTimeOffDto) {
    return this.leaveRecords.getTimeOff(data);
  }

  /** What a leave range would cost — weekends, rota rest days and holidays left out. */
  @MessagePattern({ cmd: 'count_leave' })
  async countLeave(@Payload() dto: { organizationId: string; technicianId: string; from: string; to: string; callerId?: string; scopeSpaceIds?: string[] }) {
    return this.leaveRecords.countLeave(dto);
  }

  @MessagePattern({ cmd: 'get_leave_balance' })
  async getLeaveBalance(@Payload() dto: { technicianId: string; organizationId: string; on?: string; year?: number | string }) {
    return this.leaveRecords.getLeaveBalance(dto);
  }

  /**
   * Who is on the floor right now, per workspace.
   *
   * Its own read rather than the screen joining four existing ones: the browser
   * would otherwise need the whole roster, every open shift and every active
   * break to work it out, which is both slower and more than the viewer is
   * entitled to see.
   */
  @MessagePattern({ cmd: 'get_floor_now' })
  async getFloorNow(@Payload() data: { organizationId: string; scopeSpaceIds?: string[] }) {
    return success(await this.coverFloor.floorNow(data.organizationId, data.scopeSpaceIds));
  }

  /** Cover for every day of a window, per workspace — the wallchart's footer. */
  @MessagePattern({ cmd: 'get_cover_range' })
  async getCoverRange(
    @Payload() data: { organizationId: string; start: string; end: string; scopeSpaceIds?: string[] },
  ) {
    return success(
      await this.coverService.coverRange(data.organizationId, data.start, data.end, data.scopeSpaceIds),
    );
  }

  @MessagePattern({ cmd: 'get_org_time_off' })
  async getOrgTimeOff(@Payload() data: GetOrgTimeOffDto) {
    return this.leaveRecords.getOrgTimeOff(data);
  }

  @MessagePattern({ cmd: 'approve_time_off' })
  async approveTimeOff(@Payload() data: ApproveTimeOffDto) {
    return this.decisions.approveTimeOff(data);
  }

  @MessagePattern({ cmd: 'cancel_time_off' })
  async cancelTimeOff(@Payload() data: CancelTimeOffDto) {
    return this.decisions.cancelTimeOff(data);
  }

  @MessagePattern({ cmd: 'update_time_off' })
  async updateTimeOff(
    @Payload()
    data: {
      organizationId: string;
      timeOffId: string;
      startDate?: string;
      endDate?: string;
      reason?: string | null;
    },
  ) {
    return this.decisions.updateTimeOff(data);
  }

  @MessagePattern({ cmd: 'admin_delete_time_off' })
  async adminDeleteTimeOff(@Payload() data: { organizationId: string; timeOffId: string }) {
    return this.decisions.adminDeleteTimeOff(data);
  }

  @MessagePattern({ cmd: 'add_time_off' })
  async addTimeOff(
    @Payload()
    data: {
      editorId: string;
      organizationId: string;
      technicianId: string;
      startDate: string;
      endDate: string;
      reason?: string;
    },
  ) {
    return this.leaveRecords.addTimeOff(data);
  }

  // ========================================================================
  // AVAILABILITY QUERIES
  // ========================================================================

  @MessagePattern({ cmd: 'get_technicians_availability' })
  async getAvailability(@Payload() data: GetAvailabilityDto) {
    return this.schedule.getAvailability(data);
  }
}
