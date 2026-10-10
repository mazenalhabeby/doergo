/**
 * Attendance — the clock, rests, the review surface, the work log, shift
 * issues and overtime. Gateway: modules/attendance, shift-issues, overtime.
 *
 * `keep` mirrors the phone's offline allow-list: a member's own history is
 * kept; PRESENCE (who is on right now, running breaks, no-shows, the pending
 * count) never is — stale is wrong there, not old.
 */
import type {
  AttendanceHistoryParams,
  AttendanceStatus,
  Break,
  BreakStatus,
  ClockInInput,
  ClockOutInput,
  CompanyLocation,
  GeofenceExcursion,
  TimeEntry,
} from '../../types';
import type { BreakType } from '../../types';
import { defineEndpoints, endpoint } from '../core/define';
import { path, withQuery } from '../core/path';
import type { OvertimeRequest, PresignedUpload, ShiftIssue, ShiftIssueEvent, WorkLogAttachment, WorkLogNote } from '../types';

type Id = { id: string };
type Q = Record<string, string | number | boolean | undefined>;

/** A scheduled shift with no clock-in — what `/attendance/no-shows` answers. */
export interface NoShow {
  id: string;
  userId: string;
  userName: string;
  avatarUrl?: string | null;
  spaceId: string;
  spaceName: string;
  expectedClockInAt: string;
  expectedClockOutAt: string;
  state: string;
  reminderCount: number;
  localDate: string;
  excuseReason?: string | null;
}

export interface HeartbeatResult {
  withinGeofence: boolean;
  inRing: boolean;
  distance: number;
  /** Always false now — kept for older builds. */
  autoClockedOut: boolean;
  activeExcursion: GeofenceExcursion | null;
}

export interface AllEntriesQuery {
  date?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  search?: string;
  spaceId?: string;
  page?: number;
  limit?: number;
}

