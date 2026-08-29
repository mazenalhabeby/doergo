import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { InvitationController } from './invitation.controller';
import { InvitationService } from './invitation.service';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [
    // Outbound client so an invite with an email address auto-sends the code.
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)]),
    // For the joining contract. DocumentsModule imports nothing from here, so
    // there is no cycle.
    DocumentsModule,
  ],
  controllers: [InvitationController],
  providers: [InvitationService],
  exports: [InvitationService],
})
export class InvitationModule {}
