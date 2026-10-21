import { jobTripFacts } from '@hbcfield/shared';
import { cleanRoutePoints } from '@hbcfield/shared';
import { Injectable, Inject, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '@hbcfield/shared';
import { success, SERVICE_NAMES, haversineDistance, isTaskAssignee } from '@hbcfield/shared';
import { catchError, of } from 'rxjs';
import { emitEvent, workerLocationUpdatedEvent } from '@hbcfield/shared/microservices';
import { addTripMeters, setTripMeters } from './trip-distance';

/**
 * A phone's buffered route points, flushed in one go: ownership and the en-route
 * check once, distance once, one transaction — and points that arrive late for a
 * route already ended.
 */
@Injectable()
export class LocationBatchService {
  private readonly logger = new Logger(LocationBatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION)
    private readonly notificationClient: ClientProxy,
  ) {}

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
          typeof p.lat === 'number' &&
          typeof p.lng === 'number' &&
          p.lat >= -90 &&
          p.lat <= 90 &&
          p.lng >= -180 &&
          p.lng <= 180,
      )
      .sort((a, b) => new Date(a.timestamp ?? 0).getTime() - new Date(b.timestamp ?? 0).getTime());

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
      const task = await jobTripFacts(this.prisma, taskId);

      /*
        A route that already ended, receiving its own points late.

        A phone in a dead zone keeps its points; "Arrived" may reach the server
        first (it is a queued operation too), and the points used to be refused
        and thrown away — the straight line across the gap background tracking
        was built to remove. Points timed inside the route's own window still
        belong to it.
      */
      if (
        task &&
        task.status !== 'EN_ROUTE' &&
        isTaskAssignee(task, userId) === true &&
        task.routeStartedAt &&
        task.routeEndedAt
      ) {
        await this.recordLateRoutePoints(userId, taskId, task.routeStartedAt, task.routeEndedAt, valid);
      }

      // Only record history while the task is EN_ROUTE and the caller is on it —
      // as lead or co-assignee (isTaskAssignee, the shared rule).
      if (task && task.status === 'EN_ROUTE' && isTaskAssignee(task, userId) === true) {
        const lastPoint = await this.prisma.locationHistory.findFirst({
          where: { taskId, userId },
          orderBy: { timestamp: 'desc' },
          select: { lat: true, lng: true, timestamp: true },
        });

        /*
          The same filter the phone applies (shared), so an older app is held
          to it too: no fix worse than ±50 m, no impossible jumps, nothing timed
          in the future or before this trip started. Then drop anything already
          stored — a retry after a lost response must never count the same
          metres twice.
        */
        const earliest = task.routeStartedAt ? task.routeStartedAt.getTime() - 60_000 : -Infinity;
        const cleaned = cleanRoutePoints(valid, {
          previous: lastPoint
            ? { lat: lastPoint.lat, lng: lastPoint.lng, timestamp: lastPoint.timestamp.toISOString() }
            : null,
        }).filter((p) => !p.timestamp || Date.parse(p.timestamp) >= earliest);

        const stamped = cleaned.filter((p) => p.timestamp).map((p) => new Date(p.timestamp as string));
        const known = new Set<number>(
          stamped.length
            ? (
                await this.prisma.locationHistory.findMany({
                  where: { taskId, userId, timestamp: { in: stamped } },
                  select: { timestamp: true },
                })
              ).map((e) => e.timestamp.getTime())
            : [],
        );
        const fresh = cleaned.filter((p) => !p.timestamp || !known.has(Date.parse(p.timestamp)));

        let prevLat = lastPoint?.lat ?? null;
        let prevLng = lastPoint?.lng ?? null;
        let totalIncrement = 0;

        // One pass builds the rows and the distance; one createMany inserts
        // them — this is the hottest write path (burst flush). (Audit P7.)
        const rows = fresh.map((p) => {
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

        if (rows.length) {
          await this.prisma.$transaction([
            this.prisma.locationHistory.createMany({ data: rows }),
            ...(totalIncrement > 0 ? [addTripMeters(this.prisma, taskId, task.routeStartedAt, totalIncrement)] : []),
          ]);
        }
      }
    }

    // Emit only the latest point to the live map (no need to replay the burst).
    emitEvent(this.notificationClient, workerLocationUpdatedEvent, {
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

  /**
   * Store the points of an ended route that arrived after it ended.
   *
   * Only points timed inside [routeStartedAt, routeEndedAt]; an untimed point
   * cannot be placed and is left out. A point already stored (the same burst
   * sent again after a lost answer) is not stored twice. The distance is then
   * recomputed from the whole route in time order, because late points land
   * BETWEEN points already counted and an increment would be wrong.
   */
  private async recordLateRoutePoints(
    userId: string,
    taskId: string,
    startedAt: Date,
    endedAt: Date,
    points: { lat: number; lng: number; accuracy?: number; timestamp?: string }[],
  ): Promise<void> {
    const inWindow = cleanRoutePoints(points)
      .map((p) => ({ ...p, at: p.timestamp ? new Date(p.timestamp) : null }))
      .filter(
        (p): p is typeof p & { at: Date } =>
          !!p.at && !Number.isNaN(p.at.getTime()) && p.at >= startedAt && p.at <= endedAt,
      );
    if (!inWindow.length) return;

    const existing = await this.prisma.locationHistory.findMany({
      where: { taskId, userId, timestamp: { in: inWindow.map((p) => p.at) } },
      select: { timestamp: true },
    });
    const known = new Set(existing.map((e) => e.timestamp.getTime()));
    const fresh = inWindow.filter((p) => !known.has(p.at.getTime()));
    if (!fresh.length) return;

    await this.prisma.locationHistory.createMany({
      data: fresh.map((p) => ({ userId, taskId, lat: p.lat, lng: p.lng, accuracy: p.accuracy, timestamp: p.at })),
    });

    const route = await this.prisma.locationHistory.findMany({
      where: { taskId, userId, timestamp: { gte: startedAt, lte: endedAt } },
      orderBy: { timestamp: 'asc' },
      select: { lat: true, lng: true },
    });
    let distance = 0;
    for (let i = 1; i < route.length; i++) {
      distance += haversineDistance(route[i - 1]!.lat, route[i - 1]!.lng, route[i]!.lat, route[i]!.lng);
    }
    await setTripMeters(this.prisma, taskId, startedAt, distance);
    this.logger.log(
      `Late route points: task=${taskId} user=${userId} stored=${fresh.length} distance=${Math.round(distance)}m`,
    );
  }
}
