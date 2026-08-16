import { Body, Controller, Get, HttpException, HttpStatus, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { PlatformAuthGuard, RequirePlatformPerm } from '../../common/guards/platform-auth.guard';
import { PlatformAdminService } from './platform-admin.service';

@Controller('platform')
@Public()
export class PlatformAuthController {
  constructor(private readonly svc: PlatformAdminService) {}

  private unwrap<T>(result: any): T {
    if (result && result.success === false) throw new HttpException({ message: result.message ?? 'Error' }, result.statusCode ?? HttpStatus.BAD_REQUEST);
    return result;
  }
  private actor(req: any): string | undefined { return req.platformUser?.id; }

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
  async bootstrap(@Body() body: any) { return this.unwrap(await this.svc.bootstrapOwner(body)); }

  @Get('auth/me')
  @UseGuards(PlatformAuthGuard)
  async me(@Request() req: any) { return this.unwrap(await this.svc.me({ userId: this.actor(req)! })); }

  // ── Self-service: password + 2FA (acts on the logged-in user only) ──
  @Post('auth/change-password')
  @UseGuards(PlatformAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async changePassword(@Body() body: { currentPassword?: string; newPassword?: string }, @Request() req: any) {
    return this.unwrap(await this.svc.changePassword({ userId: this.actor(req), currentPassword: body?.currentPassword, newPassword: body?.newPassword }));
  }

  @Post('auth/2fa/setup')
  @UseGuards(PlatformAuthGuard)
  async setup2fa(@Request() req: any) { return this.unwrap(await this.svc.setup2fa({ userId: this.actor(req) })); }

  @Post('auth/2fa/enable')
  @UseGuards(PlatformAuthGuard)
  async enable2fa(@Body() body: { code?: string }, @Request() req: any) { return this.unwrap(await this.svc.enable2fa({ userId: this.actor(req), code: body?.code })); }

  @Post('auth/2fa/disable')
  @UseGuards(PlatformAuthGuard)
  async disable2fa(@Body() body: { code?: string }, @Request() req: any) { return this.unwrap(await this.svc.disable2fa({ userId: this.actor(req), code: body?.code })); }

  // ── Staff management (managePlatformUsers = OWNER) ──
  @Get('users')
  @UseGuards(PlatformAuthGuard)
  @RequirePlatformPerm('managePlatformUsers')
  async listUsers() { return this.unwrap(await this.svc.listUsers()); }

  @Post('users')
  @UseGuards(PlatformAuthGuard)
  @RequirePlatformPerm('managePlatformUsers')
  async createUser(@Body() body: any, @Request() req: any) { return this.unwrap(await this.svc.createUser({ ...body, byUserId: this.actor(req) })); }

  @Patch('users/:id')
  @UseGuards(PlatformAuthGuard)
  @RequirePlatformPerm('managePlatformUsers')
  async updateUser(@Param('id') id: string, @Body() body: any, @Request() req: any) { return this.unwrap(await this.svc.updateUser({ id, ...body, byUserId: this.actor(req) })); }

  @Post('users/:id/reset-password')
  @UseGuards(PlatformAuthGuard)
  @RequirePlatformPerm('managePlatformUsers')
  async resetPassword(@Param('id') id: string, @Body() body: { password?: string }, @Request() req: any) {
    return this.unwrap(await this.svc.resetPassword({ id, password: body?.password, byUserId: this.actor(req) }));
  }
}
