import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { TaskStatus, TaskEventType, success, type OccurrenceEvidence } from '@hbcfield/shared';
import { judgeOccurrence } from '../../common/occurrence.util';
import { ReportsBase } from './reports.base';
import { emitEvent, taskStatusChangedEvent } from '@hbcfield/shared/microservices';

export { reportKeyPrefixes } from './reports-helpers';

@Injectable()
export class ReportsService extends ReportsBase {
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
    /** The report's id, made on the phone — a resend returns the same report. */
    id?: string;
    /** When the job was completed, for a completion recorded offline. */
    evidence?: OccurrenceEvidence;
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

    // The same completion sent again (its answer was lost): the report it made.
    if (data.id && task.serviceReport?.id === data.id) {
      return success(
        await this.prisma.serviceReport.findUniqueOrThrow({
          where: { id: data.id },
          include: {
            completedBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
            partsUsed: true,
            attachments: true,
          },
        }),
        'Task completed successfully',
      );
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
      throw new ForbiddenException({ message: 'You can only complete tasks assigned to you', code: 'TASK_REASSIGNED' });
    }

    /*
      A completion from the phone's queue meets a task that may have moved on —
      cancelled, or completed by someone else. That is a conflict the member is
      told about in words, carrying where the task is now.
    */
    const current = { id: task.id, status: task.status, assignedToId: task.assignedToId, updatedAt: task.updatedAt };
    if (task.status !== TaskStatus.IN_PROGRESS) {
      throw new ConflictException({
        message: `Cannot complete a task with status ${task.status}. Task must be IN_PROGRESS.`,
        code: 'TASK_STATE_CONFLICT',
        params: { current },
      });
    }

    if (task.serviceReport) {
      throw new ConflictException({
        message: 'A service report already exists for this task',
        code: 'REPORT_EXISTS',
        params: { current },
      });
    }

    // When the job was finished: the tap, not the moment the phone found signal.
    // Never before the task's last status change (the start it closes).
    let previousAt: Date | null = null;
    if (data.evidence) {
      const lastChange = await this.prisma.taskEvent.findFirst({
        where: { taskId: task.id, eventType: TaskEventType.STATUS_CHANGED },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, metadata: true },
      });
      const previousOccurred = (lastChange?.metadata as { occurredAt?: string } | null)?.occurredAt;
      previousAt = previousOccurred ? new Date(previousOccurred) : (lastChange?.createdAt ?? null);
    }
    const occurrence = judgeOccurrence(data.evidence, previousAt);

    // Create service report with parts in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Create the service report
      // Claimed first: a second completion racing this one (or the office
      // cancelling) must not both win.
      const claimed = await tx.task.updateMany({
        where: { id: data.taskId, status: TaskStatus.IN_PROGRESS },
        data: { status: TaskStatus.COMPLETED },
      });
      if (claimed.count === 0) {
        throw new ConflictException({
          message: 'This task was changed at the same moment',
          code: 'TASK_STATE_CONFLICT',
        });
      }

      const report = await tx.serviceReport.create({
        data: {
          ...(data.id ? { id: data.id } : {}),
          taskId: data.taskId,
          assetId: task.assetId, // Denormalized from task for faster history queries
          summary: data.summary,
          workPerformed: data.workPerformed,
          workDuration: data.workDuration,
          technicianSignature: data.technicianSignature,
          customerSignature: data.customerSignature,
          customerName: data.customerName,
          completedAt: occurrence.at,
          completedById: data.userId,
          organizationId: task.organizationId,
          // Create parts used if provided
          partsUsed:
            data.partsUsed && data.partsUsed.length > 0
              ? {
                  create: data.partsUsed.map((part) => ({
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

      const updatedTask = await tx.task.findUniqueOrThrow({
        where: { id: data.taskId },
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
            // The tap's time, which the timeline orders by and the next change is judged against.
            occurredAt: occurrence.at.toISOString(),
            ...(occurrence.flags.length ? { occurrenceFlags: occurrence.flags } : {}),
          },
        },
      });

      return { report, task: updatedTask };
    });

    // Notify about task completion
    emitEvent(this.notificationClient, taskStatusChangedEvent, {
      task: result.task,
      oldStatus: TaskStatus.IN_PROGRESS,
      newStatus: TaskStatus.COMPLETED,
      reportId: result.report.id,
      actorId: data.userId,
    });

    return success(result.report, 'Task completed successfully');
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
}
