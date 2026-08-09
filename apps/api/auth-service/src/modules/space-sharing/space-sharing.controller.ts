import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { SpaceSharingService } from './space-sharing.service';

@Controller()
export class SpaceSharingController {
  constructor(private readonly svc: SpaceSharingService) {}

  @MessagePattern({ cmd: 'space_share_create' })
  create(@Payload() data: any) { return this.svc.createShare(data); }

  @MessagePattern({ cmd: 'space_share_update' })
  update(@Payload() data: any) { return this.svc.updateShare(data); }

  @MessagePattern({ cmd: 'space_share_revoke' })
  revoke(@Payload() data: any) { return this.svc.revokeShare(data); }

  @MessagePattern({ cmd: 'space_share_list_for_space' })
  listForSpace(@Payload() data: any) { return this.svc.listForSpace(data); }

  @MessagePattern({ cmd: 'space_share_list_incoming' })
  listIncoming(@Payload() data: any) { return this.svc.listIncoming(data); }

  @MessagePattern({ cmd: 'space_share_respond' })
  respond(@Payload() data: any) { return this.svc.respondToShare(data); }

  @MessagePattern({ cmd: 'space_share_request_create' })
  createRequest(@Payload() data: any) { return this.svc.createRequest(data); }

  @MessagePattern({ cmd: 'space_share_request_list' })
  listRequests(@Payload() data: any) { return this.svc.listRequests(data); }

  @MessagePattern({ cmd: 'space_share_request_resolve' })
  resolveRequest(@Payload() data: any) { return this.svc.resolveRequest(data); }
}
