import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Audit interceptor — auto-logs every state-changing request to the audit trail
 * so coverage can't be forgotten (vs. manual per-endpoint logging). Runs after
 * the auth guards (so the actor is known) and around the handler (so it sees the
 * outcome). Writes are fire-and-forget and never affect the response.
 */

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

// High-frequency / low-value paths we don't audit (location pings, token churn).
const SKIP_PREFIXES = ['/tracking', '/auth', '/users/push-token'];

// Redact anything that looks secret from the logged body.
const SENSITIVE_KEY = /pass|token|secret|otp|code|hash|authorization/i;

// Known routes → semantic action labels. Anything unlisted falls back to
// `${RESOURCE}_${VERB}` (e.g. LOCATIONS_UPDATED), so coverage is total.
const ROUTE_ACTIONS: Record<string, string> = {
  'POST /tasks': 'TASK_CREATED',
  'DELETE /tasks/:id': 'TASK_DELETED',
  'POST /tasks/:id/assign': 'TASK_ASSIGNED',
  'POST /tasks/:id/status': 'TASK_STATUS_CHANGED',
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
};

const VERB: Record<string, string> = {
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

/** Strip the global prefix + query, normalize ids → :id. */
function parsePath(originalUrl: string) {
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

function redact(value: unknown, depth = 0): unknown {
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

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(@Inject('AUTH_SERVICE') private readonly authClient: ClientProxy) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    return next.handle().pipe(
      tap({
        next: () => this.record(req, true),
        error: (err) => this.record(req, false, err),
      }),
    );
  }

  private record(req: any, ok: boolean, err?: any): void {
    try {
      const method: string = req.method;
      if (!MUTATING.has(method)) return;

      const user = req.user;
      if (!user?.id || !user?.organizationId) return; // public / unauthenticated

      const { path, normalized, resourceId, resourceType } = parsePath(req.originalUrl || req.url);
      if (SKIP_PREFIXES.some((p) => path.startsWith(p))) return;

      const eventType =
        ROUTE_ACTIONS[`${method} ${normalized}`] ||
        `${(resourceType || 'RESOURCE').toUpperCase()}_${VERB[method] || 'CHANGED'}`;

      const isUserTarget = resourceType === 'members' || resourceType === 'users' || resourceType === 'technicians';

      const status: number | undefined = ok
        ? req.res?.statusCode
        : err?.status || err?.statusCode || 500;

      const payload = {
        eventType,
        userId: user.id,
        organizationId: user.organizationId,
        ...(isUserTarget && resourceId ? { targetUserId: resourceId } : {}),
        resourceType,
        resourceId,
        ipAddress: req.ip || req.headers?.['x-forwarded-for'],
        userAgent: req.headers?.['user-agent'],
        metadata: {
          method,
          path,
          status,
          ok,
          ...(req.body && Object.keys(req.body).length ? { body: redact(req.body) } : {}),
          ...(ok ? {} : { error: err?.message }),
        },
      };

      // Fire-and-forget — subscribing triggers the send; errors are swallowed.
      this.authClient.send({ cmd: 'audit_log_write' }, payload).subscribe({
        error: () => undefined,
      });
    } catch {
      // Auditing must never break the request.
    }
  }
}
