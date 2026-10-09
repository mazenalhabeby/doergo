import { DocumentsService } from './documents.service';
import { DocumentStorageService } from './document-storage.service';
import { DocumentLookupService } from './document-lookup.service';
import { DocumentNotifierService } from './document-notifier.service';
import { DocumentRoutingService } from './document-routing.service';
import { DocumentSigningService } from './document-signing.service';
import { DocumentTypesService } from './document-types.service';
import { DocumentTemplatesService } from './document-templates.service';
import { DocumentIssuingService } from './document-issuing.service';
import { DocumentSupplyService } from './document-supply.service';
import { DocumentVerificationService } from './document-verification.service';
import { DocumentCustomerSigningService } from './document-customer-signing.service';
import { DocumentRegistersService } from './document-registers.service';
import { DocumentDownloadsService } from './document-downloads.service';
import { DocumentControlService } from './document-control.service';

/**
 * The personnel file as providers: the `DocumentsService` facade and the
 * collaborators it hands each responsibility to.
 *
 * One list, read by the module AND by every spec that builds the service, so a
 * collaborator added here can never be missing from one of them.
 */
export const DOCUMENT_SERVICES = [
  DocumentsService,
  DocumentStorageService,
  DocumentLookupService,
  DocumentNotifierService,
  DocumentRoutingService,
  DocumentSigningService,
  DocumentTypesService,
  DocumentTemplatesService,
  DocumentIssuingService,
  DocumentSupplyService,
  DocumentVerificationService,
  DocumentCustomerSigningService,
  DocumentRegistersService,
  DocumentDownloadsService,
  DocumentControlService,
];
