import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { SERVICE_NAMES } from '@hbcfield/shared';
import { auditAction, auditBody, declaredPath, resolveAuditRoute } from './audit-helpers';

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/** The agent name a static-key caller declares (the operator page, scripts). Never trusted for access. */
export function staticKeyAgent(req: any): string | null {
  const raw = req?.headers?.['x-support-agent'] ?? req?.headers?.['x-platform-agent'];
  return typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, 80) : null;
}

/**
 * Who did it, as far as this request can prove.
 *
 *   STAFF       — a verified platform session (PlatformAuthGuard set `platformUser`)
 *   STATIC_KEY  — the shared PLATFORM_ADMIN_KEY matched (PlatformAdminGuard set `platformKeyVerified`)
 *   ANONYMOUS   — neither: a sign-in attempt, or a refused key
 */
export function platformActor(req: any): { actorType: 'STAFF' | 'STATIC_KEY' | 'ANONYMOUS'; actorId: string | null; actorLabel: string | null; actorRole: string | null } {
  const u = req?.platformUser;
  if (u?.id) return { actorType: 'STAFF', actorId: u.id, actorLabel: u.email ?? null, actorRole: u.role ?? null };
  if (req?.platformKeyVerified) return { actorType: 'STATIC_KEY', actorId: null, actorLabel: staticKeyAgent(req) ?? 'static-key', actorRole: null };
  return { actorType: 'ANONYMOUS', actorId: null, actorLabel: null, actorRole: null };
}

/**
 * Which customer organization a platform request acts on: the `:id` of an
 * `/platform/orgs/:id/...` route, else an `organizationId` in the body (support
 * pins, the static-key add-on grant).
 */
export function platformTargetOrg(normalized: string, resourceId: string | undefined, body: any): string | null {
  if (normalized.startsWith('/platform/orgs/:id') && resourceId) return resourceId;
  const fromBody = body?.organizationId;
  return typeof fromBody === 'string' && fromBody ? fromBody.slice(0, 64) : null;
}

/** Should this request be written to the operator audit trail? */
export function platformShouldRecord(method: string, actorType: string): boolean {
  // Every static-key call, reads included: the key can list every organization,
  // and "who listed them, when" is exactly what a shared secret cannot answer.
  if (actorType === 'STATIC_KEY') return true;
  // Staff and anonymous callers: changes only (sign-in attempts are POSTs).
  return MUTATING.has(method);
}

/**
 * The operator audit trail — ONE interceptor on every platform controller and
 * every static-key route.
 *
 * The tenant AuditInterceptor keys its rows by organization and skips any
 * request without `req.user.organizationId` — which is every platform request,
 * so suspending a company, changing how it pays or agreeing its price went
 * unrecorded. This writes `platform_audit_logs` (append-only) through the
 * auth-service, fire-and-forget: auditing never fails the request.
 *
 * Route naming, redaction and bulk-data summaries come from the same helpers
 * the tenant interceptor uses, so both trails describe a request the same way.
 */
@Injectable()
export class PlatformAuditInterceptor implements NestInterceptor {
  constructor(@Inject(SERVICE_NAMES.AUTH) private readonly authClient: ClientProxy) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const declared = declaredPath(context);
    return next.handle().pipe(
      tap({
        next: () => this.record(req, true, undefined, declared),
        error: (err) => this.record(req, false, err, declared),
      }),
    );
  }

  /** Build the row (exported shape for tests via `buildRow`). */
  buildRow(req: any, ok: boolean, err: any, declared: string | null) {
    const method: string = String(req.method || '').toUpperCase();
    const actor = platformActor(req);
    if (!platformShouldRecord(method, actor.actorType)) return null;
    const url = req.originalUrl || req.url || '';
    const { normalized, resourceId, resourceType } = resolveAuditRoute(url, declared);
    const body = auditBody(method, normalized, req.body);
    return {
      ...actor,
      ipAddress: req.ip || req.headers?.['x-forwarded-for'] || null,
      userAgent: req.headers?.['user-agent'] || null,
      method,
      route: normalized,
      action: auditAction(method, normalized, resourceType),
      targetOrganizationId: platformTargetOrg(normalized, resourceId, req.body),
      summary: body === undefined ? undefined : { body },
      ok,
      statusCode: ok ? req.res?.statusCode ?? 200 : err?.status || err?.statusCode || 500,
      error: ok ? null : String(err?.message ?? 'error').slice(0, 500),
    };
  }

  private record(req: any, ok: boolean, err: any, declared: string | null): void {
    try {
      const row = this.buildRow(req, ok, err, declared);
      if (!row) return;
      this.authClient.send({ cmd: 'platform_audit_write' }, row).subscribe({ error: () => undefined });
    } catch {
      // Auditing must never break the request.
    }
  }
}
