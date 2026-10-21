import { jobTripFacts } from '@hbcfield/shared';
import { Injectable, Inject, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '@hbcfield/shared';
import { success, SERVICE_NAMES, haversineDistance, isTaskAssignee } from '@hbcfield/shared';
import { catchError, of } from 'rxjs';
import { emitEvent, workerLocationUpdatedEvent } from '@hbcfield/shared/microservices';
import { addTripMeters } from './trip-distance';

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
    organizationId?: string,
  ) {
    // Validate coordinate bounds — reject garbage before it pollutes the map/route.
    if (typeof lat !== 'number' || typeof lng !== 'number' || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
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
      const task = await jobTripFacts(this.prisma, taskId);

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
        // can't lose an increment (one upsert statement on the trip's row).
        await this.prisma.$transaction([
          this.prisma.locationHistory.create({
            data: { userId, taskId, lat, lng, accuracy },
          }),
          ...(incrementalDistance > 0
            ? [addTripMeters(this.prisma, taskId, task.routeStartedAt, incrementalDistance)]
            : []),
        ]);
      }
    }

    // Emit location update event to notification service (fire-and-forget with error handling)
    emitEvent(this.notificationClient, workerLocationUpdatedEvent, {
      organizationId,
      workerId: userId,
      taskId,
      location: { lat, lng, accuracy, timestamp: new Date() },
    })
      .pipe(
        catchError((err) => {
          this.logger.warn(`Failed to emit location update to notification service: ${err.message}`);
          return of(null);
        }),
      )
      .subscribe();

    return success(location);
  }

  /** Right to erasure: the member's last position and their whole GPS history. Safe to repeat. */
  async eraseMember(userId: string) {
    const [last, history] = await this.prisma.$transaction([
      this.prisma.workerLastLocation.deleteMany({ where: { userId } }),
      this.prisma.locationHistory.deleteMany({ where: { userId } }),
    ]);
    return { success: true, data: { locationsRemoved: last.count + history.count } };
  }
}
