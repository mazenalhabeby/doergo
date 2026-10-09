import { Injectable } from '@nestjs/common';
import { ClockInService } from './clock-in.service';
import { ClockOutService } from './clock-out.service';
import { ExtraTimeService } from './extra-time.service';
import { HeartbeatService } from './heartbeat.service';
import { AttendanceReadService } from './attendance-read.service';
import { ShiftSweepService } from './shift-sweep.service';
import { AttendanceRoutingService } from './attendance-routing.service';

/*
  Pure rules that callers have always imported from here — they live with
  extra time now (extra-time.service.ts).
*/
export { decidableExtraTimeWhere, respondedAt } from './extra-time.service';

/**
 * The attendance service every caller injects — the controller, the
 * processor, the scheduler, the overtime service.
 *
 * A facade: each method hands over to the collaborator that owns it, so the
 * signatures callers depend on stay where they were while the work lives in
 * single-purpose services beside it.
 */
@Injectable()
export class AttendanceService {
  constructor(
    private readonly clockIns: ClockInService,
    private readonly clockOuts: ClockOutService,
    private readonly extraTime: ExtraTimeService,
    private readonly heartbeats: HeartbeatService,
    private readonly reads: AttendanceReadService,
    private readonly shiftSweeps: ShiftSweepService,
    private readonly routing: AttendanceRoutingService,
  ) {}

  // midnightClockOut removed — replaced by timezone-aware autoClockOut that runs every 15 min

  // =========================================================================
  // Report methods → AttendanceReportService
  // Break methods → BreakService
  // Approval methods → ApprovalService
  // =========================================================================

  // ── Starting a shift.

  noShiftAllowanceFor(...args: Parameters<ClockInService['noShiftAllowanceFor']>) {
    return this.clockIns.noShiftAllowanceFor(...args);
  }

  listClockInLocations(...args: Parameters<ClockInService['listClockInLocations']>) {
    return this.clockIns.listClockInLocations(...args);
  }

  clockIn(...args: Parameters<ClockInService['clockIn']>) {
    return this.clockIns.clockIn(...args);
  }

  // ── Ending a shift.

  clockOut(...args: Parameters<ClockOutService['clockOut']>) {
    return this.clockOuts.clockOut(...args);
  }

  resolveForgotClockOut(...args: Parameters<ClockOutService['resolveForgotClockOut']>) {
    return this.clockOuts.resolveForgotClockOut(...args);
  }

  closeAbandonedShifts(...args: Parameters<ClockOutService['closeAbandonedShifts']>) {
    return this.clockOuts.closeAbandonedShifts(...args);
  }

  // ── Extra time.

  requestExtraTime(...args: Parameters<ExtraTimeService['requestExtraTime']>) {
    return this.extraTime.requestExtraTime(...args);
  }

  approveExtraTime(...args: Parameters<ExtraTimeService['approveExtraTime']>) {
    return this.extraTime.approveExtraTime(...args);
  }

  removeApprovedOvertime(...args: Parameters<ExtraTimeService['removeApprovedOvertime']>) {
    return this.extraTime.removeApprovedOvertime(...args);
  }

  addOvertimeToClosedEntry(...args: Parameters<ExtraTimeService['addOvertimeToClosedEntry']>) {
    return this.extraTime.addOvertimeToClosedEntry(...args);
  }

  rejectExtraTime(...args: Parameters<ExtraTimeService['rejectExtraTime']>) {
    return this.extraTime.rejectExtraTime(...args);
  }

  listPendingExtraTime(...args: Parameters<ExtraTimeService['listPendingExtraTime']>) {
    return this.extraTime.listPendingExtraTime(...args);
  }

  // ── Heartbeats and geofence excursions.

  heartbeat(...args: Parameters<HeartbeatService['heartbeat']>) {
    return this.heartbeats.heartbeat(...args);
  }

  heartbeatBatch(...args: Parameters<HeartbeatService['heartbeatBatch']>) {
    return this.heartbeats.heartbeatBatch(...args);
  }

  reportExcursion(...args: Parameters<HeartbeatService['reportExcursion']>) {
    return this.heartbeats.reportExcursion(...args);
  }

  approveExcursion(...args: Parameters<HeartbeatService['approveExcursion']>) {
    return this.heartbeats.approveExcursion(...args);
  }

  rejectExcursion(...args: Parameters<HeartbeatService['rejectExcursion']>) {
    return this.heartbeats.rejectExcursion(...args);
  }

  listActiveExcursions(...args: Parameters<HeartbeatService['listActiveExcursions']>) {
    return this.heartbeats.listActiveExcursions(...args);
  }

  sweepExpiredExcursions(...args: Parameters<HeartbeatService['sweepExpiredExcursions']>) {
    return this.heartbeats.sweepExpiredExcursions(...args);
  }

  // ── Reading attendance.

  getEntryPresence(...args: Parameters<AttendanceReadService['getEntryPresence']>) {
    return this.reads.getEntryPresence(...args);
  }

  getStatus(...args: Parameters<AttendanceReadService['getStatus']>) {
    return this.reads.getStatus(...args);
  }

  getHistory(...args: Parameters<AttendanceReadService['getHistory']>) {
    return this.reads.getHistory(...args);
  }

  getLocationEntries(...args: Parameters<AttendanceReadService['getLocationEntries']>) {
    return this.reads.getLocationEntries(...args);
  }

  getActiveEntries(...args: Parameters<AttendanceReadService['getActiveEntries']>) {
    return this.reads.getActiveEntries(...args);
  }

  getLocationEntriesBatch(...args: Parameters<AttendanceReadService['getLocationEntriesBatch']>) {
    return this.reads.getLocationEntriesBatch(...args);
  }

  getAllEntries(...args: Parameters<AttendanceReadService['getAllEntries']>) {
    return this.reads.getAllEntries(...args);
  }

  // ── Shift reminders, expected shifts and no-shows.

  runShiftReminders(...args: Parameters<ShiftSweepService['runShiftReminders']>) {
    return this.shiftSweeps.runShiftReminders(...args);
  }

  materializeShiftInstances(...args: Parameters<ShiftSweepService['materializeShiftInstances']>) {
    return this.shiftSweeps.materializeShiftInstances(...args);
  }

  runNoShowSweep(...args: Parameters<ShiftSweepService['runNoShowSweep']>) {
    return this.shiftSweeps.runNoShowSweep(...args);
  }

  listNoShows(...args: Parameters<ShiftSweepService['listNoShows']>) {
    return this.shiftSweeps.listNoShows(...args);
  }

  resolveNoShow(...args: Parameters<ShiftSweepService['resolveNoShow']>) {
    return this.shiftSweeps.resolveNoShow(...args);
  }

  // ── Who is told.

  notifyTargetsFor(...args: Parameters<AttendanceRoutingService['notifyTargetsFor']>) {
    return this.routing.notifyTargetsFor(...args);
  }
}
