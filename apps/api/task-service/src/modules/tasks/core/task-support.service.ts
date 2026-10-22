import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { buildTaskVisibilityWhere } from './task-visibility';
import { PrismaService } from '@hbcfield/shared';
import { TaskAccessService } from '../access/task-access.service';
import { NotificationRoutingService } from '../../notification-routing/notification-routing.service';
import { TaskEventType, success, getRedisConfig } from '@hbcfield/shared';
import type { Prisma } from '@prisma/client';

const STATUS_COUNTS_TTL = 30; // seconds

/**
 * What every part of the task service shares: the event log, the watchers a
 * task event reaches, the task gate, and the status-count cache (its read and
 * its invalidation, so the two cannot drift apart).
 *
 * Split out of TasksService, which remains the facade every caller injects.
 */
@Injectable()
export class TaskSupportService {
  private readonly logger = new Logger(TaskSupportService.name);

  private readonly redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationRouting: NotificationRoutingService,
    configService: ConfigService,
    /**
     * May this caller touch this task? — the shared gate (modules/tasks/access),
     * which this file, attachments, reports and custom fields all ask. It used to
     * be three private copies that had drifted; see TaskAccessService.
     */
    readonly taskAccess: TaskAccessService,
  ) {
    this.redis = new Redis({ ...getRedisConfig(configService), maxRetriesPerRequest: 1 });
  }

  /**
   * Explicit "Notifications about" watchers of the task's assignee, so their
   * managers get pinged about task events. Explicit-only (no default admin blast)
   * and never throws — task flow must not fail on a routing hiccup.
   */
  async taskWatcherIds(
    assigneeId: string | null | undefined,
    organizationId: string | null | undefined,
  ): Promise<string[]> {
    if (!assigneeId || !organizationId) return [];
    try {
      const { ids } = await this.notificationRouting.resolveWatchers(assigneeId, organizationId, 'tasks', true);
      return ids;
    } catch {
      return [];
    }
  }

  /**
   * Create a task event for audit trail
   */
  async createTaskEvent(taskId: string, userId: string, eventType: TaskEventType, metadata?: Record<string, any>) {
    return this.prisma.taskEvent.create({
      data: {
        taskId,
        userId,
        eventType,
        metadata,
      },
    });
  }

  /**
   * Get task counts grouped by status
   * Returns counts for all statuses based on role-based filtering
   */
  async getStatusCounts(query: {
    userId: string;
    userRole: string;
    canViewAllTasks?: boolean;
    organizationId: string;
    spaceId?: string;
    /** Spaces where the caller holds canViewAllTasks by a SPACE role. */
    viewAllSpaceIds?: string[];
    /** 'status' (default) or 'space'. */
    groupBy?: string;
  }) {
    const { userId, userRole, canViewAllTasks, organizationId, spaceId, groupBy, viewAllSpaceIds } = query;

    if (!userRole) {
      return success({});
    }

    // Check Redis cache first
    // The space list is part of the key: two members with the same role and org
    // now see different counts, and a key that ignores that serves one of them
    // the other's numbers.
    const scopeKey = viewAllSpaceIds?.length ? `:${[...viewAllSpaceIds].sort().join(',')}` : '';
    const cacheKey =
      `status_counts:${groupBy === 'space' ? 'space' : 'status'}:${userRole}:${userId}:` +
      `${organizationId}${spaceId ? `:${spaceId}` : ''}${scopeKey}`;
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return success(JSON.parse(cached));
      }
    } catch (err) {
      this.logger.warn('Redis cache read failed for status counts', err);
    }

    // Same visibility rule the list uses — see task-visibility.ts.
    const where: Prisma.TaskWhereInput = buildTaskVisibilityWhere({ userId, userRole, canViewAllTasks, organizationId, viewAllSpaceIds });

    // Space filter — verify it belongs to the user's org before applying
    if (spaceId) {
      const space = await this.prisma.companyLocation.findUnique({
        where: { id: spaceId },
        select: { organizationId: true },
      });
      if (!space || space.organizationId !== organizationId) {
        throw new ForbiddenException('Access denied to this space');
      }
      where.spaceId = spaceId;
    }

    // Group by status (default) or by space. The space tabs previously counted
    // whatever happened to be on the loaded PAGE, so the same tab showed
    // different numbers on page 1 and page 2; grouping server-side over the full
    // visible set is the only way those badges can be true.
    const counts: Record<string, number> = {};
    let total = 0;
    if (groupBy === 'space') {
      const spaceCounts = await this.prisma.task.groupBy({
        by: ['spaceId'],
        where,
        _count: { spaceId: true },
      });
      for (const item of spaceCounts) {
        if (item.spaceId) counts[item.spaceId] = item._count.spaceId;
        total += item._count.spaceId;
      }
    } else {
      const statusCounts = await this.prisma.task.groupBy({
        by: ['status'],
        where,
        _count: { status: true },
      });
      for (const item of statusCounts) {
        counts[item.status] = item._count.status;
        total += item._count.status;
      }
    }
    counts['all'] = total;

    /*
      And how many of them are the caller's OWN.

      Carried in the same cached response rather than as a second endpoint: the
      badge beside "All" and the badge beside "Mine" are one question asked
      twice, and a screen should not pay two round trips to answer it. One
      indexed count — tasks(assignedToId, dueDate) and task_assignees(userId) —
      inside a reply that is already cached for thirty seconds.

      ANDed with `where`, which is the visibility rule, so this can only ever
      count a subset of what the caller may already see.
    */
    if (userId) {
      counts['mine'] = await this.prisma.task.count({
        where: {
          ...where,
          AND: [
            ...(Array.isArray(where.AND) ? where.AND : []),
            { OR: [{ assignedToId: userId }, { assignees: { some: { userId } } }] },
          ],
        },
      });
    }

    // Cache for 30 seconds + index the key per org so invalidation never needs
    // a blocking KEYS scan.
    try {
      await this.redis.setex(cacheKey, STATUS_COUNTS_TTL, JSON.stringify(counts));
      const idxKey = `status_counts:idx:${organizationId}`;
      await this.redis.sadd(idxKey, cacheKey);
      await this.redis.expire(idxKey, STATUS_COUNTS_TTL + 5);
    } catch (err) {
      this.logger.warn('Redis cache write failed for status counts', err);
    }

    return success(counts);
  }

  /**
   * Invalidate status counts cache for an organization
   * Called after task create/update/delete/status-change operations
   */
  async invalidateStatusCountsCache(organizationId: string) {
    try {
      const idxKey = `status_counts:idx:${organizationId}`;
      const keys = await this.redis.smembers(idxKey);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
      await this.redis.del(idxKey);
    } catch (err) {
      this.logger.warn('Failed to invalidate status counts cache', err);
    }
  }
}
