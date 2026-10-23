import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Role, success, paginated, clampListLimit, PERSON_BRIEF_SELECT, PrismaService } from '@hbcfield/shared';
import { MediaSigner } from '../../common/storage/media-signer.service';
import { TaskAccessService } from '../tasks/access/task-access.service';
import { withSignedAttachments } from './reports-helpers';

/** Reading service reports: a job's, and an asset's maintenance history. */
@Injectable()
export class ReportReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaSigner,
    private readonly taskAccess: TaskAccessService,
  ) {}

  /**
   * Get service report by task ID
   */
  async findByTaskId(data: { taskId: string; userId: string; userRole: string; organizationId: string }) {
    // Verify task exists
    const task = await this.prisma.task.findUnique({
      where: { id: data.taskId },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Authorization check — a holder of the job's OPEN role may read it too (tasks/role-holder.ts), never write.
    await this.taskAccess.assert(task, data, { roleHolderMayRead: true });

    const report = await this.prisma.serviceReport.findUnique({
      where: { taskId: data.taskId },
      include: {
        completedBy: {
          select: PERSON_BRIEF_SELECT,
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
    return success(await withSignedAttachments(this.media, report ?? null));
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
    canViewAllTasks?: boolean;
    organizationId: string;
  }) {
    // Query parameters arrive as text, and `limit || 10` honoured whatever
    // arrived — so ?limit=100000 returned the table. Clamped here, like the
    // asset lists, because nothing upstream of this does it.
    const page = Math.max(1, Math.floor(Number(data.page)) || 1);
    const limit = clampListLimit(data.limit, 10, 50);
    const skip = (page - 1) * limit;

    /*
      Found inside THIS organization or not at all.

      It used to find by id and then answer 403 "not in your organization" —
      which confirms to anybody guessing ids that the asset exists somewhere.
      The record page already treats a missing record as "Not found".
    */
    const asset = await this.prisma.asset.findFirst({
      where: { id: data.assetId, organizationId: data.organizationId },
      select: { id: true },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    /*
      Whoever may see all the work may see this.

      ⚠️ It used to refuse every EMPLOYEE — written when TECHNICIAN was a role.
      MANAGER has since been retired, so every non-admin IS an employee, and the
      check refused the office manager holding `canViewAllTasks` the very history
      the asset record page shows them. The gateway gates the route on that
      permission; this repeats it for the queue-less internal path.
    */
    if (data.userRole !== Role.ADMIN && data.canViewAllTasks !== true) {
      throw new ForbiddenException('You do not have permission to view this maintenance history');
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
    const summaries = reports.map((report) => ({
      id: report.id,
      taskId: report.taskId,
      taskTitle: report.task.title,
      summary: report.summary,
      workDuration: report.workDuration,
      completedAt: report.completedAt,
      completedBy: report.completedBy,
      // How many lines of parts, for the record page's list — the list shows
      // "3 parts", and adding up quantities would read "12 parts" for a box of
      // twelve screws.
      partsCount: report.partsUsed.length,
      partsTotal: report.partsUsed.reduce((sum, part) => sum + (part.unitCost || 0) * part.quantity, 0),
      attachmentCount: report.attachments.length,
      hasBeforePhotos: report.attachments.some((a) => a.type === 'BEFORE'),
      hasAfterPhotos: report.attachments.some((a) => a.type === 'AFTER'),
    }));

    return paginated(summaries, { page, limit, total });
  }
}
