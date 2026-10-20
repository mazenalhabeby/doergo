import { Controller, Get, Post, Param, Query, Body, Inject, ForbiddenException, UseInterceptors } from '@nestjs/common';
import { LabourCostInterceptor } from '../../common/interceptors/labour-cost.interceptor';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiParam } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { Role, SERVICE_NAMES, CurrentUser, RequireAccessModule } from '@hbcfield/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequestTimeOffDto } from './dto';
import { LeaveCountQueryDto } from '../calendar/calendar.dto';
import { leaveReadScope } from './members-controller-helpers';
import { callerOrgId } from '../../common/caller-org';
import { sendRpc, getTimeOff, getLeaveBalance, countLeaveRpc, requestTimeOff } from '@hbcfield/shared/microservices';
import type { SessionUser } from '../../common/request.types';

/** /employees/:id/time-off — one member's leave: the list, balance, what a range costs, asking. */
@ApiTags('employees')
@ApiBearerAuth()
@UseInterceptors(LabourCostInterceptor)
@Controller('employees')
export class MemberTimeOffController {
  constructor(@Inject(SERVICE_NAMES.TASK) private readonly taskClient: ClientProxy) {}

  // ============================================================================
  // TIME-OFF MANAGEMENT
  // ============================================================================

  @Get(':id/time-off')
  @ApiOperation({ summary: 'Get employee time-off requests' })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @ApiResponse({ status: 200, description: 'Time-off requests retrieved' })
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  async getEmployeeTimeOff(
    @Param('id') id: string,
    @Query('status') status: ('PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED') | undefined,
    @CurrentUser() user: SessionUser,
  ) {
    // Managers (EMPLOYEE + canViewAllTasks) can view any member's time-off;
    // plain employees only their own (D9).
    const privileged = user?.role === Role.ADMIN || !!user?.canViewAllTasks;
    if (!privileged && user?.id !== id) {
      throw new ForbiddenException('You can only view your own time-off requests');
    }

    return firstValueFrom(
      sendRpc(this.taskClient, getTimeOff, {
        technicianId: id,
        // `user` is optional only because it follows optional query params; the route is authenticated.
        organizationId: callerOrgId(user!),
        status,
      }),
    );
  }

  @Get(':id/leave-balance')
  @ApiOperation({ summary: "This year's vacation allowance, taken and remaining" })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  async getLeaveBalance(
    @Param('id') id: string,
    @Query('on') on: string | undefined,
    @Query('year') year: string | undefined,
    @CurrentUser() user: SessionUser,
  ) {
    // Same rule as the list above: a manager may read anyone's, a member only
    // their own. An allowance says what someone is entitled to and how much
    // they have used, which is theirs, not the team's.
    const privileged = user?.role === Role.ADMIN || !!user?.canViewAllTasks;
    if (!privileged && user?.id !== id) {
      throw new ForbiddenException('You can only view your own leave balance');
    }
    return firstValueFrom(
      sendRpc(this.taskClient, getLeaveBalance, {
        technicianId: id,
        organizationId: callerOrgId(user!),
        // The leave year containing `on` (default today); `year` = the one starting in that year.
        on: typeof on === 'string' ? on.slice(0, 10) : undefined,
        year,
      }),
    );
  }

  @Get(':id/time-off/count')
  @ApiOperation({ summary: 'What a leave range would cost — weekends, rota rest days and holidays left out' })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  async countLeave(@Param('id') id: string, @Query() q: LeaveCountQueryDto, @CurrentUser() user: SessionUser) {
    // Your own, or somebody you manage: an admin or org-wide view reaches everyone, the rota
    // permission held in a workspace reaches that workspace's people (narrowed in the service).
    const scope = leaveReadScope(user);
    if (user?.id !== id && scope !== undefined && scope.length === 0)
      throw new ForbiddenException('You can only count your own leave');
    return firstValueFrom(
      sendRpc(this.taskClient, countLeaveRpc, {
        technicianId: id,
        organizationId: callerOrgId(user),
        from: q.from,
        to: q.to,
        callerId: user.id,
        scopeSpaceIds: scope,
      }),
    );
  }

  @Post(':id/time-off')
  // Creating a request needs the tab; cancelling one (DELETE below) deliberately does not.
  @RequireAccessModule('time_off')
  @ApiOperation({ summary: 'Request time off for employee' })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @ApiResponse({ status: 201, description: 'Time-off request created' })
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  async requestTimeOff(@Param('id') id: string, @Body() body: RequestTimeOffDto, @CurrentUser() user: SessionUser) {
    // Employees can only request time off for themselves
    if (user.role === Role.EMPLOYEE && user.id !== id) {
      throw new ForbiddenException('You can only request time off for yourself');
    }

    return firstValueFrom(
      sendRpc(this.taskClient, requestTimeOff, {
        id: body.id,
        technicianId: id,
        organizationId: callerOrgId(user),
        // The request itself, as sent: task-service reads it with the shared
        // `parseRequestInput` (defaults: LEAVE, VACATION — what older clients send).
        kind: body.kind,
        startDate: body.startDate,
        endDate: body.endDate,
        reason: body.reason,
        type: body.type,
        spaceId: body.spaceId,
        startTime: body.startTime,
        endTime: body.endTime,
        minutes: body.minutes,
      }),
    );
  }
}
