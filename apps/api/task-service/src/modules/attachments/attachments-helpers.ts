import { AttachmentType, UPLOAD_RULES } from '@hbcfield/shared';

/** Upload links live an hour: a phone on a weak connection needs the time. */
const UPLOAD_TTL_SECONDS = 3600;

// What may be uploaded, and how big: ONE shared definition (constants/upload-rules.ts).
const RULE = UPLOAD_RULES.taskAttachment;

const MAX_FILE_SIZE = RULE.maxBytes;

const ALLOWED_IMAGE_TYPES = RULE.imageTypes;

const ALLOWED_DOCUMENT_TYPES = RULE.documentTypes;

const ALLOWED_FILE_TYPES = RULE.allTypes;

/**
 * The MIME type a client sends → the enum the column actually holds.
 *
 * ⚠️ These are two different things and the code treated them as one. A client
 * sends "image/jpeg"; `Attachment.fileType` is an `AttachmentType`
 * (IMAGE | DOCUMENT | OTHER). `create()` declared its parameter as
 * `AttachmentType` and passed it straight to Prisma — but the value arrives in
 * a BullMQ payload, so the annotation was a claim TypeScript had no way to
 * check. Every upload reached S3 and then died in `prisma.attachment.create()`
 * with "Invalid value for argument `fileType`", and production held ZERO
 * attachments as a result: the feature had never once worked.
 *
 * Derived from the same two lists the presign step validates against, so the
 * classification cannot drift from what is allowed through.
 */
export function attachmentTypeOf(mime: string): AttachmentType {
  if (ALLOWED_IMAGE_TYPES.includes(mime)) return AttachmentType.IMAGE;
  if (ALLOWED_DOCUMENT_TYPES.includes(mime)) return AttachmentType.DOCUMENT;
  return AttachmentType.OTHER;
}

/**
 * The key prefixes a confirmed upload may live under for this task.
 *
 * The confirm step pins the object to THIS task — never an arbitrary key, which
 * would let one tenant attach another tenant's object (or anything else in the
 * bucket) to their task and read it back through a signed link. The legacy
 * layout stays accepted for objects presigned before organization-first keys.
 */
export function attachmentKeyPrefixes(organizationId: string, taskId: string): string[] {
  return [`${organizationId}/attachments/${taskId}/`, `attachments/${taskId}/`];
}

export { UPLOAD_TTL_SECONDS, RULE, MAX_FILE_SIZE, ALLOWED_IMAGE_TYPES, ALLOWED_DOCUMENT_TYPES, ALLOWED_FILE_TYPES };
