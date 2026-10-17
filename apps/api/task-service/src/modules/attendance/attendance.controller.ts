import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AttendanceService } from './attendance.service';
import {
  pattern,
  type RpcRequest,
  listClockInLocations,
  getAttendanceStatus,
  getAttendanceHistory,
  getLocationEntries,
  getLocationEntriesBatch,
  getAllEntries,
  getActiveEntries,
  listNoShows,
  resolveNoShow,
  noShowSummary,
  reportGeofenceExcursion,
  approveGeofenceExcursion,
  rejectGeofenceExcursion,
  listGeofenceExcursions,
  resolveForgotClockOut,
  requestExtraTime,
  approveExtraTime,
  addOvertimeToEntry,
  removeApprovedOvertime,
  rejectExtraTime,
  listPendingExtraTime,
  getEntryPresence,
} from '@hbcfield/shared/microservices';

@Controller()
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @MessagePattern(pattern(listClockInLocations))
  listClockInLocations(@Payload() d: RpcRequest<typeof listClockInLocations>) {
    return this.attendanceService.listClockInLocations(d);
  }

  @MessagePattern(pattern(getAttendanceStatus))
  async getStatus(@Payload() data: RpcRequest<typeof getAttendanceStatus>) {
    return this.attendanceService.getStatus(data);
  }

  @MessagePattern(pattern(getAttendanceHistory))
  async getHistory(
    @Payload()
    data: RpcRequest<typeof getAttendanceHistory>,
  ) {
    return this.attendanceService.getHistory(data);
  }

  @MessagePattern(pattern(getLocationEntries))
  async getLocationEntries(
    @Payload()
    data: RpcRequest<typeof getLocationEntries>,
  ) {
    return this.attendanceService.getLocationEntries(data);
  }

  @MessagePattern(pattern(getLocationEntriesBatch))
  async getLocationEntriesBatch(
    @Payload()
    data: RpcRequest<typeof getLocationEntriesBatch>,
  ) {
    return this.attendanceService.getLocationEntriesBatch(data);
  }

  @MessagePattern(pattern(getAllEntries))
  async getAllEntries(
    @Payload()
    data: RpcRequest<typeof getAllEntries>,
  ) {
    return this.attendanceService.getAllEntries(data);
  }

  @MessagePattern(pattern(getActiveEntries))
  async getActiveEntries(@Payload() data: RpcRequest<typeof getActiveEntries>) {
    return this.attendanceService.getActiveEntries(data);
  }

  @MessagePattern(pattern(listNoShows))
  async listNoShows(@Payload() data: RpcRequest<typeof listNoShows>) {
    return this.attendanceService.listNoShows(data);
  }

  @MessagePattern(pattern(resolveNoShow))
  async resolveNoShow(
    @Payload()
    data: RpcRequest<typeof resolveNoShow>,
  ) {
    return this.attendanceService.resolveNoShow(data);
  }

  @MessagePattern(pattern(noShowSummary))
  async noShowSummary(@Payload() data: RpcRequest<typeof noShowSummary>) {
    return this.attendanceService.noShowSummary(data);
  }

  // ── Geofence excursion ("out of ring") ──
  @MessagePattern(pattern(reportGeofenceExcursion))
  async reportExcursion(
    @Payload()
    data: RpcRequest<typeof reportGeofenceExcursion>,
  ) {
    return this.attendanceService.reportExcursion(data);
  }

  @MessagePattern(pattern(approveGeofenceExcursion))
  async approveExcursion(
    @Payload()
    data: RpcRequest<typeof approveGeofenceExcursion>,
  ) {
    return this.attendanceService.approveExcursion(data);
  }

  @MessagePattern(pattern(rejectGeofenceExcursion))
  async rejectExcursion(
    @Payload()
    data: RpcRequest<typeof rejectGeofenceExcursion>,
  ) {
    return this.attendanceService.rejectExcursion(data);
  }

  @MessagePattern(pattern(listGeofenceExcursions))
  async listExcursions(
    @Payload()
    data: RpcRequest<typeof listGeofenceExcursions>,
  ) {
    return this.attendanceService.listActiveExcursions(data);
  }

  @MessagePattern(pattern(resolveForgotClockOut))
  async resolveForgotClockOut(@Payload() data: RpcRequest<typeof resolveForgotClockOut>) {
    return this.attendanceService.resolveForgotClockOut(data);
  }

  @MessagePattern(pattern(requestExtraTime))
  async requestExtraTime(@Payload() data: RpcRequest<typeof requestExtraTime>) {
    return this.attendanceService.requestExtraTime(data);
  }

  @MessagePattern(pattern(approveExtraTime))
  async approveExtraTime(@Payload() data: RpcRequest<typeof approveExtraTime>) {
    return this.attendanceService.approveExtraTime(data);
  }

  @MessagePattern(pattern(addOvertimeToEntry))
  async addOvertimeToEntry(
    @Payload()
    data: RpcRequest<typeof addOvertimeToEntry>,
  ) {
    return this.attendanceService.addOvertimeToClosedEntry(data);
  }

  @MessagePattern(pattern(removeApprovedOvertime))
  async removeApprovedOvertime(@Payload() data: RpcRequest<typeof removeApprovedOvertime>) {
    return this.attendanceService.removeApprovedOvertime(data);
  }

  @MessagePattern(pattern(rejectExtraTime))
  async rejectExtraTime(@Payload() data: RpcRequest<typeof rejectExtraTime>) {
    return this.attendanceService.rejectExtraTime(data);
  }

  @MessagePattern(pattern(listPendingExtraTime))
  async listPendingExtraTime(@Payload() data: RpcRequest<typeof listPendingExtraTime>) {
    return this.attendanceService.listPendingExtraTime(data);
  }

  @MessagePattern(pattern(getEntryPresence))
  async getEntryPresence(@Payload() data: RpcRequest<typeof getEntryPresence>) {
    return this.attendanceService.getEntryPresence(data);
  }
}
