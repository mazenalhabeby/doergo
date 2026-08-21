import { Body, Controller, Get, HttpException, HttpStatus, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators';
import { PlatformAuthGuard, RequirePlatformPerm } from '../../common/guards/platform-auth.guard';
import { PlatformAdminService } from './platform-admin.service';
import { ADD_ON_KEYS, isAddOn } from '@hbcfield/shared';

/**
 * PLATFORM Control Center (company super-admin). `@Public()` skips the customer
 * JWT chain; the PLATFORM-STAFF Bearer token is verified by PlatformAuthGuard and
 * each route is gated on an RBAC capability. Every mutation carries the acting
 * staff member's id for audit.
 */
@Controller('platform')
@Public()
@UseGuards(PlatformAuthGuard)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class PlatformAdminController {
  constructor(private readonly svc: PlatformAdminService) {}

  private unwrap<T>(result: any): T {
    if (result && result.success === false) {
      throw new HttpException({ message: result.message ?? 'Error' }, result.statusCode ?? HttpStatus.BAD_REQUEST);
    }
    return result;
  }
  private actor(req: any): string | undefined { return req.platformUser?.id; }

  @Get('overview')
  @RequirePlatformPerm('view')
  async overview() { return this.unwrap(await this.svc.overview()); }

  @Get('orgs')
  @RequirePlatformPerm('view')
  async listOrgs(@Query('search') search?: string, @Query('status') status?: string) {
    return this.unwrap(await this.svc.listOrgs({ search, status }));
  }

  @Get('orgs/:id')
  @RequirePlatformPerm('view')
  async orgDetail(@Param('id') id: string) { return this.unwrap(await this.svc.orgDetail({ organizationId: id })); }

  @Post('orgs/:id/extend-trial')
  @RequirePlatformPerm('extendTrial')
  async extendTrial(@Param('id') id: string, @Body() body: { days?: number }, @Request() req: any) {
    return this.unwrap(await this.svc.extendTrial({ organizationId: id, days: Number(body?.days) || 14, byUserId: this.actor(req) }));
  }

  @Post('orgs/:id/suspend')
  @RequirePlatformPerm('manageOrgs')
  async suspend(@Param('id') id: string, @Request() req: any) { return this.unwrap(await this.svc.suspend({ organizationId: id, byUserId: this.actor(req) })); }

  @Post('orgs/:id/reactivate')
  @RequirePlatformPerm('manageOrgs')
  async reactivate(@Param('id') id: string, @Request() req: any) { return this.unwrap(await this.svc.reactivate({ organizationId: id, byUserId: this.actor(req) })); }

  /**
   * Grant an organization its capabilities. Replaces setting a tier — a
   * negotiated contract grants what it covers, and the gate only understands
   * bought things. Omitting `addOns` grants everything, which is what setting
   * the enterprise tier used to mean.
   */
  @Post('orgs/:id/add-ons')
  @RequirePlatformPerm('manageOrgs')
  async setAddOns(@Param('id') id: string, @Body() body: { addOns?: string[] }) {
    const addOns = Array.isArray(body?.addOns) ? body.addOns : ADD_ON_KEYS;
    const unknown = addOns.filter((k) => !isAddOn(k));
    if (unknown.length) throw new HttpException({ message: `Not an add-on: ${unknown.join(', ')}` }, HttpStatus.BAD_REQUEST);
    return this.unwrap(await this.svc.setAddOns({ organizationId: id, addOns }));
  }
}
