import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  pattern,
  createInvitation,
  validateInvitation,
  acceptInvitation,
  listInvitations,
  resendInvitation,
  revokeInvitation,
  type RpcRequest,
} from '@hbcfield/shared/microservices';
import { InvitationService } from './invitation.service';
import { InvitationAcceptService } from './invitation-accept.service';
import { InvitationAdminService } from './invitation-admin.service';

@Controller()
export class InvitationController {
  constructor(
    private readonly invitationService: InvitationService,
    private readonly invitationAdmin: InvitationAdminService,
    private readonly accepting: InvitationAcceptService,
  ) {}

  @MessagePattern(pattern(createInvitation))
  async create(@Payload() data: RpcRequest<typeof createInvitation>) {
    return this.invitationService.createInvitation(data);
  }

  @MessagePattern(pattern(validateInvitation))
  async validate(@Payload() data: RpcRequest<typeof validateInvitation>) {
    return this.accepting.validateCode(data.code);
  }

  @MessagePattern(pattern(acceptInvitation))
  async accept(@Payload() data: RpcRequest<typeof acceptInvitation>) {
    return this.accepting.acceptInvitation(data);
  }

  @MessagePattern(pattern(listInvitations))
  async list(@Payload() data: RpcRequest<typeof listInvitations>) {
    return this.invitationAdmin.listInvitations(data);
  }

  @MessagePattern(pattern(resendInvitation))
  async resend(@Payload() data: RpcRequest<typeof resendInvitation>) {
    return this.invitationAdmin.resendInvitation(data);
  }

  @MessagePattern(pattern(revokeInvitation))
  async revoke(@Payload() data: RpcRequest<typeof revokeInvitation>) {
    return this.invitationAdmin.revokeInvitation(data);
  }
}
