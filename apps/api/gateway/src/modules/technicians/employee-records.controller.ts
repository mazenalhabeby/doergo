import { Controller, Get, Post, Param, Query, Body, Inject, ForbiddenException, UseInterceptors } from '@nestjs/common';
import { LabourCostInterceptor } from '../../common/interceptors/labour-cost.interceptor';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiParam } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import {
  Role,
  SERVICE_NAMES,
  CurrentUser,
  CurrentUserData,
  RequirePermissionInSpace,
  clampListLimit,
} from '@hbcfield/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermission } from '../../common/decorators';
import { scopeFor, scopeIdsFor } from '../../common/permission-scope';
import { callerOrgId } from '../../common/caller-org';
import {
  sendRpc,
  getTechnicianPerformance,
  getTechnicianTaskHistory,
  getAttendanceHistory,
  getTechnicianAssignments,
  getTechnicianSchedule,
  setTechnicianSchedule,
} from '@hbcfield/shared/microservices';

/** /employees/:id — one member's record: performance, jobs, attendance, workspaces, working week. */
@ApiTags('employees')
@ApiBearerAuth()
@UseInterceptors(LabourCostInterceptor)
@Controller('employees')
export class EmployeeRecordsController {
  constructor(@Inject(SERVICE_NAMES.TASK) private readonly taskClient: ClientProxy) {}

  // ============================================================================
  // PERFORMANCE METRICS
  // ============================================================================

  @Get(':id/performance')
  @ApiOperation({ summary: 'Get employee performance metrics' })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @ApiResponse({ status: 200, description: 'Performance metrics retrieved' })
  @ApiResponse({ status: 404, description: 'Employee not found' })
  @RequirePermissionInSpace('canViewAllTasks')
  async getEmployeePerformance(
    @Param('id') id: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @CurrentUser() user?: CurrentUserData,
  ) {
    // Route to task-service for performance metrics (task data lives there)
    return firstValueFrom(
      sendRpc(this.taskClient, getTechnicianPerformance, {
        // undefined = org-wide; [] = granted nowhere and matches nothing.
        scopeSpaceIds: scopeIdsFor(user, 'canViewAllTasks'),
        id,
        // `user` is optional only because it follows optional query params; the route is authenticated.
        organizationId: callerOrgId(user!),
        startDate,
        endDate,
      }),
    );
  }

  // ============================================================================
  // TASKS
  // ============================================================================

  @Get(':id/tasks')
  @ApiOperation({ summary: 'Get employee task history' })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @ApiResponse({ status: 200, description: 'Task history retrieved' })
  @RequirePermissionInSpace('canViewAllTasks')
  async getEmployeeTasks(
    @Param('id') id: string,
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    // Optional due-date window — used by the leave drawer to show what is
    // already booked while somebody wants to be away.
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @CurrentUser() user?: CurrentUserData,
  ) {
    // Route to task-service for task history (task data lives there)
    return firstValueFrom(
      sendRpc(this.taskClient, getTechnicianTaskHistory, {
        // undefined = org-wide; [] = granted nowhere and matches nothing.
        scopeSpaceIds: scopeIdsFor(user, 'canViewAllTasks'),
        id,
        organizationId: callerOrgId(user!),
        status,
        startDate,
        endDate,
        page: page ? Math.max(1, Number(page) || 1) : 1,
        limit: clampListLimit(limit, 20, 500),
      }),
    );
  }

  // ============================================================================
  // ATTENDANCE
  // ============================================================================

  @Get(':id/attendance')
  @ApiOperation({ summary: 'Get employee attendance history' })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @ApiResponse({ status: 200, description: 'Attendance history retrieved' })
  // Space-aware, like every other attendance read: a member whose grant comes
  // from a space role may see this history, narrowed to the spaces they hold.
  @RequirePermissionInSpace('canViewSpaceAttendance')
  async getEmployeeAttendance(
    @Param('id') id: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @CurrentUser() user?: CurrentUserData,
  ) {
    return firstValueFrom(
      sendRpc(this.taskClient, getAttendanceHistory, {
        userId: id,
        organizationId: callerOrgId(user!),
        scopeSpaceIds: scopeFor(user, 'canViewSpaceAttendance'),
        startDate,
        endDate,
      }),
    );
  }

  // ============================================================================
  // LOCATION ASSIGNMENTS
  // ============================================================================

  @Get(':id/assignments')
  @ApiOperation({ summary: 'Get employee location assignments' })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @ApiResponse({ status: 200, description: 'Assignments retrieved' })
  @RequirePermissionInSpace('canViewAllTasks')
  async getEmployeeAssignments(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return firstValueFrom(
      sendRpc(this.taskClient, getTechnicianAssignments, {
        // undefined = org-wide; [] = granted nowhere and matches nothing.
        scopeSpaceIds: scopeIdsFor(user, 'canViewAllTasks'),
        userId: id,
        organizationId: callerOrgId(user),
      }),
    );
  }

  // ============================================================================
  // SCHEDULE MANAGEMENT
  // ============================================================================

  @Get(':id/schedule')
  @ApiOperation({ summary: 'Get employee weekly schedule' })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @ApiResponse({ status: 200, description: 'Schedule retrieved' })
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  async getEmployeeSchedule(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    // Managers (EMPLOYEE + canViewAllTasks) can view any member; plain employees
    // only their own (D9 — was ADMIN-only, which locked managers out).
    const privileged = user.role === Role.ADMIN || !!user.canViewAllTasks;
    if (!privileged && user.id !== id) {
      throw new ForbiddenException('You can only view your own schedule');
    }

    return firstValueFrom(
      sendRpc(this.taskClient, getTechnicianSchedule, {
        technicianId: id,
        organizationId: callerOrgId(user),
      }),
    );
  }

  @Post(':id/schedule')
  @ApiOperation({ summary: 'Set employee weekly schedule' })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @ApiResponse({ status: 200, description: 'Schedule updated' })
  @RequirePermission('canManageRota')
  async setEmployeeSchedule(
    @Param('id') id: string,
    @Body()
    body: {
      schedule: Array<{ dayOfWeek: number; startTime: string; endTime: string; isActive?: boolean; notes?: string }>;
    },
    @CurrentUser() user: CurrentUserData,
  ) {
    return firstValueFrom(
      sendRpc(this.taskClient, setTechnicianSchedule, {
        technicianId: id,
        organizationId: callerOrgId(user),
        requesterId: user.id,
        schedule: body.schedule,
      }),
    );
  }
}
