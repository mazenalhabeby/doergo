import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { paginated, documentVisibleTo, PERSON_BRIEF_SELECT } from '@hbcfield/shared';

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record an activity log entry
   */
  async log(data: {
    eventType: string;
    userId?: string;
    targetUserId?: string;
    resourceType?: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
    organizationId: string;
  }) {
    try {
      await this.prisma.activityLog.create({
        data: {
          eventType: data.eventType,
          userId: data.userId,
          targetUserId: data.targetUserId,
          resourceType: data.resourceType,
          resourceId: data.resourceId,
          metadata: data.metadata ? (data.metadata as Prisma.InputJsonValue) : undefined,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
          organizationId: data.organizationId,
        },
      });
    } catch (error) {
      // Never let audit logging break the main flow
      this.logger.error(`Failed to write audit log: ${error}`);
    }
  }

  /**
   * May this viewer read the per-entity trail of `resourceId`?
   *
   * The gateway lets any org-wide `canViewAllTasks` holder read a trail by id —
   * right for a task, wrong for a document: the trail of a payslip names it,
   * who opened it and when, and a document TYPE may be restricted to HR. So
   * when the id is a document, the document visibility rule decides — the one
   * rule in shared (`documentVisibleTo`: administrators, the subject unless it
   * was hidden from them, otherwise the type / the document's own override).
   *
   * Fails CLOSED for a document when the viewer is unknown. Any other resource
   * is unchanged.
   */
  private async mayReadTrailOf(organizationId: string, resourceId: string, viewerId?: string): Promise<boolean> {
    const doc = await this.prisma.document.findFirst({
      where: { id: resourceId, organizationId },
      select: {
        userId: true,
        hiddenFromMember: true,
        rolesOverridden: true,
        visibleToRoleIds: true,
        type: { select: { visibleToRoleIds: true } },
      },
    });
    if (!doc) return true;
    if (!viewerId) return false;
    const viewer = await this.prisma.user.findFirst({
      where: { id: viewerId, organizationId },
      select: { role: true, memberRoleId: true },
    });
    if (!viewer) return false;
    return documentVisibleTo(doc, {
      isAdmin: viewer.role === 'ADMIN',
      roleId: viewer.memberRoleId ?? null,
      userId: viewerId,
    });
  }

  /**
   * Query audit logs with filters and pagination
   */
  async findAll(query: {
    organizationId: string;
    eventType?: string;
    userId?: string;
    resourceType?: string;
    resourceId?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
    /**
     * Who is asking — the gateway's token user. Needed for the one resource
     * whose trail is itself confidential (a document); see `mayReadTrailOf`.
     */
    viewerId?: string;
  }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(Math.max(1, Number(query.limit) || 50), 200);
    const skip = (page - 1) * limit;

    if (query.resourceId && !(await this.mayReadTrailOf(query.organizationId, query.resourceId, query.viewerId))) {
      // The same answer as a resource with no history: an empty trail says
      // nothing about whether a payslip exists for that person.
      return paginated([], { page, limit, total: 0 });
    }

    const where: Prisma.ActivityLogWhereInput = {
      organizationId: query.organizationId,
    };

    if (query.eventType) where.eventType = query.eventType;
    if (query.userId) where.userId = query.userId;
    if (query.resourceType) where.resourceType = query.resourceType;
    if (query.resourceId) where.resourceId = query.resourceId;

    if (query.startDate || query.endDate) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (query.startDate) createdAt.gte = new Date(query.startDate);
      if (query.endDate) createdAt.lte = new Date(query.endDate);
      where.createdAt = createdAt;
    }

    const [logs, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: PERSON_BRIEF_SELECT },
          targetUser: { select: PERSON_BRIEF_SELECT },
        },
      }),
      this.prisma.activityLog.count({ where }),
    ]);

    return paginated(logs, { page, limit, total });
  }
}
