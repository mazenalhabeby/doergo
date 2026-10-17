import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  CHAT_MAX_ATTACHMENTS,
  UPLOAD_RULES,
  uploadSizeAllowed,
  uploadTypeAllowed,
  type ChatAttachment,
} from '@hbcfield/shared';
import { OBJECT_STORE, ObjectStore, newObjectKey, requireObjectStore } from '@hbcfield/shared/storage';
import { MediaSigner } from '../../common/storage/media-signer.service';

const UPLOAD_TTL_SECONDS = 3600;
const RULE = UPLOAD_RULES.chat;

/**
 * Files in chat — the same three steps every upload in the product takes:
 * presign (a key under this conversation), the device PUTs straight to storage,
 * and the send names the key.
 *
 * ⚠️ The KEY is what gets signed, so the key is what is checked: it must sit
 * under `{org}/chat/{conversationId}/`, be an allowed type, and EXIST in
 * storage with a size inside the rule (a HEAD per file, at most five). A key
 * from another conversation or organization is refused, never signed.
 * Reads sign every key again (MediaSigner) — no URL is ever stored.
 */
@Injectable()
export class ChatFilesService {
  constructor(
    @Inject(OBJECT_STORE) private readonly store: ObjectStore | null,
    private readonly media: MediaSigner,
  ) {}

  private prefix(conv: { id: string; organizationId: string }) {
    return `${conv.organizationId}/chat/${conv.id}/`;
  }

  /** A one-hour upload link for one file into this conversation. */
  async presign(conv: { id: string; organizationId: string }, fileName: string, mimeType: string) {
    if (!uploadTypeAllowed(RULE, mimeType)) throw new BadRequestException('This kind of file cannot be sent in chat');
    if (!fileName || fileName.length > 255) throw new BadRequestException('Invalid file name');
    const store = requireObjectStore(this.store);
    const fileKey = newObjectKey({
      organizationId: conv.organizationId,
      kind: 'chat',
      parentId: conv.id,
      mime: mimeType,
    });
    const upload = await store.presignUpload(fileKey, mimeType, undefined, UPLOAD_TTL_SECONDS);
    return {
      uploadUrl: upload.url,
      headers: upload.headers,
      fileKey,
      expiresIn: UPLOAD_TTL_SECONDS,
      maxFileSize: RULE.maxBytes,
    };
  }

  /** What a send may carry: only this conversation's files that really were uploaded. */
  async accept(conv: { id: string; organizationId: string }, attachments: unknown): Promise<ChatAttachment[]> {
    if (!Array.isArray(attachments) || attachments.length === 0) return [];
    if (attachments.length > CHAT_MAX_ATTACHMENTS)
      throw new BadRequestException(`At most ${CHAT_MAX_ATTACHMENTS} files in one message`);
    const prefix = this.prefix(conv);
    const store = requireObjectStore(this.store);
    return Promise.all(
      attachments.map(async (a: any) => {
        const key =
          typeof a?.fileKey === 'string' && a.fileKey.startsWith(prefix) && !a.fileKey.includes('..')
            ? a.fileKey
            : null;
        if (!key || !uploadTypeAllowed(RULE, a.mimeType))
          throw new BadRequestException('A file in this message is not one of its uploads');
        const head = await store.head(key);
        if (!head.exists || !uploadSizeAllowed(RULE, head.sizeBytes))
          throw new BadRequestException('A file in this message was not uploaded, is empty, or is too large');
        return {
          fileKey: key,
          fileName: String(a.fileName ?? 'file').slice(0, 255),
          mimeType: a.mimeType,
          fileSize: head.sizeBytes,
          width: Number.isFinite(a.width) ? Math.round(a.width) : null,
          height: Number.isFinite(a.height) ? Math.round(a.height) : null,
        };
      }),
    );
  }

  /** Messages as a reader sees them: every file re-checked against the conversation and signed. */
  async signMessages<M extends { attachments?: unknown }>(
    conv: { id: string; organizationId: string },
    messages: M[],
  ): Promise<M[]> {
    const prefix = this.prefix(conv);
    return Promise.all(
      messages.map(async (m) => {
        const list = Array.isArray(m.attachments) ? (m.attachments as any[]) : [];
        if (list.length === 0) return m;
        const ours = list.filter((a) => typeof a?.fileKey === 'string' && a.fileKey.startsWith(prefix));
        return { ...m, attachments: await this.media.signAll(ours) };
      }),
    );
  }
}
