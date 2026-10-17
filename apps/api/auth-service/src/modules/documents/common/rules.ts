/** Rules about the caller, shared by every part of the personnel file: uploads, staging, review, issuing, types. */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ALLOWED_MIME, MAX_DOCUMENT_BYTES, type DocumentActor } from './actor';

// ── Rules about the caller, shared by every part of the personnel file ──────

/**
 * The two questions every upload has to answer before a byte moves.
 *
 * Shared by the administrator's path and the member's, because a limit that
 * only one of them honours is not a limit. Returns the extension so the
 * caller does not look it up a second time.
 */
export function assertUploadable(mimeType: string, sizeBytes: number): string {
  const extension = ALLOWED_MIME[mimeType];
  if (!extension) {
    throw new BadRequestException(`${mimeType} cannot be filed. Accepted: PDF, PNG, JPEG.`);
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new BadRequestException('A file size is required');
  }
  if (sizeBytes > MAX_DOCUMENT_BYTES) {
    throw new BadRequestException(
      `That file is larger than the ${Math.floor(MAX_DOCUMENT_BYTES / 1024 / 1024)} MB limit`,
    );
  }
  return extension;
}

/**
 * A member's own staging folder.
 *
 * Per-user, not per-organization. The administrator's prefix is shared by
 * everyone who can issue, which is fine because they may file to anybody;
 * a member may file only to themselves, so their confirm step must be unable
 * to name an object anybody else staged.
 */
export function ownStagingPrefix(organizationId: string, userId: string): string {
  return `${organizationId}/documents/_staging/u/${userId}/`;
}

/** Where anyone who may issue stages a file, for anybody in the organization. */
export function sharedStagingPrefix(organizationId: string): string {
  return `${organizationId}/documents/_staging/`;
}

/**
 * The staging key came back from the client, so it is untrusted input, and it
 * is the one place a caller could try to name somebody else's object.
 *
 * Called FIRST by both confirm paths, before the member and the type are
 * looked up. The ordering is the point: a caller probing keys gets the same
 * refusal either way, rather than learning from a 404 which member ids and
 * type ids exist. It also means a misconfigured store cannot turn this
 * refusal into a different error.
 */
export function assertStagingKey(stagingKey: string, prefix: string) {
  if (!stagingKey.startsWith(prefix) || stagingKey.includes('..')) {
    throw new ForbiddenException('That upload does not belong to you');
  }
}

/**
 * Nobody vouches for their own paperwork.
 *
 * ⚠️ A member who can issue documents could otherwise approve their own
 * expired licence, or file their own "certificate" straight to ISSUED and
 * past the dispatch gate. Administrators excepted — in a one-person
 * organization there is nobody else to ask.
 */
export function assertNotOwnReview(actor: DocumentActor, subjectUserId: string) {
  if (actor.isAdmin) return;
  if (subjectUserId === actor.userId) {
    throw new ForbiddenException('Somebody else has to review your own documents');
  }
}

export function assertCanIssue(actor: DocumentActor) {
  if (!actor.canIssueDocuments) {
    throw new ForbiddenException('You cannot issue documents');
  }
}

export function assertCanManageTypes(actor: DocumentActor) {
  if (!actor.canManageDocumentTemplates) {
    throw new ForbiddenException('You cannot manage document types');
  }
}

/** Who may see documents — per document or per type, one permission. */
export function assertCanManageVisibility(actor: DocumentActor) {
  if (actor.isAdmin) return;
  if (!actor.canManageDocumentVisibility || actor.isExternal) {
    throw new ForbiddenException('You cannot change who sees documents');
  }
}
