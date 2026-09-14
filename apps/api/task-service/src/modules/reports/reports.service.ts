import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Inject,
  Logger,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { OBJECT_STORE, ObjectStore, newObjectKey, requireObjectStore } from '@hbcfield/shared/storage';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MediaSigner } from '../../common/storage/media-signer.service';
import {
  TaskStatus,
  TaskEventType,
  Role,
  success,
  paginated,
  canAccessTask,
  isTaskAssignee,
  isWithinTaskBoundary,
} from '@hbcfield/shared';
import type { TaskAccessFacts } from '../tasks/tasks.service';

// Report attachments are before/after photos + signatures only — an image
// allow-list keeps active content (html/svg) out of the report gallery + PDF.
const REPORT_ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
];
const REPORT_MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const REPORT_UPLOAD_TTL_SECONDS = 3600;

/**
 * Where a report photo may live: this organization's report prefix, or the
 * pre-organization layout for objects presigned before it existed.
 */
export function reportKeyPrefixes(organizationId: string, reportId: string): string[] {
  return [`${organizationId}/reports/${reportId}/`, `reports/${reportId}/`];
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORE) private readonly store: ObjectStore | null,
    private readonly media: MediaSigner,
    @Inject('NOTIFICATION_SERVICE') private readonly notificationClient: ClientProxy,
  ) {}

  /** A report as a client receives it — photos behind signed links. */
  private async withSignedAttachments<T extends { attachments?: any[] } | null>(report: T): Promise<T> {
    if (!report || !report.attachments) return report;
    return { ...report, attachments: await this.media.signAll(report.attachments) };
  }

  /**
   * Create a service report when completing a task
   * This is the main completion flow for TECHNICIAN
   */
  async create(data: {
    taskId: string;
    summary: string;
    workPerformed?: string;
    workDuration: number;
    technicianSignature?: string;
    customerSignature?: string;
    customerName?: string;
    partsUsed?: {
      name: string;
      partNumber?: string;
      quantity: number;
      unitCost?: number;
      notes?: string;
    }[];
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    // Verify task exists and is assigned to this technician
    const task = await this.prisma.task.findUnique({
      where: { id: data.taskId },
      include: {
        serviceReport: true,
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Only an assigned user can complete. Recognise BOTH the LEAD (legacy
    // assignedToId) and multi-assignee MEMBER rows (task_assignees) — mirrors
    // the authorization in TasksService.updateStatus. Without the second check,
    // a member assigned via the multi-assignee system is wrongly rejected.
    const isAssignedUser =
      task.assignedToId === data.userId ||
      !!(await this.prisma.taskAssignee.findFirst({
        where: { taskId: task.id, userId: data.userId },
        select: { id: true },
      }));
    if (!isAssignedUser) {
      throw new ForbiddenException('You can only complete tasks assigned to you');
    }

    // Task must be in IN_PROGRESS status to complete
    if (task.status !== TaskStatus.IN_PROGRESS) {
      throw new BadRequestException(
        `Cannot complete a task with status ${task.status}. Task must be IN_PROGRESS.`,
      );
    }

    // Check if report already exists
    if (task.serviceReport) {
      throw new BadRequestException('A service report already exists for this task');
    }

    // Create service report with parts in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Create the service report
      const report = await tx.serviceReport.create({
        data: {
          taskId: data.taskId,
          assetId: task.assetId, // Denormalized from task for faster history queries
          summary: data.summary,
          workPerformed: data.workPerformed,
          workDuration: data.workDuration,
          technicianSignature: data.technicianSignature,
          customerSignature: data.customerSignature,
          customerName: data.customerName,
          completedAt: new Date(),
          completedById: data.userId,
          organizationId: task.organizationId,
          // Create parts used if provided
          partsUsed: data.partsUsed && data.partsUsed.length > 0
            ? {
                create: data.partsUsed.map(part => ({
                  name: part.name,
                  partNumber: part.partNumber,
                  quantity: part.quantity || 1,
                  unitCost: part.unitCost,
                  notes: part.notes,
                })),
              }
            : undefined,
        },
        include: {
          completedBy: {
            select: { id: true, firstName: true, lastName: true, avatarUrl: true },
          },
          partsUsed: true,
          attachments: true,
        },
      });

      // Update task status to COMPLETED
      const updatedTask = await tx.task.update({
        where: { id: data.taskId },
        data: {
          status: TaskStatus.COMPLETED,
        },
        include: {
          assignedTo: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        },
      });

      // Create task event for status change
      await tx.taskEvent.create({
        data: {
          taskId: data.taskId,
          userId: data.userId,
          eventType: TaskEventType.STATUS_CHANGED,
          metadata: {
            oldStatus: TaskStatus.IN_PROGRESS,
            newStatus: TaskStatus.COMPLETED,
            reportId: report.id,
          },
        },
      });

      return { report, task: updatedTask };
    });

    // Notify about task completion
    this.notificationClient.emit('task_status_changed', {
      task: result.task,
      oldStatus: TaskStatus.IN_PROGRESS,
      newStatus: TaskStatus.COMPLETED,
      reportId: result.report.id,
    });

    return success(result.report, 'Task completed successfully');
  }

  /**
   * Get service report by task ID
   */
  async findByTaskId(data: {
    taskId: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    // Verify task exists
    const task = await this.prisma.task.findUnique({
      where: { id: data.taskId },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Authorization check
    await this.checkTaskAccess(task, data);

    const report = await this.prisma.serviceReport.findUnique({
      where: { taskId: data.taskId },
      include: {
        completedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        partsUsed: {
          orderBy: { createdAt: 'asc' },
        },
        attachments: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    // A task with no service report is a normal state (report only exists after
    // completion) — return null rather than throwing, so the endpoint responds
    // 200 with data:null instead of an error the clients have to special-case.
    return success(await this.withSignedAttachments(report ?? null));
  }

  /**
   * Get all service reports for an asset (maintenance history)
   */
  async findByAssetId(data: {
    assetId: string;
    page?: number;
    limit?: number;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    const page = data.page || 1;
    const limit = data.limit || 10;
    const skip = (page - 1) * limit;

    // Verify asset exists and user has access
    const asset = await this.prisma.asset.findUnique({
      where: { id: data.assetId },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    // Authorization: Only CLIENT and DISPATCHER can view asset maintenance history
    if (data.userRole === Role.EMPLOYEE) {
      throw new ForbiddenException('Technicians cannot view asset maintenance history');
    }

    if (asset.organizationId !== data.organizationId) {
      throw new ForbiddenException('Asset is not in your organization');
    }

    const [reports, total] = await Promise.all([
      this.prisma.serviceReport.findMany({
        where: { assetId: data.assetId },
        skip,
        take: limit,
        orderBy: { completedAt: 'desc' },
        include: {
          task: {
            select: { id: true, title: true, priority: true },
          },
          completedBy: {
            select: { id: true, firstName: true, lastName: true, avatarUrl: true },
          },
          partsUsed: {
            select: { id: true, name: true, quantity: true, unitCost: true },
          },
          attachments: {
            select: { id: true, type: true, fileName: true },
          },
        },
      }),
      this.prisma.serviceReport.count({ where: { assetId: data.assetId } }),
    ]);

    // Transform to summary format
    const summaries = reports.map(report => ({
      id: report.id,
      taskId: report.taskId,
      taskTitle: report.task.title,
      summary: report.summary,
      workDuration: report.workDuration,
      completedAt: report.completedAt,
      completedBy: report.completedBy,
      partsTotal: report.partsUsed.reduce(
        (sum, part) => sum + (part.unitCost || 0) * part.quantity,
        0,
      ),
      attachmentCount: report.attachments.length,
      hasBeforePhotos: report.attachments.some(a => a.type === 'BEFORE'),
      hasAfterPhotos: report.attachments.some(a => a.type === 'AFTER'),
    }));

    return paginated(summaries, { page, limit, total });
  }

  /**
   * Update a service report (add more details)
   * Only the technician who completed it can update within 24 hours
   */
  async update(data: {
    reportId: string;
    summary?: string;
    workPerformed?: string;
    technicianSignature?: string;
    customerSignature?: string;
    customerName?: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    const report = await this.prisma.serviceReport.findUnique({
      where: { id: data.reportId },
    });

    if (!report) {
      throw new NotFoundException('Service report not found');
    }

    // Only the technician who completed can update
    if (report.completedById !== data.userId) {
      throw new ForbiddenException('You can only update reports you created');
    }

    // Can only update within 24 hours of completion
    const hoursSinceCompletion = (Date.now() - report.completedAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceCompletion > 24) {
      throw new BadRequestException('Reports can only be updated within 24 hours of completion');
    }

    const updatedReport = await this.prisma.serviceReport.update({
      where: { id: data.reportId },
      data: {
        ...(data.summary && { summary: data.summary }),
        ...(data.workPerformed !== undefined && { workPerformed: data.workPerformed }),
        ...(data.technicianSignature && { technicianSignature: data.technicianSignature }),
        ...(data.customerSignature && { customerSignature: data.customerSignature }),
        ...(data.customerName && { customerName: data.customerName }),
      },
      include: {
        completedBy: {
          select: { id: true, firstName: true, lastName: true, avatarUrl: true },
        },
        partsUsed: true,
        attachments: true,
      },
    });

    return success(await this.withSignedAttachments(updatedReport));
  }

  /**
   * Add a part to the report
   */
  async addPart(data: {
    reportId: string;
    name: string;
    partNumber?: string;
    quantity: number;
    unitCost?: number;
    notes?: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    const report = await this.prisma.serviceReport.findUnique({
      where: { id: data.reportId },
    });

    if (!report) {
      throw new NotFoundException('Service report not found');
    }

    // Only the technician who completed can add parts
    if (report.completedById !== data.userId) {
      throw new ForbiddenException('You can only add parts to reports you created');
    }

    const part = await this.prisma.partUsed.create({
      data: {
        reportId: data.reportId,
        name: data.name,
        partNumber: data.partNumber,
        quantity: data.quantity || 1,
        unitCost: data.unitCost,
        notes: data.notes,
      },
    });

    return success(part);
  }

  /**
   * Update a part on the report
   */
  async updatePart(data: {
    partId: string;
    name?: string;
    partNumber?: string;
    quantity?: number;
    unitCost?: number;
    notes?: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    const part = await this.prisma.partUsed.findUnique({
      where: { id: data.partId },
      include: {
        report: true,
      },
    });

    if (!part) {
      throw new NotFoundException('Part not found');
    }

    // Only the technician who completed can update parts
    if (part.report.completedById !== data.userId) {
      throw new ForbiddenException('You can only update parts on reports you created');
    }

    const updatedPart = await this.prisma.partUsed.update({
      where: { id: data.partId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.partNumber !== undefined && { partNumber: data.partNumber }),
        ...(data.quantity !== undefined && { quantity: data.quantity }),
        ...(data.unitCost !== undefined && { unitCost: data.unitCost }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
    });

    return success(updatedPart);
  }

  /**
   * Delete a part from the report
   */
  async deletePart(data: {
    partId: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    const part = await this.prisma.partUsed.findUnique({
      where: { id: data.partId },
      include: {
        report: true,
      },
    });

    if (!part) {
      throw new NotFoundException('Part not found');
    }

    // Only the technician who completed can delete parts
    if (part.report.completedById !== data.userId) {
      throw new ForbiddenException('You can only delete parts from reports you created');
    }

    await this.prisma.partUsed.delete({
      where: { id: data.partId },
    });

    return success(null, 'Part deleted successfully');
  }

  /**
   * Add an attachment to the report
   * Called after file is uploaded to S3
   */
  async addAttachment(data: {
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

    if (!report) {
      throw new NotFoundException('Service report not found');
    }

    // Technician who completed or ADMIN/DISPATCHER in the same org can add attachments
    if (report.completedById !== data.userId && data.userRole === Role.EMPLOYEE) {
      throw new ForbiddenException('You can only add attachments to reports you created');
    }
    if (report.organizationId !== data.organizationId) {
      throw new ForbiddenException('You can only add attachments to reports in your organization');
    }

    // The confirmed object must be the presigned one for THIS report — never an
    // arbitrary key, which would put another report's (or tenant's) file into
    // this report's gallery and PDF behind a signed link. (Sec audit H5.)
    const key = typeof data.fileKey === 'string' && data.fileKey ? data.fileKey : store.keyFromUrl(data.fileUrl);
    if (!key || key.includes('..') || !reportKeyPrefixes(report.organizationId, data.reportId).some((p) => key.startsWith(p))) {
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

    const attachment = await this.prisma.reportAttachment.create({
      data: {
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
    });

    return success(await this.media.sign(attachment));
  }

  /**
   * Delete an attachment from the report
   */
  async deleteAttachment(data: {
    attachmentId: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
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

    if (!report) {
      throw new NotFoundException('Service report not found');
    }

    // Technician who completed or ADMIN/DISPATCHER in the same org can upload
    if (report.completedById !== data.userId && data.userRole === Role.EMPLOYEE) {
      throw new ForbiddenException('You can only upload attachments to reports you created');
    }
    if (report.organizationId !== data.organizationId) {
      throw new ForbiddenException('You can only upload attachments to reports in your organization');
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

  /**
   * May this caller read this task's service report?
   *
   * Delegates to the shared rule — the same decision tasks.service and
   * attachments.service make. This was a third private copy of it, and it had
   * drifted in both directions: it knew nothing about SPACE grants, so the
   * supervisor of a site could open a completed job and be refused the report
   * of the work done there; and it restricted an ADMIN to tasks they had
   * created themselves, so an owner could not read the report for a job their
   * own dispatcher raised. Neither difference was intended — they are what a
   * copy becomes.
   */
  private async checkTaskAccess(task: any, data: TaskAccessFacts) {
    const { userId, userRole, organizationId, canViewAllTasks, sharedSpaceIds, viewAllSpaceIds } = data;
    const caller = { userId, userRole, organizationId, canViewAllTasks, sharedSpaceIds, viewAllSpaceIds };

    // Recognise BOTH the LEAD (legacy assignedToId) and multi-assignee MEMBER
    // rows, so the member who completed the task can still edit its report.
    let assignee = isTaskAssignee(task, userId);
    if (assignee === null && isWithinTaskBoundary(task, caller)) {
      const membership = await this.prisma.taskAssignee.findFirst({
        where: { taskId: task.id, userId },
        select: { id: true },
      });
      assignee = !!membership;
    }

    if (!canAccessTask(task, caller, assignee ?? false)) {
      throw new ForbiddenException('Access denied');
    }
  }
}
