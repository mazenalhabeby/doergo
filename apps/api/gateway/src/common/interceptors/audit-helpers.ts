import type { ExecutionContext } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';

/**
 * The audit vocabulary — how a request becomes a row. Shared by the tenant
 * AuditInterceptor and the PlatformAuditInterceptor so both name routes,
 * redact bodies and summarise bulk personal data the same way.
 */

/*
  Routes whose body is OTHER PEOPLE'S personal data in bulk. The log keeps what
  happened, not a second copy of the data: a phone-contacts import is up to 200
  names, numbers and addresses, and the audit log is kept far longer than any of
  them should be. Each imported client carries its own provenance on its
  timeline (who imported it, from where, when) — that is the record.
*/
export const BODY_SUMMARY: Record<string, (body: any) => unknown> = {
  'POST /customers/import': (b) => ({
    spaceId: typeof b?.spaceId === 'string' ? b.spaceId : null,
    contacts: Array.isArray(b?.items) ? b.items.length : 0,
  }),
};

// Redact anything that looks secret from the logged body.
export const SENSITIVE_KEY = /pass|token|secret|otp|code|hash|authorization/i;

// Known routes → semantic action labels. Anything unlisted falls back to
// `${RESOURCE}_${VERB}` (e.g. LOCATIONS_UPDATED), so coverage is total.
export const ROUTE_ACTIONS: Record<string, string> = {
  // Calendar (shared calendar/*): appointments, answers, and the holiday/weekend settings.
  'POST /calendar/events': 'CALENDAR_EVENT_CREATED',
  'PATCH /calendar/events/:id': 'CALENDAR_EVENT_UPDATED',
  'DELETE /calendar/events/:id': 'CALENDAR_EVENT_CANCELED',
  'POST /calendar/events/:id/respond': 'CALENDAR_EVENT_ANSWERED',
  'POST /calendar/feed': 'CALENDAR_LINK_CREATED',
  'DELETE /calendar/feed': 'CALENDAR_LINK_REVOKED',
  'PATCH /calendar/settings': 'CALENDAR_SETTINGS_UPDATED',
  'PATCH /calendar/settings/workspaces/:spaceId': 'WORKSPACE_CALENDAR_UPDATED',
  'POST /calendar/holidays': 'HOLIDAY_SAVED',
  'PATCH /calendar/holidays/:id': 'HOLIDAY_SAVED',
  'DELETE /calendar/holidays/:id': 'HOLIDAY_REMOVED',
  // Companies (legal entities). The body IS logged: who changed a bank account is the question
  // after money goes to the wrong place.
  'POST /legal-entities': 'COMPANY_CREATED',
  'PATCH /legal-entities/:id': 'COMPANY_UPDATED',
  'POST /legal-entities/:id/main': 'COMPANY_MADE_MAIN',
  'POST /legal-entities/:id/deactivate': 'COMPANY_DEACTIVATED',
  'POST /legal-entities/:id/reactivate': 'COMPANY_REACTIVATED',
  // Clients from a phone's address book — body summarised, see BODY_SUMMARY.
  'POST /customers/import': 'CLIENTS_IMPORTED_FROM_PHONE',
  'POST /tasks': 'TASK_CREATED',
  'DELETE /tasks/:id': 'TASK_DELETED',
  'POST /tasks/:id/assign': 'TASK_ASSIGNED',
  'POST /tasks/:id/status': 'TASK_STATUS_CHANGED',
  // A crew on one job (tasks/crew.ts)
  'POST /tasks/:id/crew/join': 'TASK_CREW_JOINED',
  'POST /tasks/:id/crew/leave': 'TASK_CREW_LEFT',
  'POST /tasks/:id/crew/issue': 'TASK_CREW_SELF_BLOCKED',
  'POST /tasks/:id/crew/resume': 'TASK_CREW_SELF_RESUMED',
  'PUT /tasks/:id/lead': 'TASK_LEAD_CHANGED',
  // A task open to a WORK role (tasks/role-pool.ts)
  'POST /tasks/:id/take': 'TASK_TAKEN_FROM_ROLE',
  'POST /tasks/:id/return-to-role': 'TASK_RETURNED_TO_ROLE',
  'PUT /tasks/:id/open-role': 'TASK_OPEN_ROLE_SET',
  'PATCH /organizations/members/:id/role': 'MEMBER_ROLE_CHANGED',
  'DELETE /organizations/members/:id': 'MEMBER_REMOVED',
  'PATCH /organizations/settings': 'ORG_SETTINGS_UPDATED',
  'POST /organizations/regenerate-join-code': 'ORG_JOIN_CODE_REGENERATED',
  'POST /invitations': 'INVITATION_CREATED',
  'DELETE /invitations/:id': 'INVITATION_REVOKED',
  'POST /invitations/accept': 'INVITATION_ACCEPTED',
  'PATCH /join-requests/:id/approve': 'JOIN_REQUEST_APPROVED',
  'PATCH /join-requests/:id/reject': 'JOIN_REQUEST_REJECTED',
  'POST /recurring-tasks': 'RECURRING_CREATED',
  'DELETE /recurring-tasks/:id': 'RECURRING_DELETED',
  'POST /recurring-tasks/:id/generate': 'RECURRING_GENERATED',
  'POST /locations': 'SPACE_CREATED',
  'DELETE /locations/:id': 'SPACE_DELETED',
  'POST /workflows': 'TASK_TYPE_CREATED',
  'DELETE /workflows/:id': 'TASK_TYPE_DELETED',
  'POST /custom-fields': 'CUSTOM_FIELD_CREATED',
  'DELETE /custom-fields/:id': 'CUSTOM_FIELD_DELETED',
  'POST /technicians': 'TECHNICIAN_CREATED',
  'DELETE /technicians/:id': 'TECHNICIAN_DEACTIVATED',
  // Shift scheduling
  'POST /shifts': 'SHIFT_CREATED',
  'PATCH /shifts/:id': 'SHIFT_UPDATED',
  'DELETE /shifts/:id': 'SHIFT_DELETED',
  'POST /spaces/:id/rota': 'ROTA_ASSIGNED',
  'PATCH /rota/:id': 'ROTA_UPDATED',
  'DELETE /rota/:id': 'ROTA_REMOVED',
  'POST /rota/day': 'ROTA_DAY_SET',
  'POST /space-roles': 'SPACE_ROLE_CREATED',
  'PATCH /space-roles/:id': 'SPACE_ROLE_UPDATED',
  'DELETE /space-roles/:id': 'SPACE_ROLE_DELETED',
  'POST /spaces/:id/members': 'SPACE_MEMBER_ASSIGNED',
  'DELETE /spaces/:id/members/:id': 'SPACE_MEMBER_REMOVED',
  // Shift reminder responses
  'POST /attendance/entries/:id/forgot-clock-out': 'ATTENDANCE_FORGOT_RESOLVED',
  'POST /attendance/entries/:id/request-extra-time': 'ATTENDANCE_EXTRA_TIME_REQUESTED',
  'POST /attendance/extra-time/:id/approve': 'ATTENDANCE_EXTRA_TIME_APPROVED',
  'POST /attendance/extra-time/:id/reject': 'ATTENDANCE_EXTRA_TIME_REJECTED',
  // Operator console (platform-audit.interceptor) — the curated names; anything
  // else on /platform falls back to RESOURCE_VERB like every other route.
  'POST /platform/auth/login': 'PLATFORM_SIGN_IN',
  'POST /platform/auth/logout': 'PLATFORM_SIGN_OUT',
  'POST /platform/auth/refresh': 'PLATFORM_SESSION_REFRESHED',
  'POST /platform/auth/bootstrap': 'PLATFORM_OWNER_BOOTSTRAPPED',
  'POST /platform/auth/change-password': 'PLATFORM_PASSWORD_CHANGED',
  'POST /platform/auth/2fa/setup': 'PLATFORM_2FA_SETUP_STARTED',
  'POST /platform/auth/2fa/enable': 'PLATFORM_2FA_ENABLED',
  'POST /platform/auth/2fa/disable': 'PLATFORM_2FA_DISABLED',
  'POST /platform/users': 'PLATFORM_STAFF_CREATED',
  'PATCH /platform/users/:id': 'PLATFORM_STAFF_UPDATED',
  'POST /platform/users/:id/reset-password': 'PLATFORM_STAFF_PASSWORD_RESET',
  'POST /platform/users/:id/reset-2fa': 'PLATFORM_STAFF_2FA_RESET',
  'POST /platform/orgs/:id/extend-trial': 'ORG_TRIAL_EXTENDED',
  'POST /platform/orgs/:id/end-trial': 'ORG_TRIAL_ENDED',
  'POST /platform/orgs/:id/agreed-price': 'ORG_AGREED_PRICE_SET',
  'DELETE /platform/orgs/:id/agreed-price': 'ORG_AGREED_PRICE_REMOVED',
  'POST /platform/orgs/:id/suspend': 'ORG_SUSPENDED',
  'POST /platform/orgs/:id/reactivate': 'ORG_REACTIVATED',
  'POST /platform/orgs/:id/offline-mode': 'ORG_OFFLINE_MODE_SET',
  'POST /platform/orgs/:id/billing-mode': 'ORG_BILLING_MODE_SET',
  'POST /platform/orgs/:id/add-ons': 'ORG_ADD_ONS_SET',
  'POST /platform/billing-alerts/:id/ack': 'BILLING_ALERT_ACKNOWLEDGED',
  'GET /billing/admin/orgs': 'STATIC_KEY_ORGS_LISTED',
  'POST /billing/admin/org-add-ons': 'ORG_ADD_ONS_SET',
  'POST /platform/app-update/notify': 'APP_UPDATE_NOTICE_SENT',
};

