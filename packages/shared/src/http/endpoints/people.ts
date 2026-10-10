/**
 * People and their time: employees (the gateway's `/employees`, formerly
 * "technicians"), time off, the rota and shifts.
 * Gateway: modules/employees, modules/shifts.
 */
import type {
  CreateEmployeeInput,
  EmployeeListItem,
  EmployeeProfile,
  EmployeesQueryParams,
  ScheduleEntry,
  Shift,
  ShiftAssignment,
  TimeOffRequest,
  UpdateEmployeeInput,
} from '../../types';
import type { LeaveCount } from '../../calendar/days';
import { defineEndpoints, endpoint } from '../core/define';
import { path, withQuery } from '../core/path';

type Id = { id: string };

export const employeesEndpoints = defineEndpoints('employees', {
  /** A page of members; use `client.page` / `unwrap: 'page'` for the total. */
  list: endpoint<EmployeesQueryParams | void, EmployeeListItem[]>({ method: 'GET', path: (q) => withQuery('/employees', q || undefined), keep: true }),
  get: endpoint<Id, EmployeeProfile>({ method: 'GET', path: (a) => path`/employees/${a.id}`, keep: true }),
  create: endpoint<void, EmployeeProfile, CreateEmployeeInput>({ method: 'POST', path: () => '/employees' }),
  update: endpoint<Id, EmployeeProfile, UpdateEmployeeInput>({ method: 'PATCH', path: (a) => path`/employees/${a.id}` }),
  performance: endpoint<Id & { period?: string; startDate?: string; endDate?: string }, unknown>({
    method: 'GET',
    path: ({ id, ...q }) => withQuery(path`/employees/${id}/performance`, q),
    keep: true,
  }),
  tasks: endpoint<Id & { page?: number; limit?: number; status?: string }, unknown[]>({
    method: 'GET',
    path: ({ id, ...q }) => withQuery(path`/employees/${id}/tasks`, q),
    keep: true,
  }),
  attendance: endpoint<Id & { startDate?: string; endDate?: string; page?: number; limit?: number }, unknown[]>({
    method: 'GET',
    path: ({ id, ...q }) => withQuery(path`/employees/${id}/attendance`, q),
    keep: true,
  }),
  assignments: endpoint<Id, unknown[]>({ method: 'GET', path: (a) => path`/employees/${a.id}/assignments`, keep: true }),
  schedule: endpoint<Id, ScheduleEntry[]>({ method: 'GET', path: (a) => path`/employees/${a.id}/schedule`, keep: true }),
  setSchedule: endpoint<Id, ScheduleEntry[], { schedules: unknown[] } | Record<string, unknown>>({
    method: 'POST',
    path: (a) => path`/employees/${a.id}/schedule`,
  }),
  leaveBalance: endpoint<Id & { year?: number }, unknown>({
    method: 'GET',
    path: ({ id, ...q }) => withQuery(path`/employees/${id}/leave-balance`, q),
    keep: true,
  }),
  /** Availability for one day (`date`) or a range (`startDate`/`endDate`). */
  availability: endpoint<{ date?: string; startDate?: string; endDate?: string }, unknown>({
    method: 'GET',
    path: (q) => withQuery('/employees/availability', q),
    keep: true,
  }),
  coverRange: endpoint<{ start: string; end: string }, unknown[]>({ method: 'GET', path: (q) => withQuery('/employees/cover-range', q), keep: true }),
  /** Who is on the floor now. Presence — never kept. */
  floorNow: endpoint<void, unknown[]>({ method: 'GET', path: () => '/employees/floor-now', keep: false }),
});

