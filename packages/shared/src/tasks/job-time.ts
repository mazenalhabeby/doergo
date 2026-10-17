
/**
 * Job time — ONE rule for the job page, the handover, the clock-out sheet and
 * the report.
 *
 * Worked out from the moments already saved for every step (no running timer,
 * nothing in the background), and split three ways:
 *
 *   travel  — on the way: a working step whose only tools are the route (`gps`)
 *             and the clock (`timer`) — EN_ROUTE, IN_TRANSIT, any custom twin;
 *   working — every other working step (the clock gate's own rule);
 *   blocked — reported an issue, until it is resumed.
 *
 * ⚠️ ONLY INSIDE A SHIFT. Each worker's share is clipped to the time they were
 * clocked in, so job time never runs overnight and can never be more than the
 * time on the timesheet: billed hours and worked hours come from the same
 * moments. A paused job (clock-out) counts nothing until it is picked up.
 *
 * ⚠️ PER PERSON. A worker is credited from their own first move on the job —
 * or the office's move made FOR them — so whoever takes a job over starts at
 * their own Start work, and the time before stays the previous worker's.
 */
export {
  type JobTimeKind,
  type JobTime,
  type WorkTimelineEvent,
  type ShiftSpan,
  type JobSpan,
  stepTimeKind,
  jobSpans,
  joinedJobAt,
  jobWindows,
  selfBlockWindows,
  personalSpans,
  workerJobTime,
  exclusiveSpans,
  addJobTime,
} from './job-time/spans';
export {
  NO_JOB_TIME,
  liveJobKind,
  type OfficeStart,
  OFFICE_START_REASON_MAX,
  OFFICE_START_CODES,
  type JobTimeReading,
  jobTimeAt,
  shiftsWithoutRests,
  clockMinutes,
} from './job-time/readings';
