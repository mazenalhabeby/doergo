import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { CustomerSignLinkService } from './customer-sign-link.service';
import { CustomerSignMailerService } from './customer-sign-mailer.service';
import { MrzOcrService } from './mrz-ocr.service';
import { objectStoreProvider } from './object-store.provider';
import { CredentialExpiryService } from './credential-expiry.service';
import { DOCUMENT_READERS, OcrRulesReader } from './document-reader';
import { DocumentReadQueue } from './document-read-queue.service';

@Module({
  imports: [
    // Outbound only: telling a member a document is waiting for them.
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)]),
  ],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    CustomerSignLinkService,
    CustomerSignMailerService,
    CredentialExpiryService,
    // Reads a document's machine-readable zone in-process, so members'
    // passports never leave the box.
    MrzOcrService,
    objectStoreProvider,
    /*
      The readers, in the order they are tried. Today: this server's OCR plus
      the shared rules. A local AI engine later is one more entry here — the
      queue, the review screen and the approval do not change.
    */
    OcrRulesReader,
    { provide: DOCUMENT_READERS, useFactory: (ocr: OcrRulesReader) => [ocr], inject: [OcrRulesReader] },
    // Reads members' documents after they are filed, never while they wait.
    DocumentReadQueue,
  ],
  exports: [DocumentsService, CredentialExpiryService, CustomerSignLinkService, CustomerSignMailerService],
})
export class DocumentsModule {}
