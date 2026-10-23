import { readFileSync } from 'fs';
import { join } from 'path';
import { combinedServices } from '../../../common/testing/combined-services';
import { AttendanceController } from '../attendance.controller';
import { WorklogController } from '../worklog.controller';
import { AttendanceRecordsController } from '../attendance-records.controller';
import { AttendanceReportsController } from '../attendance-reports.controller';
import { BreaksController } from '../breaks.controller';
import { AttendanceApprovalsController } from '../attendance-approvals.controller';
import { ExtraTimeController } from '../extra-time.controller';
import { EntryEditsController } from '../entry-edits.controller';

/** Every /attendance controller — one class until 2026-10-16, split by job since. */
export const ATTENDANCE_CONTROLLERS = [
  AttendanceController,
  WorklogController,
  AttendanceRecordsController,
  AttendanceReportsController,
  BreaksController,
  AttendanceApprovalsController,
  ExtraTimeController,
  EntryEditsController,
] as const;

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };
export type AttendanceControllers = Public<AttendanceController> &
  Public<WorklogController> &
  Public<AttendanceRecordsController> &
  Public<AttendanceReportsController> &
  Public<BreaksController> &
  Public<AttendanceApprovalsController> &
  Public<ExtraTimeController> &
  Public<EntryEditsController>;

/** All of them over the same two services, as one object. */
export function attendanceControllers(service: unknown, queue: unknown): AttendanceControllers {
  // Every gateway service (AttendanceService and the ones split out of it) is the one mock; the queue is the other.
  const s = service as never;
  return combinedServices<AttendanceControllers>(
    new AttendanceController(s, queue as never),
    new WorklogController(s),
    new AttendanceRecordsController(s),
    new AttendanceReportsController(s),
    new BreaksController(s),
    new AttendanceApprovalsController(s),
    new ExtraTimeController(s),
    new EntryEditsController(s),
  );
}

/** The route handler named `name`, from whichever controller owns it (for its decorator metadata). */
export function attendanceRoute(name: string): (...a: unknown[]) => unknown {
  for (const C of ATTENDANCE_CONTROLLERS) {
    const fn = (C.prototype as unknown as Record<string, unknown>)[name];
    if (typeof fn === 'function' && Object.prototype.hasOwnProperty.call(C.prototype, name)) return fn as never;
  }
  throw new Error(`no /attendance route ${name}`);
}

/** The source of every /attendance controller, concatenated — for the tests that read decorators as text. */
export const ATTENDANCE_CONTROLLER_FILES = [
  'attendance.controller.ts',
  'worklog.controller.ts',
  'attendance-records.controller.ts',
  'attendance-reports.controller.ts',
  'breaks.controller.ts',
  'attendance-approvals.controller.ts',
  'extra-time.controller.ts',
  'entry-edits.controller.ts',
];
export function attendanceControllerSource(): string {
  return ATTENDANCE_CONTROLLER_FILES.map((f) => readFileSync(join(__dirname, '..', f), 'utf8')).join('\n');
}
