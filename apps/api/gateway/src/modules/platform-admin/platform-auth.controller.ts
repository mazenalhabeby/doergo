import { assertServiceOk } from '@hbcfield/shared';
import { Body, Controller, Get, Param, Patch, Post, Request, UseGuards, UseInterceptors } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import {
  PlatformAuthGuard, PlatformEnrolmentAllowed, PlatformHostGuard, RequirePlatformPerm,
} from '../../common/guards/platform-auth.guard';
import { PlatformAuditInterceptor } from '../../common/interceptors/platform-audit.interceptor';
import { PlatformAdminService } from './platform-admin.service';

/**
 * Only these fields of a staff edit are read. The PATH id is the target; a body
 * `id` (or `byUserId`) is ignored rather than spread over it.
 */
export function pickStaffPatch(id: string, body: any, byUserId: string | undefined) {
  const patch: { id: string; role?: string; isActive?: boolean; byUserId?: string } = { id, byUserId };
  if (typeof body?.role === 'string') patch.role = body.role;
  if (typeof body?.isActive === 'boolean') patch.isActive = body.isActive;
  return patch;
}

/** The fields a new staff member is created from — nothing else in the body travels. */
export function pickStaffCreate(body: any, byUserId: string | undefined) {
  const s = (v: unknown) => (typeof v === 'string' ? v : undefined);
  return { email: s(body?.email), password: s(body?.password), firstName: s(body?.firstName), lastName: s(body?.lastName), role: s(body?.role), byUserId };
}

@Controller('platform')
@Public()
@UseGuards(PlatformHostGuard)
@UseInterceptors(PlatformAuditInterceptor)
export class PlatformAuthController {
  constructor(private readonly svc: PlatformAdminService) {}

  private unwrap<T>(result: any): T {
    return assertServiceOk(result) as T;
  }
  private actor(req: any): string | undefined { return req.platformUser?.id; }
  private session(req: any): { iat?: number; authTime?: number } { return req.platformSession ?? {}; }

  /** Staff login — open but tightly rate-limited (brute-force + lockout in the service). */
  @Post('auth/login')
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  async login(@Body() body: { email?: string; password?: string; code?: string }) {
    return this.unwrap(await this.svc.login({ email: body?.email ?? '', password: body?.password ?? '', code: body?.code }));
  }

  /** Break-glass: create the first OWNER — gated by the shared PLATFORM_ADMIN_KEY. */
  @Post('auth/bootstrap')
  @UseGuards(PlatformAdminGuard)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async bootstrap(@Body() body: any) { return this.unwrap(await this.svc.bootstrapOwner(pickStaffCreate(body, undefined))); }

  @Get('auth/me')
  @UseGuards(PlatformAuthGuard)
  @PlatformEnrolmentAllowed()
  async me(@Request() req: any) { return this.unwrap(await this.svc.me({ userId: this.actor(req)! })); }

  /**
   * Sign out on the SERVER: this operator's tokens stop working now, rather
   * than the console merely forgetting one copy of it.
   */
  @Post('auth/logout')
  @UseGuards(PlatformAuthGuard)
  @PlatformEnrolmentAllowed()
  async logout(@Request() req: any) {
    return this.unwrap(await this.svc.logout({ userId: this.actor(req)!, iat: this.session(req).iat }));
  }

  /** Slide a live session forward (short tokens; capped by PLATFORM_SESSION_MAX_SECONDS from sign-in). */
  @Post('auth/refresh')
  @UseGuards(PlatformAuthGuard)
  @PlatformEnrolmentAllowed()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async refresh(@Request() req: any) {
    return this.unwrap(await this.svc.refresh({ userId: this.actor(req)!, authTime: this.session(req).authTime }));
  }

  // ── Self-service: password + 2FA (acts on the logged-in user only) ──
  @Post('auth/change-password')
  @UseGuards(PlatformAuthGuard)
  @PlatformEnrolmentAllowed()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async changePassword(@Body() body: { currentPassword?: string; newPassword?: string }, @Request() req: any) {
    return this.unwrap(await this.svc.changePassword({ userId: this.actor(req), currentPassword: body?.currentPassword, newPassword: body?.newPassword, authTime: this.session(req).authTime }));
  }

  /** While 2FA is on, re-keying needs a current `code` (the service refuses without one). */
  @Post('auth/2fa/setup')
  @UseGuards(PlatformAuthGuard)
  @PlatformEnrolmentAllowed()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async setup2fa(@Body() body: { code?: string }, @Request() req: any) {
    return this.unwrap(await this.svc.setup2fa({ userId: this.actor(req), code: body?.code, authTime: this.session(req).authTime }));
  }

  @Post('auth/2fa/enable')
  @UseGuards(PlatformAuthGuard)
  @PlatformEnrolmentAllowed()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async enable2fa(@Body() body: { code?: string }, @Request() req: any) {
    return this.unwrap(await this.svc.enable2fa({ userId: this.actor(req), code: body?.code, authTime: this.session(req).authTime }));
  }

  @Post('auth/2fa/disable')
  @UseGuards(PlatformAuthGuard)
  @PlatformEnrolmentAllowed()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async disable2fa(@Body() body: { code?: string }, @Request() req: any) {
    return this.unwrap(await this.svc.disable2fa({ userId: this.actor(req), code: body?.code, authTime: this.session(req).authTime }));
  }

  // ── Staff management (managePlatformUsers = OWNER) ──
  @Get('users')
  @UseGuards(PlatformAuthGuard)
  @RequirePlatformPerm('managePlatformUsers')
  async listUsers() { return this.unwrap(await this.svc.listUsers()); }

  @Post('users')
  @UseGuards(PlatformAuthGuard)
  @RequirePlatformPerm('managePlatformUsers')
  async createUser(@Body() body: any, @Request() req: any) { return this.unwrap(await this.svc.createUser(pickStaffCreate(body, this.actor(req)))); }

  @Patch('users/:id')
  @UseGuards(PlatformAuthGuard)
  @RequirePlatformPerm('managePlatformUsers')
  async updateUser(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.unwrap(await this.svc.updateUser(pickStaffPatch(id, body, this.actor(req))));
  }

  @Post('users/:id/reset-password')
  @UseGuards(PlatformAuthGuard)
  @RequirePlatformPerm('managePlatformUsers')
  async resetPassword(@Param('id') id: string, @Body() body: { password?: string }, @Request() req: any) {
    return this.unwrap(await this.svc.resetPassword({ id, password: body?.password, byUserId: this.actor(req) }));
  }

  /** A lost phone: clear somebody else's second factor (never your own). Their next sign-in enrols again. */
  @Post('users/:id/reset-2fa')
  @UseGuards(PlatformAuthGuard)
  @RequirePlatformPerm('managePlatformUsers')
  async reset2fa(@Param('id') id: string, @Request() req: any) {
    return this.unwrap(await this.svc.reset2fa({ id, byUserId: this.actor(req) }));
  }
}
