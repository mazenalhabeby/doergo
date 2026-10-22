import { Module } from '@nestjs/common';
import { DocumentCoreModule } from '../core/document-core.module';
import { DocumentSigningService } from './document-signing.service';
import { DocumentSendBackService } from './document-send-back.service';
import { DocumentSealService } from './document-seal.service';
import { DocumentCustomerSigningService } from './document-customer-signing.service';
import { CustomerSignBatchService } from './customer-sign-batch.service';
import { CustomerSignLinkService } from './customer-sign-link.service';
import { CustomerSignMailerService } from './customer-sign-mailer.service';

/**
 * Signing: the member's and the office's steps, sending back, the seal, and a client signing through a link.
 */
@Module({
  imports: [DocumentCoreModule],
  providers: [
    DocumentSigningService,
    DocumentSendBackService,
    DocumentSealService,
    DocumentCustomerSigningService,
    CustomerSignBatchService,
    CustomerSignLinkService,
    CustomerSignMailerService,
  ],
  exports: [
    DocumentSigningService,
    DocumentSendBackService,
    DocumentSealService,
    DocumentCustomerSigningService,
    CustomerSignBatchService,
    CustomerSignLinkService,
    CustomerSignMailerService,
  ],
})
export class DocumentSigningModule {}