export const attendanceEndpoints = defineEndpoints('attendance', {
  // ── my clock ──
  /** The caller's running shift. Never kept: read offline through the phone's own store. */
  status: endpoint<void, AttendanceStatus>({ method: 'GET', path: () => '/attendance/status', keep: false }),
  /** Where the CALLER may clock in right now (not `GET /locations`, which is what they can see). */
  clockInLocations: endpoint<void, CompanyLocation[]>({ method: 'GET', path: () => '/attendance/clock-in-locations', keep: true }),
  clockIn: endpoint<void, TimeEntry, ClockInInput>({ method: 'POST', path: () => '/attendance/clock-in' }),
  clockOut: endpoint<void, TimeEntry, ClockOutInput>({ method: 'POST', path: () => '/attendance/clock-out' }),
  heartbeat: endpoint<void, HeartbeatResult, { lat: number; lng: number; accuracy?: number }>({ method: 'POST', path: () => '/attendance/heartbeat' }),
  /** Check-ins kept while the phone had no signal, each with the moment it was taken. */
  heartbeatBatch: endpoint<void, { recorded: number; opened: boolean; returned: boolean }, { points: Array<{ lat: number; lng: number; accuracy?: number; recordedAt: string }> }>({
    method: 'POST',
    path: () => '/attendance/heartbeat/batch',
  }),
  history: endpoint<AttendanceHistoryParams | void, TimeEntry[]>({ method: 'GET', path: (q) => withQuery('/attendance/history', q || undefined), keep: true }),
  forgotClockOut: endpoint<Id, TimeEntry, { clockOutAt: string }>({ method: 'POST', path: (a) => path`/attendance/entries/${a.id}/forgot-clock-out` }),
  requestExtraTime: endpoint<Id, { entryId: string; status: string }>({ method: 'POST', path: (a) => path`/attendance/entries/${a.id}/request-extra-time` }),

  // ── rests ──
  startBreak: endpoint<{ type?: BreakType } | void, Break, { notes?: string; ruleId?: string }>({
    method: 'POST',
    path: (q) => withQuery('/attendance/breaks/start', q || undefined),
  }),
  /** "Later." The count is kept by the SERVER, or a phone that is off would silence the alarm. */
  snoozeBreak: endpoint<void, { state: string; dueAt?: string; snoozeCount: number }, { ruleId?: string }>({
    method: 'POST',
    path: () => '/attendance/breaks/snooze',
  }),
  endBreak: endpoint<void, Break, { notes?: string }>({ method: 'POST', path: () => '/attendance/breaks/end' }),
  breakStatus: endpoint<void, BreakStatus>({ method: 'GET', path: () => '/attendance/breaks/status', keep: false }),
  activeBreaks: endpoint<void, Array<{ userId: string; [k: string]: unknown }>>({ method: 'GET', path: () => '/attendance/breaks/active', keep: false }),
  endBreakFor: endpoint<Id, Break>({ method: 'POST', path: (a) => path`/attendance/breaks/${a.id}/end` }),
  removeBreak: endpoint<Id, void>({ method: 'DELETE', path: (a) => path`/attendance/breaks/${a.id}` }),
  breaksHistory: endpoint<Q | void, Break[]>({ method: 'GET', path: (q) => withQuery('/attendance/breaks/history', q || undefined), keep: true }),
  breaksSummary: endpoint<Q, unknown>({ method: 'GET', path: (q) => withQuery('/attendance/breaks/summary', q), keep: true }),
  breakRules: endpoint<{ spaceId?: string; shiftId?: string } | void, unknown[]>({
    method: 'GET',
    path: (q) => withQuery('/attendance/break-rules', q || undefined),
    keep: true,
  }),
  createBreakRule: endpoint<void, unknown, Record<string, unknown>>({ method: 'POST', path: () => '/attendance/break-rules' }),
  updateBreakRule: endpoint<Id, unknown, Record<string, unknown>>({ method: 'PATCH', path: (a) => path`/attendance/break-rules/${a.id}` }),
  removeBreakRule: endpoint<Id, void>({ method: 'DELETE', path: (a) => path`/attendance/break-rules/${a.id}` }),

  // ── entries (the review surface; the server narrows to the caller's spaces) ──
  /**
   * Time entries in the caller's spaces. ⚠️ With `status: 'CLOCKED_IN'` this is
   * PRESENCE (the Crew card) and is never kept offline.
   */
  allEntries: endpoint<AllEntriesQuery | void, TimeEntry[]>({
    method: 'GET',
    path: (q) => withQuery('/attendance/all-entries', q || undefined),
    keep: (q) => !(q && (q as AllEntriesQuery).status === 'CLOCKED_IN'),
  }),
  /** Who is clocked in RIGHT NOW, org-wide. Presence — never kept. */
  activeEntries: endpoint<void, TimeEntry[]>({ method: 'GET', path: () => '/attendance/active-entries', keep: false }),
  entries: endpoint<{ ids: string[]; date?: string }, TimeEntry[]>({
    method: 'GET',
    path: (q) => withQuery('/attendance/entries', { ids: q.ids, date: q.date }),
    keep: true,
  }),
  locationEntries: endpoint<{ locationId: string } & Q, TimeEntry[]>({
    method: 'GET',
    path: ({ locationId, ...q }) => withQuery(path`/attendance/locations/${locationId}/entries`, q),
    keep: true,
  }),
  manualEntry: endpoint<void, TimeEntry, Record<string, unknown>>({ method: 'POST', path: () => '/attendance/entries/manual' }),
  /** Correct a shift's times or note. `reason` is required and kept with the entry. */
  editEntry: endpoint<Id, TimeEntry, { clockInAt?: string; clockOutAt?: string; notes?: string; timezone?: string; reason: string }>({
    method: 'PUT',
    path: (a) => path`/attendance/entries/${a.id}/edit`,
  }),
  removeEntry: endpoint<Id, void>({ method: 'DELETE', path: (a) => path`/attendance/entries/${a.id}` }),
  entryHistory: endpoint<Id, unknown[]>({ method: 'GET', path: (a) => path`/attendance/entries/${a.id}/history`, keep: true }),
  entryBreaks: endpoint<Id, Break[]>({ method: 'GET', path: (a) => path`/attendance/entries/${a.id}/breaks`, keep: true }),
  addEntryBreak: endpoint<Id, Break, Record<string, unknown>>({ method: 'POST', path: (a) => path`/attendance/entries/${a.id}/breaks` }),
  entryPresence: endpoint<Id, unknown>({ method: 'GET', path: (a) => path`/attendance/entries/${a.id}/presence`, keep: false }),
  entryOvertime: endpoint<Id, unknown, Record<string, unknown>>({ method: 'POST', path: (a) => path`/attendance/entries/${a.id}/overtime` }),
  removeOvertime: endpoint<Id, void>({ method: 'DELETE', path: (a) => path`/attendance/overtime/${a.id}` }),

  // ── approvals ──
  /**
   * Completed entries waiting for a decision. ⚠️ `summary: true` answers the
   * COUNTS only (`{ total, bySpace }`) — a number beside presence, never kept.
   */
  pendingApprovals: endpoint<{ page?: number; limit?: number; spaceId?: string; summary?: boolean } | void, unknown>({
    method: 'GET',
    path: (q) => withQuery('/attendance/approvals/pending', q || undefined),
    keep: (q) => !(q && (q as { summary?: boolean }).summary),
  }),
  approve: endpoint<Id, TimeEntry, { notes?: string }>({ method: 'POST', path: (a) => path`/attendance/approvals/${a.id}/approve` }),
  reject: endpoint<Id, TimeEntry, { reason: string }>({ method: 'POST', path: (a) => path`/attendance/approvals/${a.id}/reject` }),

  // ── away from the site ──
  reportExcursion: endpoint<void, GeofenceExcursion, { reason: string; requestedMinutes: number }>({
    method: 'POST',
    path: () => '/attendance/excursions/report',
  }),
  excursions: endpoint<{ status?: string } | void, GeofenceExcursion[]>({
    method: 'GET',
    path: (q) => withQuery('/attendance/excursions', q || undefined),
    keep: true,
  }),
  approveExcursion: endpoint<Id, GeofenceExcursion, Record<string, unknown>>({ method: 'PATCH', path: (a) => path`/attendance/excursions/${a.id}/approve` }),
  rejectExcursion: endpoint<Id, GeofenceExcursion, Record<string, unknown>>({ method: 'PATCH', path: (a) => path`/attendance/excursions/${a.id}/reject` }),

  // ── no-shows and extra time ──
  /** Scheduled shifts nobody clocked in for. Presence — never kept. */
  noShows: endpoint<{ days?: number; spaceId?: string } | void, NoShow[]>({ method: 'GET', path: (q) => withQuery('/attendance/no-shows', q || undefined), keep: false }),
  resolveNoShow: endpoint<Id, NoShow, { action: 'excuse' | 'reopen'; reason?: string }>({ method: 'PATCH', path: (a) => path`/attendance/no-shows/${a.id}` }),
  extraTimePending: endpoint<void, TimeEntry[]>({ method: 'GET', path: () => '/attendance/extra-time/pending', keep: true }),
  approveExtraTime: endpoint<Id, unknown, { minutes: number }>({ method: 'POST', path: (a) => path`/attendance/extra-time/${a.id}/approve` }),
  rejectExtraTime: endpoint<Id, unknown>({ method: 'POST', path: (a) => path`/attendance/extra-time/${a.id}/reject` }),
});

