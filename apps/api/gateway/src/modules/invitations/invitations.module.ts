import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { createClientOptions, SERVICE_NAMES } from '@hbcfield/shared';
import { InvitationsController } from './invitations.controller';

@Module({
  imports: [
    ClientsModule.registerAsync([
      createClientOptions(SERVICE_NAMES.NOTIFICATION),
    ]),
  ],
  controllers: [InvitationsController],
})
export class InvitationsModule {}
