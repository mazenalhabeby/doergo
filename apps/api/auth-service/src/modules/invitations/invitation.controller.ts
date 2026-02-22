import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { InvitationService } from './invitation.service';

@Controller()
export class InvitationController {
  constructor(private readonly invitationService: InvitationService) {}

  @MessagePattern({ cmd: 'create_invitation' })
  async create(@Payload() data: any) {
    return this.invitationService.createInvitation(data);
  }

  @MessagePattern({ cmd: 'validate_invitation' })
  async validate(@Payload() data: { code: string }) {
    return this.invitationService.validateCode(data.code);
  }

  @MessagePattern({ cmd: 'accept_invitation' })
  async accept(@Payload() data: any) {
    return this.invitationService.acceptInvitation(data);
  }

  @MessagePattern({ cmd: 'list_invitations' })
  async list(@Payload() data: any) {
    return this.invitationService.listInvitations(data);
  }

  @MessagePattern({ cmd: 'revoke_invitation' })
  async revoke(@Payload() data: any) {
    return this.invitationService.revokeInvitation(data);
  }
}
