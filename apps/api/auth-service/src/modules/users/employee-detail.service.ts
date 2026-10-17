import { Role } from '@hbcfield/shared';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GetEmployeeDetailDto } from './dto';
import { isOnline } from './users-common';
import { EmployeeStatsService } from './employee-stats.service';

/**
 * One employee's detail page: the record, their task and attendance figures, and
 * the recent-activity feed narrowed to what the viewer may see.
 *
 * Part of member management; `UsersService` is the facade every caller uses.
 */
@Injectable()
export class EmployeeDetailService {

  @Inject(EmployeeStatsService) private readonly stats!: EmployeeStatsService;



  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Get full employee detail with stats
   */
  async getEmployeeDetail(dto: GetEmployeeDetailDto) {
    const { id, organizationId } = dto;
    /*
      Who is allowed to read a colleague's record, and how much of it.

      This endpoint had NO permission guard: any authenticated member could
      fetch any other member's full profile — every task they have completed
      across every space, their hours, their recent activity and their last GPS
      position. For an external member that is a client's supervisor reading the
      complete work history of people at sites they have nothing to do with.

      `viewerSpaceIds` is null for an org-wide viewer (an admin or a manager) and
      the caller's granted spaces otherwise. Undefined means an older caller that
      sends nothing, which is treated as org-wide so existing internal callers
      are unaffected — the gateway sends it on the one route a member reaches.
    */
    const viewerSpaceIds = (dto as { viewerSpaceIds?: string[] | null }).viewerSpaceIds;
    const scoped = Array.isArray(viewerSpaceIds);
    // Coordinates need their own permission — see lastLocation below. Absent
    // fails CLOSED: an org-wide viewer of the roster is not, by that alone,
    // somebody who may follow a colleague on a map.
    const canSeeLocation = (dto as { canViewTracking?: boolean }).canViewTracking === true;

    const employee = await this.prisma.user.findFirst({
      where: {
        id,
        organizationId,
        role: Role.EMPLOYEE,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        role: true,
        // Their worker statistics are structurally zero — see EmployeeProfile.
        isExternal: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        position: true,
        enabledModules: true,
        /*
          The account-level grant for working away from a site.

          Read by the member's Workspaces tab, which resolves the EFFECTIVE
          answer per assignment from the site's ceiling, this flag, and any
          per-assignment override. Missing, that screen renders "Refused" for
          somebody whose account allows it — a wrong answer shown to the one
          person who would then go and change the wrong setting.
        */
        allowRemote: true,
        specialty: true,
        employmentType: true,
        rating: true,
        ratingCount: true,
        maxDailyJobs: true,
        canCreateTasks: true,
        organizationId: true,
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
        lastLocation: {
          select: {
            lat: true,
            lng: true,
            accuracy: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    // Batch all stats queries in parallel to avoid N+1
    if (scoped) {
      // Reachable only through a space they were both put in. Reads as "not
      // found" rather than "forbidden": whether a given colleague exists is
      // itself something this caller has no business learning.
      const shared = await this.prisma.spaceAssignment.findFirst({
        where: { userId: id, spaceId: { in: viewerSpaceIds as string[] } },
        select: { id: true },
      });
      if (!shared) throw new NotFoundException('Employee not found');
    }

    const [taskStats, attendanceStats, recentActivity] = await Promise.all([
      // Scoped to the spaces the viewer holds, so a supervisor of one site sees
      // that site's work and not a career total.
      this.stats.getTaskStatsForEmployee(id, scoped ? (viewerSpaceIds as string[]) : undefined),
      this.stats.getAttendanceStatsForEmployee(id, scoped ? (viewerSpaceIds as string[]) : undefined),
      // ⚠️ The activity feed too — it named every job and every site the person
      // had been at, whatever the viewer's spaces. Same scope as the numbers.
      this.stats.getRecentActivityForEmployee(id, scoped ? (viewerSpaceIds as string[]) : undefined),
    ]);

    // Build response
    const profile = {
      id: employee.id,
      email: employee.email,
      firstName: employee.firstName,
      lastName: employee.lastName,
      role: employee.role,
      isActive: employee.isActive,
      createdAt: employee.createdAt.toISOString(),
      updatedAt: employee.updatedAt.toISOString(),
      position: employee.position,
      enabledModules: employee.enabledModules as string[] | null,
      specialty: employee.specialty,
      employmentType: employee.employmentType ?? 'EXTERNAL',
      rating: employee.rating || 5.0,
      ratingCount: employee.ratingCount || 0,
      maxDailyJobs: employee.maxDailyJobs || 5,
      canCreateTasks: employee.canCreateTasks,
      organizationId: employee.organizationId,
      organization: employee.organization,
      /*
        Where this person physically is — the most sensitive field here, and it
        was returned to anybody who asked.

        `canViewTracking` exists for exactly this and was split out of
        canViewAllTasks because "read a task list" and "track a person's
        location" are not the same permission. Without it the coordinates are
        withheld and `isOnline` still answers the question a roster actually
        asks: are they around?
      */
      lastLocation:
        canSeeLocation && employee.lastLocation
          ? {
              lat: employee.lastLocation.lat,
              lng: employee.lastLocation.lng,
              accuracy: employee.lastLocation.accuracy,
              updatedAt: employee.lastLocation.updatedAt.toISOString(),
            }
          : null,
      // When they were last seen is not a position — it is what `isOnline` is
      // made of, and a roster may show it without the map permission.
      lastLocationUpdatedAt: employee.lastLocation?.updatedAt?.toISOString() || null,
      isOnline: isOnline(employee.lastLocation?.updatedAt),
      currentTaskCount: taskStats.inProgress,
      todayTaskCount: taskStats.todayTotal,
      completedTaskCount: taskStats.completed,
    };

    const stats = {
      tasks: taskStats,
      attendance: attendanceStats,
      performance: {
        completionRate: taskStats.completionRate,
        onTimeRate: taskStats.onTimeRate,
        customerRating: employee.rating || 5.0,
        ratingCount: employee.ratingCount || 0,
      },
      recentActivity,
    };

    return {
      success: true,
      data: {
        ...profile,
        stats,
      },
    };
  }
}
