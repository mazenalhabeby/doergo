import { Injectable, NotFoundException, BadRequestException, ConflictException, Inject, Logger } from '@nestjs/common';
import { requireObjectStore, OBJECT_STORE, ObjectStore } from '@hbcfield/shared/storage';
import { success, PrismaService } from '@hbcfield/shared';
import { createOnce } from '../../common/create-once.util';
import {
  MAX_FILE_SIZE,
  ALLOWED_FILE_TYPES,
  UPLOAD_TTL_SECONDS,
  objectKey,
  sessionPrefix,
  deleteStoredObject,
} from './worklog-helpers';
import { MediaSigner } from '../../common/storage/media-signer.service';
import { WorklogAccess } from './worklog-access.service';

/** Photos and files on a work-log note: an upload link, filing it, deleting it. */
@Injectable()
export class WorklogAttachmentsService {
  private readonly logger = new Logger(WorklogAttachmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORE) private readonly store: ObjectStore | null,
    private readonly media: MediaSigner,
    private readonly access: WorklogAccess,
  ) {}

  // ── Attachments (S3) ────────────────────────────────────────────────────────

  async presignAttachment(data: {
    organizationId: string;
    noteId: string;
    callerUserId: string;
    canManage?: boolean;
    /** Spaces the caller oversees; undefined = org-wide, [] = none. */
    manageSpaceIds?: string[];
    fileName: string;
    mimeType: string;
  }) {
    const { te } = await this.access.sessionForNote(
      data.noteId,
      data.organizationId,
      data.callerUserId,
      !!data.canManage,
      data.manageSpaceIds,
    ); // owner or manager (canManage)
    if (
      !data.mimeType ||
      !/^[a-z]+\/[a-z0-9\-.+]+$/i.test(data.mimeType) ||
      !ALLOWED_FILE_TYPES.includes(data.mimeType)
    ) {
      throw new BadRequestException('File type not allowed');
    }
    if (!data.fileName || data.fileName.length > 255) throw new BadRequestException('Invalid file name');

    const store = requireObjectStore(this.store);
    const key = objectKey(te, data.mimeType);
    const upload = await store.presignUpload(key, data.mimeType, undefined, UPLOAD_TTL_SECONDS);
    return success({
      uploadUrl: upload.url,
      fileKey: key,
      // LEGACY: app 1.0.5 echoes this back on confirm. Not a readable URL.
      fileUrl: store.privateUrl(key),
      expiresIn: UPLOAD_TTL_SECONDS,
      maxFileSize: MAX_FILE_SIZE,
    });
  }

  async confirmAttachment(data: {
    organizationId: string;
    noteId: string;
    callerUserId: string;
    canManage?: boolean;
    /** Spaces the caller oversees; undefined = org-wide, [] = none. */
    manageSpaceIds?: string[];
    fileKey?: string;
    fileUrl?: string;
    fileName: string;
    fileSize?: number;
    mimeType: string;
    width?: number;
    height?: number;
    /** Made on the phone: a confirm sent twice is still one attachment. */
    id?: string;
  }) {
    const store = requireObjectStore(this.store);
    const { note, te } = await this.access.sessionForNote(
      data.noteId,
      data.organizationId,
      data.callerUserId,
      !!data.canManage,
      data.manageSpaceIds,
    ); // owner or manager (canManage)
    if (data.id) {
      const prior = await this.prisma.timeEntryNoteAttachment.findUnique({ where: { id: data.id } });
      // Already confirmed: answered before any storage check. Somebody else's id is refused.
      if (prior) {
        if (prior.noteId !== note.id)
          throw new ConflictException({ message: 'This id is already in use', code: 'ID_IN_USE' });
        return success(await this.media.sign(prior));
      }
    }
    // The confirmed object MUST live under THIS session's prefix (anti-IDOR / cross-tenant).
    const fileKey = typeof data.fileKey === 'string' && data.fileKey ? data.fileKey : store.keyFromUrl(data.fileUrl);
    if (!fileKey || fileKey.includes('..') || !fileKey.startsWith(sessionPrefix(te))) {
      throw new BadRequestException('Invalid file');
    }
    if (!ALLOWED_FILE_TYPES.includes(data.mimeType)) throw new BadRequestException('File type not allowed');
    if (!data.fileName || data.fileName.length > 255) throw new BadRequestException('Invalid file name');

    // The size comes from storage — some pickers report 0 or nothing — and an
    // upload that never landed cannot become a row.
    const object = await store.head(fileKey);
    if (!object.exists) throw new BadRequestException('The upload did not reach storage. Please try again.');
    if (object.sizeBytes <= 0 || object.sizeBytes > MAX_FILE_SIZE) {
      await store.delete(fileKey);
      throw new BadRequestException('File is empty or larger than 20 MB');
    }

    const { row: att } = await createOnce({
      id: data.id,
      find: (id) => this.prisma.timeEntryNoteAttachment.findUnique({ where: { id } }),
      isSame: (a) => a.noteId === note.id,
      create: () =>
        this.prisma.timeEntryNoteAttachment.create({
          data: {
            ...(data.id ? { id: data.id } : {}),
            noteId: note.id,
            organizationId: data.organizationId,
            fileKey,
            // Written for app 1.0.5 only; nothing server-side reads it any more.
            fileUrl: store.privateUrl(fileKey),
            fileName: data.fileName,
            fileSize: object.sizeBytes,
            mimeType: data.mimeType,
            width: typeof data.width === 'number' ? Math.round(data.width) : null,
            height: typeof data.height === 'number' ? Math.round(data.height) : null,
          },
        }),
    });
    return success(await this.media.sign(att));
  }

  async deleteAttachment(data: {
    organizationId: string;
    attachmentId: string;
    callerUserId: string;
    canManage?: boolean;
    manageSpaceIds?: string[];
  }) {
    const att = await this.prisma.timeEntryNoteAttachment.findFirst({
      where: { id: data.attachmentId, organizationId: data.organizationId },
      select: { id: true, fileKey: true, noteId: true },
    });
    if (!att) throw new NotFoundException('Attachment not found');
    await this.access.sessionForNote(
      att.noteId,
      data.organizationId,
      data.callerUserId,
      !!data.canManage,
      data.manageSpaceIds,
    ); // owner or manager (canManage)
    await this.prisma.timeEntryNoteAttachment.delete({ where: { id: att.id } });
    void deleteStoredObject(this.store, att.fileKey, this.logger);
    return success({ success: true });
  }
}
