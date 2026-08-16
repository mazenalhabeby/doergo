import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { Public } from '../../common/decorators';
import { PlatformAuthGuard, RequirePlatformPerm } from '../../common/guards/platform-auth.guard';
import { PlatformAdminService } from './platform-admin.service';

/**
 * C2 pricing editor. Viewing needs `view`; every EDIT needs `editPricing`
 * (Owner/Billing). No Stripe mutation happens here — publishing only swaps the
 * active price-book version (Stripe sync is C3).
 */
@Controller('platform/pricing')
@Public()
@UseGuards(PlatformAuthGuard)
export class PlatformPricingController {
  constructor(private readonly svc: PlatformAdminService) {}
  private unwrap<T>(r: any): T { if (r && r.success === false) throw new HttpException({ message: r.message ?? 'Error' }, r.statusCode ?? HttpStatus.BAD_REQUEST); return r; }
  private actor(req: any) { return req.platformUser?.id; }

  @Get()
  @RequirePlatformPerm('view')
  async get() {
    const [active, versions] = await Promise.all([this.svc.pricingActive(), this.svc.pricingList()]);
    return { data: { active: this.unwrap<any>(active)?.data ?? null, versions: this.unwrap<any>(versions)?.data ?? [] } };
  }

  @Post('draft')
  @RequirePlatformPerm('editPricing')
  async draft(@Body() body: { note?: string }, @Request() req: any) { return this.unwrap(await this.svc.pricingCreateDraft({ note: body?.note, byUserId: this.actor(req) })); }

  @Patch(':configId/seat/:seatPriceId')
  @RequirePlatformPerm('editPricing')
  async seat(@Param('configId') configId: string, @Param('seatPriceId') seatPriceId: string, @Body() body: { monthlyCents?: number; annualCents?: number }) {
    return this.unwrap(await this.svc.pricingUpdateSeat({ configId, seatPriceId, monthlyCents: body?.monthlyCents, annualCents: body?.annualCents }));
  }

  @Post(':configId/module')
  @RequirePlatformPerm('editPricing')
  async module(@Param('configId') configId: string, @Body() body: { moduleKey: string; monthlyCents: number; annualCents?: number; billingScope?: string }) {
    return this.unwrap(await this.svc.pricingUpsertModule({ configId, ...body }));
  }

  @Delete(':configId/module/:modulePriceId')
  @RequirePlatformPerm('editPricing')
  async delModule(@Param('configId') configId: string, @Param('modulePriceId') modulePriceId: string) {
    return this.unwrap(await this.svc.pricingDeleteModule({ configId, modulePriceId }));
  }

  @Post(':configId/publish')
  @RequirePlatformPerm('editPricing')
  async publish(@Param('configId') configId: string, @Request() req: any) { return this.unwrap(await this.svc.pricingPublish({ configId, byUserId: this.actor(req) })); }
}
