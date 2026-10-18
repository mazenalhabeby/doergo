import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { success, buildDateRangeFilter, memberScopeFilter } from '@hbcfield/shared';
import { WORKER_ROLES, taskInScope } from './location-helpers';

/**
 * Where people are: everybody active, one worker, one worker's history — inside
 * the reader's workspaces.
 */
@Injectable()
export class WorkerLocationReadService {

  constructor(private readonly prisma: PrismaService) {}

  async getActiveWorkers(organizationId?: string, userIds?: string[], scopeSpaceIds?: string[]) {
    const userWhere: Prisma.UserWhereInput = {
      // Field workers across legacy + current role names (the live map must
      // show EMPLOYEE workers, not just the dropped legacy TECHNICIAN role).
      role: { in: [...WORKER_ROLES] },
      isActive: true,
      ...(memberScopeFilter(scopeSpaceIds) as Prisma.UserWhereInput),
    };
    const where: Prisma.WorkerLastLocationWhereInput = { user: userWhere };

    if (organizationId) {
      userWhere.organizationId = organizationId;
    }
    // Restrict to a specific roster (cross-org shared space: the owner-org
    // workers assigned to that space, resolved server-side and passed in).
    if (Array.isArray(userIds)) {
      if (userIds.length === 0) return success([]);
      where.userId = { in: userIds };
    }

    // Get workers with recent location updates (within last 10 minutes)
    // Technicians disappear from map ~10 min after stopping tracking
    const cutoffTime = new Date(Date.now() - 10 * 60 * 1000);

    const locations = await this.prisma.workerLastLocation.findMany({
      where: {
        ...where,
        updatedAt: { gte: cutoffTime },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            organizationId: true,
          },
        },
      },
    });

    // Get current tasks for each worker (EN_ROUTE or IN_PROGRESS)
    const workerIds = locations.map((loc) => loc.user.id);
    const activeTasks = await this.prisma.task.findMany({
      where: {
        assignedToId: { in: workerIds },
        status: { in: ['EN_ROUTE', 'IN_PROGRESS', 'ARRIVED'] },
        // A job in another workspace is not named to a caller scoped to this one.
        ...taskInScope(scopeSpaceIds),
      },
      select: {
        id: true,
        title: true,
        status: true,
        assignedToId: true,
      },
    });

    // Create a map of workerId -> currentTask
    const taskByWorker = new Map(activeTasks.map((task) => [task.assignedToId, task]));

    // Flatten structure for frontend consumption
    const data = locations.map((loc) => {
      const currentTask = taskByWorker.get(loc.user.id);
      return {
        id: loc.user.id,
        email: loc.user.email,
        firstName: loc.user.firstName,
        lastName: loc.user.lastName,
        lat: loc.lat,
        lng: loc.lng,
        accuracy: loc.accuracy,
        updatedAt: loc.updatedAt.toISOString(),
        currentTask: currentTask
          ? {
              id: currentTask.id,
              title: currentTask.title,
              status: currentTask.status,
            }
          : null,
      };
    });

    return success(data);
  }

  async getWorkerLocation(workerId: string, organizationId?: string, scopeSpaceIds?: string[]) {
    const location = await this.prisma.workerLastLocation.findFirst({
      where: {
        userId: workerId,
        // Scope by tenant so one org can't read another org's worker location;
        // a workspace-scoped caller only their own workspaces' people.
        user: { ...(organizationId ? { organizationId } : {}), ...memberScopeFilter(scopeSpaceIds) },
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!location) {
      return success(null);
    }

    return success({
      workerId: location.userId,
      worker: location.user,
      lat: location.lat,
      lng: location.lng,
      accuracy: location.accuracy,
      lastUpdate: location.updatedAt,
    });
  }

  async getWorkerHistory(
    workerId: string,
    startDate?: string,
    endDate?: string,
    organizationId?: string,
    scopeSpaceIds?: string[],
  ) {
    // Tenant scope: bail out if the worker isn't in the requesting org — or,
    // for a workspace-scoped caller, isn't rostered in one of its workspaces.
    if (organizationId || scopeSpaceIds !== undefined) {
      const worker = await this.prisma.user.findFirst({
        where: { id: workerId, ...(organizationId ? { organizationId } : {}), ...memberScopeFilter(scopeSpaceIds) },
        select: { id: true },
      });
      if (!worker) return success([]);
    }

    // Default to the last 24h when no range is given, so an open-ended call can't
    // stream a worker's entire location history (M2).
    let dateFilter = buildDateRangeFilter(startDate, endDate);
    if (!dateFilter) {
      dateFilter = { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) };
    }
    const where: Prisma.LocationHistoryWhereInput = { userId: workerId, timestamp: dateFilter };
    // Scoped: only points of jobs in scope — not the drive to another
    // workspace's job, and not untagged points between jobs.
    if (scopeSpaceIds !== undefined) where.task = taskInScope(scopeSpaceIds) as Prisma.TaskWhereInput;

    const history = await this.prisma.locationHistory.findMany({
      where,
      orderBy: { timestamp: 'asc' },
      select: {
        lat: true,
        lng: true,
        accuracy: true,
        timestamp: true,
        taskId: true,
      },
      // Hard cap so a very active worker/wide range can't blow up memory (M2).
      take: 10000,
    });

    return success(history);
  }
}
