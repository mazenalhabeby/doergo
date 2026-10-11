import { AttendanceRoutingService } from './attendance-routing.service';
import { AttendanceGeocoderService } from './attendance-geocoder.service';
import { ShiftSweepService } from './shift-sweep.service';
import { ExtraTimeService } from './extra-time.service';
import { ClockOutService } from './clock-out.service';
import { ClockInService } from './clock-in.service';
import { HeartbeatService } from './heartbeat.service';
import { AttendanceReadService } from './attendance-read.service';
import { AutoClockService } from './auto-clock.service';

/**
 * The collaborators behind the AttendanceService facade. One list, read by the
 * module and by every test that builds AttendanceService, so the two cannot drift.
 */
export const ATTENDANCE_SERVICE_PARTS = [
  AttendanceRoutingService,
  AttendanceGeocoderService,
  ShiftSweepService,
  ExtraTimeService,
  ClockOutService,
  ClockInService,
  HeartbeatService,
  AttendanceReadService,
  // The automatic clock: plan, consent, undo, and "is this member automatic" for the closers and sweeps.
  AutoClockService,
];
