import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { safeEqual } from '@hbcfield/shared';

/**
 * Fail-closed gate for PLATFORM-OPERATOR (company super-admin) routes. Verifies
 * the `x-platform-admin-key` header against `PLATFORM_ADMIN_KEY` using a
 * CONSTANT-TIME comparison of SHA-256 digests (fixed 32-byte length → no timing
 * or length leak). Fails closed if the key isn't configured. Use with `@Public()`
 * so the JWT guard is skipped — the secret header is the only credential.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    this.assertKey(ctx.switchToHttp().getRequest());
    return true;
  }

  /**
   * The check itself, callable outside the guard pipeline.
   *
   * Exposed because the billing controller needs the same gate mid-handler and had
   * grown its own inline copy comparing with `!==` — non-constant-time, on the
   * secret protecting "list every organization" and "grant an org every paid
   * capability" (audit B-B1). One implementation, two callers.
   */
  assertKey(req: { headers?: Record<string, unknown> }): void {
    const expected = this.config.get<string>('PLATFORM_ADMIN_KEY') || '';
    if (!expected) throw new ForbiddenException('Forbidden');
    const raw = req.headers?.['x-platform-admin-key'];
    const provided = typeof raw === 'string' ? raw : '';
    // The shared constant-time compare (SHA-256 both sides to a fixed length, then
    // timingSafeEqual) — the same one the socket gate and Bull Board use.
    if (!safeEqual(provided, expected)) throw new ForbiddenException('Forbidden');
  }
}
