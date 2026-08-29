import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { objectStoreProvider } from './object-store.provider';
import { CredentialExpiryService } from './credential-expiry.service';

@Module({
  imports: [
    // Outbound only: telling a member a document is waiting for them.
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)]),
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService, CredentialExpiryService, objectStoreProvider],
  exports: [DocumentsService, CredentialExpiryService],
})
export class DocumentsModule {}
