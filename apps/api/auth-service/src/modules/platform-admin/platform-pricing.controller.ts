import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { PricingService } from './platform-pricing.service';

import { pattern, platformPricingList } from '@hbcfield/shared/microservices';
/**
 * One handler. The price book used to have seven — draft, edit a seat, add a
 * module price, delete one, publish — because prices lived in a database table
 * an operator could edit. They live in code now, so there is nothing to write.
 */
@Controller()
export class PlatformPricingController {
  constructor(private readonly svc: PricingService) {}

  @MessagePattern(pattern(platformPricingList))
  list() {
    return this.svc.getPriceList();
  }
}
