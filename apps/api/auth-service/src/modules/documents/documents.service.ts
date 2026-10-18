import { Injectable } from '@nestjs/common';
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
import { DocumentChainService } from './document-chain.service';
import { DocumentSendBackService } from './document-send-back.service';
import { IssuedRegisterService } from './issued-register.service';
import { MemberDocumentsService } from './member-documents.service';
import { DocumentDraftsService } from './document-drafts.service';
import { DocumentRequirementsService } from './document-requirements.service';
import { ContractIssueService } from './contract-issue.service';
import { CustomerSignBatchService } from './customer-sign-batch.service';
import { DocumentTypeUpdateService } from './document-type-update.service';

export { CONSENT_TEXT, type DocumentActor, type RouteCandidateStep } from './document-common';

/**
 * The personnel file.
 *
 * Documents that belong to a PERSON. Two rules run through everything here and
 * are worth stating once rather than repeating at every method:
 *
 *   1. BYTES NEVER PASS THROUGH THIS SERVICE. Uploads and downloads are both
 *      presigned; this service moves metadata and mints short-lived links.
 *
 *   2. EVERY QUERY IS SCOPED IN THE `where` CLAUSE, by organization AND by the
 *      owner. Never fetch-then-filter, never paginate-then-filter. The last
 *      IDOR in this codebase was an endpoint that trusted an id from a path.
 *
 * THE FACADE. The work lives in one collaborator per responsibility, beside this
 * file; this class keeps every method callers already use and hands each one
 * to the part that owns it. `readOwnUpload` stays here: it is the one place the
 * server asks the shared `suggestExpiry` what a page says, and the mobile
 * one-reader guard reads this file to prove it.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly routing: DocumentRoutingService,
    private readonly chain: DocumentChainService,
    private readonly signing: DocumentSigningService,
    private readonly sendBacks: DocumentSendBackService,
    private readonly types: DocumentTypesService,
    private readonly typeUpdates: DocumentTypeUpdateService,
    private readonly templates: DocumentTemplatesService,
    private readonly contractIssue: ContractIssueService,
    private readonly issuing: DocumentIssuingService,
    private readonly drafts: DocumentDraftsService,
    private readonly supply: DocumentSupplyService,
    private readonly requirements: DocumentRequirementsService,
    private readonly verification: DocumentVerificationService,
    private readonly customerSigning: DocumentCustomerSigningService,
    private readonly customerSignBatch: CustomerSignBatchService,
    private readonly registers: DocumentRegistersService,
    private readonly memberDocuments: MemberDocumentsService,
    private readonly issuedRegister: IssuedRegisterService,
    private readonly downloads: DocumentDownloadsService,
    private readonly control: DocumentControlService,
  ) {}

  listTypes(...args: Parameters<DocumentTypesService['listTypes']>) {
    return this.types.listTypes(...args);
  }

  createType(...args: Parameters<DocumentTypesService['createType']>) {
    return this.types.createType(...args);
  }

  updateType(...args: Parameters<DocumentTypeUpdateService['updateType']>) {
    return this.typeUpdates.updateType(...args);
  }

  deactivateType(...args: Parameters<DocumentTypesService['deactivateType']>) {
    return this.types.deactivateType(...args);
  }

  presignUpload(...args: Parameters<DocumentIssuingService['presignUpload']>) {
    return this.issuing.presignUpload(...args);
  }

  confirmUpload(...args: Parameters<DocumentIssuingService['confirmUpload']>) {
    return this.issuing.confirmUpload(...args);
  }

  listTemplates(...args: Parameters<DocumentTemplatesService['listTemplates']>) {
    return this.templates.listTemplates(...args);
  }

  createTemplate(...args: Parameters<DocumentTemplatesService['createTemplate']>) {
    return this.templates.createTemplate(...args);
  }

  updateTemplate(...args: Parameters<DocumentTemplatesService['updateTemplate']>) {
    return this.templates.updateTemplate(...args);
  }

  deactivateTemplate(...args: Parameters<DocumentTemplatesService['deactivateTemplate']>) {
    return this.templates.deactivateTemplate(...args);
  }

  resolveTemplate(...args: Parameters<DocumentTemplatesService['resolveTemplate']>) {
    return this.templates.resolveTemplate(...args);
  }

  resolveTemplateForMember(...args: Parameters<DocumentTemplatesService['resolveTemplateForMember']>) {
    return this.templates.resolveTemplateForMember(...args);
  }

  issueFromTemplate(...args: Parameters<ContractIssueService['issueFromTemplate']>) {
    return this.contractIssue.issueFromTemplate(...args);
  }

  previewTemplate(...args: Parameters<DocumentTemplatesService['previewTemplate']>) {
    return this.templates.previewTemplate(...args);
  }

  presignOwnUpload(...args: Parameters<DocumentSupplyService['presignOwnUpload']>) {
    return this.supply.presignOwnUpload(...args);
  }

  submitOwnDocument(...args: Parameters<DocumentSupplyService['submitOwnDocument']>) {
    return this.supply.submitOwnDocument(...args);
  }

  listRequirements(...args: Parameters<DocumentRequirementsService['listRequirements']>) {
    return this.requirements.listRequirements(...args);
  }

  pendingForMember(...args: Parameters<DocumentRequirementsService['pendingForMember']>) {
    return this.requirements.pendingForMember(...args);
  }

  listAwaitingVerification(...args: Parameters<DocumentVerificationService['listAwaitingVerification']>) {
    return this.verification.listAwaitingVerification(...args);
  }

  verifyDocument(...args: Parameters<DocumentVerificationService['verifyDocument']>) {
    return this.verification.verifyDocument(...args);
  }

  rejectDocument(...args: Parameters<DocumentVerificationService['rejectDocument']>) {
    return this.verification.rejectDocument(...args);
  }

  recordConsent(...args: Parameters<DocumentSigningService['recordConsent']>) {
    return this.signing.recordConsent(...args);
  }

  signDocument(...args: Parameters<DocumentSigningService['signDocument']>) {
    return this.signing.signDocument(...args);
  }

  listForCustomer(...args: Parameters<DocumentCustomerSigningService['listForCustomer']>) {
    return this.customerSigning.listForCustomer(...args);
  }

  openForCustomer(...args: Parameters<DocumentCustomerSigningService['openForCustomer']>) {
    return this.customerSigning.openForCustomer(...args);
  }

  signBatchAsCustomer(...args: Parameters<CustomerSignBatchService['signBatchAsCustomer']>) {
    return this.customerSignBatch.signBatchAsCustomer(...args);
  }

  acknowledgeDocument(...args: Parameters<DocumentSigningService['acknowledgeDocument']>) {
    return this.signing.acknowledgeDocument(...args);
  }

  listMatchCandidates(...args: Parameters<DocumentIssuingService['listMatchCandidates']>) {
    return this.issuing.listMatchCandidates(...args);
  }

  listDrafts(...args: Parameters<DocumentDraftsService['listDrafts']>) {
    return this.drafts.listDrafts(...args);
  }

  publishBatch(...args: Parameters<DocumentDraftsService['publishBatch']>) {
    return this.drafts.publishBatch(...args);
  }

  discardDraft(...args: Parameters<DocumentDraftsService['discardDraft']>) {
    return this.drafts.discardDraft(...args);
  }

  purgeAbandonedDrafts(...args: Parameters<DocumentDraftsService['purgeAbandonedDrafts']>) {
    return this.drafts.purgeAbandonedDrafts(...args);
  }

  browse(...args: Parameters<DocumentRegistersService['browse']>) {
    return this.registers.browse(...args);
  }

  sendBack(...args: Parameters<DocumentSendBackService['sendBack']>) {
    return this.sendBacks.sendBack(...args);
  }

  documentChain(...args: Parameters<DocumentChainService['documentChain']>) {
    return this.chain.documentChain(...args);
  }

  routeCandidates(...args: Parameters<DocumentRoutingService['routeCandidates']>) {
    return this.routing.routeCandidates(...args);
  }

  listIssued(...args: Parameters<IssuedRegisterService['listIssued']>) {
    return this.issuedRegister.listIssued(...args);
  }

  listForMember(...args: Parameters<MemberDocumentsService['listForMember']>) {
    return this.memberDocuments.listForMember(...args);
  }

  getDownloadUrl(...args: Parameters<DocumentDownloadsService['getDownloadUrl']>) {
    return this.downloads.getDownloadUrl(...args);
  }

  listEvents(...args: Parameters<MemberDocumentsService['listEvents']>) {
    return this.memberDocuments.listEvents(...args);
  }

  exportForMember(...args: Parameters<DocumentDownloadsService['exportForMember']>) {
    return this.downloads.exportForMember(...args);
  }

  setVisibility(...args: Parameters<DocumentControlService['setVisibility']>) {
    return this.control.setVisibility(...args);
  }

  deleteDocuments(...args: Parameters<DocumentControlService['deleteDocuments']>) {
    return this.control.deleteDocuments(...args);
  }

  revoke(...args: Parameters<DocumentControlService['revoke']>) {
    return this.control.revoke(...args);
  }

  deleteOwnSupplied(...args: Parameters<DocumentSupplyService['deleteOwnSupplied']>) {
    return this.supply.deleteOwnSupplied(...args);
  }
}
