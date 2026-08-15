import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { success } from '@hbcfield/shared';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
const ALLOWED_DOCUMENT_TYPES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
const ALLOWED_FILE_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOCUMENT_TYPES];
const BODY_MAX = 5000;
const BATCH_MAX = 200;
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
  'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf', 'text/plain': 'txt',
  'application/msword': 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

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
  private readonly s3Client: S3Client;
  private readonly s3Bucket: string;
  private readonly s3Endpoint: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.s3Endpoint = this.configService.get<string>('S3_ENDPOINT', 'https://hel1.your-objectstorage.com');
    this.s3Bucket = this.configService.get<string>('S3_BUCKET', 'hbcfield');
    this.s3Client = new S3Client({
      endpoint: this.s3Endpoint,
      region: this.configService.get<string>('S3_REGION', 'eu-central'),
      credentials: {
        accessKeyId: this.configService.get<string>('S3_ACCESS_KEY', ''),
        secretAccessKey: this.configService.get<string>('S3_SECRET_KEY', ''),
      },
      forcePathStyle: true,
    });
  }

  // ── Ownership ──────────────────────────────────────────────────────────────

  /** Load a session (org-scoped) and assert the caller may act on it. */
  private async session(timeEntryId: string, organizationId: string, callerUserId: string, canManage: boolean): Promise<Session> {
    const te = await this.prisma.timeEntry.findFirst({
      where: { id: timeEntryId, organizationId },
      select: { id: true, userId: true, organizationId: true, clockInAt: true },
    });
    if (!te) throw new NotFoundException('Attendance session not found');
    if (te.userId !== callerUserId && !canManage) throw new ForbiddenException('Not your session');
    return te;
  }

  private async sessionForNote(noteId: string, organizationId: string, callerUserId: string, canManage: boolean) {
    const note = await this.prisma.timeEntryNote.findFirst({
      where: { id: noteId, organizationId },
      select: { id: true, timeEntryId: true },
    });
    if (!note) throw new NotFoundException('Note not found');
    const te = await this.session(note.timeEntryId, organizationId, callerUserId, canManage);
    return { note, te };
  }

  // ── The object key: {orgId}/attendance/{YYYY}/{MM}/{DD}/{userId}/{timeEntryId}/{uuid}.{ext}
  private objectKey(te: Session, mime: string): { key: string; url: string } {
    const d = te.clockInAt ?? new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const ext = EXT_BY_MIME[mime] ?? 'bin';
    const key = `${te.organizationId}/attendance/${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())}/${te.userId}/${te.id}/${randomUUID()}.${ext}`;
    return { key, url: `${this.s3Endpoint}/${this.s3Bucket}/${key}` };
  }

  /** Every attachment for this session lives under this prefix (confirm guard). */
  private sessionPrefix(te: Session): string {
    const d = te.clockInAt ?? new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${this.s3Endpoint}/${this.s3Bucket}/${te.organizationId}/attendance/${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())}/${te.userId}/${te.id}/`;
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

  async addNote(data: { organizationId: string; timeEntryId: string; callerUserId: string; canManage?: boolean; body: string; at?: string; taskId?: string }) {
    const te = await this.session(data.timeEntryId, data.organizationId, data.callerUserId, !!data.canManage);
    const note = await this.prisma.timeEntryNote.create({
      data: {
        timeEntryId: te.id,
        userId: te.userId,
        organizationId: data.organizationId,
        body: this.cleanBody(data.body),
        at: this.parseAt(data.at),
        taskId: await this.keepOrgTaskId(data.taskId, data.organizationId),
      },
    });
    return success(note);
  }

  /** Offline flush: many notes in one round-trip. Session validated once. */
  async addNotesBatch(data: { organizationId: string; timeEntryId: string; callerUserId: string; canManage?: boolean; notes: Array<{ body: string; at?: string; taskId?: string }> }) {
    const te = await this.session(data.timeEntryId, data.organizationId, data.callerUserId, !!data.canManage);
    const items = Array.isArray(data.notes) ? data.notes.slice(0, BATCH_MAX) : [];
    const rows = [];
    for (const n of items) {
      const body = (typeof n?.body === 'string' ? n.body.trim() : '').slice(0, BODY_MAX);
      if (!body) continue; // skip empties, never throw the whole flush away
      rows.push({
        timeEntryId: te.id,
        userId: te.userId,
        organizationId: data.organizationId,
        body,
        at: this.parseAt(n.at),
        taskId: await this.keepOrgTaskId(n.taskId, data.organizationId),
      });
    }
    if (rows.length) await this.prisma.timeEntryNote.createMany({ data: rows });
    return success({ inserted: rows.length });
  }

  async listNotes(data: { organizationId: string; timeEntryId: string; callerUserId: string; canManage?: boolean }) {
    await this.session(data.timeEntryId, data.organizationId, data.callerUserId, !!data.canManage);
    const notes = await this.prisma.timeEntryNote.findMany({
      where: { timeEntryId: data.timeEntryId, organizationId: data.organizationId },
      orderBy: { at: 'asc' },
      include: { attachments: true },
      take: 1000,
    });
    // Short-lived signed GET URLs so a private bucket stays private.
    const withUrls = await Promise.all(
      notes.map(async (n) => ({
        ...n,
        attachments: await Promise.all(
          n.attachments.map(async (a) => ({ ...a, url: await this.signedGet(a.fileKey) })),
        ),
      })),
    );
    return success(withUrls);
  }

  async deleteNote(data: { organizationId: string; noteId: string; callerUserId: string; canManage?: boolean }) {
    const { note } = await this.sessionForNote(data.noteId, data.organizationId, data.callerUserId, !!data.canManage);
    const atts = await this.prisma.timeEntryNoteAttachment.findMany({ where: { noteId: note.id }, select: { fileKey: true } });
    await this.prisma.timeEntryNote.delete({ where: { id: note.id } }); // cascades attachment rows
    for (const a of atts) void this.deleteObject(a.fileKey);
    return success({ success: true });
  }

  // ── Attachments (S3) ────────────────────────────────────────────────────────

  async presignAttachment(data: { organizationId: string; noteId: string; callerUserId: string; canManage?: boolean; fileName: string; mimeType: string }) {
    const { te } = await this.sessionForNote(data.noteId, data.organizationId, data.callerUserId, !!data.canManage);
    if (!data.mimeType || !/^[a-z]+\/[a-z0-9\-.+]+$/i.test(data.mimeType) || !ALLOWED_FILE_TYPES.includes(data.mimeType)) {
      throw new BadRequestException('File type not allowed');
    }
    if (!data.fileName || data.fileName.length > 255) throw new BadRequestException('Invalid file name');

    const { key, url } = this.objectKey(te, data.mimeType);
    const command = new PutObjectCommand({ Bucket: this.s3Bucket, Key: key, ContentType: data.mimeType });
    const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
    return success({ uploadUrl, fileKey: key, fileUrl: url, expiresIn: 3600, maxFileSize: MAX_FILE_SIZE });
  }

  async confirmAttachment(data: {
    organizationId: string; noteId: string; callerUserId: string; canManage?: boolean;
    fileKey?: string; fileUrl: string; fileName: string; fileSize: number; mimeType: string; width?: number; height?: number;
  }) {
    const { note, te } = await this.sessionForNote(data.noteId, data.organizationId, data.callerUserId, !!data.canManage);
    // The confirmed object MUST live under THIS session's prefix (anti-IDOR / cross-tenant).
    if (typeof data.fileUrl !== 'string' || !data.fileUrl.startsWith(this.sessionPrefix(te))) {
      throw new BadRequestException('Invalid file URL');
    }
    if (typeof data.fileSize !== 'number' || data.fileSize <= 0 || data.fileSize > MAX_FILE_SIZE) {
      throw new BadRequestException('Invalid file size');
    }
    if (!ALLOWED_FILE_TYPES.includes(data.mimeType)) throw new BadRequestException('File type not allowed');
    if (!data.fileName || data.fileName.length > 255) throw new BadRequestException('Invalid file name');

    const fileKey = data.fileKey && data.fileUrl.endsWith(data.fileKey) ? data.fileKey : data.fileUrl.slice(`${this.s3Endpoint}/${this.s3Bucket}/`.length);
    const att = await this.prisma.timeEntryNoteAttachment.create({
      data: {
        noteId: note.id,
        organizationId: data.organizationId,
        fileKey,
        fileUrl: data.fileUrl,
        fileName: data.fileName,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
        width: typeof data.width === 'number' ? data.width : null,
        height: typeof data.height === 'number' ? data.height : null,
      },
    });
    return success({ ...att, url: await this.signedGet(att.fileKey) });
  }

  async deleteAttachment(data: { organizationId: string; attachmentId: string; callerUserId: string; canManage?: boolean }) {
    const att = await this.prisma.timeEntryNoteAttachment.findFirst({
      where: { id: data.attachmentId, organizationId: data.organizationId },
      select: { id: true, fileKey: true, noteId: true },
    });
    if (!att) throw new NotFoundException('Attachment not found');
    await this.sessionForNote(att.noteId, data.organizationId, data.callerUserId, !!data.canManage); // access check
    await this.prisma.timeEntryNoteAttachment.delete({ where: { id: att.id } });
    void this.deleteObject(att.fileKey);
    return success({ success: true });
  }

  // ── S3 helpers ───────────────────────────────────────────────────────────────

  private async signedGet(key: string): Promise<string> {
    try {
      return await getSignedUrl(this.s3Client, new GetObjectCommand({ Bucket: this.s3Bucket, Key: key }), { expiresIn: 3600 });
    } catch {
      return `${this.s3Endpoint}/${this.s3Bucket}/${key}`;
    }
  }

  private async deleteObject(key: string): Promise<void> {
    try {
      await this.s3Client.send(new DeleteObjectCommand({ Bucket: this.s3Bucket, Key: key }));
    } catch (e) {
      this.logger.warn(`Failed to delete S3 object ${key}: ${e instanceof Error ? e.message : e}`);
    }
  }
}
