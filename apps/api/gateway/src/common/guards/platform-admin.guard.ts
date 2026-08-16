import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'crypto';

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
    const expected = this.config.get<string>('PLATFORM_ADMIN_KEY') || '';
    if (!expected) throw new ForbiddenException('Forbidden');
    const req = ctx.switchToHttp().getRequest();
    const provided = (req.headers?.['x-platform-admin-key'] as string) || '';
    // Hash both to a fixed length before comparing so neither the length nor the
    // byte-by-byte match time reveals anything about the secret.
    const a = createHash('sha256').update(expected).digest();
    const b = createHash('sha256').update(provided).digest();
    if (!timingSafeEqual(a, b)) throw new ForbiddenException('Forbidden');
    return true;
  }
}
