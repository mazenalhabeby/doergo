import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { DocumentsService } from './documents.service';
import { CustomerSignLinkService } from './signing/customer-sign-link.service';
import { CustomerSignMailerService } from './signing/customer-sign-mailer.service';
import { OwnUploadReaderService } from './reading/own-upload-reader.service';
import { ComplianceBoardService } from './registers/compliance-board.service';

import { pattern, type RpcRequest } from '@hbcfield/shared/microservices';
// The handlers' message contracts — one namespace, so the list is not repeated here.
import * as docs from '@hbcfield/shared/microservices';

/** A handler's payload: its message contract's request type. */
type Msg<C> = RpcRequest<C>;
/**
 * Transport only. Every method forwards to the service, which is where the
 * authorization lives — so a new caller cannot reach a document by finding a
 * pattern that skipped a check.
 */
@Controller()
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly ownUploadReader: OwnUploadReaderService,
    private readonly complianceBoard: ComplianceBoardService,
    private readonly links: CustomerSignLinkService,
    private readonly mailer: CustomerSignMailerService,
  ) {}

  // ── Types ────────────────────────────────────────────────────────────────
  @MessagePattern(pattern(docs.documentsChain))
  documentChain(@Payload() data: Msg<typeof docs.documentsChain>) {
    return this.documents.documentChain(data);
  }

  @MessagePattern(pattern(docs.documentsRouteCandidates))
  routeCandidates(@Payload() data: Msg<typeof docs.documentsRouteCandidates>) {
    return this.documents.routeCandidates(data);
  }

  @MessagePattern(pattern(docs.documentsSendBack))
  sendBack(@Payload() data: Msg<typeof docs.documentsSendBack>) {
    return this.documents.sendBack(data);
  }

  @MessagePattern(pattern(docs.documentsBrowse))
  browse(@Payload() data: Msg<typeof docs.documentsBrowse>) {
    return this.documents.browse(data);
  }

  @MessagePattern(pattern(docs.documentsListIssued))
  listIssued(@Payload() data: Msg<typeof docs.documentsListIssued>) {
    return this.documents.listIssued(data);
  }

  @MessagePattern(pattern(docs.documentsListTypes))
  listTypes(@Payload() data: Msg<typeof docs.documentsListTypes>) {
    return this.documents.listTypes(data);
  }

  @MessagePattern(pattern(docs.documentsCreateType))
  createType(@Payload() data: Msg<typeof docs.documentsCreateType>) {
    return this.documents.createType(data);
  }

  @MessagePattern(pattern(docs.documentsUpdateType))
  updateType(@Payload() data: Msg<typeof docs.documentsUpdateType>) {
    return this.documents.updateType(data);
  }

  @MessagePattern(pattern(docs.documentsDeactivateType))
  deactivateType(@Payload() data: Msg<typeof docs.documentsDeactivateType>) {
    return this.documents.deactivateType(data);
  }

  // ── Issuing ──────────────────────────────────────────────────────────────
  @MessagePattern(pattern(docs.documentsPresignUpload))
  presignUpload(@Payload() data: Msg<typeof docs.documentsPresignUpload>) {
    return this.documents.presignUpload(data);
  }

  @MessagePattern(pattern(docs.documentsConfirmUpload))
  confirmUpload(@Payload() data: Msg<typeof docs.documentsConfirmUpload>) {
    return this.documents.confirmUpload(data);
  }

  @MessagePattern(pattern(docs.documentsRevoke))
  revoke(@Payload() data: Msg<typeof docs.documentsRevoke>) {
    return this.documents.revoke(data);
  }

  @MessagePattern(pattern(docs.documentsSetVisibility))
  setVisibility(@Payload() data: Msg<typeof docs.documentsSetVisibility>) {
    return this.documents.setVisibility(data);
  }

  @MessagePattern(pattern(docs.documentsDelete))
  deleteDocuments(@Payload() data: Msg<typeof docs.documentsDelete>) {
    return this.documents.deleteDocuments(data);
  }

  // ── Credentials ──────────────────────────────────────────────────────────
  @MessagePattern(pattern(docs.documentsCompliance))
  compliance(@Payload() data: Msg<typeof docs.documentsCompliance>) { return this.complianceBoard.listCompliance(data); }

  // ── Templates ────────────────────────────────────────────────────────────
  @MessagePattern(pattern(docs.documentsListTemplates))
  listTemplates(@Payload() data: Msg<typeof docs.documentsListTemplates>) { return this.documents.listTemplates(data); }

  @MessagePattern(pattern(docs.documentsCreateTemplate))
  createTemplate(@Payload() data: Msg<typeof docs.documentsCreateTemplate>) { return this.documents.createTemplate(data); }

  @MessagePattern(pattern(docs.documentsUpdateTemplate))
  updateTemplate(@Payload() data: Msg<typeof docs.documentsUpdateTemplate>) { return this.documents.updateTemplate(data); }

  @MessagePattern(pattern(docs.documentsDeactivateTemplate))
  deactivateTemplate(@Payload() data: Msg<typeof docs.documentsDeactivateTemplate>) { return this.documents.deactivateTemplate(data); }

  @MessagePattern(pattern(docs.documentsListRequirements))
  listRequirements(@Payload() data: Msg<typeof docs.documentsListRequirements>) { return this.documents.listRequirements(data); }

  @MessagePattern(pattern(docs.documentsPendingForMember))
  pendingForMember(@Payload() data: Msg<typeof docs.documentsPendingForMember>) { return this.documents.pendingForMember(data); }

  // ── Reviewing what members supplied ──────────────────────────────────────
  @MessagePattern(pattern(docs.documentsAwaitingVerification))
  listAwaitingVerification(@Payload() data: Msg<typeof docs.documentsAwaitingVerification>) {
    return this.documents.listAwaitingVerification(data);
  }

  @MessagePattern(pattern(docs.documentsVerify))
  verifyDocument(@Payload() data: Msg<typeof docs.documentsVerify>) { return this.documents.verifyDocument(data); }

  @MessagePattern(pattern(docs.documentsReject))
  rejectDocument(@Payload() data: Msg<typeof docs.documentsReject>) { return this.documents.rejectDocument(data); }

  // ── What the member supplies ─────────────────────────────────────────────
  @MessagePattern(pattern(docs.documentsPresignOwnUpload))
  presignOwnUpload(@Payload() data: Msg<typeof docs.documentsPresignOwnUpload>) { return this.documents.presignOwnUpload(data); }

  @MessagePattern(pattern(docs.documentsReadOwnUpload))
  readOwnUpload(@Payload() data: Msg<typeof docs.documentsReadOwnUpload>) {
    return this.ownUploadReader.readOwnUpload(data);
  }

  @MessagePattern(pattern(docs.documentsSubmitOwn))
  submitOwnDocument(@Payload() data: Msg<typeof docs.documentsSubmitOwn>) { return this.documents.submitOwnDocument(data); }

  @MessagePattern(pattern(docs.documentsPreviewTemplate))
  previewTemplate(@Payload() data: Msg<typeof docs.documentsPreviewTemplate>) { return this.documents.previewTemplate(data); }

  @MessagePattern(pattern(docs.documentsIssueFromTemplate))
  issueFromTemplate(@Payload() data: Msg<typeof docs.documentsIssueFromTemplate>) { return this.documents.issueFromTemplate(data); }

  // ── Signing ──────────────────────────────────────────────────────────────
  @MessagePattern(pattern(docs.documentsConsent))
  consent(@Payload() data: Msg<typeof docs.documentsConsent>) { return this.documents.recordConsent(data); }

  @MessagePattern(pattern(docs.documentsSign))
  sign(@Payload() data: Msg<typeof docs.documentsSign>) { return this.documents.signDocument(data); }

  @MessagePattern(pattern(docs.documentsAcknowledge))
  acknowledge(@Payload() data: Msg<typeof docs.documentsAcknowledge>) { return this.documents.acknowledgeDocument(data); }

  // ── Payroll day ──────────────────────────────────────────────────────────
  @MessagePattern(pattern(docs.documentsMatchCandidates))
  matchCandidates(@Payload() data: Msg<typeof docs.documentsMatchCandidates>) {
    return this.documents.listMatchCandidates(data);
  }

  @MessagePattern(pattern(docs.documentsListDrafts))
  listDrafts(@Payload() data: Msg<typeof docs.documentsListDrafts>) {
    return this.documents.listDrafts(data);
  }

  @MessagePattern(pattern(docs.documentsPublishBatch))
  publishBatch(@Payload() data: Msg<typeof docs.documentsPublishBatch>) {
    return this.documents.publishBatch(data);
  }

  @MessagePattern(pattern(docs.documentsDiscardDraft))
  discardDraft(@Payload() data: Msg<typeof docs.documentsDiscardDraft>) {
    return this.documents.discardDraft(data);
  }

  // ── Reading ──────────────────────────────────────────────────────────────
  @MessagePattern(pattern(docs.documentsListForMember))
  listForMember(@Payload() data: Msg<typeof docs.documentsListForMember>) {
    return this.documents.listForMember(data);
  }

  @MessagePattern(pattern(docs.documentsDownloadUrl))
  downloadUrl(@Payload() data: Msg<typeof docs.documentsDownloadUrl>) {
    return this.documents.getDownloadUrl(data);
  }

  @MessagePattern(pattern(docs.documentsListEvents))
  listEvents(@Payload() data: Msg<typeof docs.documentsListEvents>) {
    return this.documents.listEvents(data);
  }

  @MessagePattern(pattern(docs.documentsExport))
  export(@Payload() data: Msg<typeof docs.documentsExport>) { return this.documents.exportForMember(data); }

  @MessagePattern(pattern(docs.documentsDeleteOwn))
  deleteOwn(@Payload() data: Msg<typeof docs.documentsDeleteOwn>) {
    return this.documents.deleteOwnSupplied(data);
  }

  // ── The client, signing by emailed link ──────────────────────────────────
  //
  // Every one of these resolves the token FIRST and derives the organisation
  // and the client from it. Nothing here accepts an id from the caller, so a
  // crafted payload has nothing to aim at.

  @MessagePattern(pattern(docs.documentsLinkOpen))
  async linkOpen(@Payload() data: Msg<typeof docs.documentsLinkOpen>) {
    const resolved = await this.links.resolve(data?.token ?? '');
    if (!resolved.ok) return { ok: false as const, refusal: resolved.refusal };

    await this.links.markOpened(resolved.link.id);
    const lists = await this.documents.listForCustomer({
      organizationId: resolved.link.organizationId,
      email: resolved.link.email,
    });
    return {
      ok: true as const,
      organizationName: resolved.organizationName,
      customerName: resolved.counterpartyName,
      expiresAt: resolved.link.expiresAt,
      ...lists,
    };
  }

  @MessagePattern(pattern(docs.documentsLinkFile))
  async linkFile(@Payload() data: Msg<typeof docs.documentsLinkFile>) {
    const resolved = await this.links.resolve(data?.token ?? '');
    if (!resolved.ok) return { ok: false as const, refusal: resolved.refusal };
    const { url } = await this.documents.openForCustomer({
      organizationId: resolved.link.organizationId,
      email: resolved.link.email,
      signerId: data.signerId,
    });
    return { ok: true as const, url };
  }

  @MessagePattern(pattern(docs.documentsLinkSign))
  async linkSign(@Payload() data: Msg<typeof docs.documentsLinkSign>) {
    const resolved = await this.links.resolve(data?.token ?? '');
    if (!resolved.ok) return { ok: false as const, refusal: resolved.refusal };
    const result = await this.documents.signBatchAsCustomer({
      organizationId: resolved.link.organizationId,
      email: resolved.link.email,
      signerIds: data.signerIds ?? [],
      signatureImage: data.signatureImage,
      typedName: data.name,
      typedRole: data.role ?? null,
      idempotencyKey: data.idempotencyKey,
      ctx: data.ctx,
    });
    return { ok: true as const, ...result };
  }

  /**
   * "Send me a new link."
   *
   * Always answers the same, whatever it finds. The response cannot vary with
   * whether the address is known, or this page becomes a way to discover which
   * companies a supplier works with — so the branch that sends and the branch
   * that does nothing return identical shapes.
   */
  @MessagePattern(pattern(docs.documentsLinkReissue))
  async linkReissue(@Payload() data: Msg<typeof docs.documentsLinkReissue>) {
    try {
      const outcome = await this.links.requestReissue(data?.email ?? '');
      if (outcome.send) {
        const sent = await this.mailer.sendReissue({
          to: outcome.to,
          token: outcome.token,
          expiresAt: outcome.expiresAt,
          organizationName: outcome.organizationName,
          organizationId: outcome.organizationId,
          customerId: outcome.customerId,
        });
        if (sent) await this.links.markSent(outcome.linkId);
      }
    } catch {
      // Swallowed on purpose: an error here would be a difference the caller
      // could measure, and differences are what enumeration is made of.
    }
    return { ok: true as const };
  }
}
