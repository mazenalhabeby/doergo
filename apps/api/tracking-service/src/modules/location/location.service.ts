import { Injectable, Inject, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../common/prisma/prisma.service';
import { success, SERVICE_NAMES } from '@doergo/shared';
import { catchError, of } from 'rxjs';

// Haversine formula to calculate distance between two GPS points
function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

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
    // Upsert worker's last location (for live map)
    const location = await this.prisma.workerLastLocation.upsert({
      where: { userId },
      update: { lat, lng, accuracy },
      create: { userId, lat, lng, accuracy },
    });

    // If taskId provided, store in location history for route tracking
    if (taskId) {
      // Get the task to check if it's EN_ROUTE
      const task = await this.prisma.task.findUnique({
        where: { id: taskId },
        select: { status: true, routeStartedAt: true, routeDistance: true },
      });

      // Only record history if task is EN_ROUTE
      if (task && task.status === 'EN_ROUTE') {
        // Get the last location point for this task to calculate incremental distance
        const lastPoint = await this.prisma.locationHistory.findFirst({
          where: { taskId, userId },
          orderBy: { timestamp: 'desc' },
        });

        // Calculate distance from last point
        let incrementalDistance = 0;
        if (lastPoint) {
          incrementalDistance = haversineDistance(
            lastPoint.lat,
            lastPoint.lng,
            lat,
            lng,
          );
        }

        // Store location point in history
        await this.prisma.locationHistory.create({
          data: {
            userId,
            taskId,
            lat,
            lng,
            accuracy,
          },
        });

        // Update task's total route distance
        if (incrementalDistance > 0) {
          await this.prisma.task.update({
            where: { id: taskId },
            data: {
              routeDistance: (task.routeDistance || 0) + incrementalDistance,
            },
          });
        }
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
        role: 'TECHNICIAN',
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

  async getWorkerLocation(workerId: string) {
    const location = await this.prisma.workerLastLocation.findUnique({
      where: { userId: workerId },
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

  async getWorkerHistory(workerId: string, startDate?: string, endDate?: string) {
    // Build where clause
    const where: any = { userId: workerId };

    if (startDate) {
      where.timestamp = { ...where.timestamp, gte: new Date(startDate) };
    }
    if (endDate) {
      where.timestamp = { ...where.timestamp, lte: new Date(endDate) };
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

  async getTaskRoute(taskId: string) {
    // Get task with route info
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
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

    // Get all location points for this task
    const points = await this.prisma.locationHistory.findMany({
      where: { taskId },
      orderBy: { timestamp: 'asc' },
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

  async getWorkerCurrentRoute(workerId: string) {
    // Find the worker's current EN_ROUTE task
    const task = await this.prisma.task.findFirst({
      where: {
        assignedToId: workerId,
        status: 'EN_ROUTE',
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
