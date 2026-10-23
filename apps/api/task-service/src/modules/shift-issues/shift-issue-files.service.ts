import { Inject, Injectable } from '@nestjs/common';
import { OBJECT_STORE, ObjectStore } from '@hbcfield/shared/storage';
import { MediaSigner } from '../../common/storage/media-signer.service';
import { ALLOWED_FILE_TYPES, Attachment } from './shift-issues-helpers';

/** A shift issue's files: only what lives under the issue's own prefix, signed on read. */
@Injectable()
export class ShiftIssueFiles {
  constructor(
    @Inject(OBJECT_STORE) private readonly store: ObjectStore | null,
    private readonly media: MediaSigner,
  ) {}

  private issuePrefix(organizationId: string, issueId: string): string {
    return `${organizationId}/shift-issues/${issueId}/`;
  }

  /**
   * Keep only attachments whose object lives under THIS issue's prefix.
   *
   * ⚠️ The KEY is what gets signed, so the key is what is checked. This used to
   * check the prefix of `fileUrl` and then sign `fileKey` as sent — a member
   * could pair a valid-looking URL with another organization's key and be handed
   * a signed link to that organization's file. The key is now taken from the
   * key if it passes, else read out of the legacy URL, and must pass either way.
   */
  cleanAttachments(issue: { id: string; organizationId: string }, attachments: unknown): Attachment[] {
    if (!Array.isArray(attachments)) return [];
    const prefix = this.issuePrefix(issue.organizationId, issue.id);
    const within = (k: unknown): k is string => typeof k === 'string' && k.startsWith(prefix) && !k.includes('..');
    const out: Attachment[] = [];
    for (const a of attachments.slice(0, 10)) {
      if (!a) continue;
      const fromUrl = this.store?.keyFromUrl(a.fileUrl) ?? null;
      const key = within(a.fileKey) ? a.fileKey : within(fromUrl) ? fromUrl : null;
      if (!key) continue;
      out.push({
        fileKey: key,
        fileUrl: this.store ? this.store.privateUrl(key) : '',
        fileName: String(a.fileName ?? 'file').slice(0, 255),
        fileSize: Number(a.fileSize) || 0,
        mimeType: ALLOWED_FILE_TYPES.includes(String(a.mimeType)) ? String(a.mimeType) : '',
        width: typeof a.width === 'number' ? a.width : null,
        height: typeof a.height === 'number' ? a.height : null,
      });
    }
    return out;
  }

  /**
   * Signed links for a thread event's files — re-checked against the issue's
   * prefix on READ as well, so a key stored before the write check existed can
   * never be signed for someone who should not see it.
   */
  async signAttachments(issue: { id: string; organizationId: string }, attachments: unknown) {
    return this.media.signAll(this.cleanAttachments(issue, attachments));
  }
}