export const timeOffEndpoints = defineEndpoints('timeOff', {
  /** The organization's requests (the caller's scope). */
  listOrg: endpoint<{ status?: string; from?: string; to?: string } | void, TimeOffRequest[]>({
    method: 'GET',
    path: (q) => withQuery('/employees/time-off', q || undefined),
    keep: true,
  }),
  listFor: endpoint<{ employeeId: string; status?: string }, TimeOffRequest[]>({
    method: 'GET',
    path: ({ employeeId, ...q }) => withQuery(path`/employees/${employeeId}/time-off`, q),
    keep: true,
  }),
  request: endpoint<{ employeeId: string }, TimeOffRequest, { startDate: string; endDate: string; reason?: string; type?: string; [k: string]: unknown }>({
    method: 'POST',
    path: (a) => path`/employees/${a.employeeId}/time-off`,
  }),
  /** What a leave range COSTS in working days (≤ 1 year). */
  count: endpoint<{ employeeId: string; from: string; to: string }, LeaveCount>({
    method: 'GET',
    path: ({ employeeId, ...q }) => withQuery(path`/employees/${employeeId}/time-off/count`, q),
    keep: true,
  }),
  /** The member cancels their own. */
  cancel: endpoint<{ timeOffId: string }, void>({ method: 'DELETE', path: (a) => path`/employees/time-off/${a.timeOffId}` }),
  update: endpoint<{ timeOffId: string }, TimeOffRequest, Record<string, unknown>>({ method: 'PATCH', path: (a) => path`/employees/time-off/${a.timeOffId}` }),
  approve: endpoint<{ timeOffId: string }, TimeOffRequest, { approved: boolean; rejectionReason?: string }>({
    method: 'PATCH',
    path: (a) => path`/employees/time-off/${a.timeOffId}/approve`,
  }),
  /** The office removes a request. */
  removeManaged: endpoint<{ timeOffId: string }, void>({ method: 'DELETE', path: (a) => path`/employees/time-off/${a.timeOffId}/manage` }),
  /** Leave entered by the office for somebody. */
  manual: endpoint<void, TimeOffRequest, Record<string, unknown>>({ method: 'POST', path: () => '/employees/time-off/manual' }),
});

export interface RotaCellShift {
  date: string;
  kind: 'shift';
  shiftId: string;
  start: string;
  end: string;
  source: 'once' | 'weekly';
}
export type RotaCell =
  | RotaCellShift
  | { date: string; kind: 'schedule'; start: string; end: string }
  | { date: string; kind: 'leave' }
  | { date: string; kind: 'off' };

export interface RotaWeek {
  spaces: Array<{ id: string; name: string }>;
  space: { id: string; name: string; timezone: string; tracksAttendance: boolean } | null;
  days: string[];
  shifts: Array<{ id: string; name: string; color: string | null; startLocal: string; endLocal: string }>;
  people: Array<{ userId: string; firstName: string; lastName: string; avatarUrl: string | null; position: string | null; days: RotaCell[] }>;
  canEdit: boolean;
}

export const rotaEndpoints = defineEndpoints('rota', {
  /** A workspace's week as the clock-in resolves it. */
  week: endpoint<{ spaceId?: string; from?: string } | void, RotaWeek>({ method: 'GET', path: (q) => withQuery('/rota/week', q || undefined), keep: false /* other people's staffing: a stale week is a wrong one */ }),
  setDay: endpoint<void, { ok: true }, { spaceId: string; userId: string; date: string; shiftId: string | null; repeat: 'once' | 'weekly' }>({
    method: 'POST',
    path: () => '/rota/day',
  }),
  listForSpace: endpoint<{ spaceId: string; includeEnded?: boolean }, ShiftAssignment[]>({
    method: 'GET',
    path: ({ spaceId, ...q }) => withQuery(path`/spaces/${spaceId}/rota`, q),
  }),
  createForSpace: endpoint<{ spaceId: string }, ShiftAssignment, Record<string, unknown>>({ method: 'POST', path: (a) => path`/spaces/${a.spaceId}/rota` }),
  update: endpoint<Id, ShiftAssignment, Record<string, unknown>>({ method: 'PATCH', path: (a) => path`/rota/${a.id}` }),
  remove: endpoint<Id, void>({ method: 'DELETE', path: (a) => path`/rota/${a.id}` }),
});

export const shiftsEndpoints = defineEndpoints('shifts', {
  list: endpoint<{ spaceId?: string } | void, Shift[]>({ method: 'GET', path: (q) => withQuery('/shifts', q || undefined) }),
  create: endpoint<void, Shift, Record<string, unknown>>({ method: 'POST', path: () => '/shifts' }),
  update: endpoint<Id, Shift, Record<string, unknown>>({ method: 'PATCH', path: (a) => path`/shifts/${a.id}` }),
  remove: endpoint<Id, void>({ method: 'DELETE', path: (a) => path`/shifts/${a.id}` }),
});
