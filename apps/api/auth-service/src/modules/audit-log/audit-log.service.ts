import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { paginated } from '@hbcfield/shared';

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
          eventType: data.eventType as any,
          userId: data.userId,
          targetUserId: data.targetUserId,
          resourceType: data.resourceType,
          resourceId: data.resourceId,
          metadata: data.metadata ? (data.metadata as any) : undefined,
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
  }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(Math.max(1, Number(query.limit) || 50), 200);
    const skip = (page - 1) * limit;

    const where: any = {
      organizationId: query.organizationId,
    };

    if (query.eventType) where.eventType = query.eventType;
    if (query.userId) where.userId = query.userId;
    if (query.resourceType) where.resourceType = query.resourceType;
    if (query.resourceId) where.resourceId = query.resourceId;

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const [logs, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          targetUser: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
      this.prisma.activityLog.count({ where }),
    ]);

    return paginated(logs, { page, limit, total });
  }
}
