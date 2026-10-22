import { Injectable } from '@nestjs/common';
import { ClockInService } from './clock-in/clock-in.service';
import { ClockOutService } from './clock-out/clock-out.service';
import { ExtraTimeService } from './extra-time/extra-time.service';
import { HeartbeatService } from './on-the-clock/heartbeat.service';
import { AttendanceReadService } from './reads/attendance-read.service';
import { ShiftSweepService } from './no-shows/shift-sweep.service';
import { NoShowRecordService } from './no-shows/no-show-record.service';
import { NoShowSettleService } from './no-shows/no-show-settle.service';
import { AttendanceRoutingService } from './core/attendance-routing.service';
import { DecidedCloseService } from './clock-out/decided-close.service';
import { ShiftCloseSweepService } from './clock-out/shift-close-sweep.service';
import { ClockInLocationsService } from './clock-in/clock-in-locations.service';
import { ExtraTimeDecisionService } from './extra-time/extra-time-decision.service';
import { HeartbeatBatchService } from './on-the-clock/heartbeat-batch.service';
import { ExcursionsService } from './on-the-clock/excursions.service';
import { AttendanceEntriesReadService } from './reads/attendance-entries-read.service';
import { ShiftReminderSweepService } from './shifts/shift-reminder-sweep.service';
import { ShiftInstancesService } from './shifts/shift-instances.service';
import { NoShowSummaryService } from './no-shows/no-show-summary.service';

