import { Injectable, Inject, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { OBJECT_STORE, ObjectStore, newObjectKey, requireObjectStore } from '@hbcfield/shared/storage';
import { PrismaService } from '@hbcfield/shared';
import { MediaSigner } from '../../common/storage/media-signer.service';
import { TaskEventType, Role, success } from '@hbcfield/shared';
import { TaskAccessService } from '../../common/task-access/task-access.service';
import { UPLOAD_TTL_SECONDS, MAX_FILE_SIZE, ALLOWED_FILE_TYPES } from './attachments-helpers';
import { emitEvent, taskUpdatedEvent } from '@hbcfield/shared/microservices';
import { TASK_JOBS, type JobData } from '@hbcfield/shared';

/** A task attachment after it is filed: removing it (and its object), and an upload link. */
@Injectable()
export class AttachmentFilesService {
  private readonly logger = new Logger(AttachmentFilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORE) private readonly store: ObjectStore | null,
    private readonly media: MediaSigner,
    @Inject('NOTIFICATION_SERVICE') private readonly notificationClient: ClientProxy,
    private readonly taskAccess: TaskAccessService,
  ) {}

  async remove(data: JobData<typeof TASK_JOBS.deleteAttachment>) {
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
    emitEvent(this.notificationClient, taskUpdatedEvent, { task: { id: attachment.taskId } });

    return success(null, 'Attachment deleted');
  }

  async getPresignedUrl(data: JobData<typeof TASK_JOBS.getPresignedUrl>) {
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
