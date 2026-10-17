import { AttendanceRoutingService } from './attendance-routing.service';
import { AttendanceGeocoderService } from './attendance-geocoder.service';
import { ShiftSweepService } from './shift-sweep.service';
import { ExtraTimeService } from './extra-time.service';
import { ClockOutService } from './clock-out.service';
import { DecidedCloseService } from './decided-close.service';
import { ShiftCloseSweepService } from './shift-close-sweep.service';
import { ClockInService } from './clock-in.service';
import { ClockInLocationsService } from './clock-in-locations.service';
import { HeartbeatService } from './heartbeat.service';
import { AttendanceReadService } from './attendance-read.service';
import { AutoClockService } from './auto-clock.service';
import { NoShowSettleService } from './no-show-settle.service';
import { NoShowRecordService } from './no-show-record.service';
import { ExtraTimeDecisionService } from './extra-time-decision.service';
import { HeartbeatBatchService } from './heartbeat-batch.service';
import { ExcursionsService } from './excursions.service';
import { AttendanceEntriesReadService } from './attendance-entries-read.service';
import { ShiftReminderSweepService } from './shift-reminder-sweep.service';
import { ShiftInstancesService } from './shift-instances.service';
import { AutoClockPlanService } from './auto-clock-plan.service';
import { AutoClockUndoService } from './auto-clock-undo.service';
import { NoShowSummaryService } from './no-show-summary.service';

/**
 * The collaborators behind the AttendanceService facade. One list, read by the
 * module and by every test that builds AttendanceService, so the two cannot drift.
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
  ClockOutService,
  // Closing a shift by an answer, and the sweeps that close what nobody closed.
  DecidedCloseService,
  ShiftCloseSweepService,
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
