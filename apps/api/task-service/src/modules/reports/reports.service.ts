import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  TaskStatus,
  TaskEventType,
  Role,
  success,
  paginated,
} from '@doergo/shared';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('NOTIFICATION_SERVICE') private readonly notificationClient: ClientProxy,
  ) {}

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

    // Only assigned technician can complete
    if (task.assignedToId !== data.userId) {
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
            select: { id: true, firstName: true, lastName: true },
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
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
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
    this.checkTaskAccess(task, data.userId, data.userRole, data.organizationId);

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

    if (!report) {
      throw new NotFoundException('Service report not found for this task');
    }

    return success(report);
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
    if (data.userRole === Role.TECHNICIAN) {
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
            select: { id: true, firstName: true, lastName: true },
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
          select: { id: true, firstName: true, lastName: true },
        },
        partsUsed: true,
        attachments: true,
      },
    });

    return success(updatedReport);
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
    fileUrl: string;
    fileSize: number;
    caption?: string;
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

    // Only the technician who completed can add attachments
    if (report.completedById !== data.userId) {
      throw new ForbiddenException('You can only add attachments to reports you created');
    }

    const attachment = await this.prisma.reportAttachment.create({
      data: {
        reportId: data.reportId,
        type: data.type,
        fileName: data.fileName,
        fileUrl: data.fileUrl,
        fileSize: data.fileSize,
        caption: data.caption,
      },
    });

    return success(attachment);
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

    await this.prisma.reportAttachment.delete({
      where: { id: data.attachmentId },
    });

    // TODO: Also delete from S3

    return success(null, 'Attachment deleted successfully');
  }

  /**
   * Get presigned URL for uploading attachment to S3
   * This will be implemented when S3 is set up
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

    // Only the technician who completed can upload attachments
    if (report.completedById !== data.userId) {
      throw new ForbiddenException('You can only upload attachments to reports you created');
    }

    // TODO: Implement S3 presigned URL generation
    // For now, return a placeholder
    return success({
      uploadUrl: `https://s3.example.com/uploads/${data.reportId}/${Date.now()}-${data.fileName}`,
      fileKey: `reports/${data.reportId}/${Date.now()}-${data.fileName}`,
      expiresIn: 3600, // 1 hour
    });
  }

  /**
   * Check if user has access to a task
   */
  private checkTaskAccess(
    task: any,
    userId: string,
    userRole: string,
    organizationId: string,
  ) {
    switch (userRole) {
      case Role.CLIENT:
        // CLIENT can only access their own tasks
        if (task.createdById !== userId || task.organizationId !== organizationId) {
          throw new ForbiddenException('Access denied');
        }
        break;

      case Role.DISPATCHER:
        // DISPATCHER can access all tasks in their org
        if (task.organizationId !== organizationId) {
          throw new ForbiddenException('Access denied');
        }
        break;

      case Role.TECHNICIAN:
        // TECHNICIAN can only access tasks assigned to them
        if (task.assignedToId !== userId) {
          throw new ForbiddenException('Access denied');
        }
        break;

      default:
        throw new ForbiddenException('Access denied');
    }
  }
}
