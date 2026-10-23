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
  'core/attendance-routing.service.ts',
  'core/attendance-geocoder.service.ts',
  'no-shows/shift-sweep.service.ts',
  'shifts/shift-reminder-sweep.service.ts',
  'shifts/shift-instances.service.ts',
  'extra-time/extra-time.service.ts',
  'extra-time/extra-time-approval.service.ts',
  'extra-time/extra-time-decision.service.ts',
  'clock-out/clock-out.service.ts',
  'clock-out/clock-out-alerts.service.ts',
  'clock-out/clock-out-steps.ts',
  'clock-in/clock-in.service.ts',
  'clock-in/clock-in-context.service.ts',
  'clock-in/clock-in-remote.service.ts',
  'clock-in/clock-in-site.writer.ts',
  'clock-in/clock-in-no-shift.ts',
  'clock-in/clock-in-steps.ts',
  'on-the-clock/heartbeat.service.ts',
  'on-the-clock/excursion-notices.service.ts',
  'on-the-clock/excursion-records.ts',
  'on-the-clock/heartbeat-batch.service.ts',
  'on-the-clock/excursions.service.ts',
  'reads/attendance-read.service.ts',
  'reads/entries-read-rules.ts',
  'reads/attendance-entries-read.service.ts',
  'core/attendance-selects.ts',
  'attendance.service.ts',
  'clock-out/shift-closer.service.ts',
  'clock-out/decided-close.service.ts',
  'clock-out/shift-close-sweep.service.ts',
  'entries/entry-change-log.ts',
  'entries/shift-expectation.ts',
  'entries/entry-edit.service.ts',
  'entries/entry-record.service.ts',
  'entries/manual-entries.service.ts',
  'entries/manual-entries-steps.ts',
  'rests/break-status.service.ts',
  'rests/break-read.service.ts',
  'rests/office-breaks.service.ts',
];

export function readAttendanceServiceSource(): string {
  return ATTENDANCE_SERVICE_FILES.map((f) => readFileSync(join(__dirname, '..', f), 'utf8')).join('\n');
}
