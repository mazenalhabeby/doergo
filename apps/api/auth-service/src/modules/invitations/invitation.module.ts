import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { InvitationController } from './invitation.controller';
import { InvitationService } from './invitation.service';
import { DocumentsModule } from '../documents/documents.module';
import { BillingModule } from '../billing/billing.module';
import { InvitationAcceptService } from './invitation-accept.service';
import { InvitationAdminService } from './invitation-admin.service';

@Module({
  imports: [
    // Outbound client so an invite with an email address auto-sends the code.
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)]),
    // For the joining contract. DocumentsModule imports nothing from here, so
    // there is no cycle.
    DocumentsModule,
    // A member who accepts is a seat — the bill is re-synced at once.
    BillingModule,
  ],
  controllers: [InvitationController],
  providers: [InvitationService, InvitationAcceptService, InvitationAdminService],
  exports: [InvitationService, InvitationAcceptService, InvitationAdminService],
})
export class InvitationModule {}
