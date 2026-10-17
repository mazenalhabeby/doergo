import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { workspaceZone } from '../../common/zone.util';
import { notEndedWhere, TaskStatus, Role, success, startOfDayIn, endOfDayIn, assertFoundInOrg } from '@hbcfield/shared';
import { assertMayAssign } from './task-scope';
import {
  calculateDistanceScore,
  calculateAvailabilityScore,
  calculateSpecializationScore,
  calculateWorkloadScore,
  calculateRatingScore,
  calculateDistance,
} from './technician-scoring';

/**
 * Who should take this task? A weighted ranking of the people the caller may
 * assign — the scores themselves are pure (technician-scoring.ts).
 */
@Injectable()
export class TechnicianSuggestionService {
  private static readonly SUGGESTION_LIMIT = 100;

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Get suggested technicians for a task with weighted scoring
   *
   * Scoring weights:
   * - Distance (30%): Closer to task location is better
   * - Availability (25%): Has capacity for more jobs today
   * - Specialization (20%): Matches task specialty/category
   * - Workload (15%): Fewer active tasks is better
   * - Rating (10%): Higher rating is better
   */
  async getSuggestedTechnicians(data: {
    taskId: string;
    userId: string;
    userRole: string;
    canViewAllTasks?: boolean;
    canAssignTasks?: boolean;
    /** Spaces where the caller holds canAssignTasks through a SPACE role. */
    assignSpaceIds?: string[];
    organizationId: string;
  }) {
    // First verify task exists and user has access
    const task = await this.prisma.task.findUnique({
      where: { id: data.taskId },
    });

    assertFoundInOrg(task, data.organizationId, 'Task');

    // The same authority the assignment itself needs — asked against THIS task's
    // space, so a space-granted assigner passes here and only here.
    assertMayAssign(task, data);

    /*
      Who may be suggested.

      An org-wide assigner sees the organization, as before. A space-granted one
      sees the people rostered in the task's own space and nobody else: this
      endpoint returns names, ratings, workloads and last known positions, so an
      unnarrowed list would hand a client's supervisor the whole staff
      directory — through the door marked "who should do this job".
    */
    const orgWide = data.userRole === Role.ADMIN || data.canAssignTasks === true;
    const spaceRoster = orgWide
      ? null
      : (
          await this.prisma.spaceAssignment.findMany({
            where: {
              spaceId: task.spaceId ?? '',
              ...notEndedWhere(),
            },
            select: { userId: true },
          })
        ).map((a) => a.userId);

    const technicians = await this.prisma.user.findMany({
      where: {
        organizationId: data.organizationId,
        isActive: true,
        id: { not: task.createdById ?? undefined },
        ...(spaceRoster ? { id: { in: spaceRoster, not: task.createdById ?? undefined } } : {}),
      },
      take: TechnicianSuggestionService.SUGGESTION_LIMIT, // Cap to prevent unbounded queries in large orgs
      select: {
        id: true, firstName: true, lastName: true, email: true,
        specialty: true,
        rating: true,
        ratingCount: true,
        lastLocation: {
          select: { lat: true, lng: true, updatedAt: true },
        },
        _count: {
          select: {
            assignedTasks: {
              where: {
                status: {
                  in: [TaskStatus.ASSIGNED, TaskStatus.ACCEPTED, TaskStatus.EN_ROUTE, TaskStatus.ARRIVED, TaskStatus.IN_PROGRESS],
                },
              },
            },
          },
        },
      },
    });

    // Today's range for workload — the task's WORKSPACE's day, never the server's (zone.util).
    const zone = await workspaceZone(this.prisma, { spaceId: task.spaceId, organizationId: task.organizationId });
    const now = new Date();
    const todayStart = startOfDayIn(now, zone);
    const todayEnd = endOfDayIn(now, zone);

    // Batch query: get today's completed task counts for all technicians at once (avoids N+1)
    const techIds = technicians.map((t) => t.id);
    const todayCompletedCounts = await this.prisma.task.groupBy({
      by: ['assignedToId'],
      where: {
        assignedToId: { in: techIds },
        status: TaskStatus.COMPLETED,
        updatedAt: {
          gte: todayStart,
          lt: todayEnd,
        },
      },
      _count: { id: true },
    });

    const completedCountMap = new Map<string, number>();
    for (const row of todayCompletedCounts) {
      if (row.assignedToId) {
        completedCountMap.set(row.assignedToId, row._count.id);
      }
    }

    // Derive each candidate's DAILY CAPACITY from their OWN recent throughput —
    // the busy-day rate (90th-percentile completed jobs/day over the last 30 days),
    // instead of a manually-typed number. Self-adjusting; a new/no-history worker
    // falls back to DEFAULT_CAPACITY. ONE grouped query (no N+1), org-scoped with
    // bound params, clamped to a sane [1,20]. `updatedAt` marks the COMPLETED/CLOSED
    // transition (there is no completedAt column) — a good proxy for finished date.
    const DEFAULT_CAPACITY = 5;
    const derivedCapacityMap = new Map<string, number>();
    if (techIds.length > 0) {
      const capacityRows = await this.prisma.$queryRawUnsafe<Array<{ assignedToId: string; capacity: number }>>(
        `SELECT daily."assignedToId",
                GREATEST(1, LEAST(20, percentile_disc(0.9) WITHIN GROUP (ORDER BY daily.cnt))) AS capacity
         FROM (
           SELECT "assignedToId", ("updatedAt")::date AS d, count(*)::int AS cnt
           FROM "tasks"
           WHERE "organizationId" = $1
             AND "assignedToId" = ANY($2::text[])
             AND status IN ('COMPLETED', 'CLOSED')
             AND "updatedAt" >= NOW() - INTERVAL '30 days'
           GROUP BY "assignedToId", ("updatedAt")::date
         ) daily
         GROUP BY daily."assignedToId"`,
        data.organizationId,
        techIds,
      );
      for (const r of capacityRows) derivedCapacityMap.set(r.assignedToId, Number(r.capacity));
    }

    // Calculate scores for each technician
    const scoredTechnicians = technicians.map((tech) => {
        const todayCompletedCount = completedCountMap.get(tech.id) || 0;

          const activeTaskCount = tech._count.assignedTasks;
          const todayTaskCount = activeTaskCount + todayCompletedCount;
          // Automatic capacity (see above); no longer the manual maxDailyJobs field.
          const maxDailyJobs = derivedCapacityMap.get(tech.id) ?? DEFAULT_CAPACITY;

          // Calculate individual scores (0-100 scale)
          const distanceScore = calculateDistanceScore(task, tech.lastLocation);
          const availabilityScore = calculateAvailabilityScore(todayTaskCount, maxDailyJobs);
          const specializationScore = calculateSpecializationScore(task.title, tech.specialty);
          const workloadScore = calculateWorkloadScore(activeTaskCount);
          const ratingScore = calculateRatingScore(tech.rating);

        // Weighted total score
        const totalScore =
          distanceScore * 0.30 +
          availabilityScore * 0.25 +
          specializationScore * 0.20 +
          workloadScore * 0.15 +
          ratingScore * 0.10;

          // Calculate distance in km
          const distanceKm = calculateDistance(
            task.locationLat,
            task.locationLng,
            tech.lastLocation?.lat,
            tech.lastLocation?.lng,
          );

        return {
          id: tech.id,
          firstName: tech.firstName,
          lastName: tech.lastName,
          email: tech.email,
          specialty: tech.specialty,
          rating: tech.rating || 5.0,
          ratingCount: tech.ratingCount || 0,
          activeTaskCount,
          todayTaskCount,
          maxDailyJobs,
          distanceKm: distanceKm !== null ? Math.round(distanceKm * 10) / 10 : null,
          hasLocation: !!tech.lastLocation,
          score: Math.round(totalScore * 100) / 100,
          scoreBreakdown: {
            distance: Math.round(distanceScore),
            availability: Math.round(availabilityScore),
            specialization: Math.round(specializationScore),
            workload: Math.round(workloadScore),
            rating: Math.round(ratingScore),
          },
        };
      });

    // Sort by score (highest first)
    scoredTechnicians.sort((a, b) => b.score - a.score);

    return success({
      taskId: data.taskId,
      technicians: scoredTechnicians,
      suggestedTechnicianId: scoredTechnicians.length > 0 ? scoredTechnicians[0].id : null,
    });
  }
}
