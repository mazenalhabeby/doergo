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
  'extra-time.service.ts',
  'clock-out.service.ts',
  'clock-in.service.ts',
  'heartbeat.service.ts',
  'attendance-read.service.ts',
  'attendance-selects.ts',
  'attendance.service.ts',
];

export function readAttendanceServiceSource(): string {
  return ATTENDANCE_SERVICE_FILES.map((f) => readFileSync(join(__dirname, '..', f), 'utf8')).join('\n');
}
