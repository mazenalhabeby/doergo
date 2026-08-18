import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TaskEventType, AttachmentType, Role, success, canAccessTask } from '@hbcfield/shared';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
const ALLOWED_DOCUMENT_TYPES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
const ALLOWED_FILE_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOCUMENT_TYPES];

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);
  private readonly s3Client: S3Client;
  private readonly s3Bucket: string;
  private readonly s3Endpoint: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Inject('NOTIFICATION_SERVICE') private readonly notificationClient: ClientProxy,
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

  async create(data: {
    taskId: string;
    uploadedById: string;
    userRole?: string;
    fileName: string;
    fileUrl: string;
    fileType: AttachmentType;
    fileSize: number;
    organizationId: string;
  }) {
    // Verify task exists, then apply the SAME access check as upload/list/delete
    // (not just an org check) — an unassigned employee must not attach to a task.
    const task = await this.prisma.task.findUnique({ where: { id: data.taskId } });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    this.checkTaskAccess(task, data.uploadedById, data.userRole || '', data.organizationId, (data as any).canViewAllTasks);

    // The confirmed URL must be the presigned object for THIS task — never an
    // arbitrary client-supplied URL (would be stored-XSS/phishing in the gallery).
    const expectedPrefix = `${this.s3Endpoint}/${this.s3Bucket}/attachments/${data.taskId}/`;
    if (typeof data.fileUrl !== 'string' || !data.fileUrl.startsWith(expectedPrefix)) {
      throw new BadRequestException('Invalid file URL');
    }
    if (typeof data.fileSize !== 'number' || data.fileSize <= 0 || data.fileSize > MAX_FILE_SIZE) {
      throw new BadRequestException('Invalid file size');
    }
    if (!data.fileName || data.fileName.length > 255) {
      throw new BadRequestException('Invalid file name');
    }

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

    return success(attachment);
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
    this.checkTaskAccess(task, data.userId, data.userRole, data.organizationId, (data as any).canViewAllTasks);

    const attachments = await this.prisma.attachment.findMany({
      where: { taskId: data.taskId },
      orderBy: { createdAt: 'desc' },
      include: {
        uploadedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    return success(attachments);
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

    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    // Only uploader or ADMIN can delete
    if (attachment.uploadedById !== data.userId && data.userRole !== Role.ADMIN) {
      throw new ForbiddenException('You can only delete your own attachments');
    }

    // Verify org access
    if (attachment.task.organizationId !== data.organizationId) {
      throw new ForbiddenException('Attachment is not in your organization');
    }

    // Delete from S3 (graceful - log warning on failure)
    const fileUrl = attachment.fileUrl;
    const bucketPrefix = `${this.s3Endpoint}/${this.s3Bucket}/`;
    if (fileUrl.startsWith(bucketPrefix)) {
      const fileKey = fileUrl.slice(bucketPrefix.length);
      try {
        await this.s3Client.send(new DeleteObjectCommand({
          Bucket: this.s3Bucket,
          Key: fileKey,
        }));
      } catch (err) {
        this.logger.warn(`Failed to delete S3 object ${fileKey}: ${err}`);
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
    this.checkTaskAccess(task, data.userId, data.userRole, data.organizationId, (data as any).canViewAllTasks);

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

    // Sanitize filename: remove path separators and special chars
    const safeName = data.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileKey = `attachments/${data.taskId}/${Date.now()}-${safeName}`;
    const expiresIn = 3600; // 1 hour

    const command = new PutObjectCommand({
      Bucket: this.s3Bucket,
      Key: fileKey,
      ContentType: data.fileType,
    });

    const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn });

    // Build the public file URL for storing in DB after upload
    const fileUrl = `${this.s3Endpoint}/${this.s3Bucket}/${fileKey}`;

    return success({
      uploadUrl,
      fileKey,
      fileUrl,
      expiresIn,
      maxFileSize: MAX_FILE_SIZE,
    });
  }

  async getAvatarPresignedUrl(data: {
    userId: string;
    fileName: string;
    fileType: string;
  }) {
    // Validate file type format and allowed types for avatars
    if (!data.fileType || !/^[a-z]+\/[a-z0-9\-\.+]+$/i.test(data.fileType)) {
      throw new BadRequestException('Invalid file type format');
    }
    if (!ALLOWED_IMAGE_TYPES.includes(data.fileType)) {
      throw new BadRequestException(
        `File type ${data.fileType} is not allowed for avatars. Allowed: JPEG, PNG, GIF, WebP, HEIC.`,
      );
    }

    if (!data.fileName || data.fileName.length > 255) {
      throw new BadRequestException('File name must be between 1 and 255 characters');
    }

    const safeName = data.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileKey = `avatars/${data.userId}/${Date.now()}-${safeName}`;
    const expiresIn = 3600;

    const command = new PutObjectCommand({
      Bucket: this.s3Bucket,
      Key: fileKey,
      ContentType: data.fileType,
    });

    const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn });
    const fileUrl = `${this.s3Endpoint}/${this.s3Bucket}/${fileKey}`;

    return success({ uploadUrl, fileUrl, expiresIn });
  }

  async deleteAvatarFromS3(data: { fileUrl: string }) {
    const bucketPrefix = `${this.s3Endpoint}/${this.s3Bucket}/`;
    if (data.fileUrl.startsWith(bucketPrefix)) {
      const fileKey = data.fileUrl.slice(bucketPrefix.length);
      try {
        await this.s3Client.send(new DeleteObjectCommand({
          Bucket: this.s3Bucket,
          Key: fileKey,
        }));
        this.logger.log(`Deleted avatar from S3: ${fileKey}`);
      } catch (err) {
        this.logger.warn(`Failed to delete avatar S3 object ${fileKey}: ${err}`);
      }
    }
    return success(null, 'Avatar deleted from S3');
  }

  /**
   * May this caller touch this task's attachments?
   *
   * Delegates to the shared rule (@hbcfield/shared canAccessTask), which is the
   * same decision tasks.service makes. This file used to carry its own copy
   * that recognised only the LEAD assignee, so a member co-assigned to a task
   * could comment on it but was refused when attaching a photo to it.
   */
  private checkTaskAccess(
    task: any,
    userId: string,
    userRole: string,
    organizationId: string,
    canViewAllTasks?: boolean,
  ) {
    if (!canAccessTask(task, { userId, userRole, organizationId, canViewAllTasks })) {
      throw new ForbiddenException('Access denied');
    }
  }
}
