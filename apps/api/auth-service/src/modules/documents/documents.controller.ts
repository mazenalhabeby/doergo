import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { DocumentsService } from './documents.service';

/**
 * Transport only. Every method forwards to the service, which is where the
 * authorization lives — so a new caller cannot reach a document by finding a
 * pattern that skipped a check.
 */
@Controller()
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  // ── Types ────────────────────────────────────────────────────────────────
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

  @MessagePattern({ cmd: 'documents_delete_own' })
  deleteOwn(@Payload() data: any) {
    return this.documents.deleteOwnSupplied(data);
  }
}
