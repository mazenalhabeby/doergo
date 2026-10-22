import { shiftIssuesApi, type IssuePhoto } from '../../lib/api/shift-issues';
import { uploadToPresignedUrl } from '../../lib/api/attachments';
import type { PickedImage } from '../../hooks/useImagePicker';

/** How many photos one report or reply carries. */
export const MAX_PHOTOS = 5;

/**
 * Upload picked photos and return what a message needs to reference them.
 *
 * ⚠️ AFTER CREATE, NEVER BEFORE — the S3 key is namespaced by the issue id, so
 * there is nothing to presign against until the issue exists.
 *
 * ⚠️ A FAILED PHOTO IS SKIPPED, NEVER THE MESSAGE. Losing the sentence
 * "compressor valve seized" because one JPEG timed out is the worse failure by
 * a long way.
 */
export async function uploadPhotos(issueId: string, photos: PickedImage[]): Promise<IssuePhoto[]> {
  const out: IssuePhoto[] = [];
  for (const p of photos) {
    try {
      const pre = await shiftIssuesApi.presignAttachment(issueId, p.fileName, p.mimeType);
      await uploadToPresignedUrl(pre.uploadUrl, p.uri, p.mimeType);
      out.push({
        fileKey: pre.fileKey,
        fileUrl: pre.fileUrl,
        fileName: p.fileName,
        fileSize: p.fileSize,
        mimeType: p.mimeType,
        width: p.width,
        height: p.height,
      });
    } catch {
      /* skip a failed photo, never lose the message */
    }
  }
  return out;
}

/**
 * The four severities, as KEYS.
 *
 * ⚠️ NO LABELS HERE. These used to carry English strings, which is how a module
 * constant becomes an untranslatable one: nothing looks wrong, the text simply
 * arrives already in one language. The label is looked up where it is rendered,
 * which is the only place a translation function exists.
 *
 * ⚠️ AND NO COLOURS HERE EITHER — severity is NEUTRAL below `HIGH`. A list
 * where every row carries a coloured word has no emphasis left for the row
 * that needs it, and `MEDIUM` is the default nobody chose.
 */
export const SEVERITY_KEYS = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
