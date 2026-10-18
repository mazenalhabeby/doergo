import { Module } from '@nestjs/common';
import { InvitationsController } from './invitations.controller';

@Module({
  imports: [
  ],
  controllers: [InvitationsController],
})
export class InvitationsModule {}
