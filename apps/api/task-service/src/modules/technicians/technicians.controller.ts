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
import { DayHoursService } from './day-hours.service';
import { CoverService } from './cover.service';
import { LeaveLedgerService } from './leave-ledger.service';
import { LeaveOpeningService } from './leave-opening.service';
import { CoverFloorService } from './cover-floor.service';
import {
  pattern,
  type RpcRequest,
  listLeaveAdjustments,
  addLeaveAdjustment,
  voidLeaveAdjustment,
  getLeaveOpening,
  saveLeaveOpening,
  matchLeaveOpening,
  getTechnicianStats,
  getTechnicianPerformance,
  getTechnicianTaskHistory,
  setTechnicianSchedule,
  getTechnicianSchedule,
  requestTimeOff,
  requestPrecheck,
  getRequestOptions,
  getTimeOff,
  countLeaveRpc,
  getLeaveBalance,
  getFloorNow,
  getCoverRange,
  getOrgTimeOff,
  approveTimeOff,
  cancelTimeOff,
  updateTimeOff,
  adminDeleteTimeOff,
  addTimeOff,
  setDayHours,
  getDayHours,
  getTechniciansAvailability,
} from '@hbcfield/shared/microservices';

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
    private readonly dayHours: DayHoursService,
  ) {}

  // ========================================================================
  // THE LEAVE LEDGER (leave-ledger.service.ts) — scope and caller come from the gateway
  // ========================================================================

  @MessagePattern(pattern(listLeaveAdjustments))
  async listLeaveAdjustments(@Payload() dto: RpcRequest<typeof listLeaveAdjustments>) {
    return success(await this.leaveLedger.listAdjustments(dto));
  }

  @MessagePattern(pattern(addLeaveAdjustment))
  async addLeaveAdjustment(@Payload() dto: RpcRequest<typeof addLeaveAdjustment>) {
    return success(await this.leaveLedger.addAdjustment(dto));
  }

  @MessagePattern(pattern(voidLeaveAdjustment))
  async voidLeaveAdjustment(@Payload() dto: RpcRequest<typeof voidLeaveAdjustment>) {
    return success(await this.leaveLedger.voidAdjustment(dto));
  }

  @MessagePattern(pattern(getLeaveOpening))
  async getLeaveOpening(@Payload() dto: RpcRequest<typeof getLeaveOpening>) {
    return success(await this.leaveOpening.getOpening(dto));
  }

  @MessagePattern(pattern(saveLeaveOpening))
  async saveLeaveOpening(@Payload() dto: RpcRequest<typeof saveLeaveOpening>) {
    return success(await this.leaveOpening.saveOpening(dto));
  }

  @MessagePattern(pattern(matchLeaveOpening))
  async matchLeaveOpening(@Payload() dto: RpcRequest<typeof matchLeaveOpening>) {
    return success(await this.leaveOpening.matchOpening(dto));
  }

  // ========================================================================
  // PERFORMANCE & STATS
  // ========================================================================

  @MessagePattern(pattern(getTechnicianStats))
  async getStats(@Payload() data: RpcRequest<typeof getTechnicianStats>) {
    return this.techniciansService.getStats(data);
  }

  @MessagePattern(pattern(getTechnicianPerformance))
  async getPerformance(@Payload() data: RpcRequest<typeof getTechnicianPerformance>) {
    return this.performance.getPerformance(data);
  }

  @MessagePattern(pattern(getTechnicianTaskHistory))
  async getTaskHistory(@Payload() data: RpcRequest<typeof getTechnicianTaskHistory>) {
    return this.techniciansService.getTaskHistory(data);
  }

  // ========================================================================
  // SCHEDULE MANAGEMENT
  // ========================================================================

  @MessagePattern(pattern(setTechnicianSchedule))
  async setSchedule(@Payload() data: RpcRequest<typeof setTechnicianSchedule>) {
    return this.schedule.setSchedule(data);
  }

  @MessagePattern(pattern(getTechnicianSchedule))
  async getSchedule(@Payload() data: RpcRequest<typeof getTechnicianSchedule>) {
    return this.schedule.getSchedule(data);
  }

  // ========================================================================
  // TIME-OFF MANAGEMENT
  // ========================================================================

  @MessagePattern(pattern(requestTimeOff))
  async requestTimeOff(@Payload() data: RpcRequest<typeof requestTimeOff>) {
    return this.requests.requestTimeOff(data);
  }

  /** What the caller may request, and at which workspaces a remote day (requests/request-kinds.ts). */
  /** What a leader would check, for the member's OWN request before sending (advice only). */
  @MessagePattern(pattern(requestPrecheck))
  requestPrecheck(@Payload() data: RpcRequest<typeof requestPrecheck>) {
    return this.precheck.precheck(data);
  }

  @MessagePattern(pattern(getRequestOptions))
  async getRequestOptions(@Payload() data: RpcRequest<typeof getRequestOptions>) {
    return this.requests.requestOptions(data);
  }

  @MessagePattern(pattern(getTimeOff))
  async getTimeOff(@Payload() data: RpcRequest<typeof getTimeOff>) {
    return this.leaveRecords.getTimeOff(data);
  }

  /** What a leave range would cost — weekends, rota rest days and holidays left out. */
  @MessagePattern(pattern(countLeaveRpc))
  async countLeave(
    @Payload()
    dto: RpcRequest<typeof countLeaveRpc>,
  ) {
    return this.leaveRecords.countLeave(dto);
  }

  @MessagePattern(pattern(getLeaveBalance))
  async getLeaveBalance(@Payload() dto: RpcRequest<typeof getLeaveBalance>) {
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
  @MessagePattern(pattern(getFloorNow))
  async getFloorNow(@Payload() data: RpcRequest<typeof getFloorNow>) {
    return success(await this.coverFloor.floorNow(data.organizationId, data.scopeSpaceIds));
  }

  /** Cover for every day of a window, per workspace — the wallchart's footer. */
  @MessagePattern(pattern(getCoverRange))
  async getCoverRange(@Payload() data: RpcRequest<typeof getCoverRange>) {
    return success(await this.coverService.coverRange(data.organizationId, data.start, data.end, data.scopeSpaceIds));
  }

  @MessagePattern(pattern(getOrgTimeOff))
  async getOrgTimeOff(@Payload() data: RpcRequest<typeof getOrgTimeOff>) {
    return this.leaveRecords.getOrgTimeOff(data);
  }

  @MessagePattern(pattern(approveTimeOff))
  async approveTimeOff(@Payload() data: RpcRequest<typeof approveTimeOff>) {
    return this.decisions.approveTimeOff(data);
  }

  @MessagePattern(pattern(cancelTimeOff))
  async cancelTimeOff(@Payload() data: RpcRequest<typeof cancelTimeOff>) {
    return this.decisions.cancelTimeOff(data);
  }

  @MessagePattern(pattern(updateTimeOff))
  async updateTimeOff(
    @Payload()
    data: RpcRequest<typeof updateTimeOff>,
  ) {
    return this.decisions.updateTimeOff(data);
  }

  @MessagePattern(pattern(adminDeleteTimeOff))
  async adminDeleteTimeOff(@Payload() data: RpcRequest<typeof adminDeleteTimeOff>) {
    return this.decisions.adminDeleteTimeOff(data);
  }

  @MessagePattern(pattern(addTimeOff))
  async addTimeOff(
    @Payload()
    data: RpcRequest<typeof addTimeOff>,
  ) {
    return this.leaveRecords.addTimeOff(data);
  }

  @MessagePattern(pattern(setDayHours))
  async setDayHours(@Payload() data: RpcRequest<typeof setDayHours>) {
    return this.dayHours.setDayHours(data);
  }

  @MessagePattern(pattern(getDayHours))
  async getDayHours(@Payload() data: RpcRequest<typeof getDayHours>) {
    return this.dayHours.getDayHours(data);
  }

  // ========================================================================
  // AVAILABILITY QUERIES
  // ========================================================================

  @MessagePattern(pattern(getTechniciansAvailability))
  async getAvailability(@Payload() data: RpcRequest<typeof getTechniciansAvailability>) {
    return this.schedule.getAvailability(data);
  }
}
