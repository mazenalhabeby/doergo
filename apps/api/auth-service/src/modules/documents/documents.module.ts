import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { MrzOcrService } from './mrz-ocr.service';
import { objectStoreProvider } from './object-store.provider';
import { CredentialExpiryService } from './credential-expiry.service';

@Module({
  imports: [
    // Outbound only: telling a member a document is waiting for them.
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)]),
  ],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    CredentialExpiryService,
    // Reads a document's machine-readable zone in-process, so members'
    // passports never leave the box.
    MrzOcrService,
    objectStoreProvider,
  ],
  exports: [DocumentsService, CredentialExpiryService],
})
export class DocumentsModule {}
