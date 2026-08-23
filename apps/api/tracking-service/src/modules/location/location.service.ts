import { Injectable, Inject, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { success, SERVICE_NAMES, haversineDistance, buildDateRangeFilter, isTaskAssignee, runWithCronLock, } from '@hbcfield/shared';
import { RouteMatchingService } from './route-matching.service';
import { catchError, of } from 'rxjs';

// Field-worker roles across the legacy → current rename. Must be valid DB Role
// enum values (no 'WORKER' — that's not in the enum).
const WORKER_ROLES = ['EMPLOYEE', 'TECHNICIAN'] as const;

@Injectable()
export class LocationService {
  private readonly logger = new Logger(LocationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION)
    private readonly notificationClient: ClientProxy,
    private readonly routeMatching: RouteMatchingService,
  ) {}

  /**
   * Retention: prune GPS points older than LOCATION_HISTORY_RETENTION_DAYS
   * (default 90). LocationHistory grows unbounded and dominates query/storage
   * cost, so we delete in capped batches nightly to avoid a single huge DELETE
   * holding a long lock.
   */
  /**
   * Cron entry point. The work is in pruneOldLocationHistory(), which stays directly
   * callable — this only decides whether THIS replica is the one to run it.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async pruneOldLocationHistoryCron(): Promise<void> {
    await runWithCronLock(
      this.prisma,
      { name: 'tracking:pruneLocationHistory', ttlSeconds: 1800, logger: this.logger },
      () => this.pruneOldLocationHistory(),
    );
  }

  async pruneOldLocationHistory(): Promise<number> {
    const days = Number(process.env.LOCATION_HISTORY_RETENTION_DAYS) || 90;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const BATCH = 5000;

    let totalDeleted = 0;
    // Delete in capped batches so no single DELETE holds a long lock. Each batch
    // is one round-trip: a self-join to a LIMITed CTE deletes up to BATCH rows
    // by ctid without ever loading ids into the app (was findMany+deleteMany).
    // Cap iterations as a safety backstop (≤ 1M rows per run).
    for (let i = 0; i < 200; i++) {
      const deleted = await this.prisma.$executeRaw`
        DELETE FROM location_history
        WHERE ctid IN (
          SELECT ctid FROM location_history
          WHERE timestamp < ${cutoff}
          LIMIT ${BATCH}
        )`;
      totalDeleted += deleted;
      if (deleted < BATCH) break;
    }

    if (totalDeleted > 0) {
      this.logger.log(
        `Pruned ${totalDeleted} location history points older than ${days}d`,
      );
    }
    return totalDeleted;
  }

  async updateLocation(
    userId: string,
    lat: number,
    lng: number,
    accuracy?: number,
    taskId?: string,
    organizationId?: string,
  ) {
    // Validate coordinate bounds — reject garbage before it pollutes the map/route.
    if (
      typeof lat !== 'number' || typeof lng !== 'number' ||
      lat < -90 || lat > 90 || lng < -180 || lng > 180
    ) {
      throw new Error('Invalid coordinates');
    }

    // Upsert worker's last location (for live map)
    const location = await this.prisma.workerLastLocation.upsert({
      where: { userId },
      update: { lat, lng, accuracy },
      create: { userId, lat, lng, accuracy },
    });

    // If taskId provided, store in location history for route tracking
    if (taskId) {
      // Get the task — and verify it is assigned to THIS user (ownership check:
      // a worker may only append GPS points to their own active task).
      const task = await this.prisma.task.findUnique({
        where: { id: taskId },
        // Co-assignees included: a member assigned alongside a lead drives the
        // same route, and matching assignedToId alone silently discarded every
        // point they recorded — accepted by the API, never stored.
        select: { status: true, assignedToId: true, assignees: { select: { userId: true } } },
      });

      // Only record history while the task is EN_ROUTE and the caller is on it —
      // as lead or co-assignee (isTaskAssignee, the shared rule).
      if (task && task.status === 'EN_ROUTE' && isTaskAssignee(task, userId) === true) {
        // Get the last location point for this task to calculate incremental distance
        const lastPoint = await this.prisma.locationHistory.findFirst({
          where: { taskId, userId },
          orderBy: { timestamp: 'desc' },
        });

        let incrementalDistance = 0;
        if (lastPoint) {
          incrementalDistance = haversineDistance(lastPoint.lat, lastPoint.lng, lat, lng);
        }

        // Append the point and bump the distance atomically so concurrent pings
        // can't lose an increment (read-modify-write race on routeDistance).
        await this.prisma.$transaction([
          this.prisma.locationHistory.create({
            data: { userId, taskId, lat, lng, accuracy },
          }),
          ...(incrementalDistance > 0
            ? [
                this.prisma.task.update({
                  where: { id: taskId },
                  data: { routeDistance: { increment: incrementalDistance } },
                }),
              ]
            : []),
        ]);
      }
    }

    // Emit location update event to notification service (fire-and-forget with error handling)
    this.notificationClient
      .emit('worker_location_updated', {
        organizationId,
        workerId: userId,
        taskId,
        location: { lat, lng, accuracy, timestamp: new Date() },
      })
      .pipe(
        catchError((err) => {
          this.logger.warn(
            `Failed to emit location update to notification service: ${err.message}`,
          );
          return of(null);
        }),
      )
      .subscribe();

    return success(location);
  }

  /**
   * Batch variant of updateLocation — used by the mobile background route
   * tracker, which buffers GPS points while the phone is locked/backgrounded
   * and flushes them in one request. Appending the whole burst in a single
   * transaction (one ownership check, one distance increment) is far cheaper on
   * the device radio and the DB than N separate /location calls.
   */
  async updateLocationBatch(
    userId: string,
    taskId: string | undefined,
    points: { lat: number; lng: number; accuracy?: number; timestamp?: string }[],
    organizationId?: string,
  ) {
    if (!Array.isArray(points) || points.length === 0) {
      return success(null);
    }

    // Drop garbage coordinates, then order by device timestamp so the route
    // keeps its real shape (turns) even when points arrive batched out of order.
    const valid = points
      .filter(
        (p) =>
          typeof p.lat === 'number' && typeof p.lng === 'number' &&
          p.lat >= -90 && p.lat <= 90 && p.lng >= -180 && p.lng <= 180,
      )
      .sort(
        (a, b) =>
          new Date(a.timestamp ?? 0).getTime() - new Date(b.timestamp ?? 0).getTime(),
      );

    if (valid.length === 0) {
      throw new Error('Invalid coordinates');
    }

    const latest = valid[valid.length - 1];

    // Upsert worker's last location with the newest point (for the live map).
    const location = await this.prisma.workerLastLocation.upsert({
      where: { userId },
      update: { lat: latest.lat, lng: latest.lng, accuracy: latest.accuracy },
      create: { userId, lat: latest.lat, lng: latest.lng, accuracy: latest.accuracy },
    });

    if (taskId) {
      const task = await this.prisma.task.findUnique({
        where: { id: taskId },
        // Co-assignees included: a member assigned alongside a lead drives the
        // same route, and matching assignedToId alone silently discarded every
        // point they recorded — accepted by the API, never stored.
        select: { status: true, assignedToId: true, assignees: { select: { userId: true } } },
      });

      // Only record history while the task is EN_ROUTE and the caller is on it —
      // as lead or co-assignee (isTaskAssignee, the shared rule).
      if (task && task.status === 'EN_ROUTE' && isTaskAssignee(task, userId) === true) {
        const lastPoint = await this.prisma.locationHistory.findFirst({
          where: { taskId, userId },
          orderBy: { timestamp: 'desc' },
          select: { lat: true, lng: true },
        });

        let prevLat = lastPoint?.lat ?? null;
        let prevLng = lastPoint?.lng ?? null;
        let totalIncrement = 0;

        // Build the rows in one pass (accumulating route distance), then insert
        // them with a single createMany instead of N individual INSERTs in the
        // transaction — this is the hottest write path (burst flush). (Audit P7.)
        const rows = valid.map((p) => {
          if (prevLat !== null && prevLng !== null) {
            totalIncrement += haversineDistance(prevLat, prevLng, p.lat, p.lng);
          }
          prevLat = p.lat;
          prevLng = p.lng;
          return {
            userId,
            taskId,
            lat: p.lat,
            lng: p.lng,
            accuracy: p.accuracy,
            ...(p.timestamp ? { timestamp: new Date(p.timestamp) } : {}),
          };
        });

        await this.prisma.$transaction([
          this.prisma.locationHistory.createMany({ data: rows }),
          ...(totalIncrement > 0
            ? [
                this.prisma.task.update({
                  where: { id: taskId },
                  data: { routeDistance: { increment: totalIncrement } },
                }),
              ]
            : []),
        ]);
      }
    }

    // Emit only the latest point to the live map (no need to replay the burst).
    this.notificationClient
      .emit('worker_location_updated', {
        organizationId,
        workerId: userId,
        taskId,
        location: { lat: latest.lat, lng: latest.lng, accuracy: latest.accuracy, timestamp: new Date() },
      })
      .pipe(
        catchError((err) => {
          this.logger.warn(`Failed to emit location update: ${err.message}`);
          return of(null);
        }),
      )
      .subscribe();

    return success(location);
  }

  async getActiveWorkers(organizationId?: string, userIds?: string[]) {
    const where: any = {
      user: {
        // Field workers across legacy + current role names (the live map must
        // show EMPLOYEE workers, not just the dropped legacy TECHNICIAN role).
        role: { in: [...WORKER_ROLES] },
        isActive: true,
      },
    };

    if (organizationId) {
      where.user.organizationId = organizationId;
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
      },
      select: {
        id: true,
        title: true,
        status: true,
        assignedToId: true,
      },
    });

    // Create a map of workerId -> currentTask
    const taskByWorker = new Map(
      activeTasks.map((task) => [task.assignedToId, task]),
    );

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

  async getWorkerLocation(workerId: string, organizationId?: string) {
    const location = await this.prisma.workerLastLocation.findFirst({
      where: {
        userId: workerId,
        // Scope by tenant so one org can't read another org's worker location.
        ...(organizationId ? { user: { organizationId } } : {}),
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
  ) {
    // Tenant scope: bail out if the worker isn't in the requesting org.
    if (organizationId) {
      const worker = await this.prisma.user.findFirst({
        where: { id: workerId, organizationId },
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
    const where: any = { userId: workerId, timestamp: dateFilter };

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

  async getTaskRoute(taskId: string, organizationId?: string) {
    // Get task with route info — scoped to the requesting org (tenant isolation).
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, ...(organizationId ? { organizationId } : {}) },
      select: {
        id: true,
        status: true,
        routeStartedAt: true,
        routeEndedAt: true,
        routeDistance: true,
        assignedToId: true,
      },
    });

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
      duration = Math.floor(
        (endTime.getTime() - task.routeStartedAt.getTime()) / 1000,
      );
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
      distance: task.routeDistance, // meters
      points,
      matchedPath,
    });
  }

  async getWorkerCurrentRoute(workerId: string, organizationId?: string) {
    // Find the worker's current EN_ROUTE task — scoped to the requesting org.
    const task = await this.prisma.task.findFirst({
      where: {
        assignedToId: workerId,
        status: 'EN_ROUTE',
        ...(organizationId ? { organizationId } : {}),
      },
      select: {
        id: true,
        title: true,
        routeStartedAt: true,
        routeDistance: true,
        locationLat: true,
        locationLng: true,
      },
    });

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
      duration = Math.floor(
        (new Date().getTime() - task.routeStartedAt.getTime()) / 1000,
      );
    }

    return success({
      taskId: task.id,
      taskTitle: task.title,
      startTime: task.routeStartedAt,
      duration, // seconds
      distance: task.routeDistance || 0, // meters
      destination: task.locationLat && task.locationLng
        ? { lat: task.locationLat, lng: task.locationLng }
        : null,
      points,
    });
  }
}
