import type { MediaSigner, StoredFile } from '../../common/storage/media-signer.service';

// Report attachments are before/after photos + signatures only — an image
// allow-list keeps active content (html/svg) out of the report gallery + PDF.
const REPORT_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];

const REPORT_MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

const REPORT_UPLOAD_TTL_SECONDS = 3600;

/**
 * Where a report photo may live: this organization's report prefix, or the
 * pre-organization layout for objects presigned before it existed.
 */
export function reportKeyPrefixes(organizationId: string, reportId: string): string[] {
  return [`${organizationId}/reports/${reportId}/`, `reports/${reportId}/`];
}

export { REPORT_ALLOWED_TYPES, REPORT_MAX_FILE_SIZE, REPORT_UPLOAD_TTL_SECONDS };

/** A report as a client receives it — photos behind signed links. */
export async function withSignedAttachments<T extends { attachments?: StoredFile[] } | null>(
  media: MediaSigner,
  report: T,
): Promise<T> {
  if (!report || !report.attachments) return report;
  return { ...report, attachments: await media.signAll(report.attachments) };
}
