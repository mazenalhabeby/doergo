import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { success } from '@hbcfield/shared';
import { TechniciansService } from './technicians.service';
import { CoverService } from './cover.service';
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
  ) {}

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

  @MessagePattern({ cmd: 'get_time_off' })
  async getTimeOff(@Payload() data: GetTimeOffDto) {
    return this.techniciansService.getTimeOff(data);
  }

  @MessagePattern({ cmd: 'get_leave_balance' })
  async getLeaveBalance(@Payload() dto: { technicianId: string; organizationId: string }) {
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
