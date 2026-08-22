import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { PricingService } from './platform-pricing.service';

/**
 * One handler. The price book used to have seven — draft, edit a seat, add a
 * module price, delete one, publish — because prices lived in a database table
 * an operator could edit. They live in code now, so there is nothing to write.
 */
@Controller()
export class PlatformPricingController {
  constructor(private readonly svc: PricingService) {}

  @MessagePattern({ cmd: 'platform_pricing_list' })
  list() { return this.svc.getPriceList(); }
}
