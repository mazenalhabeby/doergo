import { Injectable, Inject, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../common/prisma/prisma.service';
import { success, SERVICE_NAMES, haversineDistance, buildDateRangeFilter } from '@hbcfield/shared';
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
  ) {}

  async updateLocation(
    userId: string,
    lat: number,
    lng: number,
    accuracy?: number,
    taskId?: string,
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
        select: { status: true, assignedToId: true },
      });

      // Only record history if the task is EN_ROUTE and owned by the caller.
      if (task && task.status === 'EN_ROUTE' && task.assignedToId === userId) {
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

  async getActiveWorkers(organizationId?: string) {
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

    const dateFilter = buildDateRangeFilter(startDate, endDate);
    const where: any = { userId: workerId };
    if (dateFilter) {
      where.timestamp = dateFilter;
    }

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

    return success({
      taskId: task.id,
      workerId: task.assignedToId,
      status: task.status,
      startTime: task.routeStartedAt,
      endTime: task.routeEndedAt,
      duration, // seconds
      distance: task.routeDistance, // meters
      points,
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

    // Get location points for this task
    const points = await this.prisma.locationHistory.findMany({
      where: { taskId: task.id },
      orderBy: { timestamp: 'asc' },
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
