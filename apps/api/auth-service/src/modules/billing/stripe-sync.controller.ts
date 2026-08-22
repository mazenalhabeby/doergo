import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { StripeSyncService } from './stripe-sync.service';

@Controller()
export class StripeSyncController {
  constructor(private readonly svc: StripeSyncService) {}

  // Read-only. There is deliberately no `apply`: creating a Stripe price is
  // permanent, and it belongs in a reviewed command, not a console button.
  @MessagePattern({ cmd: 'platform_pricing_stripe_status' })
  status() { return this.svc.status(); }
}
