import { AttendanceRoutingService } from './core/attendance-routing.service';
import { AttendanceGeocoderService } from './core/attendance-geocoder.service';
import { ShiftSweepService } from './no-shows/shift-sweep.service';
import { ExtraTimeService } from './extra-time/extra-time.service';
import { ClockOutService } from './clock-out/clock-out.service';
import { ClockOutAlertsService } from './clock-out/clock-out-alerts.service';
import { DecidedCloseService } from './clock-out/decided-close.service';
import { ShiftCloseSweepService } from './clock-out/shift-close-sweep.service';
import { ClockInService } from './clock-in/clock-in.service';
import { ClockInContextService } from './clock-in/clock-in-context.service';
import { ClockInRemoteService } from './clock-in/clock-in-remote.service';
import { ClockInSiteWriter } from './clock-in/clock-in-site.writer';
import { ClockInLocationsService } from './clock-in/clock-in-locations.service';
import { HeartbeatService } from './on-the-clock/heartbeat.service';
import { AttendanceReadService } from './reads/attendance-read.service';
import { AutoClockService } from './auto-clock/auto-clock.service';
import { NoShowSettleService } from './no-shows/no-show-settle.service';
import { NoShowRecordService } from './no-shows/no-show-record.service';
import { ExtraTimeDecisionService } from './extra-time/extra-time-decision.service';
import { HeartbeatBatchService } from './on-the-clock/heartbeat-batch.service';
import { ExcursionsService } from './on-the-clock/excursions.service';
import { AttendanceEntriesReadService } from './reads/attendance-entries-read.service';
import { ShiftReminderSweepService } from './shifts/shift-reminder-sweep.service';
import { ShiftInstancesService } from './shifts/shift-instances.service';
import { AutoClockPlanService } from './auto-clock/auto-clock-plan.service';
import { AutoClockUndoService } from './auto-clock/auto-clock-undo.service';
import { NoShowSummaryService } from './no-shows/no-show-summary.service';

/**
 * The collaborators behind the AttendanceService facade, as ONE flat list for the tests that build it.
 * The app wires them through the sub-modules (see attendance.module.ts); `tools/di-check.mjs` proves it.
 */
export const ATTENDANCE_SERVICE_PARTS = [
  AttendanceRoutingService,
  AttendanceGeocoderService,
  ShiftSweepService,
  ShiftReminderSweepService,
  ShiftInstancesService,
  // A no-show: what the system closes itself, and the record + decisions.
  NoShowSettleService,
  NoShowRecordService,
  NoShowSummaryService,
  ExtraTimeService,
  ExtraTimeDecisionService,
  ClockOutAlertsService,
  ClockOutService,
  // Closing a shift by an answer, and the sweeps that close what nobody closed.
  DecidedCloseService,
  ShiftCloseSweepService,
  // A clock-in: what the list and the clock-in share, the remote half, the on-site half, the steps.
  ClockInContextService,
  ClockInRemoteService,
  ClockInSiteWriter,
  ClockInService,
  ClockInLocationsService,
  HeartbeatService,
  HeartbeatBatchService,
  ExcursionsService,
  AttendanceReadService,
  AttendanceEntriesReadService,
  // The automatic clock: plan, consent, undo, and "is this member automatic" for the closers and sweeps.
  AutoClockService,
  AutoClockPlanService,
  AutoClockUndoService,
];
