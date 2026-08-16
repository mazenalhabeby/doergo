import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { PricingService } from './platform-pricing.service';

@Controller()
export class PlatformPricingController {
  constructor(private readonly svc: PricingService) {}

  @MessagePattern({ cmd: 'platform_pricing_active' })
  active() { return this.svc.getActive(); }

  @MessagePattern({ cmd: 'platform_pricing_list' })
  list() { return this.svc.list(); }

  @MessagePattern({ cmd: 'platform_pricing_create_draft' })
  createDraft(@Payload() d: any) { return this.svc.createDraft(d); }

  @MessagePattern({ cmd: 'platform_pricing_update_seat' })
  updateSeat(@Payload() d: any) { return this.svc.updateSeatPrice(d); }

  @MessagePattern({ cmd: 'platform_pricing_upsert_module' })
  upsertModule(@Payload() d: any) { return this.svc.upsertModulePrice(d); }

  @MessagePattern({ cmd: 'platform_pricing_delete_module' })
  deleteModule(@Payload() d: any) { return this.svc.deleteModulePrice(d); }

  @MessagePattern({ cmd: 'platform_pricing_publish' })
  publish(@Payload() d: any) { return this.svc.publish(d); }
}
