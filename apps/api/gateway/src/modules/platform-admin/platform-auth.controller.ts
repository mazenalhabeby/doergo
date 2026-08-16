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
  async login(@Body() body: { email?: string; password?: string }) {
    return this.unwrap(await this.svc.login({ email: body?.email ?? '', password: body?.password ?? '' }));
  }

  /** Break-glass: create the first OWNER — gated by the shared PLATFORM_ADMIN_KEY. */
  @Post('auth/bootstrap')
  @UseGuards(PlatformAdminGuard)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async bootstrap(@Body() body: any) { return this.unwrap(await this.svc.bootstrapOwner(body)); }

  @Get('auth/me')
  @UseGuards(PlatformAuthGuard)
  async me(@Request() req: any) { return this.unwrap(await this.svc.me({ userId: this.actor(req)! })); }

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
