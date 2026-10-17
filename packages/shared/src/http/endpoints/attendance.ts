/**
 * Attendance — the clock, rests, the review surface, the work log, shift
 * issues and overtime. Gateway: modules/attendance, shift-issues, overtime.
 *
 * `keep` mirrors the phone's offline allow-list: a member's own history is
 * kept; PRESENCE (who is on right now, running breaks, no-shows, the pending
 * count) never is — stale is wrong there, not old.
 */
export { type NoShow, type HeartbeatResult, type AllEntriesQuery, attendanceEndpoints } from './attendance-parts/clock';
export { worklogEndpoints, shiftIssuesEndpoints, overtimeEndpoints } from './attendance-parts/work';
