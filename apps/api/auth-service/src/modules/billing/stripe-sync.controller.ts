import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { StripeSyncService } from './stripe-sync.service';

@Controller()
export class StripeSyncController {
  constructor(private readonly svc: StripeSyncService) {}

  @MessagePattern({ cmd: 'platform_pricing_sync_preview' })
  preview() { return this.svc.preview(); }

  @MessagePattern({ cmd: 'platform_pricing_sync_apply' })
  apply(@Payload() d: any) { return this.svc.apply(d); }
}
