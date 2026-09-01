import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { DocumentsService } from './documents.service';
import { CredentialExpiryService } from './credential-expiry.service';
import { CustomerSignLinkService } from './customer-sign-link.service';
import { CustomerSignMailerService } from './customer-sign-mailer.service';

/**
 * Transport only. Every method forwards to the service, which is where the
 * authorization lives — so a new caller cannot reach a document by finding a
 * pattern that skipped a check.
 */
@Controller()
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly credentials: CredentialExpiryService,
    private readonly links: CustomerSignLinkService,
    private readonly mailer: CustomerSignMailerService,
  ) {}

  // ── Types ────────────────────────────────────────────────────────────────
  @MessagePattern({ cmd: 'documents_chain' })
  documentChain(@Payload() data: any) {
    return this.documents.documentChain(data);
  }

  @MessagePattern({ cmd: 'documents_route_candidates' })
  routeCandidates(@Payload() data: any) {
    return this.documents.routeCandidates(data);
  }

  @MessagePattern({ cmd: 'documents_send_back' })
  sendBack(@Payload() data: any) {
    return this.documents.sendBack(data);
  }

  @MessagePattern({ cmd: 'documents_browse' })
  browse(@Payload() data: any) {
    return this.documents.browse(data);
  }

  @MessagePattern({ cmd: 'documents_list_issued' })
  listIssued(@Payload() data: any) {
    return this.documents.listIssued(data);
  }

  @MessagePattern({ cmd: 'documents_list_types' })
  listTypes(@Payload() data: any) {
    return this.documents.listTypes(data);
  }

  @MessagePattern({ cmd: 'documents_create_type' })
  createType(@Payload() data: any) {
    return this.documents.createType(data);
  }

  @MessagePattern({ cmd: 'documents_update_type' })
  updateType(@Payload() data: any) {
    return this.documents.updateType(data);
  }

  @MessagePattern({ cmd: 'documents_deactivate_type' })
  deactivateType(@Payload() data: any) {
    return this.documents.deactivateType(data);
  }

  // ── Issuing ──────────────────────────────────────────────────────────────
  @MessagePattern({ cmd: 'documents_presign_upload' })
  presignUpload(@Payload() data: any) {
    return this.documents.presignUpload(data);
  }

  @MessagePattern({ cmd: 'documents_confirm_upload' })
  confirmUpload(@Payload() data: any) {
    return this.documents.confirmUpload(data);
  }

  @MessagePattern({ cmd: 'documents_revoke' })
  revoke(@Payload() data: any) {
    return this.documents.revoke(data);
  }

  // ── Credentials ──────────────────────────────────────────────────────────
  @MessagePattern({ cmd: 'documents_compliance' })
  compliance(@Payload() data: any) { return this.credentials.listCompliance(data); }

  // ── Templates ────────────────────────────────────────────────────────────
  @MessagePattern({ cmd: 'documents_list_templates' })
  listTemplates(@Payload() data: any) { return this.documents.listTemplates(data); }

  @MessagePattern({ cmd: 'documents_create_template' })
  createTemplate(@Payload() data: any) { return this.documents.createTemplate(data); }

  @MessagePattern({ cmd: 'documents_update_template' })
  updateTemplate(@Payload() data: any) { return this.documents.updateTemplate(data); }

  @MessagePattern({ cmd: 'documents_deactivate_template' })
  deactivateTemplate(@Payload() data: any) { return this.documents.deactivateTemplate(data); }

  @MessagePattern({ cmd: 'documents_list_requirements' })
  listRequirements(@Payload() data: any) { return this.documents.listRequirements(data); }

  @MessagePattern({ cmd: 'documents_pending_for_member' })
  pendingForMember(@Payload() data: any) { return this.documents.pendingForMember(data); }

  // ── Reviewing what members supplied ──────────────────────────────────────
  @MessagePattern({ cmd: 'documents_awaiting_verification' })
  listAwaitingVerification(@Payload() data: any) { return this.documents.listAwaitingVerification(data); }

  @MessagePattern({ cmd: 'documents_verify' })
  verifyDocument(@Payload() data: any) { return this.documents.verifyDocument(data); }

  @MessagePattern({ cmd: 'documents_reject' })
  rejectDocument(@Payload() data: any) { return this.documents.rejectDocument(data); }

  // ── What the member supplies ─────────────────────────────────────────────
  @MessagePattern({ cmd: 'documents_presign_own_upload' })
  presignOwnUpload(@Payload() data: any) { return this.documents.presignOwnUpload(data); }

  @MessagePattern({ cmd: 'documents_read_own_upload' })
  readOwnUpload(@Payload() data: any) { return this.documents.readOwnUpload(data); }

  @MessagePattern({ cmd: 'documents_submit_own' })
  submitOwnDocument(@Payload() data: any) { return this.documents.submitOwnDocument(data); }

  @MessagePattern({ cmd: 'documents_preview_template' })
  previewTemplate(@Payload() data: any) { return this.documents.previewTemplate(data); }

  @MessagePattern({ cmd: 'documents_issue_from_template' })
  issueFromTemplate(@Payload() data: any) { return this.documents.issueFromTemplate(data); }

  // ── Signing ──────────────────────────────────────────────────────────────
  @MessagePattern({ cmd: 'documents_consent' })
  consent(@Payload() data: any) { return this.documents.recordConsent(data); }

  @MessagePattern({ cmd: 'documents_sign' })
  sign(@Payload() data: any) { return this.documents.signDocument(data); }

  @MessagePattern({ cmd: 'documents_acknowledge' })
  acknowledge(@Payload() data: any) { return this.documents.acknowledgeDocument(data); }

  // ── Payroll day ──────────────────────────────────────────────────────────
  @MessagePattern({ cmd: 'documents_match_candidates' })
  matchCandidates(@Payload() data: any) {
    return this.documents.listMatchCandidates(data);
  }

  @MessagePattern({ cmd: 'documents_list_drafts' })
  listDrafts(@Payload() data: any) {
    return this.documents.listDrafts(data);
  }

  @MessagePattern({ cmd: 'documents_publish_batch' })
  publishBatch(@Payload() data: any) {
    return this.documents.publishBatch(data);
  }

  @MessagePattern({ cmd: 'documents_discard_draft' })
  discardDraft(@Payload() data: any) {
    return this.documents.discardDraft(data);
  }

  // ── Reading ──────────────────────────────────────────────────────────────
  @MessagePattern({ cmd: 'documents_list_for_member' })
  listForMember(@Payload() data: any) {
    return this.documents.listForMember(data);
  }

  @MessagePattern({ cmd: 'documents_download_url' })
  downloadUrl(@Payload() data: any) {
    return this.documents.getDownloadUrl(data);
  }

  @MessagePattern({ cmd: 'documents_list_events' })
  listEvents(@Payload() data: any) {
    return this.documents.listEvents(data);
  }

  @MessagePattern({ cmd: 'documents_export' })
  export(@Payload() data: any) { return this.documents.exportForMember(data); }

  @MessagePattern({ cmd: 'documents_delete_own' })
  deleteOwn(@Payload() data: any) {
    return this.documents.deleteOwnSupplied(data);
  }

  // ── The client, signing by emailed link ──────────────────────────────────
  //
  // Every one of these resolves the token FIRST and derives the organisation
  // and the client from it. Nothing here accepts an id from the caller, so a
  // crafted payload has nothing to aim at.

  @MessagePattern({ cmd: 'documents_link_open' })
  async linkOpen(@Payload() data: { token: string }) {
    const resolved = await this.links.resolve(data?.token ?? '');
    if (!resolved.ok) return { ok: false as const, refusal: resolved.refusal };

    await this.links.markOpened(resolved.link.id);
    const lists = await this.documents.listForCustomer({
      organizationId: resolved.link.organizationId,
      customerId: resolved.link.customerId,
    });
    return {
      ok: true as const,
      organizationName: resolved.organizationName,
      customerName: resolved.customer.name,
      expiresAt: resolved.link.expiresAt,
      ...lists,
    };
  }

  @MessagePattern({ cmd: 'documents_link_file' })
  async linkFile(@Payload() data: { token: string; signerId: string }) {
    const resolved = await this.links.resolve(data?.token ?? '');
    if (!resolved.ok) return { ok: false as const, refusal: resolved.refusal };
    const { url } = await this.documents.openForCustomer({
      organizationId: resolved.link.organizationId,
      customerId: resolved.link.customerId,
      signerId: data.signerId,
    });
    return { ok: true as const, url };
  }

  @MessagePattern({ cmd: 'documents_link_sign' })
  async linkSign(
    @Payload()
    data: {
      token: string;
      signerIds: string[];
      signatureImage: string;
      name: string;
      role?: string | null;
      idempotencyKey: string;
      ctx?: any;
    },
  ) {
    const resolved = await this.links.resolve(data?.token ?? '');
    if (!resolved.ok) return { ok: false as const, refusal: resolved.refusal };
    const result = await this.documents.signBatchAsCustomer({
      organizationId: resolved.link.organizationId,
      customerId: resolved.link.customerId,
      customerEmail: resolved.customer.email,
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
  @MessagePattern({ cmd: 'documents_link_reissue' })
  async linkReissue(@Payload() data: { email: string }) {
    try {
      const outcome = await this.links.requestReissue(data?.email ?? '');
      if (outcome.send) {
        const sent = await this.mailer.sendReissue({
          to: outcome.to,
          token: outcome.token,
          expiresAt: outcome.expiresAt,
          organizationName: outcome.organizationName,
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
