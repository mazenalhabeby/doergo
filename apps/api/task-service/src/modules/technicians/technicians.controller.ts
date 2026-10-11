import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { success } from '@hbcfield/shared';
import { TechniciansService } from './technicians.service';
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

@Controller()
export class TechniciansController {
  constructor(
    private readonly techniciansService: TechniciansService,
    private readonly coverService: CoverService,
    private readonly leaveLedger: LeaveLedgerService,
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
  async getLeaveOpening(@Payload() dto: Parameters<LeaveLedgerService['getOpening']>[0]) {
    return success(await this.leaveLedger.getOpening(dto));
  }

  @MessagePattern({ cmd: 'save_leave_opening' })
  async saveLeaveOpening(@Payload() dto: Parameters<LeaveLedgerService['saveOpening']>[0]) {
    return success(await this.leaveLedger.saveOpening(dto));
  }

  @MessagePattern({ cmd: 'match_leave_opening' })
  async matchLeaveOpening(@Payload() dto: Parameters<LeaveLedgerService['matchOpening']>[0]) {
    return success(await this.leaveLedger.matchOpening(dto));
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
    return this.techniciansService.getPerformance(data);
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
    return this.techniciansService.setSchedule(data);
  }

  @MessagePattern({ cmd: 'get_technician_schedule' })
  async getSchedule(@Payload() data: GetScheduleDto) {
    return this.techniciansService.getSchedule(data);
  }

  // ========================================================================
  // TIME-OFF MANAGEMENT
  // ========================================================================

  @MessagePattern({ cmd: 'request_time_off' })
  async requestTimeOff(@Payload() data: RequestTimeOffDto) {
    return this.techniciansService.requestTimeOff(data);
  }

  /** What the caller may request, and at which workspaces a remote day (requests/request-kinds.ts). */
  @MessagePattern({ cmd: 'get_request_options' })
  async getRequestOptions(@Payload() data: { userId: string; organizationId: string }) {
    return this.techniciansService.requestOptions(data);
  }

  @MessagePattern({ cmd: 'get_time_off' })
  async getTimeOff(@Payload() data: GetTimeOffDto) {
    return this.techniciansService.getTimeOff(data);
  }

  /** What a leave range would cost — weekends, rota rest days and holidays left out. */
  @MessagePattern({ cmd: 'count_leave' })
  async countLeave(@Payload() dto: { organizationId: string; technicianId: string; from: string; to: string; callerId?: string; scopeSpaceIds?: string[] }) {
    return this.techniciansService.countLeave(dto);
  }

  @MessagePattern({ cmd: 'get_leave_balance' })
  async getLeaveBalance(@Payload() dto: { technicianId: string; organizationId: string; on?: string; year?: number | string }) {
    return this.techniciansService.getLeaveBalance(dto);
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
    return success(await this.coverService.floorNow(data.organizationId, data.scopeSpaceIds));
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
    return this.techniciansService.getOrgTimeOff(data);
  }

  @MessagePattern({ cmd: 'approve_time_off' })
  async approveTimeOff(@Payload() data: ApproveTimeOffDto) {
    return this.techniciansService.approveTimeOff(data);
  }

  @MessagePattern({ cmd: 'cancel_time_off' })
  async cancelTimeOff(@Payload() data: CancelTimeOffDto) {
    return this.techniciansService.cancelTimeOff(data);
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
    return this.techniciansService.updateTimeOff(data);
  }

  @MessagePattern({ cmd: 'admin_delete_time_off' })
  async adminDeleteTimeOff(@Payload() data: { organizationId: string; timeOffId: string }) {
    return this.techniciansService.adminDeleteTimeOff(data);
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
    return this.techniciansService.addTimeOff(data);
  }

  // ========================================================================
  // AVAILABILITY QUERIES
  // ========================================================================

  @MessagePattern({ cmd: 'get_technicians_availability' })
  async getAvailability(@Payload() data: GetAvailabilityDto) {
    return this.techniciansService.getAvailability(data);
  }
}
