import type { ChatAttachment } from '@hbcfield/shared/client';
import { chatApi } from '@/lib/api';
import { uploadToPresignedUrl } from '@/lib/api/attachments';
import { downscaleImage } from '@/lib/downscale-image';
import type { PickedImage } from '@/hooks/use-image-picker';

/** A camera photo is ~5 MB; at this size it is ~300 KB and still sharp on any screen. */
const MAX_EDGE = 1600;

/**
 * Photos into a conversation: shrink on the phone, ask for an upload link,
 * PUT straight to storage. The send then names the keys — the server checks
 * they are this conversation's and really there.
 *
 * ⚠️ A FAILED PHOTO IS SKIPPED, NEVER THE MESSAGE (the same rule as shift
 * issues): the words still go.
 */
export async function uploadChatPhotos(conversationId: string, photos: PickedImage[]): Promise<ChatAttachment[]> {
  const out: ChatAttachment[] = [];
  for (const p of photos) {
    try {
      const small = await downscaleImage(p.uri, { maxEdge: MAX_EDGE, quality: 0.8 }).catch(() => null);
      const uri = small?.uri ?? p.uri;
      const mimeType = small ? 'image/jpeg' : p.mimeType;
      const fileName = small ? p.fileName.replace(/\.[^.]+$/, '') + '.jpg' : p.fileName;
      const pre = await chatApi.presign(conversationId, fileName, mimeType);
      await uploadToPresignedUrl(pre.uploadUrl, uri, mimeType);
      out.push({
        fileKey: pre.fileKey,
        fileName,
        mimeType,
        fileSize: p.fileSize,
        width: small?.width ?? p.width,
        height: small?.height ?? p.height,
      });
    } catch {
      /* skip this photo, keep the message */
    }
  }
  return out;
}
