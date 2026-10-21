import { jobTrip, jobEnRouteFor } from '@hbcfield/shared';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@hbcfield/shared';
import { success, tripDistanceOf } from '@hbcfield/shared';
import { RouteMatchingService } from './route-matching.service';

/** Routes: a job's whole route, and a worker's route in progress. */
@Injectable()
export class RouteReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly routeMatching: RouteMatchingService,
  ) {}

  async getTaskRoute(taskId: string, organizationId?: string, scopeSpaceIds?: string[]) {
    // Get task with route info — scoped to the requesting org (tenant isolation)
    // and, for a workspace-scoped caller, to its workspaces.
    const task = await jobTrip(this.prisma, taskId, organizationId, scopeSpaceIds);

    if (!task) {
      return success(null);
    }

    // Get location points for this task (capped to prevent memory issues on long routes)
    const points = await this.prisma.locationHistory.findMany({
      where: { taskId },
      orderBy: { timestamp: 'asc' },
      take: 5000,
      select: {
        lat: true,
        lng: true,
        accuracy: true,
        timestamp: true,
      },
    });

    // Calculate duration if we have start and end times
    let duration = null;
    if (task.routeStartedAt) {
      const endTime = task.routeEndedAt || new Date();
      duration = Math.floor((endTime.getTime() - task.routeStartedAt.getTime()) / 1000);
    }

    // Road-snapped path, computed here rather than in every viewer's browser —
    // see RouteMatchingService. Null when matching is off or upstream is
    // unavailable, and the client draws the raw points.
    const matchedPath = await this.routeMatching.matchToRoads(points);

    return success({
      taskId: task.id,
      workerId: task.assignedToId,
      status: task.status,
      startTime: task.routeStartedAt,
      endTime: task.routeEndedAt,
      duration, // seconds
      // meters; null = never started (as before the trip table)
      distance: task.routeStartedAt || task.route ? tripDistanceOf(task.route, task.routeStartedAt) : null,
      points,
      matchedPath,
    });
  }

  async getWorkerCurrentRoute(workerId: string, organizationId?: string, scopeSpaceIds?: string[]) {
    // Find the worker's current EN_ROUTE task — scoped to the requesting org,
    // and for a workspace-scoped caller to a job in its workspaces.
    const task = await jobEnRouteFor(this.prisma, workerId, organizationId, scopeSpaceIds);

    if (!task) {
      return success(null);
    }

    // Get location points for this task (capped like getTaskRoute to bound memory
    // on a very long active route) (M3).
    const points = await this.prisma.locationHistory.findMany({
      where: { taskId: task.id },
      orderBy: { timestamp: 'asc' },
      take: 5000,
      select: {
        lat: true,
        lng: true,
        timestamp: true,
      },
    });

    // Calculate current duration
    let duration = null;
    if (task.routeStartedAt) {
      duration = Math.floor((new Date().getTime() - task.routeStartedAt.getTime()) / 1000);
    }

    return success({
      taskId: task.id,
      taskTitle: task.title,
      startTime: task.routeStartedAt,
      duration, // seconds
      distance: tripDistanceOf(task.route, task.routeStartedAt), // meters
      destination: task.locationLat && task.locationLng ? { lat: task.locationLat, lng: task.locationLng } : null,
      points,
    });
  }
}
