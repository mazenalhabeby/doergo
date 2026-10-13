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
import { declaredPath, resolveAuditRoute, auditAction, auditBody } from './audit-helpers';
// Re-exported: the route-naming tests import it from here.
export { fromDeclaredPath } from './audit-helpers';

/**
 * Audit interceptor — auto-logs every state-changing request to the audit trail
 * so coverage can't be forgotten (vs. manual per-endpoint logging). Runs after
 * the auth guards (so the actor is known) and around the handler (so it sees the
 * outcome). Writes are fire-and-forget and never affect the response.
 */

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

// High-frequency / low-value paths we don't audit (location pings, token churn).
// `/sync/push` is a carrier: each operation inside it is replayed against its own
// route and audited there, as the action it is. Auditing the carrier too would
// record every offline action twice.
// `/approvals/decide` is a carrier too: the decision is replayed against the kind's own route, audited there.
// `/employees/me/requests/precheck` is a POST that reads: what a leader would check, written nowhere.
const SKIP_PREFIXES = ['/tracking', '/auth', '/users/push-token', '/sync', '/approvals/decide', '/employees/me/requests/precheck'];

// Routes whose service writes its own, richer audit rows in the same
// transaction as the change (titles, member, what was lost). A second, generic
// row from here would only say the same thing worse.
const SELF_AUDITED = new Set(['POST /documents/bulk/delete', 'POST /documents/bulk/visibility']);

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(@Inject('AUTH_SERVICE') private readonly authClient: ClientProxy) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    // The declared route travels with the request so `record` can name the
    // resource exactly rather than infer it from the URL.
    const declared = declaredPath(context);
    return next.handle().pipe(
      tap({
        next: () => this.record(req, true, undefined, declared),
        error: (err) => this.record(req, false, err, declared),
      }),
    );
  }

  private record(req: any, ok: boolean, err?: any, declared?: string | null): void {
    try {
      const method: string = req.method;
      if (!MUTATING.has(method)) return;

      const user = req.user;
      if (!user?.id || !user?.organizationId) return; // public / unauthenticated

      const url = req.originalUrl || req.url;
      // Prefer the declared route; fall back to the URL heuristic only when the
      // metadata is unavailable (a route defined outside a normal controller).
      const { path, normalized, resourceId, resourceType } = resolveAuditRoute(url, declared);
      if (SKIP_PREFIXES.some((p) => path.startsWith(p))) return;
      if (SELF_AUDITED.has(`${method} ${normalized}`)) return;

      const eventType = auditAction(method, normalized, resourceType);

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
          ...(auditBody(method, normalized, req.body) !== undefined ? { body: auditBody(method, normalized, req.body) } : {}),
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
