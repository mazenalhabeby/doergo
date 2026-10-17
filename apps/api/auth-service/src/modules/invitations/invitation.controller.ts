import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
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

  @MessagePattern({ cmd: 'create_invitation' })
  async create(@Payload() data: any) {
    return this.invitationService.createInvitation(data);
  }

  @MessagePattern({ cmd: 'validate_invitation' })
  async validate(@Payload() data: { code: string }) {
    return this.accepting.validateCode(data.code);
  }

  @MessagePattern({ cmd: 'accept_invitation' })
  async accept(@Payload() data: any) {
    return this.accepting.acceptInvitation(data);
  }

  @MessagePattern({ cmd: 'list_invitations' })
  async list(@Payload() data: any) {
    return this.invitationAdmin.listInvitations(data);
  }

  @MessagePattern({ cmd: 'resend_invitation' })
  async resend(@Payload() data: { organizationId: string; customerId: string }) {
    return this.invitationAdmin.resendInvitation(data);
  }

  @MessagePattern({ cmd: 'revoke_invitation' })
  async revoke(@Payload() data: any) {
    return this.invitationAdmin.revokeInvitation(data);
  }
}
