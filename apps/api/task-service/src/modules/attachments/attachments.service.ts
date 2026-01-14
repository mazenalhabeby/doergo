import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TaskEventType, AttachmentType } from '@doergo/shared';

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('NOTIFICATION_SERVICE') private readonly notificationClient: ClientProxy,
  ) {}

  async create(data: {
    taskId: string;
    uploadedById: string;
    fileName: string;
    fileUrl: string;
    fileType: AttachmentType;
    fileSize: number;
  }) {
    const attachment = await this.prisma.attachment.create({
      data: {
        taskId: data.taskId,
        uploadedById: data.uploadedById,
        fileName: data.fileName,
        fileUrl: data.fileUrl,
        fileType: data.fileType,
        fileSize: data.fileSize,
      },
    });

    // Create task event
    await this.prisma.taskEvent.create({
      data: {
        taskId: data.taskId,
        userId: data.uploadedById,
        eventType: TaskEventType.ATTACHMENT_ADDED,
        metadata: { attachmentId: attachment.id, fileName: data.fileName },
      },
    });

    // Notify
    this.notificationClient.emit('attachment_added', { taskId: data.taskId, attachment });

    return { success: true, data: attachment };
  }

  async findByTask(taskId: string) {
    const attachments = await this.prisma.attachment.findMany({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, data: attachments };
  }

  async remove(id: string) {
    const attachment = await this.prisma.attachment.delete({ where: { id } });

    await this.prisma.taskEvent.create({
      data: {
        taskId: attachment.taskId,
        userId: attachment.uploadedById,
        eventType: TaskEventType.ATTACHMENT_REMOVED,
        metadata: { fileName: attachment.fileName },
      },
    });

    return { success: true, message: 'Attachment deleted' };
  }

  async getPresignedUrl(fileName: string, fileType: string) {
    // TODO: Implement S3 presigned URL generation
    // For now, return a placeholder
    return {
      success: true,
      data: {
        uploadUrl: `https://storage.example.com/upload/${Date.now()}-${fileName}`,
        fileUrl: `https://storage.example.com/files/${Date.now()}-${fileName}`,
      },
    };
  }
}
