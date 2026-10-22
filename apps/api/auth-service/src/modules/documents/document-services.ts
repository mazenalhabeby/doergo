import { DocumentsService } from './documents.service';
import { DocumentStorageService } from './core/document-storage.service';
import { DocumentLookupService } from './core/document-lookup.service';
import { DocumentNotifierService } from './core/document-notifier.service';
import { DocumentRoutingService } from './core/document-routing.service';
import { DocumentSigningService } from './signing/document-signing.service';
import { DocumentTypesService } from './types/document-types.service';
import { DocumentTemplatesService } from './templates/document-templates.service';
import { DocumentIssuingService } from './issuing/document-issuing.service';
import { DocumentSupplyService } from './issuing/document-supply.service';
import { DocumentVerificationService } from './issuing/document-verification.service';
import { DocumentCustomerSigningService } from './signing/document-customer-signing.service';
import { DocumentRegistersService } from './registers/document-registers.service';
import { DocumentDownloadsService } from './registers/document-downloads.service';
import { DocumentControlService } from './issuing/document-control.service';
import { DocumentChainService } from './core/document-chain.service';
import { OwnUploadReaderService } from './reading/own-upload-reader.service';
import { DocumentSendBackService } from './signing/document-send-back.service';
import { DocumentSealService } from './signing/document-seal.service';
import { IssuedRegisterService } from './registers/issued-register.service';
import { MemberDocumentsService } from './registers/member-documents.service';
import { DocumentDraftsService } from './issuing/document-drafts.service';
import { DocumentRequirementsService } from './issuing/document-requirements.service';
import { ContractIssueService } from './templates/contract-issue.service';
import { CustomerSignBatchService } from './signing/customer-sign-batch.service';
import { DocumentTypeUpdateService } from './types/document-type-update.service';

/**
 * The personnel file as providers: the `DocumentsService` facade and the
 * collaborators it hands each responsibility to.
 *
 * One list, read by the module AND by every spec that builds the service, so a
 * collaborator added here can never be missing from one of them.
 */
export const DOCUMENT_SERVICES = [
  DocumentsService,
  OwnUploadReaderService,
  DocumentStorageService,
  DocumentLookupService,
  DocumentNotifierService,
  DocumentRoutingService,
  DocumentChainService,
  DocumentSigningService,
  DocumentSendBackService,
  DocumentSealService,
  DocumentTypesService,
  DocumentTypeUpdateService,
  DocumentTemplatesService,
  ContractIssueService,
  DocumentIssuingService,
  DocumentDraftsService,
  DocumentSupplyService,
  DocumentRequirementsService,
  DocumentVerificationService,
  DocumentCustomerSigningService,
  CustomerSignBatchService,
  DocumentRegistersService,
  IssuedRegisterService,
  MemberDocumentsService,
  DocumentDownloadsService,
  DocumentControlService,
];
