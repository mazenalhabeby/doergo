import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { InvitationsController } from './invitations.controller';

@Module({
  imports: [
  ],
  controllers: [InvitationsController],
})
export class InvitationsModule {}
