/**
 * What a member may upload, and how big — ONE definition.
 *
 * Task attachments, work-log files and shift-issue evidence each carried their
 * own copy of the same three lists and the same 20 MB, while the shared
 * A `MAX_FILE_SIZE_BYTES` (10 MB) was read by nothing and is gone. Three copies of a limit
 * are how one screen accepts a file another refuses.
 *
 * One deliberate difference, kept and named: shift-issue evidence takes no Word
 * files. It is a photo or a PDF of what went wrong on a shift, read by a shift
 * leader on a phone — a .doc there is a macro carrier with no reason to exist.
 */
export const UPLOAD_MAX_BYTES = 20 * 1024 * 1024; // 20 MB

export const UPLOAD_IMAGE_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
];

/** PDF and plain text — every upload surface takes these. */
export const UPLOAD_PLAIN_DOCUMENT_TYPES: readonly string[] = ['application/pdf', 'text/plain'];

/** Plus Word, for surfaces where somebody files a written document. */
export const UPLOAD_DOCUMENT_TYPES: readonly string[] = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

export interface UploadRule {
  maxBytes: number;
  imageTypes: readonly string[];
  documentTypes: readonly string[];
  /** images ∪ documents — what the presign and the confirm both accept. */
  allTypes: readonly string[];
}

const rule = (documentTypes: readonly string[]): UploadRule => ({
  maxBytes: UPLOAD_MAX_BYTES,
  imageTypes: UPLOAD_IMAGE_TYPES,
  documentTypes,
  allTypes: [...UPLOAD_IMAGE_TYPES, ...documentTypes],
});

export const UPLOAD_RULES = {
  taskAttachment: rule(UPLOAD_DOCUMENT_TYPES),
  worklog: rule(UPLOAD_DOCUMENT_TYPES),
  /** No Word files — see the note above. */
  shiftIssue: rule(UPLOAD_PLAIN_DOCUMENT_TYPES),
  /** Photos and the documents people pass around at work. */
  chat: rule(UPLOAD_DOCUMENT_TYPES),
} as const;

/** Is this MIME type allowed by this rule? */
export function uploadTypeAllowed(rule: UploadRule, mime: string | null | undefined): boolean {
  return typeof mime === 'string' && rule.allTypes.includes(mime);
}

/** Is this stored size within the rule (and not empty)? */
export function uploadSizeAllowed(rule: UploadRule, bytes: number): boolean {
  return bytes > 0 && bytes <= rule.maxBytes;
}
