import { Injectable, Inject, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { newObjectKey, requireObjectStore, OBJECT_STORE, ObjectStore } from '@hbcfield/shared/storage';
import { createOnce } from '../../common/create-once.util';
import { Role, success, assertFoundInOrg, PrismaService } from '@hbcfield/shared';
import {
  REPORT_ALLOWED_TYPES,
  REPORT_MAX_FILE_SIZE,
  REPORT_UPLOAD_TTL_SECONDS,
  reportKeyPrefixes,
} from './reports-helpers';
import { MediaSigner } from '../../common/storage/media-signer.service';

/** A service report's photos: upload link, add, delete. */
@Injectable()
export class ReportAttachmentsService {
  private readonly logger = new Logger(ReportAttachmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORE) private readonly store: ObjectStore | null,
    private readonly media: MediaSigner,
  ) {}

  /**
   * Add an attachment to the report
   * Called after file is uploaded to S3
   */
  async addAttachment(data: {
    /** Id made on the phone — see createOnce. */
    attachmentId?: string;
    reportId: string;
    type: 'BEFORE' | 'AFTER';
    fileName: string;
    /** The key the presign returned. Sent by apps newer than 1.0.5. */
    fileKey?: string;
    /** LEGACY: the URL app 1.0.5 sends instead of the key. */
    fileUrl?: string;
    /** Absent from app 1.0.5; storage's own content type is used then. */
    fileType?: string;
    fileSize?: number;
    caption?: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    const store = requireObjectStore(this.store);
    const report = await this.prisma.serviceReport.findUnique({
      where: { id: data.reportId },
    });

    // The organization comes FIRST: checking "did you write it?" before it told
    // a stranger, with a 403, that this id is a real report.
    assertFoundInOrg(report, data.organizationId, 'Service report');

    // Technician who completed or ADMIN/DISPATCHER in the same org can add attachments
    if (report.completedById !== data.userId && data.userRole === Role.EMPLOYEE) {
      throw new ForbiddenException('You can only add attachments to reports you created');
    }

    // The confirmed object must be the presigned one for THIS report — never an
    // arbitrary key, which would put another report's (or tenant's) file into
    // this report's gallery and PDF behind a signed link. (Sec audit H5.)
    const key = typeof data.fileKey === 'string' && data.fileKey ? data.fileKey : store.keyFromUrl(data.fileUrl);
    if (
      !key ||
      key.includes('..') ||
      !reportKeyPrefixes(report.organizationId, data.reportId).some((p) => key.startsWith(p))
    ) {
      throw new BadRequestException('Invalid file');
    }
    if (!data.fileName || data.fileName.length > 255) {
      throw new BadRequestException('Invalid file name');
    }

    // Look at the object rather than believing the request: it must exist, be
    // an image, and be within the limit. An oversized one is removed.
    const object = await store.head(key);
    if (!object.exists) {
      throw new BadRequestException('The upload did not reach storage. Please try again.');
    }
    const mimeType = (data.fileType || object.contentType || '').toLowerCase();
    if (!REPORT_ALLOWED_TYPES.includes(mimeType)) {
      await store.delete(key);
      throw new BadRequestException('Report attachments must be images.');
    }
    if (object.sizeBytes <= 0 || object.sizeBytes > REPORT_MAX_FILE_SIZE) {
      await store.delete(key);
      throw new BadRequestException('File is empty or larger than 20 MB');
    }

    const { row: attachment } = await createOnce({
      id: data.attachmentId,
      find: (id) => this.prisma.reportAttachment.findUnique({ where: { id } }),
      isSame: (a) => a.reportId === data.reportId,
      create: () =>
        this.prisma.reportAttachment.create({
          data: {
            ...(data.attachmentId ? { id: data.attachmentId } : {}),
            reportId: data.reportId,
            type: data.type,
            fileName: data.fileName,
            fileKey: key,
            // Written for app 1.0.5 only; nothing server-side reads it any more.
            fileUrl: store.privateUrl(key),
            mimeType,
            fileSize: object.sizeBytes,
            caption: data.caption,
          },
        }),
    });

    return success(await this.media.sign(attachment));
  }

  /**
   * Delete an attachment from the report
   */
  async deleteAttachment(data: { attachmentId: string; userId: string; userRole: string; organizationId: string }) {
    const attachment = await this.prisma.reportAttachment.findUnique({
      where: { id: data.attachmentId },
      include: {
        report: true,
      },
    });

    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    // Only the technician who completed can delete attachments
    if (attachment.report.completedById !== data.userId) {
      throw new ForbiddenException('You can only delete attachments from reports you created');
    }

    // Remove the object; continue with the row even if cleanup fails.
    const fileKey = this.media.keyOf(attachment);
    if (fileKey && this.store && !(await this.store.delete(fileKey))) {
      this.logger.warn(`Failed to delete stored object ${fileKey}`);
    }

    await this.prisma.reportAttachment.delete({
      where: { id: data.attachmentId },
    });

    return success(null, 'Attachment deleted successfully');
  }

  /**
   * Get presigned URL for uploading attachment to S3
   */
  async getPresignedUrl(data: {
    reportId: string;
    fileName: string;
    fileType: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    const report = await this.prisma.serviceReport.findUnique({
      where: { id: data.reportId },
    });

    // The organization comes FIRST: checking "did you write it?" before it told
    // a stranger, with a 403, that this id is a real report.
    assertFoundInOrg(report, data.organizationId, 'Service report');

    // Technician who completed or ADMIN/DISPATCHER in the same org can upload
    if (report.completedById !== data.userId && data.userRole === Role.EMPLOYEE) {
      throw new ForbiddenException('You can only upload attachments to reports you created');
    }

    // Validate content type BEFORE signing — a presigned PUT for text/html or
    // image/svg+xml under reports/ would be stored XSS on the bucket origin.
    // Report attachments are photos/signatures only. (Sec audit H5.)
    if (!data.fileType || !/^[a-z]+\/[a-z0-9\-.+]+$/i.test(data.fileType)) {
      throw new BadRequestException('Invalid file type format');
    }
    if (!REPORT_ALLOWED_TYPES.includes(data.fileType.toLowerCase())) {
      throw new BadRequestException('File type not allowed. Report attachments must be images.');
    }
    if (!data.fileName || data.fileName.length > 255) {
      throw new BadRequestException('Invalid file name');
    }

    const store = requireObjectStore(this.store);
    // {org}/reports/{reportId}/{uuid}.{ext} — no filename, no timestamp.
    const fileKey = newObjectKey({
      organizationId: report.organizationId,
      kind: 'reports',
      parentId: data.reportId,
      mime: data.fileType.toLowerCase(),
    });
    const upload = await store.presignUpload(fileKey, data.fileType, undefined, REPORT_UPLOAD_TTL_SECONDS);

    return success({
      uploadUrl: upload.url,
      fileKey,
      // LEGACY: app 1.0.5 echoes this back on confirm. Not a readable URL.
      fileUrl: store.privateUrl(fileKey),
      expiresIn: REPORT_UPLOAD_TTL_SECONDS,
    });
  }
}
