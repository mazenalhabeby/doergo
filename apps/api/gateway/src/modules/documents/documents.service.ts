import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { BaseGatewayService } from '@hbcfield/shared';
import {
  documentsListTypes,
  documentsListForMember,
  documentsListEvents,
  documentsMatchCandidates,
  documentsListDrafts,
  documentsListTemplates,
  documentsBrowse,
  documentsChain,
  documentsLinkOpen,
  documentsLinkFile,
  documentsLinkSign,
  documentsLinkReissue,
  documentsRouteCandidates,
  documentsListIssued,
  documentsCompliance,
  documentsAwaitingVerification,
  documentsListRequirements,
  documentsPendingForMember,
  documentsSendBack,
  listAccessRoles,
  documentsCreateType,
  documentsUpdateType,
  documentsDeactivateType,
  documentsPresignUpload,
  documentsPresignOwnUpload,
  documentsReadOwnUpload,
  documentsVerify,
  documentsReject,
  documentsSubmitOwn,
  documentsConfirmUpload,
  documentsRevoke,
  documentsSetVisibility,
  documentsDelete,
  documentsDeleteOwn,
  documentsExport,
  documentsPublishBatch,
  documentsDiscardDraft,
  documentsCreateTemplate,
  documentsPreviewTemplate,
  documentsUpdateTemplate,
  documentsDeactivateTemplate,
  documentsIssueFromTemplate,
  documentsConsent,
  documentsSign,
  documentsAcknowledge,
  documentsDownloadUrl,
  type RpcRequest,
} from '@hbcfield/shared/microservices';

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
  listTypes(data: RpcRequest<typeof documentsListTypes>) {
    return this.call(documentsListTypes, data);
  }
  list(data: RpcRequest<typeof documentsListForMember>) {
    return this.call(documentsListForMember, data);
  }
  events(data: RpcRequest<typeof documentsListEvents>) {
    return this.call(documentsListEvents, data);
  }
  matchCandidates(data: RpcRequest<typeof documentsMatchCandidates>) {
    return this.call(documentsMatchCandidates, data);
  }
  listDrafts(data: RpcRequest<typeof documentsListDrafts>) {
    return this.call(documentsListDrafts, data);
  }
  listTemplates(data: RpcRequest<typeof documentsListTemplates>) {
    return this.call(documentsListTemplates, data);
  }
  browse(data: RpcRequest<typeof documentsBrowse>) {
    return this.call(documentsBrowse, data);
  }
  documentChain(data: RpcRequest<typeof documentsChain>) {
    return this.call(documentsChain, data);
  }

  // ── The client, signing by emailed link (public, token-authenticated) ─────
  linkOpen(data: RpcRequest<typeof documentsLinkOpen>) {
    return this.call(documentsLinkOpen, data);
  }
  linkFile(data: RpcRequest<typeof documentsLinkFile>) {
    return this.call(documentsLinkFile, data);
  }
  linkSign(data: RpcRequest<typeof documentsLinkSign>) {
    return this.call(documentsLinkSign, data);
  }
  linkReissue(data: RpcRequest<typeof documentsLinkReissue>) {
    return this.call(documentsLinkReissue, data);
  }
  routeCandidates(data: RpcRequest<typeof documentsRouteCandidates>) {
    return this.call(documentsRouteCandidates, data);
  }
  listIssued(data: RpcRequest<typeof documentsListIssued>) {
    return this.call(documentsListIssued, data);
  }
  compliance(data: RpcRequest<typeof documentsCompliance>) {
    return this.call(documentsCompliance, data);
  }
  awaitingVerification(data: RpcRequest<typeof documentsAwaitingVerification>) {
    return this.call(documentsAwaitingVerification, data);
  }
  requirements(data: RpcRequest<typeof documentsListRequirements>) {
    return this.call(documentsListRequirements, data);
  }
  pending(data: RpcRequest<typeof documentsPendingForMember>) {
    return this.call(documentsPendingForMember, data);
  }

  // ── Writes ───────────────────────────────────────────────────────────────
  sendBack(data: RpcRequest<typeof documentsSendBack>) {
    return this.callOnce(documentsSendBack, data);
  }
  // A read: the org's roles, for "Who can see this".
  listOrgRoles(organizationId: string) {
    return this.call(listAccessRoles, { organizationId, scope: 'org' });
  }
  createType(data: RpcRequest<typeof documentsCreateType>) {
    return this.callOnce(documentsCreateType, data);
  }
  updateType(data: RpcRequest<typeof documentsUpdateType>) {
    return this.callOnce(documentsUpdateType, data);
  }
  deactivateType(data: RpcRequest<typeof documentsDeactivateType>) {
    return this.callOnce(documentsDeactivateType, data);
  }
  presignUpload(data: RpcRequest<typeof documentsPresignUpload>) {
    return this.callOnce(documentsPresignUpload, data);
  }
  presignOwnUpload(data: RpcRequest<typeof documentsPresignOwnUpload>) {
    return this.callOnce(documentsPresignOwnUpload, data);
  }
  // Reads and returns; files nothing. `send`, because a retry costs a second
  // read and nothing else — and OCR is slower than a database lookup.
  readOwnUpload(data: RpcRequest<typeof documentsReadOwnUpload>) {
    return this.call(documentsReadOwnUpload, data);
  }
  // Writes: a retry after a timeout must not re-run a decision somebody made once.
  verifyDocument(data: RpcRequest<typeof documentsVerify>) {
    return this.callOnce(documentsVerify, data);
  }
  rejectDocument(data: RpcRequest<typeof documentsReject>) {
    return this.callOnce(documentsReject, data);
  }
  // A retry would file the same photograph twice, under two rows.
  submitOwnDocument(data: RpcRequest<typeof documentsSubmitOwn>) {
    return this.callOnce(documentsSubmitOwn, data);
  }
  confirmUpload(data: RpcRequest<typeof documentsConfirmUpload>) {
    return this.callOnce(documentsConfirmUpload, data);
  }
  revoke(data: RpcRequest<typeof documentsRevoke>) {
    return this.callOnce(documentsRevoke, data);
  }
  setVisibility(data: RpcRequest<typeof documentsSetVisibility>) {
    return this.callOnce(documentsSetVisibility, data);
  }
  deleteDocuments(data: RpcRequest<typeof documentsDelete>) {
    return this.callOnce(documentsDelete, data);
  }
  deleteOwn(data: RpcRequest<typeof documentsDeleteOwn>) {
    return this.callOnce(documentsDeleteOwn, data);
  }
  /* A write — it records a DOWNLOADED event per document — and slow enough to
     need the wider window when a file is large. */
  export(data: RpcRequest<typeof documentsExport>) {
    return this.callOnce(documentsExport, data, 60000);
  }
  publishBatch(data: RpcRequest<typeof documentsPublishBatch>) {
    return this.callOnce(documentsPublishBatch, data);
  }
  discardDraft(data: RpcRequest<typeof documentsDiscardDraft>) {
    return this.callOnce(documentsDiscardDraft, data);
  }
  createTemplate(data: RpcRequest<typeof documentsCreateTemplate>) {
    return this.callOnce(documentsCreateTemplate, data);
  }
  // A read in every sense that matters: it stores nothing and writes no event,
  // so a retried preview costs a second render and nothing else.
  previewTemplate(data: RpcRequest<typeof documentsPreviewTemplate>) {
    return this.call(documentsPreviewTemplate, data);
  }
  updateTemplate(data: RpcRequest<typeof documentsUpdateTemplate>) {
    return this.callOnce(documentsUpdateTemplate, data);
  }
  deactivateTemplate(data: RpcRequest<typeof documentsDeactivateTemplate>) {
    return this.callOnce(documentsDeactivateTemplate, data);
  }

  /*
    Rendering a PDF and writing two objects takes longer than a status flip, so
    these get a wider window — and NEVER a retry: a replayed issue produces a
    second contract, and a replayed sign is the one thing a signature must not
    survive. `signDocument` is idempotent by key, which is the real protection;
    the absence of a retry here is the belt to that pair of braces.
  */
  issueFromTemplate(data: RpcRequest<typeof documentsIssueFromTemplate>) {
    return this.callOnce(documentsIssueFromTemplate, data, 60000);
  }
  consent(data: RpcRequest<typeof documentsConsent>) {
    return this.callOnce(documentsConsent, data);
  }
  sign(data: RpcRequest<typeof documentsSign>) {
    return this.callOnce(documentsSign, data, 60000);
  }
  acknowledge(data: RpcRequest<typeof documentsAcknowledge>) {
    return this.callOnce(documentsAcknowledge, data);
  }

  /*
    Minting a download link is a POST and it WRITES — it records the open on the
    evidence trail. Retrying it would enter the same read twice and make the
    delivery record wrong, so it is a `sendOnce` despite reading a file.
  */
  downloadUrl(data: RpcRequest<typeof documentsDownloadUrl>) {
    return this.callOnce(documentsDownloadUrl, data);
  }
}
