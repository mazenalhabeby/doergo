import { Injectable } from '@nestjs/common';
import { checkScan, suggestExpiry, type Rect } from '@hbcfield/shared';
import { MrzOcrService } from './mrz-ocr.service';
import { type DocumentActor } from './document-common';
import { DocumentStorageService } from './document-storage.service';
import { DocumentLookupService } from './document-lookup.service';
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
    private readonly ocr: MrzOcrService,
    private readonly storage: DocumentStorageService,
    private readonly lookup: DocumentLookupService,
    private readonly routing: DocumentRoutingService,
    private readonly signing: DocumentSigningService,
    private readonly types: DocumentTypesService,
    private readonly templates: DocumentTemplatesService,
    private readonly issuing: DocumentIssuingService,
    private readonly supply: DocumentSupplyService,
    private readonly verification: DocumentVerificationService,
    private readonly customerSigning: DocumentCustomerSigningService,
    private readonly registers: DocumentRegistersService,
    private readonly downloads: DocumentDownloadsService,
    private readonly control: DocumentControlService,
  ) {}

  listTypes(...args: Parameters<DocumentTypesService['listTypes']>) {
    return this.types.listTypes(...args);
  }

  createType(...args: Parameters<DocumentTypesService['createType']>) {
    return this.types.createType(...args);
  }

  updateType(...args: Parameters<DocumentTypesService['updateType']>) {
    return this.types.updateType(...args);
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

  issueFromTemplate(...args: Parameters<DocumentTemplatesService['issueFromTemplate']>) {
    return this.templates.issueFromTemplate(...args);
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

  /**
   * Read a staged upload and say what is on it — WITHOUT filing anything.
   *
   * This exists because the flow was backwards. The member typed an expiry
   * date, sent the document, and the server then read the real one and quietly
   * used it instead: busywork followed by a silent override, which is the worst
   * of both. Reading first turns it into what every identity flow does — the
   * machine reads, the person confirms.
   *
   * The distinction in the answer is the important part. An expiry from a
   * machine-readable zone is a FACT the document proves about itself, with a
   * check digit behind it. An expiry scraped from printed text is a SUGGESTION,
   * because a European driving licence has no zone at all and nothing about
   * that reading is provable. The caller is told which it got.
   *
   * The staged object is left where it is: the member may still change their
   * mind, and `submitOwnDocument` is what consumes it.
   */
  async readOwnUpload(data: {
    actor: DocumentActor;
    stagingKey: string;
    crop?: Rect | null;
    /** The reverse, for a card that carries its zone there. */
    backStagingKey?: string | null;
    backCrop?: Rect | null;
  }) {
    const { organizationId, userId } = data.actor;

    // The frame, not the room: an uncropped photo puts the zone somewhere the
    // band search will never look.
    const front = await this.storage.peekStaged(organizationId, data.stagingKey, userId, data.crop);
    const back = data.backStagingKey
      ? await this.storage.peekStaged(organizationId, data.backStagingKey, userId, data.backCrop)
      : null;

    /*
      A PDF cannot be read here, and the honest thing is to say so rather than
      to fail at it.

      Rasterising needs a renderer this service does not have — `pdf-lib`
      manipulates PDFs, it does not draw them. ⚠️ Which is NOT the end of the
      story for the member: the browser reads a PDF's TEXT LAYER before it
      uploads (`src/lib/pdf-text.ts`), and a text layer is the characters the
      document was written with rather than a guess at their shape, so it beats
      anything OCR could return. This answer is what lets that reading stand
      instead of being overwritten with a worse one.
    */
    if (!front.mimeType.startsWith('image/')) {
      return { source: 'NOTHING' as const, expiresOn: null, fields: null, verdict: null };
    }

    // Read the two sides together. On an ID card the zone is only on the back.
    const bytes = await this.storage.composeSides(front.bytes, back?.bytes ?? null);
    const text = await this.ocr.read(bytes, 'image/jpeg');

    if (!text) {
      return { source: 'NOTHING' as const, expiresOn: null, fields: null, verdict: null };
    }

    const member = await this.lookup.assertMemberOfOrg(data.actor.userId, data.actor.organizationId);
    const scan = checkScan({ mrzText: text, member });

    if (scan.raw) {
      const fields = {
        holderName: scan.extracted.holderName,
        documentNumber: scan.extracted.documentNumber,
        dateOfBirth: scan.extracted.dateOfBirth,
        issuingState: scan.extracted.issuingState,
      };

      /*
        A zone was read, and its arithmetic agrees. This is the only expiry in
        the product that is a FACT rather than a reading.
      */
      if (scan.raw.allChecksPassed) {
        return {
          source: 'MRZ' as const,
          expiresOn: scan.extracted.dateOfExpiry,
          fields,
          verdict: scan.verdict,
        };
      }

      /*
        The check digit disagrees, so the zone's own date is not offered — it
        would be a wrong date with the app's authority behind it.
        ⚠️ But that used to end the matter, and the member was left typing.
        The band is the lower third of the picture; the date is very often
        printed in the part of the page the band never covered. So look at the
        whole frame before giving up, and label what comes back as the guess it
        is. Costs a second pass, on the rare path where the first one failed.
      */
      const printed = await this.ocr.read(bytes, 'image/jpeg', { wholeFrame: true });
      const fallback = printed ? suggestExpiry(printed) : null;
      return {
        source: fallback ? ('TEXT' as const) : ('NOTHING' as const),
        expiresOn: fallback?.iso ?? null,
        fields,
        verdict: scan.verdict,
      };
    }

    /*
      No zone: a licence, a certificate, an insurance card — which is MOST of
      what this product files.

      ⚠️ This branch was unreachable until the OCR stopped discarding text that
      did not look like a zone. `suggestExpiry` has been sitting here, tested
      and correct, never once called with anything but null.
    */
    const guess = suggestExpiry(text);
    return {
      source: guess ? ('TEXT' as const) : ('NOTHING' as const),
      expiresOn: guess?.iso ?? null,
      fields: null,
      verdict: null,
    };
  }

  listRequirements(...args: Parameters<DocumentSupplyService['listRequirements']>) {
    return this.supply.listRequirements(...args);
  }

  pendingForMember(...args: Parameters<DocumentSupplyService['pendingForMember']>) {
    return this.supply.pendingForMember(...args);
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

  signBatchAsCustomer(...args: Parameters<DocumentCustomerSigningService['signBatchAsCustomer']>) {
    return this.customerSigning.signBatchAsCustomer(...args);
  }

  acknowledgeDocument(...args: Parameters<DocumentSigningService['acknowledgeDocument']>) {
    return this.signing.acknowledgeDocument(...args);
  }

  listMatchCandidates(...args: Parameters<DocumentIssuingService['listMatchCandidates']>) {
    return this.issuing.listMatchCandidates(...args);
  }

  listDrafts(...args: Parameters<DocumentIssuingService['listDrafts']>) {
    return this.issuing.listDrafts(...args);
  }

  publishBatch(...args: Parameters<DocumentIssuingService['publishBatch']>) {
    return this.issuing.publishBatch(...args);
  }

  discardDraft(...args: Parameters<DocumentIssuingService['discardDraft']>) {
    return this.issuing.discardDraft(...args);
  }

  purgeAbandonedDrafts(...args: Parameters<DocumentIssuingService['purgeAbandonedDrafts']>) {
    return this.issuing.purgeAbandonedDrafts(...args);
  }

  browse(...args: Parameters<DocumentRegistersService['browse']>) {
    return this.registers.browse(...args);
  }

  sendBack(...args: Parameters<DocumentSigningService['sendBack']>) {
    return this.signing.sendBack(...args);
  }

  documentChain(...args: Parameters<DocumentRoutingService['documentChain']>) {
    return this.routing.documentChain(...args);
  }

  routeCandidates(...args: Parameters<DocumentRoutingService['routeCandidates']>) {
    return this.routing.routeCandidates(...args);
  }

  listIssued(...args: Parameters<DocumentRegistersService['listIssued']>) {
    return this.registers.listIssued(...args);
  }

  listForMember(...args: Parameters<DocumentRegistersService['listForMember']>) {
    return this.registers.listForMember(...args);
  }

  getDownloadUrl(...args: Parameters<DocumentDownloadsService['getDownloadUrl']>) {
    return this.downloads.getDownloadUrl(...args);
  }

  listEvents(...args: Parameters<DocumentRegistersService['listEvents']>) {
    return this.registers.listEvents(...args);
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
