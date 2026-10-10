import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  OBJECT_STORE,
  ObjectStore,
  newObjectKey,
  requireObjectStore,
} from '@hbcfield/shared/storage';
import { PrismaService } from '../../common/prisma/prisma.service';
import { createOnce } from '../../common/create-once.util';
import { MediaSigner } from '../../common/storage/media-signer.service';
import { TaskEventType, AttachmentType, Role, success, UPLOAD_RULES } from '@hbcfield/shared';
import { TaskAccessService, type TaskAccessFacts } from '../../common/task-access/task-access.service';

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

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORE) private readonly store: ObjectStore | null,
    private readonly media: MediaSigner,
    @Inject('NOTIFICATION_SERVICE') private readonly notificationClient: ClientProxy,
    private readonly taskAccess: TaskAccessService,
  ) {}

  async create(data: {
    /** Id made on the phone — see createOnce. */
    attachmentId?: string;
    taskId: string;
    uploadedById: string;
    userRole?: string;
    fileName: string;
    /** The key the presign step returned. Sent by apps newer than 1.0.5. */
    fileKey?: string;
    /** LEGACY: the URL app 1.0.5 sends instead of the key. */
    fileUrl?: string;
    /** A MIME type, as the client reports it — NOT an AttachmentType. */
    fileType: string;
    fileSize: number;
    organizationId: string;
  }) {
    const store = requireObjectStore(this.store);

    // Verify task exists, then apply the SAME access check as upload/list/delete
    // (not just an org check) — an unassigned employee must not attach to a task.
    const task = await this.prisma.task.findUnique({ where: { id: data.taskId } });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    // The uploader IS the caller on this path — the payload names them
    // `uploadedById`, so the facts are assembled rather than passed straight.
    await this.taskAccess.assert(task, {
      ...(data as object),
      userId: data.uploadedById,
      userRole: data.userRole || '',
    } as TaskAccessFacts);

    const key = typeof data.fileKey === 'string' && data.fileKey ? data.fileKey : store.keyFromUrl(data.fileUrl);
    if (!key || key.includes('..') || !attachmentKeyPrefixes(data.organizationId, data.taskId).some((p) => key.startsWith(p))) {
      throw new BadRequestException('Invalid file');
    }
    if (!data.fileName || data.fileName.length > 255) {
      throw new BadRequestException('Invalid file name');
    }
    /*
      Checked HERE as well as at the presign, because they are two requests and
      only this one writes. Same list, so a file that was allowed to upload is
      never refused at the last step.
    */
    if (!ALLOWED_FILE_TYPES.includes(data.fileType)) {
      throw new BadRequestException('Unsupported file type');
    }

    /*
      ⚠️ The server looks at the object instead of believing the client.

      The size used to be whatever the confirm request claimed, and nothing
      checked the upload had happened at all — a row could point at nothing.
      The presigned PUT did not pin a length (a phone picker's size is not the
      bytes it sends), so this is also where an oversized upload is caught and
      removed.
    */
    const object = await store.head(key);
    if (!object.exists) {
      throw new BadRequestException('The upload did not reach storage. Please try again.');
    }
    if (object.sizeBytes <= 0 || object.sizeBytes > MAX_FILE_SIZE) {
      await store.delete(key);
      throw new BadRequestException('File is empty or larger than 20 MB');
    }

    const { row: attachment, created } = await createOnce({
      id: data.attachmentId,
      find: (id) => this.prisma.attachment.findUnique({ where: { id } }),
      isSame: (a) => a.taskId === data.taskId && a.uploadedById === data.uploadedById,
      create: () => this.prisma.attachment.create({
      data: {
        ...(data.attachmentId ? { id: data.attachmentId } : {}),
        taskId: data.taskId,
        uploadedById: data.uploadedById,
        fileName: data.fileName,
        fileKey: key,
        // Written for app 1.0.5 only; nothing server-side reads it any more.
        fileUrl: store.privateUrl(key),
        mimeType: data.fileType,
        fileType: attachmentTypeOf(data.fileType),
        fileSize: object.sizeBytes,
      },
      }),
    });
    if (!created) return success(await this.media.sign(attachment));

    // Create task event
    await this.prisma.taskEvent.create({
      data: {
        taskId: data.taskId,
        userId: data.uploadedById,
        eventType: TaskEventType.ATTACHMENT_ADDED,
        metadata: { attachmentId: attachment.id, fileName: data.fileName },
      },
    });

    const signed = await this.media.sign(attachment);

    // Notify
    this.notificationClient.emit('attachment_added', { taskId: data.taskId, attachment: signed });

    return success(signed);
  }

  async findByTask(data: {
    taskId: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    // Verify task access
    const task = await this.prisma.task.findUnique({ where: { id: data.taskId } });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    // A holder of the job's OPEN role may see its photos before taking it — read only (tasks/role-holder.ts).
    await this.taskAccess.assert(task, data, { roleHolderMayRead: true });

    const attachments = await this.prisma.attachment.findMany({
      where: { taskId: data.taskId },
      orderBy: { createdAt: 'desc' },
      include: {
        uploadedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    return success(await this.media.signAll(attachments));
  }

  async remove(data: {
    id: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: data.id },
      include: { task: true },
    });

    /*
      The organization FIRST, and as a 404. The uploader check used to run
      before it, so a caller from another organization was told 403 "only your
      own attachments" — confirming the id exists — and the org check after it
      was a second 403 saying the same. Another organization's attachment does
      not exist to this caller.
    */
    if (!attachment || attachment.task.organizationId !== data.organizationId) {
      throw new NotFoundException('Attachment not found');
    }

    // Only uploader or ADMIN can delete — a rule about an attachment they can see.
    if (attachment.uploadedById !== data.userId && data.userRole !== Role.ADMIN) {
      throw new ForbiddenException('You can only delete your own attachments');
    }

    // Remove the object first; a failed cleanup never blocks the delete — an
    // orphaned object costs a fraction of a cent.
    if (this.store) {
      const key = this.media.keyOf(attachment);
      if (key && !(await this.store.delete(key))) {
        this.logger.warn(`Failed to delete stored object ${key}`);
      }
    }

    await this.prisma.attachment.delete({ where: { id: data.id } });

    await this.prisma.taskEvent.create({
      data: {
        taskId: attachment.taskId,
        userId: data.userId,
        eventType: TaskEventType.ATTACHMENT_REMOVED,
        metadata: { fileName: attachment.fileName },
      },
    });

    // Adding an attachment announces itself; removing one did not, so a second
    // viewer's gallery kept showing a file that no longer exists — and clicking it
    // 404s against S3 (audit T-D1). `task_updated` is what the web client already
    // listens for; the payload is ids only.
    this.notificationClient.emit('task_updated', { task: { id: attachment.taskId } });

    return success(null, 'Attachment deleted');
  }

  async getPresignedUrl(data: {
    taskId: string;
    fileName: string;
    fileType: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    // Verify task exists and belongs to user's org
    const task = await this.prisma.task.findUnique({ where: { id: data.taskId } });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    await this.taskAccess.assert(task, data);

    // Validate file type format and allowed types
    if (!data.fileType || !/^[a-z]+\/[a-z0-9\-\.+]+$/i.test(data.fileType)) {
      throw new BadRequestException('Invalid file type format');
    }
    if (!ALLOWED_FILE_TYPES.includes(data.fileType)) {
      throw new BadRequestException(
        `File type ${data.fileType} is not allowed. Allowed types: images (JPEG, PNG, GIF, WebP, HEIC) and documents (PDF, Word, Text).`,
      );
    }

    // Validate fileName length
    if (!data.fileName || data.fileName.length > 255) {
      throw new BadRequestException('File name must be between 1 and 255 characters');
    }

    const store = requireObjectStore(this.store);
    /*
      `{org}/attachments/{taskId}/{uuid}.{ext}`.

      The key used to be `{timestamp}-{original filename}`: guessable, and
      carrying whatever the uploader called the file ("passport_mueller.jpg").
      The name is kept on the row; the key is an id. Organization first, like
      every other object, so a tenant is a prefix.
    */
    const fileKey = newObjectKey({
      organizationId: data.organizationId,
      kind: 'attachments',
      parentId: data.taskId,
      mime: data.fileType,
    });
    const upload = await store.presignUpload(fileKey, data.fileType, undefined, UPLOAD_TTL_SECONDS);

    return success({
      uploadUrl: upload.url,
      fileKey,
      // LEGACY: app 1.0.5 echoes this back on confirm. Not a readable URL.
      fileUrl: store.privateUrl(fileKey),
      expiresIn: UPLOAD_TTL_SECONDS,
      maxFileSize: MAX_FILE_SIZE,
    });
  }
}