/*
  Pure rules that callers have always imported from here — they live with
  extra time now (extra-time.service.ts).
*/
export { decidableExtraTimeWhere, respondedAt } from './extra-time/extra-time.service';

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
    private readonly clockInLocations: ClockInLocationsService,
    private readonly clockOuts: ClockOutService,
    private readonly closeSweep: ShiftCloseSweepService,
    private readonly decidedClose: DecidedCloseService,
    private readonly extraTime: ExtraTimeService,
    private readonly extraTimeDecisions: ExtraTimeDecisionService,
    private readonly heartbeats: HeartbeatService,
    private readonly excursions: ExcursionsService,
    private readonly heartbeatBatches: HeartbeatBatchService,
    private readonly reads: AttendanceReadService,
    private readonly entryReads: AttendanceEntriesReadService,
    private readonly shiftSweeps: ShiftSweepService,
    private readonly shiftInstances: ShiftInstancesService,
    private readonly shiftReminders: ShiftReminderSweepService,
    private readonly routing: AttendanceRoutingService,
    private readonly noShows: NoShowRecordService,
    private readonly noShowTotals: NoShowSummaryService,
    private readonly noShowSettle: NoShowSettleService,
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

  listClockInLocations(...args: Parameters<ClockInLocationsService['listClockInLocations']>) {
    return this.clockInLocations.listClockInLocations(...args);
  }

  clockIn(...args: Parameters<ClockInService['clockIn']>) {
    return this.clockIns.clockIn(...args);
  }

  // ── Ending a shift.

  clockOut(...args: Parameters<ClockOutService['clockOut']>) {
    return this.clockOuts.clockOut(...args);
  }

  resolveForgotClockOut(...args: Parameters<DecidedCloseService['resolveForgotClockOut']>) {
    return this.decidedClose.resolveForgotClockOut(...args);
  }

  closeAbandonedShifts(...args: Parameters<ShiftCloseSweepService['closeAbandonedShifts']>) {
    return this.closeSweep.closeAbandonedShifts(...args);
  }

  // ── Extra time.

  requestExtraTime(...args: Parameters<ExtraTimeService['requestExtraTime']>) {
    return this.extraTime.requestExtraTime(...args);
  }

  approveExtraTime(...args: Parameters<ExtraTimeService['approveExtraTime']>) {
    return this.extraTime.approveExtraTime(...args);
  }

  removeApprovedOvertime(...args: Parameters<ExtraTimeDecisionService['removeApprovedOvertime']>) {
    return this.extraTimeDecisions.removeApprovedOvertime(...args);
  }

  addOvertimeToClosedEntry(...args: Parameters<ExtraTimeDecisionService['addOvertimeToClosedEntry']>) {
    return this.extraTimeDecisions.addOvertimeToClosedEntry(...args);
  }

  rejectExtraTime(...args: Parameters<ExtraTimeDecisionService['rejectExtraTime']>) {
    return this.extraTimeDecisions.rejectExtraTime(...args);
  }

  listPendingExtraTime(...args: Parameters<ExtraTimeService['listPendingExtraTime']>) {
    return this.extraTime.listPendingExtraTime(...args);
  }

  // ── Heartbeats and geofence excursions.

  heartbeat(...args: Parameters<HeartbeatService['heartbeat']>) {
    return this.heartbeats.heartbeat(...args);
  }

  heartbeatBatch(...args: Parameters<HeartbeatBatchService['heartbeatBatch']>) {
    return this.heartbeatBatches.heartbeatBatch(...args);
  }

  reportExcursion(...args: Parameters<ExcursionsService['reportExcursion']>) {
    return this.excursions.reportExcursion(...args);
  }

  approveExcursion(...args: Parameters<ExcursionsService['approveExcursion']>) {
    return this.excursions.approveExcursion(...args);
  }

  rejectExcursion(...args: Parameters<ExcursionsService['rejectExcursion']>) {
    return this.excursions.rejectExcursion(...args);
  }

  listActiveExcursions(...args: Parameters<ExcursionsService['listActiveExcursions']>) {
    return this.excursions.listActiveExcursions(...args);
  }

  sweepExpiredExcursions(...args: Parameters<ExcursionsService['sweepExpiredExcursions']>) {
    return this.excursions.sweepExpiredExcursions(...args);
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

  getLocationEntries(...args: Parameters<AttendanceEntriesReadService['getLocationEntries']>) {
    return this.entryReads.getLocationEntries(...args);
  }

  getActiveEntries(...args: Parameters<AttendanceEntriesReadService['getActiveEntries']>) {
    return this.entryReads.getActiveEntries(...args);
  }

  getLocationEntriesBatch(...args: Parameters<AttendanceEntriesReadService['getLocationEntriesBatch']>) {
    return this.entryReads.getLocationEntriesBatch(...args);
  }

  getAllEntries(...args: Parameters<AttendanceEntriesReadService['getAllEntries']>) {
    return this.entryReads.getAllEntries(...args);
  }

  // ── Shift reminders, expected shifts and no-shows.

  runShiftReminders(...args: Parameters<ShiftReminderSweepService['runShiftReminders']>) {
    return this.shiftReminders.runShiftReminders(...args);
  }

  /** The slow cron: plan the next shifts, and look again at every open no-show (the rota, leave or calendar may have changed). */
  async materializeShiftInstances(...args: Parameters<ShiftInstancesService['materializeShiftInstances']>) {
    const made = await this.shiftInstances.materializeShiftInstances(...args);
    const noShows = await this.noShowSettle.recheckOpen();
    return { ...made, noShows };
  }

  runNoShowSweep(...args: Parameters<ShiftSweepService['runNoShowSweep']>) {
    return this.shiftSweeps.runNoShowSweep(...args);
  }

  listNoShows(...args: Parameters<NoShowRecordService['list']>) {
    return this.noShows.list(...args);
  }

  resolveNoShow(...args: Parameters<NoShowRecordService['resolve']>) {
    return this.noShows.resolve(...args);
  }

  noShowSummary(...args: Parameters<NoShowSummaryService['summary']>) {
    return this.noShowTotals.summary(...args);
  }

  // ── Who is told.

  notifyTargetsFor(...args: Parameters<AttendanceRoutingService['notifyTargetsFor']>) {
    return this.routing.notifyTargetsFor(...args);
  }
}
