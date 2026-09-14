import { Inject, Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { OBJECT_STORE, ObjectStore, extensionForMime, requireObjectStore } from '@hbcfield/shared/storage';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MediaSigner } from '../../common/storage/media-signer.service';
import { success } from '@hbcfield/shared';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
const ALLOWED_DOCUMENT_TYPES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
const ALLOWED_FILE_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOCUMENT_TYPES];
const BODY_MAX = 5000;
const BATCH_MAX = 200;
const UPLOAD_TTL_SECONDS = 3600;

type Session = { id: string; userId: string; organizationId: string; clockInAt: Date };

/**
 * Session work-log: timestamped notes (optionally with S3 photos/files) added
 * during a clock-in session. All access is decided server-side from the verified
 * token — a member manages their OWN session's log; managers (canManage) may view/
 * manage any session in their org. Bytes go phone→S3 direct; the DB holds only keys.
 */
@Injectable()
export class WorklogService {
  private readonly logger = new Logger(WorklogService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORE) private readonly store: ObjectStore | null,
    private readonly media: MediaSigner,
  ) {}

  // ── Ownership ──────────────────────────────────────────────────────────────

  /**
   * Load a session (org-scoped) and assert the caller may act on it.
   *
   * `canManage` is the ORG-wide answer. A supervisor whose authority comes from
   * a space role has it false and was refused their own crew's log — the same
   * shape as the shift-issues list, which read the flat columns and counted a
   * space-granted member as nobody.
   *
   * `manageSpaceIds` carries the spaces they oversee (server-resolved, never
   * client-supplied), and a session is theirs to manage when it was clocked at
   * one of them. `undefined` means the caller was not scoped — org-wide — and
   * `[]` means granted nowhere, which must match NOTHING rather than everything.
   */
  private async session(
    timeEntryId: string,
    organizationId: string,
    callerUserId: string,
    canManage: boolean,
    manageSpaceIds?: string[],
  ): Promise<Session> {
    const te = await this.prisma.timeEntry.findFirst({
      where: { id: timeEntryId, organizationId },
      select: { id: true, userId: true, organizationId: true, clockInAt: true, locationId: true },
    });
    if (!te) throw new NotFoundException('Attendance session not found');
    const mine = te.userId === callerUserId;
    const inMySpace = !!manageSpaceIds?.includes(te.locationId);
    if (!mine && !canManage && !inMySpace) throw new ForbiddenException('Not your session');
    return te;
  }

  private async sessionForNote(noteId: string, organizationId: string, callerUserId: string, canManage: boolean, manageSpaceIds?: string[]) {
    const note = await this.prisma.timeEntryNote.findFirst({
      where: { id: noteId, organizationId },
      select: { id: true, timeEntryId: true },
    });
    if (!note) throw new NotFoundException('Note not found');
    const te = await this.session(note.timeEntryId, organizationId, callerUserId, canManage, manageSpaceIds);
    return { note, te };
  }

  // ── The object key: {orgId}/attendance/{YYYY}/{MM}/{DD}/{userId}/{timeEntryId}/{uuid}.{ext}
  private objectKey(te: Session, mime: string): string {
    return `${this.sessionPrefix(te)}${randomUUID()}.${extensionForMime(mime)}`;
  }

  /** Every attachment for this session lives under this key prefix (confirm guard). */
  private sessionPrefix(te: Session): string {
    const d = te.clockInAt ?? new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${te.organizationId}/attendance/${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())}/${te.userId}/${te.id}/`;
  }

  private cleanBody(body: unknown): string {
    const b = typeof body === 'string' ? body.trim() : '';
    if (!b) throw new BadRequestException('Note text is required');
    return b.slice(0, BODY_MAX);
  }

  private parseAt(at: unknown): Date {
    if (typeof at === 'string' || typeof at === 'number') {
      const d = new Date(at);
      // Reject garbage / far-future (>1 day ahead); fall back to now.
      if (!isNaN(d.getTime()) && d.getTime() < Date.now() + 24 * 60 * 60 * 1000) return d;
    }
    return new Date();
  }

  private async keepOrgTaskId(taskId: unknown, organizationId: string): Promise<string | null> {
    if (typeof taskId !== 'string' || !taskId) return null;
    const t = await this.prisma.task.findFirst({ where: { id: taskId, organizationId }, select: { id: true } });
    return t ? t.id : null;
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  async addNote(data: { organizationId: string; timeEntryId: string; callerUserId: string; canManage?: boolean;
    /** Spaces the caller oversees; undefined = org-wide, [] = none. */
    manageSpaceIds?: string[]; body: string; at?: string; taskId?: string }) {
    // Writable by the session owner (the member) OR a manager/responsible party (canManage).
    const te = await this.session(data.timeEntryId, data.organizationId, data.callerUserId, !!data.canManage, data.manageSpaceIds);
    const note = await this.prisma.timeEntryNote.create({
      data: {
        timeEntryId: te.id,
        userId: te.userId, // the session's member
        authorId: data.callerUserId, // who actually wrote it (member or manager)
        organizationId: data.organizationId,
        body: this.cleanBody(data.body),
        at: this.parseAt(data.at),
        taskId: await this.keepOrgTaskId(data.taskId, data.organizationId),
      },
    });
    return success(note);
  }

  /** Offline flush: many notes in one round-trip. Session validated once. */
  async addNotesBatch(data: { organizationId: string; timeEntryId: string; callerUserId: string; canManage?: boolean;
    /** Spaces the caller oversees; undefined = org-wide, [] = none. */
    manageSpaceIds?: string[]; notes: Array<{ body: string; at?: string; taskId?: string }> }) {
    const te = await this.session(data.timeEntryId, data.organizationId, data.callerUserId, !!data.canManage, data.manageSpaceIds); // owner or manager (canManage)
    const items = Array.isArray(data.notes) ? data.notes.slice(0, BATCH_MAX) : [];
    const rows = [];
    for (const n of items) {
      const body = (typeof n?.body === 'string' ? n.body.trim() : '').slice(0, BODY_MAX);
      if (!body) continue; // skip empties, never throw the whole flush away
      rows.push({
        timeEntryId: te.id,
        userId: te.userId,
        authorId: data.callerUserId,
        organizationId: data.organizationId,
        body,
        at: this.parseAt(n.at),
        taskId: await this.keepOrgTaskId(n.taskId, data.organizationId),
      });
    }
    if (rows.length) await this.prisma.timeEntryNote.createMany({ data: rows });
    return success({ inserted: rows.length });
  }

  async listNotes(data: { organizationId: string; timeEntryId: string; callerUserId: string; canManage?: boolean; manageSpaceIds?: string[] }) {
    const te = await this.session(data.timeEntryId, data.organizationId, data.callerUserId, !!data.canManage, data.manageSpaceIds);
    const notes = await this.prisma.timeEntryNote.findMany({
      where: { timeEntryId: data.timeEntryId, organizationId: data.organizationId },
      orderBy: { at: 'asc' },
      include: { attachments: true },
      take: 1000,
    });

    // Resolve author display names in one query. `authorId` is null for legacy
    // rows → fall back to the session's member (userId).
    const authorIds = Array.from(new Set(notes.map((n) => n.authorId ?? n.userId)));
    const users = authorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: authorIds }, organizationId: data.organizationId },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const nameById = new Map(users.map((u) => [u.id, `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || 'Member']));

    // Short-lived signed GET URLs so a private bucket stays private.
    const withUrls = await Promise.all(
      notes.map(async (n) => {
        const authorId = n.authorId ?? n.userId;
        return {
          ...n,
          author: { id: authorId, name: nameById.get(authorId) ?? 'Member' },
          // true when a manager/admin (not the session's member) wrote it.
          byManager: authorId !== te.userId,
          attachments: await this.media.signAll(n.attachments),
        };
      }),
    );
    return success(withUrls);
  }

  async deleteNote(data: { organizationId: string; noteId: string; callerUserId: string; canManage?: boolean; manageSpaceIds?: string[] }) {
    const { note } = await this.sessionForNote(data.noteId, data.organizationId, data.callerUserId, !!data.canManage, data.manageSpaceIds); // owner or manager (canManage)
    const atts = await this.prisma.timeEntryNoteAttachment.findMany({ where: { noteId: note.id }, select: { fileKey: true } });
    await this.prisma.timeEntryNote.delete({ where: { id: note.id } }); // cascades attachment rows
    for (const a of atts) void this.deleteObject(a.fileKey);
    return success({ success: true });
  }

  // ── Attachments (S3) ────────────────────────────────────────────────────────

  async presignAttachment(data: { organizationId: string; noteId: string; callerUserId: string; canManage?: boolean;
    /** Spaces the caller oversees; undefined = org-wide, [] = none. */
    manageSpaceIds?: string[]; fileName: string; mimeType: string }) {
    const { te } = await this.sessionForNote(data.noteId, data.organizationId, data.callerUserId, !!data.canManage, data.manageSpaceIds); // owner or manager (canManage)
    if (!data.mimeType || !/^[a-z]+\/[a-z0-9\-.+]+$/i.test(data.mimeType) || !ALLOWED_FILE_TYPES.includes(data.mimeType)) {
      throw new BadRequestException('File type not allowed');
    }
    if (!data.fileName || data.fileName.length > 255) throw new BadRequestException('Invalid file name');

    const store = requireObjectStore(this.store);
    const key = this.objectKey(te, data.mimeType);
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
    organizationId: string; noteId: string; callerUserId: string; canManage?: boolean;
    /** Spaces the caller oversees; undefined = org-wide, [] = none. */
    manageSpaceIds?: string[];
    fileKey?: string; fileUrl?: string; fileName: string; fileSize?: number; mimeType: string; width?: number; height?: number;
  }) {
    const store = requireObjectStore(this.store);
    const { note, te } = await this.sessionForNote(data.noteId, data.organizationId, data.callerUserId, !!data.canManage, data.manageSpaceIds); // owner or manager (canManage)
    // The confirmed object MUST live under THIS session's prefix (anti-IDOR / cross-tenant).
    const fileKey = typeof data.fileKey === 'string' && data.fileKey ? data.fileKey : store.keyFromUrl(data.fileUrl);
    if (!fileKey || fileKey.includes('..') || !fileKey.startsWith(this.sessionPrefix(te))) {
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

    const att = await this.prisma.timeEntryNoteAttachment.create({
      data: {
        noteId: note.id,
        organizationId: data.organizationId,
        fileKey,
        // Written for app 1.0.5 only; nothing server-side reads it any more.
        fileUrl: store.privateUrl(fileKey),
        fileName: data.fileName,
        fileSize: object.sizeBytes,
        mimeType: data.mimeType,
        width: typeof data.width === 'number' ? data.width : null,
        height: typeof data.height === 'number' ? data.height : null,
      },
    });
    return success(await this.media.sign(att));
  }

  async deleteAttachment(data: { organizationId: string; attachmentId: string; callerUserId: string; canManage?: boolean; manageSpaceIds?: string[] }) {
    const att = await this.prisma.timeEntryNoteAttachment.findFirst({
      where: { id: data.attachmentId, organizationId: data.organizationId },
      select: { id: true, fileKey: true, noteId: true },
    });
    if (!att) throw new NotFoundException('Attachment not found');
    await this.sessionForNote(att.noteId, data.organizationId, data.callerUserId, !!data.canManage, data.manageSpaceIds); // owner or manager (canManage)
    await this.prisma.timeEntryNoteAttachment.delete({ where: { id: att.id } });
    void this.deleteObject(att.fileKey);
    return success({ success: true });
  }

  // ── Storage helpers ─────────────────────────────────────────────────────────

  /** Never fails the user's delete: an orphaned object costs a fraction of a cent. */
  private async deleteObject(key: string): Promise<void> {
    if (this.store && !(await this.store.delete(key))) {
      this.logger.warn(`Failed to delete stored object ${key}`);
    }
  }
}
