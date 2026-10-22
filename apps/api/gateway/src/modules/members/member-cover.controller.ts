import { ServiceCalls } from '../../common/microservices/service-calls';
import {
  Controller,
  Get,
  Post,
  HttpCode,
  Query,
  Body,
  BadRequestException,
  ForbiddenException,
  UseInterceptors,
} from '@nestjs/common';
import { LabourCostInterceptor } from '../../common/interceptors/labour-cost.interceptor';
import { callerOrgId } from '../../common/caller-org';
import {
  getTechniciansAvailability,
  getRequestOptions,
  requestPrecheck,
  getFloorNow,
  getCoverRange,
} from '@hbcfield/shared/microservices';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { Role, CurrentUser, RequireAccessModule, RequirePermissionInSpace } from '@hbcfield/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { scopeIdsFor } from '../../common/permission-scope';
import type { SessionUser } from '../../common/request.types';

/**
 * /employees — who is available and on the floor, cover over a range, and the
 * caller's own request options and pre-check. ⚠️ Registered BEFORE
 * MembersController: its one-segment paths would otherwise be read as `:id`.
 */
@ApiTags('employees')
@ApiBearerAuth()
@UseInterceptors(LabourCostInterceptor)
@Controller('employees')
export class MemberCoverController {
  constructor(private readonly services: ServiceCalls) {}

  // ============================================================================
  // AVAILABILITY (must be before /:id routes to avoid conflict)
  // ============================================================================

  @Get('availability')
  @ApiOperation({ summary: 'Get all employees availability for a date or date range' })
  @ApiResponse({ status: 200, description: 'Availability retrieved' })
  @RequirePermissionInSpace('canViewAllTasks')
  async getAvailability(
    @Query('date') date: string | undefined,
    @Query('startDate') startDate: string | undefined,
    @Query('endDate') endDate: string | undefined,
    @CurrentUser() user: SessionUser,
  ) {
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const now = new Date();
    const ninetyDays = 90 * 24 * 60 * 60 * 1000;

    // Validate and check all provided dates
    for (const d of [date, startDate, endDate].filter(Boolean) as string[]) {
      if (!datePattern.test(d)) {
        throw new ForbiddenException('Invalid date format. Use YYYY-MM-DD');
      }
      if (Math.abs(new Date(d).getTime() - now.getTime()) > ninetyDays) {
        throw new ForbiddenException('Date must be within 90 days of today');
      }
    }

    return this.services.task.ask(getTechniciansAvailability, {
      // undefined = org-wide; [] = granted nowhere and matches nothing.
      scopeSpaceIds: scopeIdsFor(user, 'canViewAllTasks'),
      // `user` is optional only because it follows optional query params; the route is authenticated.
      organizationId: callerOrgId(user!),
      date,
      startDate,
      endDate,
    });
  }

  // ============================================================================
  // ORG-WIDE TIME-OFF (must be before /:id routes to avoid conflict)
  // ============================================================================

  @Get('me/request-options')
  // The same tab as making a request — an external member holds no time_off.
  @RequireAccessModule('time_off')
  @ApiOperation({ summary: 'What the caller may request (kinds), and at which workspaces a remote day' })
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  async getRequestOptions(@CurrentUser() user: SessionUser) {
    // Only the caller's own options: the ids come from the token, never the request.
    return this.services.task.ask(getRequestOptions, { userId: user.id, organizationId: callerOrgId(user) });
  }

  @Post('me/requests/precheck')
  @HttpCode(200)
  // Asked before sending a request: the same tab as making one.
  @RequireAccessModule('time_off')
  @ApiOperation({ summary: "What a leader would check, for the caller's own request before it is sent (advice only)" })
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  async precheckRequest(@CurrentUser() user: SessionUser, @Body() body: Record<string, unknown>) {
    // Only the caller's own request: the person comes from the token, the body is read by the same parser as sending.
    return this.services.task.ask(requestPrecheck, { userId: user.id, organizationId: callerOrgId(user), body });
  }

  @Get('floor-now')
  @ApiOperation({ summary: 'Who is on the floor right now, per workspace' })
  @ApiResponse({ status: 200, description: 'Live floor state retrieved' })
  /*
    Gated on attendance, not on tasks.

    This says who clocked in, who has stepped away and who has not turned up —
    which is attendance, whatever screen it is drawn on. Reusing the time-off
    gate would have let anyone who can see a leave request read the shift state
    of everybody in the workspace, and those are not the same authority.
  */
  @RequirePermissionInSpace('canViewSpaceAttendance')
  async getFloorNow(@CurrentUser() user: SessionUser) {
    return this.services.task.ask(getFloorNow, {
      organizationId: callerOrgId(user!),
      // undefined = org-wide; [] = granted nowhere and matches nothing.
      scopeSpaceIds: scopeIdsFor(user, 'canViewSpaceAttendance'),
    });
  }

  @Get('cover-range')
  @ApiOperation({ summary: 'Cover per workspace per day, for the leave chart footer' })
  @ApiQuery({ name: 'start', required: true, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'end', required: true, description: 'YYYY-MM-DD' })
  /*
    Gated on ATTENDANCE, not on tasks — and deliberately not on the gate of the
    leave list it is drawn under.

    `canViewAllTasks` is held by the External Observer seat, whose whole purpose
    is to watch the work and raise a job. Staffing levels are not the work: how
    many people a company has on the floor each day is its own business, and
    reusing the task gate here would be the same mistake the asset audit found —
    one permission doing duty for two different things.
  */
  @RequirePermissionInSpace('canViewSpaceAttendance')
  async getCoverRange(@Query('start') start: string, @Query('end') end: string, @CurrentUser() user: SessionUser) {
    // Rejected here rather than trusted downstream: the range drives a day loop.
    const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
    if (!ISO_DAY.test(start ?? '') || !ISO_DAY.test(end ?? '') || end < start) {
      throw new BadRequestException('start and end must be dates (YYYY-MM-DD), and end must not be before start');
    }
    return this.services.task.ask(getCoverRange, {
      organizationId: callerOrgId(user!),
      start,
      end,
      scopeSpaceIds: scopeIdsFor(user, 'canViewSpaceAttendance'),
    });
  }
}
