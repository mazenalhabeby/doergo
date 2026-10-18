import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The source of the attendance service, for the specs that pin what its code says.
 *
 * AttendanceService is a facade over single-purpose collaborators; the rules
 * those specs guard live in the collaborators now. Reading every file keeps
 * each guard on the same code it always covered. The facade comes LAST, so a
 * search for a method's body finds the implementation, not the hand-over.
 */
export const ATTENDANCE_SERVICE_FILES = [
  'attendance-routing.service.ts',
  'attendance-geocoder.service.ts',
  'shift-sweep.service.ts',
  'shift-reminder-sweep.service.ts',
  'shift-instances.service.ts',
  'extra-time.service.ts',
  'extra-time.base.ts',
  'extra-time-decision.service.ts',
  'clock-out.service.ts',
  'clock-out-alerts.service.ts',
  'clock-out-steps.ts',
  'clock-in.service.ts',
  'clock-in-context.service.ts',
  'clock-in-remote.service.ts',
  'clock-in-site.writer.ts',
  'clock-in-no-shift.ts',
  'clock-in-steps.ts',
  'heartbeat.service.ts',
  'heartbeat.base.ts',
  'heartbeat-batch.service.ts',
  'excursions.service.ts',
  'attendance-read.service.ts',
  'attendance-read.base.ts',
  'attendance-entries-read.service.ts',
  'attendance-selects.ts',
  'attendance.service.ts',
  'shift-close.base.ts',
  'decided-close.service.ts',
  'shift-close-sweep.service.ts',
  'entry-service.base.ts',
  'entry-edit.service.ts',
  'entry-record.service.ts',
  'manual-entries.service.ts',
  'manual-entries-steps.ts',
  'break-status.service.ts',
  'break-read.service.ts',
  'office-breaks.service.ts',
];

export function readAttendanceServiceSource(): string {
  return ATTENDANCE_SERVICE_FILES.map((f) => readFileSync(join(__dirname, '..', f), 'utf8')).join('\n');
}