export const VERB: Record<string, string> = {
  POST: 'CREATED',
  PATCH: 'UPDATED',
  PUT: 'UPDATED',
  DELETE: 'DELETED',
};

function looksLikeId(seg: string): boolean {
  return (
    /^c[a-z0-9]{20,}$/i.test(seg) || // cuid
    /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(seg) || // uuid
    /^[0-9a-f]{16,}$/i.test(seg) // long hex
  );
}

/**
 * The route as DECLARED on the controller — `/tasks/:id/assignees/:userId` —
 * rather than as guessed from the URL.
 *
 * Guessing was the bug. `looksLikeId` recognises cuids, uuids and long hex, so
 * any other kind of identifier was mistaken for a resource name: deleting an
 * assignee at `/tasks/{cuid}/assignees/emp-dana` made `emp-dana` the resource
 * type and wrote the event `EMP-DANA_DELETED`. That misread three things at
 * once — the label a person reads, the normalized path used to look up a
 * curated action name, and the vocabulary of event types itself, which grew by
 * one for every distinct identifier that ever appeared in a URL.
 *
 * Nest knows the answer exactly: the controller's prefix plus the handler's
 * path. No heuristic can beat reading the declaration.
 */
export function declaredPath(context: ExecutionContext): string | null {
  try {
    const controllerPath = Reflect.getMetadata(PATH_METADATA, context.getClass());
    const handlerPath = Reflect.getMetadata(PATH_METADATA, context.getHandler());
    const parts = [controllerPath, handlerPath]
      .map((p) => (typeof p === 'string' ? p : Array.isArray(p) ? p[0] : ''))
      .filter((p) => p && p !== '/')
      .map((p) => String(p).replace(/^\/+|\/+$/g, ''))
      .filter(Boolean);
    return parts.length ? '/' + parts.join('/') : null;
  } catch {
    return null;
  }
}

