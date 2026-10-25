/** The work log, shift issues and overtime — moved here unchanged from attendance.ts. */
import { defineEndpoints, endpoint } from '../../core/define';
import type {
  OvertimeRequest,
  PresignedUpload,
  ShiftIssue,
  ShiftIssueEvent,
  WorkLogAttachment,
  WorkLogNote,
} from '../../types';
import { path, withQuery } from '../../core/path';
import type { OvertimeSummary } from '../../../attendance/overtime-round';
import type { OutsideShiftWaiting } from '../../../attendance/outside-shift';
import type { Id } from './clock';

/** A session's work log: timestamped notes (optionally with photos) during a clock-in. */
export const worklogEndpoints = defineEndpoints('worklog', {
  /** Never kept: read offline through the phone's own store with unsent notes laid on top. */
  list: endpoint<{ entryId: string }, WorkLogNote[]>({
    method: 'GET',
    path: (a) => path`/attendance/entries/${a.entryId}/worklog`,
    keep: false,
  }),
  add: endpoint<{ entryId: string }, WorkLogNote, { body: string; at?: string; taskId?: string }>({
    method: 'POST',
    path: (a) => path`/attendance/entries/${a.entryId}/worklog`,
  }),
  /** Offline flush: many notes in one round-trip. */
  addBatch: endpoint<
    { entryId: string },
    { inserted: number },
    { notes: Array<{ body: string; at?: string; taskId?: string }> }
  >({
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
    {
      fileKey: string;
      fileUrl: string;
      fileName: string;
      fileSize: number;
      mimeType: string;
      width?: number;
      height?: number;
    }
  >({ method: 'POST', path: (a) => path`/attendance/worklog/${a.noteId}/attachments` }),
  removeAttachment: endpoint<{ attachmentId: string }, void>({
    method: 'DELETE',
    path: (a) => path`/attendance/worklog/attachments/${a.attachmentId}`,
  }),
});

export const shiftIssuesEndpoints = defineEndpoints('shiftIssues', {
  list: endpoint<{ status?: string; scope?: string } | void, ShiftIssue[]>({
    method: 'GET',
    path: (q) => withQuery('/shift-issues', q || undefined),
    keep: true,
  }),
  get: endpoint<Id, ShiftIssue>({ method: 'GET', path: (a) => path`/shift-issues/${a.id}`, keep: true }),
  create: endpoint<
    void,
    ShiftIssue,
    { title: string; description?: string; severity?: string; timeEntryId?: string; spaceId?: string }
  >({
    method: 'POST',
    path: () => '/shift-issues',
  }),
  message: endpoint<Id, ShiftIssueEvent, { body?: string; attachments?: unknown[] }>({
    method: 'POST',
    path: (a) => path`/shift-issues/${a.id}/messages`,
  }),
  acknowledge: endpoint<Id, ShiftIssue>({ method: 'POST', path: (a) => path`/shift-issues/${a.id}/acknowledge` }),
  assign: endpoint<Id, ShiftIssue, { assigneeId: string | null }>({
    method: 'POST',
    path: (a) => path`/shift-issues/${a.id}/assign`,
  }),
  setStatus: endpoint<Id, ShiftIssue, { status: string; note?: string }>({
    method: 'POST',
    path: (a) => path`/shift-issues/${a.id}/status`,
  }),
  attachmentPresign: endpoint<Id, PresignedUpload, { fileName: string; mimeType: string }>({
    method: 'POST',
    path: (a) => path`/shift-issues/${a.id}/attachments/presign`,
  }),
});

export const overtimeEndpoints = defineEndpoints('overtime', {
  active: endpoint<void, OvertimeRequest | null>({ method: 'GET', path: () => '/overtime/active', keep: true }),
  /** The caller's own time outside the shift, waiting for a decision (presence-like: never kept). */
  outsideMine: endpoint<void, OutsideShiftWaiting[]>({
    method: 'GET',
    path: () => '/attendance/outside/mine',
    keep: false,
  }),
  /** Who decides the caller's time today (names, first three) — the clock-out receipt names them (C7). */
  myApprovers: endpoint<void, { names: string[]; more: number }>({
    method: 'GET',
    path: () => '/attendance/approvers/mine',
    keep: false,
  }),
  respond: endpoint<void, unknown, { response: 'YES' | 'NO'; reason?: string }>({
    method: 'POST',
    path: () => '/overtime/respond',
  }),
  approve: endpoint<Id, unknown, { maxDurationMinutes: number; notes?: string }>({
    method: 'POST',
    path: (a) => path`/overtime/${a.id}/approve`,
  }),
  approveSignature: endpoint<
    Id,
    unknown,
    { approverId: string; leaderName: string; leaderSignature: string; maxDurationMinutes: number; notes?: string }
  >({ method: 'POST', path: (a) => path`/overtime/${a.id}/approve-signature` }),
  reject: endpoint<Id, unknown, { reason: string }>({ method: 'POST', path: (a) => path`/overtime/${a.id}/reject` }),
  pendingApprovals: endpoint<void, OvertimeRequest[]>({
    method: 'GET',
    path: () => '/overtime/pending-approvals',
    keep: true,
  }),
  history: endpoint<
    {
      technicianId?: string;
      spaceId?: string;
      status?: string;
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
    } | void,
    OvertimeRequest[]
  >({
    method: 'GET',
    path: (q) => withQuery('/overtime/history', q || undefined),
    keep: true,
  }),
  /** The period's numbers, who is running now, and per person (attendance/overtime-round.ts). */
  summary: endpoint<{ from?: string; to?: string; spaceId?: string; technicianId?: string } | void, OvertimeSummary>({
    method: 'GET',
    path: (q) => withQuery('/overtime/summary', q || undefined),
    keep: false,
  }),
  /** One round in full, with its signature. */
  round: endpoint<Id, unknown>({ method: 'GET', path: (a) => path`/overtime/${a.id}`, keep: false }),
});
