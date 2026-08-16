import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { PlatformAdminService } from './platform-admin.service';

@Controller()
export class PlatformAdminController {
  constructor(private readonly svc: PlatformAdminService) {}

  @MessagePattern({ cmd: 'platform_overview' })
  overview() { return this.svc.overview(); }

  @MessagePattern({ cmd: 'platform_list_orgs' })
  listOrgs(@Payload() d: { search?: string; status?: string }) { return this.svc.listOrgs(d ?? {}); }

  @MessagePattern({ cmd: 'platform_org_detail' })
  orgDetail(@Payload() d: { organizationId: string }) { return this.svc.orgDetail(d.organizationId); }

  @MessagePattern({ cmd: 'platform_suspend' })
  suspend(@Payload() d: any) { return this.svc.suspend(d); }

  @MessagePattern({ cmd: 'platform_reactivate' })
  reactivate(@Payload() d: any) { return this.svc.reactivate(d); }

  @MessagePattern({ cmd: 'platform_extend_trial' })
  extendTrial(@Payload() d: any) { return this.svc.extendTrial(d); }
}
