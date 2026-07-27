import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { TechniciansService } from './technicians.service';
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
  constructor(private readonly techniciansService: TechniciansService) {}

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
