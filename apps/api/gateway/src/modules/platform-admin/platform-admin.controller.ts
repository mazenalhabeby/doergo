import { Body, Controller, Get, HttpException, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { PlatformAdminService } from './platform-admin.service';

/**
 * PLATFORM-OPERATOR control center (company super-admin). NOT a customer surface:
 * `@Public()` skips the JWT chain and the constant-time `PlatformAdminGuard` is the
 * only credential (the `x-platform-admin-key` secret). All routes rate-limited.
 */
@Controller('platform')
@Public()
@UseGuards(PlatformAdminGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class PlatformAdminController {
  constructor(private readonly svc: PlatformAdminService) {}

  /** Turn a `{ success:false }` microservice result into an HTTP error. */
  private unwrap<T>(result: any): T {
    if (result && result.success === false) {
      throw new HttpException({ message: result.message ?? 'Error' }, result.statusCode ?? HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  @Get('overview')
  async overview() { return this.unwrap(await this.svc.overview()); }

  @Get('orgs')
  async listOrgs(@Query('search') search?: string, @Query('status') status?: string) {
    return this.unwrap(await this.svc.listOrgs({ search, status }));
  }

  @Get('orgs/:id')
  async orgDetail(@Param('id') id: string) { return this.unwrap(await this.svc.orgDetail({ organizationId: id })); }

  @Post('orgs/:id/suspend')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async suspend(@Param('id') id: string) { return this.unwrap(await this.svc.suspend({ organizationId: id })); }

  @Post('orgs/:id/reactivate')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async reactivate(@Param('id') id: string) { return this.unwrap(await this.svc.reactivate({ organizationId: id })); }

  @Post('orgs/:id/extend-trial')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async extendTrial(@Param('id') id: string, @Body() body: { days?: number }) {
    return this.unwrap(await this.svc.extendTrial({ organizationId: id, days: Number(body?.days) || 14 }));
  }
}
