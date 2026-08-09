import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Inject,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { Role, SERVICE_NAMES, CurrentUser, CurrentUserData } from '@hbcfield/shared';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermission } from '../../common/decorators';
import {
  CreateEmployeeDto,
  UpdateEmployeeDto,
  ListEmployeesDto,
} from './dto';

@ApiTags('employees')
@ApiBearerAuth()
@Controller('employees')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmployeesController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
    @Inject(SERVICE_NAMES.TASK) private readonly taskClient: ClientProxy,
  ) {}

  /** Fire-and-forget: re-sync billable seat counts to Stripe after a member change. */
  private syncSeats(organizationId: string | null | undefined) {
    if (!organizationId) return;
    firstValueFrom(this.authClient.send({ cmd: 'billing_reconcile_seats' }, { organizationId })).catch(() => {});
  }

  // ============================================================================
  // LIST & SEARCH
  // ============================================================================

  @Get()
  @ApiOperation({ summary: 'List employees with filtering and pagination' })
  @ApiResponse({ status: 200, description: 'Employees list retrieved' })
  @RequirePermission('canViewAllTasks')
  async listEmployees(
    @Query() query: ListEmployeesDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return firstValueFrom(
      this.authClient.send(
        { cmd: 'list_technicians' },
        {
          ...query,
          organizationId: user.organizationId,
        },
      ),
    );
  }

  // ============================================================================
  // AVAILABILITY (must be before /:id routes to avoid conflict)
  // ============================================================================

  @Get('availability')
  @ApiOperation({ summary: 'Get all employees availability for a date or date range' })
  @ApiResponse({ status: 200, description: 'Availability retrieved' })
  @RequirePermission('canViewAllTasks')
  async getAvailability(
    @Query('date') date?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @CurrentUser() user?: CurrentUserData,
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

    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'get_technicians_availability' },
        {
          organizationId: user?.organizationId,
          date,
          startDate,
          endDate,
        },
      ),
    );
  }

  // ============================================================================
  // ORG-WIDE TIME-OFF (must be before /:id routes to avoid conflict)
  // ============================================================================

  @Get('time-off')
  @ApiOperation({ summary: 'Get all time-off requests for the organization' })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELED'] })
  @ApiResponse({ status: 200, description: 'Time-off requests retrieved' })
  @RequirePermission('canViewAllTasks')
  async getOrgTimeOff(
    @Query('status') status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED',
    @CurrentUser() user?: CurrentUserData,
  ) {
    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'get_org_time_off' },
        {
          organizationId: user?.organizationId,
          status,
        },
      ),
    );
  }

  // ============================================================================
  // TIME-OFF APPROVAL (must be before /:id routes to avoid conflict)
  // ============================================================================

  @Patch('time-off/:timeOffId/approve')
  @ApiOperation({ summary: 'Approve or reject a time-off request' })
  @ApiParam({ name: 'timeOffId', description: 'Time-off request ID' })
  @ApiResponse({ status: 200, description: 'Time-off request processed' })
  @RequirePermission('canManageUsers')
  async approveTimeOff(
    @Param('timeOffId') timeOffId: string,
    @Body() body: { approved: boolean; rejectionReason?: string },
    @CurrentUser() user: CurrentUserData,
  ) {
    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'approve_time_off' },
        {
          timeOffId,
          organizationId: user.organizationId,
          approverId: user.id,
          approved: body.approved,
          rejectionReason: body.rejectionReason,
        },
      ),
    );
  }

  @Post('time-off/manual')
  @ApiOperation({ summary: 'Admin: add an already-approved day off for an employee' })
  @RequirePermission('canManageUsers')
  async addTimeOff(
    @Body() body: { technicianId: string; startDate: string; endDate: string; reason?: string },
    @CurrentUser() user: CurrentUserData,
  ) {
    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'add_time_off' },
        {
          editorId: user.id,
          organizationId: user.organizationId,
          technicianId: body.technicianId,
          startDate: body.startDate,
          endDate: body.endDate,
          reason: body.reason,
        },
      ),
    );
  }

  @Patch('time-off/:timeOffId')
  @ApiOperation({ summary: 'Admin: edit an existing day off (dates / reason)' })
  @ApiParam({ name: 'timeOffId', description: 'Time-off request ID' })
  @RequirePermission('canManageUsers')
  async updateTimeOff(
    @Param('timeOffId') timeOffId: string,
    @Body() body: { startDate?: string; endDate?: string; reason?: string | null },
    @CurrentUser() user: CurrentUserData,
  ) {
    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'update_time_off' },
        {
          organizationId: user.organizationId,
          timeOffId,
          startDate: body.startDate,
          endDate: body.endDate,
          reason: body.reason,
        },
      ),
    );
  }

  @Delete('time-off/:timeOffId/manage')
  @ApiOperation({ summary: 'Admin: delete a day off' })
  @ApiParam({ name: 'timeOffId', description: 'Time-off request ID' })
  @RequirePermission('canManageUsers')
  async adminDeleteTimeOff(
    @Param('timeOffId') timeOffId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'admin_delete_time_off' },
        { organizationId: user.organizationId, timeOffId },
      ),
    );
  }

  @Post('time-off/bulk-approve')
  @ApiOperation({ summary: 'Bulk approve or reject time-off requests' })
  @RequirePermission('canManageUsers')
  async bulkApproveTimeOff(
    @Body() body: { timeOffIds: string[]; approved: boolean; rejectionReason?: string },
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!body.timeOffIds || body.timeOffIds.length === 0) {
      return { success: false, message: 'No time-off IDs provided' };
    }
    if (body.timeOffIds.length > 50) {
      return { success: false, message: 'Maximum 50 requests per bulk operation' };
    }

    const results = await Promise.allSettled(
      body.timeOffIds.map(timeOffId =>
        firstValueFrom(
          this.taskClient.send(
            { cmd: 'approve_time_off' },
            {
              timeOffId,
              organizationId: user.organizationId,
              approverId: user.id,
              approved: body.approved,
              rejectionReason: body.rejectionReason,
            },
          ),
        ),
      ),
    );

    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    return {
      success: true,
      data: { succeeded, failed, total: body.timeOffIds.length },
    };
  }

  @Delete('time-off/:timeOffId')
  @ApiOperation({ summary: 'Cancel a time-off request' })
  @ApiParam({ name: 'timeOffId', description: 'Time-off request ID' })
  @ApiResponse({ status: 200, description: 'Time-off request canceled' })
  @Roles(Role.EMPLOYEE)
  async cancelTimeOff(
    @Param('timeOffId') timeOffId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'cancel_time_off' },
        {
          timeOffId,
          technicianId: user.id,
        },
      ),
    );
  }

  // ============================================================================
  // CREATE
  // ============================================================================

  @Post()
  @ApiOperation({ summary: 'Create a new employee' })
  @ApiResponse({ status: 201, description: 'Employee created' })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  @RequirePermission('canManageUsers')
  async createEmployee(
    @Body() dto: CreateEmployeeDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send(
        { cmd: 'create_technician' },
        {
          ...dto,
          organizationId: user.organizationId,
        },
      ),
    );
    this.syncSeats(user.organizationId);
    return result;
  }

  // ============================================================================
  // GET DETAIL
  // ============================================================================

  @Get(':id')
  @ApiOperation({ summary: 'Get employee detail with stats' })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @ApiResponse({ status: 200, description: 'Employee detail retrieved' })
  @ApiResponse({ status: 404, description: 'Employee not found' })
  @RequirePermission('canViewAllTasks')
  async getEmployeeDetail(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return firstValueFrom(
      this.authClient.send(
        { cmd: 'get_technician_detail' },
        {
          id,
          organizationId: user.organizationId,
        },
      ),
    );
  }

  // ============================================================================
  // STATS (Basic task stats)
  // ============================================================================

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get employee basic task stats' })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @ApiResponse({ status: 200, description: 'Stats retrieved' })
  @RequirePermission('canViewAllTasks')
  async getEmployeeStats(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    // Route to task-service for task stats (task data lives there)
    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'get_technician_stats' },
        {
          id,
          organizationId: user.organizationId,
        },
      ),
    );
  }

  // ============================================================================
  // UPDATE
  // ============================================================================

  @Patch(':id')
  @ApiOperation({ summary: 'Update an employee' })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @ApiResponse({ status: 200, description: 'Employee updated' })
  @ApiResponse({ status: 404, description: 'Employee not found' })
  @RequirePermission('canManageUsers')
  async updateEmployee(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send(
        { cmd: 'update_technician' },
        {
          id,
          organizationId: user.organizationId,
          dto,
        },
      ),
    );
    // employmentType (and access) changes can flip a member's billable seat type
    // (in-house ⇄ external field), so re-sync seats to Stripe after the edit.
    this.syncSeats(user.organizationId);
    return result;
  }

  // ============================================================================
  // DEACTIVATE (Soft Delete)
  // ============================================================================

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate an employee (soft delete)' })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @ApiResponse({ status: 200, description: 'Employee deactivated' })
  @ApiResponse({ status: 404, description: 'Employee not found' })
  @ApiResponse({
    status: 400,
    description: 'Cannot deactivate employee with active tasks',
  })
  @RequirePermission('canManageUsers')
  async deactivateEmployee(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send(
        { cmd: 'deactivate_technician' },
        {
          id,
          organizationId: user.organizationId,
        },
      ),
    );
    this.syncSeats(user.organizationId);
    return result;
  }

  // ============================================================================
  // PERFORMANCE METRICS
  // ============================================================================

  @Get(':id/performance')
  @ApiOperation({ summary: 'Get employee performance metrics' })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @ApiResponse({ status: 200, description: 'Performance metrics retrieved' })
  @ApiResponse({ status: 404, description: 'Employee not found' })
  @RequirePermission('canViewAllTasks')
  async getEmployeePerformance(
    @Param('id') id: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @CurrentUser() user?: CurrentUserData,
  ) {
    // Route to task-service for performance metrics (task data lives there)
    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'get_technician_performance' },
        {
          id,
          organizationId: user?.organizationId,
          startDate,
          endDate,
        },
      ),
    );
  }

  // ============================================================================
  // TASKS
  // ============================================================================

  @Get(':id/tasks')
  @ApiOperation({ summary: 'Get employee task history' })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @ApiResponse({ status: 200, description: 'Task history retrieved' })
  @RequirePermission('canViewAllTasks')
  async getEmployeeTasks(
    @Param('id') id: string,
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @CurrentUser() user?: CurrentUserData,
  ) {
    // Route to task-service for task history (task data lives there)
    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'get_technician_task_history' },
        {
          id,
          organizationId: user?.organizationId,
          status,
          page: page ? Math.max(1, Number(page) || 1) : 1,
          limit: Math.min(limit ? Math.max(1, Number(limit) || 20) : 20, 500),
        },
      ),
    );
  }

  // ============================================================================
  // ATTENDANCE
  // ============================================================================

  @Get(':id/attendance')
  @ApiOperation({ summary: 'Get employee attendance history' })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @ApiResponse({ status: 200, description: 'Attendance history retrieved' })
  @RequirePermission('canViewAllTasks')
  async getEmployeeAttendance(
    @Param('id') id: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @CurrentUser() user?: CurrentUserData,
  ) {
    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'get_attendance_history' },
        {
          userId: id,
          organizationId: user?.organizationId,
          startDate,
          endDate,
        },
      ),
    );
  }

  // ============================================================================
  // LOCATION ASSIGNMENTS
  // ============================================================================

  @Get(':id/assignments')
  @ApiOperation({ summary: 'Get employee location assignments' })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @ApiResponse({ status: 200, description: 'Assignments retrieved' })
  @RequirePermission('canViewAllTasks')
  async getEmployeeAssignments(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'get_technician_assignments' },
        {
          userId: id,
          organizationId: user.organizationId,
        },
      ),
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
  async getEmployeeSchedule(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    // Managers (EMPLOYEE + canViewAllTasks) can view any member; plain employees
    // only their own (D9 — was ADMIN-only, which locked managers out).
    const privileged = user.role === Role.ADMIN || !!user.canViewAllTasks;
    if (!privileged && user.id !== id) {
      throw new ForbiddenException('You can only view your own schedule');
    }

    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'get_technician_schedule' },
        {
          technicianId: id,
          organizationId: user.organizationId,
        },
      ),
    );
  }

  @Post(':id/schedule')
  @ApiOperation({ summary: 'Set employee weekly schedule' })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @ApiResponse({ status: 200, description: 'Schedule updated' })
  @RequirePermission('canManageUsers')
  async setEmployeeSchedule(
    @Param('id') id: string,
    @Body() body: { schedule: Array<{ dayOfWeek: number; startTime: string; endTime: string; isActive?: boolean; notes?: string }> },
    @CurrentUser() user: CurrentUserData,
  ) {
    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'set_technician_schedule' },
        {
          technicianId: id,
          organizationId: user.organizationId,
          requesterId: user.id,
          schedule: body.schedule,
        },
      ),
    );
  }

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
    @Query('status') status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED',
    @CurrentUser() user?: CurrentUserData,
  ) {
    // Managers (EMPLOYEE + canViewAllTasks) can view any member's time-off;
    // plain employees only their own (D9).
    const privileged = user?.role === Role.ADMIN || !!user?.canViewAllTasks;
    if (!privileged && user?.id !== id) {
      throw new ForbiddenException('You can only view your own time-off requests');
    }

    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'get_time_off' },
        {
          technicianId: id,
          organizationId: user?.organizationId,
          status,
        },
      ),
    );
  }

  @Post(':id/time-off')
  @ApiOperation({ summary: 'Request time off for employee' })
  @ApiParam({ name: 'id', description: 'Employee ID' })
  @ApiResponse({ status: 201, description: 'Time-off request created' })
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  async requestTimeOff(
    @Param('id') id: string,
    @Body() body: { startDate: string; endDate: string; reason?: string },
    @CurrentUser() user: CurrentUserData,
  ) {
    // Employees can only request time off for themselves
    if (user.role === Role.EMPLOYEE && user.id !== id) {
      throw new ForbiddenException('You can only request time off for yourself');
    }

    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'request_time_off' },
        {
          technicianId: id,
          organizationId: user.organizationId,
          startDate: body.startDate,
          endDate: body.endDate,
          reason: body.reason,
        },
      ),
    );
  }

}