/** A session's work log: timestamped notes (optionally with photos) during a clock-in. */
export const worklogEndpoints = defineEndpoints('worklog', {
  /** Never kept: read offline through the phone's own store with unsent notes laid on top. */
  list: endpoint<{ entryId: string }, WorkLogNote[]>({ method: 'GET', path: (a) => path`/attendance/entries/${a.entryId}/worklog`, keep: false }),
  add: endpoint<{ entryId: string }, WorkLogNote, { body: string; at?: string; taskId?: string }>({
    method: 'POST',
    path: (a) => path`/attendance/entries/${a.entryId}/worklog`,
  }),
  /** Offline flush: many notes in one round-trip. */
  addBatch: endpoint<{ entryId: string }, { inserted: number }, { notes: Array<{ body: string; at?: string; taskId?: string }> }>({
    method: 'POST',
    path: (a) => path`/attendance/entries/${a.entryId}/worklog/batch`,
  }),
  remove: endpoint<{ noteId: string }, void>({ method: 'DELETE', path: (a) => path`/attendance/worklog/${a.noteId}` }),
  attachmentPresign: endpoint<{ noteId: string }, PresignedUpload, { fileName: string; mimeType: string }>({
    method: 'POST',
    path: (a) => path`/attendance/worklog/${a.noteId}/attachments/presign`,
  }),
  attachmentConfirm: endpoint<
    { noteId: string },
    WorkLogAttachment,
    { fileKey: string; fileUrl: string; fileName: string; fileSize: number; mimeType: string; width?: number; height?: number }
  >({ method: 'POST', path: (a) => path`/attendance/worklog/${a.noteId}/attachments` }),
  removeAttachment: endpoint<{ attachmentId: string }, void>({
    method: 'DELETE',
    path: (a) => path`/attendance/worklog/attachments/${a.attachmentId}`,
  }),
});

