/**
 * Every operation a phone may queue, and the existing API route it replays.
 *
 * ⚠️ AN ALLOW-LIST, AND THE ONLY PLACE ONE IS DEFINED.
 *
 * `/sync/push` does not call services itself. Each operation is sent to the
 * gateway's own route for it — the same URL a phone calls when online — so
 * every guard (role, permission, module, plan, external member), every DTO and
 * every audit entry applies unchanged. A second code path for "the same action,
 * but offline" is exactly how an offline write would one day skip a permission
 * check that the online one enforces.
 *
 * An operation not listed here is refused. Adding one is adding a row, and the
 * route it names must already exist.
 */

export interface SyncOperationRoute {
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Relative to the API prefix. `:name` segments come from `payload.params`. */
  path: string;
}

export const SYNC_OPERATIONS = {
  // Tasks
  'task.create': { method: 'POST', path: '/tasks' },
  'task.status': { method: 'PATCH', path: '/tasks/:taskId/status' },
  'task.comment': { method: 'POST', path: '/tasks/:taskId/comments' },
  'task.decline': { method: 'POST', path: '/tasks/:taskId/decline' },
  'task.attachment': { method: 'POST', path: '/tasks/:taskId/attachments' },
  'task.complete': { method: 'POST', path: '/tasks/:taskId/complete' },
  'report.attachment': { method: 'POST', path: '/reports/:reportId/attachments' },
  // Attendance
  'attendance.clockIn': { method: 'POST', path: '/attendance/clock-in' },
  'attendance.clockOut': { method: 'POST', path: '/attendance/clock-out' },
  'attendance.breakStart': { method: 'POST', path: '/attendance/breaks/start' },
  'attendance.breakEnd': { method: 'POST', path: '/attendance/breaks/end' },
  'overtime.respond': { method: 'POST', path: '/overtime/respond' },
  'overtime.approveSignature': { method: 'POST', path: '/overtime/:overtimeId/approve-signature' },
  'worklog.note': { method: 'POST', path: '/attendance/entries/:entryId/worklog' },
  'worklog.attachment': { method: 'POST', path: '/attendance/worklog/:noteId/attachments' },
  // People
  'shiftIssue.create': { method: 'POST', path: '/shift-issues' },
  'shiftIssue.message': { method: 'POST', path: '/shift-issues/:issueId/messages' },
  'timeOff.request': { method: 'POST', path: '/employees/:employeeId/time-off' },
  'timeOff.cancel': { method: 'DELETE', path: '/employees/time-off/:timeOffId' },
  'profile.update': { method: 'PATCH', path: '/users/me' },
  // Money & communication
  'expense.submit': { method: 'POST', path: '/assets/:assetId/expenses' },
  'proposal.raise': { method: 'POST', path: '/assets/proposals' },
  // Documents I supply myself (a licence, a passport)
  'document.supply': { method: 'POST', path: '/documents/mine' },
  'chat.send': { method: 'POST', path: '/chat/conversations/:conversationId/messages' },
  'support.ticket': { method: 'POST', path: '/support/tickets' },
  // Clients (sales reps)
  'customer.create': { method: 'POST', path: '/customers' },
  'customer.activity': { method: 'POST', path: '/customers/:customerId/activities' },
  'support.message': { method: 'POST', path: '/support/tickets/:ticketId/messages' },
} as const satisfies Record<string, SyncOperationRoute>;

export type SyncOperationName = keyof typeof SYNC_OPERATIONS;

/** What an operation's payload looks like on the wire. */
export interface SyncOperationPayload {
  /** Values for the `:name` segments of the route. */
  params?: Record<string, string>;
  /** The request body the route expects. */
  body?: unknown;
}

export function isSyncOperationName(op: string): op is SyncOperationName {
  return Object.prototype.hasOwnProperty.call(SYNC_OPERATIONS, op);
}

/** A path parameter's alphabet: ids only. Anything else could steer the request elsewhere. */
const PARAM = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * The concrete path for an operation, or an error naming what is wrong.
 * Every `:name` in the route must be supplied, and nothing else is accepted.
 */
export function resolveSyncOperationPath(
  op: SyncOperationName,
  params: Record<string, string> | undefined,
): { ok: true; method: SyncOperationRoute['method']; path: string } | { ok: false; message: string } {
  const route: SyncOperationRoute = SYNC_OPERATIONS[op];
  const wanted = (route.path.match(/:([A-Za-z]+)/g) ?? []).map((s) => s.slice(1));
  const given = Object.keys(params ?? {});
  const extra = given.filter((k) => !wanted.includes(k));
  if (extra.length) return { ok: false, message: `Unexpected parameter(s): ${extra.join(', ')}` };
  let path = route.path;
  for (const name of wanted) {
    const value = params?.[name];
    if (typeof value !== 'string' || !PARAM.test(value)) return { ok: false, message: `Missing or invalid parameter: ${name}` };
    path = path.replace(`:${name}`, value);
  }
  return { ok: true, method: route.method, path };
}
