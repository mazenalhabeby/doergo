import { Module } from '@nestjs/common';
import { DocumentCoreModule } from '../core/document-core.module';
import { DocumentIssuingService } from './document-issuing.service';
import { DocumentDraftsService } from './document-drafts.service';
import { DocumentSupplyService } from './document-supply.service';
import { DocumentRequirementsService } from './document-requirements.service';
import { DocumentVerificationService } from './document-verification.service';
import { DocumentControlService } from './document-control.service';

/**
 * Putting documents in a file: issuing, drafts, a member supplying their own, what is required of
 * whom, verifying, and hiding / replacing / deleting.
 */
@Module({
  imports: [DocumentCoreModule],
  providers: [
    DocumentIssuingService,
    DocumentDraftsService,
    DocumentSupplyService,
    DocumentRequirementsService,
    DocumentVerificationService,
    DocumentControlService,
  ],
  exports: [
    DocumentIssuingService,
    DocumentDraftsService,
    DocumentSupplyService,
    DocumentRequirementsService,
    DocumentVerificationService,
    DocumentControlService,
  ],
})
export class DocumentIssuingModule {}