export const shiftIssuesEndpoints = defineEndpoints('shiftIssues', {
  list: endpoint<{ status?: string; scope?: string } | void, ShiftIssue[]>({ method: 'GET', path: (q) => withQuery('/shift-issues', q || undefined), keep: true }),
  get: endpoint<Id, ShiftIssue>({ method: 'GET', path: (a) => path`/shift-issues/${a.id}`, keep: true }),
  create: endpoint<void, ShiftIssue, { title: string; description?: string; severity?: string; timeEntryId?: string; spaceId?: string }>({
    method: 'POST',
    path: () => '/shift-issues',
  }),
  message: endpoint<Id, ShiftIssueEvent, { body?: string; attachments?: unknown[] }>({ method: 'POST', path: (a) => path`/shift-issues/${a.id}/messages` }),
  acknowledge: endpoint<Id, ShiftIssue>({ method: 'POST', path: (a) => path`/shift-issues/${a.id}/acknowledge` }),
  assign: endpoint<Id, ShiftIssue, { assigneeId: string | null }>({ method: 'POST', path: (a) => path`/shift-issues/${a.id}/assign` }),
  setStatus: endpoint<Id, ShiftIssue, { status: string; note?: string }>({ method: 'POST', path: (a) => path`/shift-issues/${a.id}/status` }),
  attachmentPresign: endpoint<Id, PresignedUpload, { fileName: string; mimeType: string }>({
    method: 'POST',
    path: (a) => path`/shift-issues/${a.id}/attachments/presign`,
  }),
});

export const overtimeEndpoints = defineEndpoints('overtime', {
  active: endpoint<void, OvertimeRequest | null>({ method: 'GET', path: () => '/overtime/active', keep: true }),
  respond: endpoint<void, unknown, { response: 'YES' | 'NO'; reason?: string }>({ method: 'POST', path: () => '/overtime/respond' }),
  approve: endpoint<Id, unknown, { maxDurationMinutes: number; notes?: string }>({ method: 'POST', path: (a) => path`/overtime/${a.id}/approve` }),
  approveSignature: endpoint<
    Id,
    unknown,
    { approverId: string; leaderName: string; leaderSignature: string; maxDurationMinutes: number; notes?: string }
  >({ method: 'POST', path: (a) => path`/overtime/${a.id}/approve-signature` }),
  reject: endpoint<Id, unknown, { reason: string }>({ method: 'POST', path: (a) => path`/overtime/${a.id}/reject` }),
  pendingApprovals: endpoint<void, OvertimeRequest[]>({ method: 'GET', path: () => '/overtime/pending-approvals', keep: true }),
  history: endpoint<{ technicianId?: string; status?: string; page?: number; limit?: number } | void, OvertimeRequest[]>({
    method: 'GET',
    path: (q) => withQuery('/overtime/history', q || undefined),
    keep: true,
  }),
});
