import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { OBJECT_STORE, ObjectStore, requireObjectStore } from '@hbcfield/shared/storage';
import { PrismaService } from '@hbcfield/shared';
import { createOnce } from '../../common/create-once.util';
import { MediaSigner } from '../../common/storage/media-signer.service';
import { TaskEventType, success } from '@hbcfield/shared';
import { TaskAccessService, type TaskAccessFacts } from '../../common/task-access/task-access.service';
import { MAX_FILE_SIZE, ALLOWED_FILE_TYPES, attachmentTypeOf, attachmentKeyPrefixes } from './attachments-helpers';
import { emitEvent, attachmentAddedEvent } from '@hbcfield/shared/microservices';
import { TASK_JOBS, type JobData } from '@hbcfield/shared';

export { attachmentTypeOf, attachmentKeyPrefixes } from './attachments-helpers';

@Injectable()
export class AttachmentsService {

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORE) private readonly store: ObjectStore | null,
    private readonly media: MediaSigner,
    @Inject('NOTIFICATION_SERVICE') private readonly notificationClient: ClientProxy,
    private readonly taskAccess: TaskAccessService,
  ) {}

  async create(data: JobData<typeof TASK_JOBS.addAttachment>) {
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
    if (
      !key ||
      key.includes('..') ||
      !attachmentKeyPrefixes(data.organizationId, data.taskId).some((p) => key.startsWith(p))
    ) {
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
      create: () =>
        this.prisma.attachment.create({
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
    emitEvent(this.notificationClient, attachmentAddedEvent, { taskId: data.taskId, attachment: signed });

    return success(signed);
  }

  async findByTask(data: { taskId: string; userId: string; userRole: string; organizationId: string }) {
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
}
