import { Controller, Get, HttpException, HttpStatus, UseGuards } from '@nestjs/common';
import { Public } from '../../common/decorators';
import { PlatformAuthGuard, RequirePlatformPerm } from '../../common/guards/platform-auth.guard';
import { PlatformAdminService } from './platform-admin.service';

/**
 * What the platform charges, and whether Stripe agrees.
 *
 * Both routes are reads. The editor that used to live here — draft, edit a seat
 * price, add a module price, publish, push to Stripe — is gone with the price
 * book it edited: prices are code now, so changing one is a reviewed deploy.
 * `editPricing` still gates the Stripe view, because it exposes what the live
 * account holds.
 */
@Controller('platform/pricing')
@Public()
@UseGuards(PlatformAuthGuard)
export class PlatformPricingController {
  constructor(private readonly svc: PlatformAdminService) {}
  private unwrap<T>(r: any): T {
    if (r && r.success === false) throw new HttpException({ message: r.message ?? 'Error' }, r.statusCode ?? HttpStatus.BAD_REQUEST);
    return r;
  }

  @Get()
  @RequirePlatformPerm('view')
  async get() {
    return { data: this.unwrap<any>(await this.svc.pricingList())?.data ?? null };
  }

  @Get('stripe')
  @RequirePlatformPerm('editPricing')
  async stripe() {
    return { data: this.unwrap<any>(await this.svc.pricingStripeStatus())?.data ?? null };
  }
}
