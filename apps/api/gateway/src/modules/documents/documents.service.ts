import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { BaseGatewayService } from '@hbcfield/shared';

/**
 * The gateway's half of the personnel file.
 *
 * Exists so the controller does not hand-roll `firstValueFrom(client.send(...))`
 * — which is what it did first, and which silently collapsed every 400, 403 and
 * 404 from auth-service into a 500. NestJS does not serialize an HttpException's
 * status across the Redis transport; `BaseGatewayService` is where that is
 * already solved, and reaching past it means solving it again, worse.
 *
 * Reads go through `send` (retries a dropped connection). Writes go through
 * `sendOnce` (does not) — a timeout means "no answer arrived", never "nothing
 * happened", and a replayed issue-document call files the document twice.
 */
@Injectable()
export class DocumentsGatewayService extends BaseGatewayService {
  constructor(@Inject('AUTH_SERVICE') client: ClientProxy) {
    super(client, 'DocumentsGatewayService');
  }

  // ── Reads ────────────────────────────────────────────────────────────────
  listTypes(data: unknown) { return this.send({ cmd: 'documents_list_types' }, data); }
  list(data: unknown) { return this.send({ cmd: 'documents_list_for_member' }, data); }
  events(data: unknown) { return this.send({ cmd: 'documents_list_events' }, data); }
  matchCandidates(data: unknown) { return this.send({ cmd: 'documents_match_candidates' }, data); }
  listDrafts(data: unknown) { return this.send({ cmd: 'documents_list_drafts' }, data); }
  listTemplates(data: unknown) { return this.send({ cmd: 'documents_list_templates' }, data); }
  browse(data: unknown) { return this.send({ cmd: 'documents_browse' }, data); }
  listIssued(data: unknown) { return this.send({ cmd: 'documents_list_issued' }, data); }
  compliance(data: unknown) { return this.send({ cmd: 'documents_compliance' }, data); }
  awaitingVerification(data: unknown) { return this.send({ cmd: 'documents_awaiting_verification' }, data); }
  requirements(data: unknown) { return this.send({ cmd: 'documents_list_requirements' }, data); }
  pending(data: unknown) { return this.send({ cmd: 'documents_pending_for_member' }, data); }

  // ── Writes ───────────────────────────────────────────────────────────────
  createType(data: unknown) { return this.sendOnce({ cmd: 'documents_create_type' }, data); }
  updateType(data: unknown) { return this.sendOnce({ cmd: 'documents_update_type' }, data); }
  deactivateType(data: unknown) { return this.sendOnce({ cmd: 'documents_deactivate_type' }, data); }
  presignUpload(data: unknown) { return this.sendOnce({ cmd: 'documents_presign_upload' }, data); }
  presignOwnUpload(data: unknown) { return this.sendOnce({ cmd: 'documents_presign_own_upload' }, data); }
  // Reads and returns; files nothing. `send`, because a retry costs a second
  // read and nothing else — and OCR is slower than a database lookup.
  readOwnUpload(data: unknown) { return this.send({ cmd: 'documents_read_own_upload' }, data); }
  // Writes: a retry after a timeout must not re-run a decision somebody made once.
  verifyDocument(data: unknown) { return this.sendOnce({ cmd: 'documents_verify' }, data); }
  rejectDocument(data: unknown) { return this.sendOnce({ cmd: 'documents_reject' }, data); }
  // A retry would file the same photograph twice, under two rows.
  submitOwnDocument(data: unknown) { return this.sendOnce({ cmd: 'documents_submit_own' }, data); }
  confirmUpload(data: unknown) { return this.sendOnce({ cmd: 'documents_confirm_upload' }, data); }
  revoke(data: unknown) { return this.sendOnce({ cmd: 'documents_revoke' }, data); }
  deleteOwn(data: unknown) { return this.sendOnce({ cmd: 'documents_delete_own' }, data); }
  /* A write — it records a DOWNLOADED event per document — and slow enough to
     need the wider window when a file is large. */
  export(data: unknown) { return this.sendOnce({ cmd: 'documents_export' }, data, 60000); }
  publishBatch(data: unknown) { return this.sendOnce({ cmd: 'documents_publish_batch' }, data); }
  discardDraft(data: unknown) { return this.sendOnce({ cmd: 'documents_discard_draft' }, data); }
  createTemplate(data: unknown) { return this.sendOnce({ cmd: 'documents_create_template' }, data); }
  // A read in every sense that matters: it stores nothing and writes no event,
  // so a retried preview costs a second render and nothing else.
  previewTemplate(data: unknown) { return this.send({ cmd: 'documents_preview_template' }, data); }
  updateTemplate(data: unknown) { return this.sendOnce({ cmd: 'documents_update_template' }, data); }
  deactivateTemplate(data: unknown) { return this.sendOnce({ cmd: 'documents_deactivate_template' }, data); }

  /*
    Rendering a PDF and writing two objects takes longer than a status flip, so
    these get a wider window — and NEVER a retry: a replayed issue produces a
    second contract, and a replayed sign is the one thing a signature must not
    survive. `signDocument` is idempotent by key, which is the real protection;
    the absence of a retry here is the belt to that pair of braces.
  */
  issueFromTemplate(data: unknown) { return this.sendOnce({ cmd: 'documents_issue_from_template' }, data, 60000); }
  consent(data: unknown) { return this.sendOnce({ cmd: 'documents_consent' }, data); }
  sign(data: unknown) { return this.sendOnce({ cmd: 'documents_sign' }, data, 60000); }
  acknowledge(data: unknown) { return this.sendOnce({ cmd: 'documents_acknowledge' }, data); }

  /*
    Minting a download link is a POST and it WRITES — it records the open on the
    evidence trail. Retrying it would enter the same read twice and make the
    delivery record wrong, so it is a `sendOnce` despite reading a file.
  */
  downloadUrl(data: unknown) { return this.sendOnce({ cmd: 'documents_download_url' }, data); }
}
