/**
 * analytics — web-only routes (the browser's screens; the phone does not call them).
 * Read raw by apps/web-app/src/lib/api (`unwrap: 'raw'`), which types each answer
 * where it calls; `R` stays `unknown` here until a second app needs it.
 */
import { defineEndpoints, endpoint } from '../../core/define';
import { path } from '../../core/path';

export const analyticsWebEndpoints = defineEndpoints('analytics', {
  catalog: endpoint<void, unknown>({ method: 'GET', path: () => '/analytics/catalog' }),
  run: endpoint<void, unknown, unknown>({ method: 'POST', path: () => '/analytics/run' }),
  timesheet: endpoint<void, unknown>({ method: 'GET', path: () => '/analytics/timesheet' }),
  listSaved: endpoint<void, unknown>({ method: 'GET', path: () => '/analytics/reports' }),
  createSaved: endpoint<void, unknown, unknown>({ method: 'POST', path: () => '/analytics/reports' }),
  updateSaved: endpoint<{ id: string }, unknown, unknown>({ method: 'PATCH', path: (a) => path`/analytics/reports/${a.id}` }),
  deleteSaved: endpoint<{ id: string }, unknown, unknown>({ method: 'DELETE', path: (a) => path`/analytics/reports/${a.id}` }),
  listSchedules: endpoint<void, unknown>({ method: 'GET', path: () => '/analytics/schedules' }),
  createSchedule: endpoint<void, unknown, unknown>({ method: 'POST', path: () => '/analytics/schedules' }),
  updateSchedule: endpoint<{ id: string }, unknown, unknown>({ method: 'PATCH', path: (a) => path`/analytics/schedules/${a.id}` }),
  deleteSchedule: endpoint<{ id: string }, unknown, unknown>({ method: 'DELETE', path: (a) => path`/analytics/schedules/${a.id}` }),
});