/** Split a declared route into its literal segments and its parameters. */
export function fromDeclaredPath(declared: string, actualUrl: string) {
  const declaredSegs = declared.split('/').filter(Boolean);
  const actualSegs = (actualUrl.split('?')[0] || '')
    .replace(/^\/api\/v\d+/, '')
    .split('/')
    .filter(Boolean);

  const normSegs: string[] = [];
  let resourceId: string | undefined;
  let resourceType: string | undefined;

  declaredSegs.forEach((seg, i) => {
    if (seg.startsWith(':')) {
      // A parameter position, whatever the value happens to look like. The
      // FIRST one is the record this event is about — /tasks/:id/assignees/:userId
      // is an event about the task.
      if (!resourceId && actualSegs[i]) resourceId = actualSegs[i];
      normSegs.push(':id');
    } else {
      resourceType = seg; // last literal wins (sub-resources)
      normSegs.push(seg);
    }
  });

  return { normalized: '/' + normSegs.join('/'), resourceId, resourceType };
}

/** Strip the global prefix + query, normalize ids → :id. */
export function parsePath(originalUrl: string) {
  let path = (originalUrl || '').split('?')[0] || '';
  path = path.replace(/^\/api\/v\d+/, '');
  const segs = path.split('/').filter(Boolean);
  const normSegs: string[] = [];
  let resourceId: string | undefined;
  let resourceType: string | undefined;
  for (const seg of segs) {
    if (looksLikeId(seg)) {
      if (!resourceId) resourceId = seg;
      normSegs.push(':id');
    } else {
      resourceType = seg; // last non-id segment wins (sub-resources)
      normSegs.push(seg);
    }
  }
  return { path, normalized: '/' + normSegs.join('/'), resourceId, resourceType };
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value == null) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? '[redacted]' : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}


/** The action a request records: the curated name, else RESOURCE_VERB. */
export function auditAction(method: string, normalized: string, resourceType?: string): string {
  return (
    ROUTE_ACTIONS[`${method} ${normalized}`] ||
    `${(resourceType || 'RESOURCE').toUpperCase()}_${VERB[method] || (method === 'GET' ? 'READ' : 'CHANGED')}`
  );
}

/** The body as it may be kept: summarised where it is bulk personal data, redacted otherwise. */
export function auditBody(method: string, normalized: string, body: unknown): unknown {
  if (!body || typeof body !== 'object' || !Object.keys(body as object).length) return undefined;
  return BODY_SUMMARY[`${method} ${normalized}`]?.(body) ?? redact(body);
}

/** Declared route → `{ path, normalized, resourceId, resourceType }`, URL heuristic as the fallback. */
export function resolveAuditRoute(url: string, declared: string | null | undefined) {
  const guessed = parsePath(url);
  const resolved = declared ? fromDeclaredPath(declared, url) : guessed;
  return { path: guessed.path, ...resolved };
}
