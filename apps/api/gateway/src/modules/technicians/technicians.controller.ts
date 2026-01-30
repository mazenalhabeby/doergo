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
} from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { Role, SERVICE_NAMES } from '@doergo/shared';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  CurrentUserData,
} from '../../common/decorators/current-user.decorator';
import {
  CreateTechnicianDto,
  UpdateTechnicianDto,
  ListTechniciansDto,
} from './dto';

@ApiTags('technicians')
@ApiBearerAuth()
@Controller('technicians')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TechniciansController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
    @Inject(SERVICE_NAMES.TASK) private readonly taskClient: ClientProxy,
  ) {}

  // ============================================================================
  // LIST & SEARCH
  // ============================================================================

  @Get()
  @ApiOperation({ summary: 'List technicians with filtering and pagination' })
  @ApiResponse({ status: 200, description: 'Technicians list retrieved' })
  @Roles(Role.ADMIN, Role.DISPATCHER)
  async listTechnicians(
    @Query() query: ListTechniciansDto,
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
  @ApiOperation({ summary: 'Get all technicians availability for a date' })
  @ApiResponse({ status: 200, description: 'Availability retrieved' })
  @Roles(Role.ADMIN, Role.DISPATCHER)
  async getAvailability(
    @Query('date') date?: string,
    @CurrentUser() user?: CurrentUserData,
  ) {
    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'get_technicians_availability' },
        {
          organizationId: user?.organizationId,
          date,
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
  @Roles(Role.ADMIN, Role.DISPATCHER)
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

  @Delete('time-off/:timeOffId')
  @ApiOperation({ summary: 'Cancel a time-off request' })
  @ApiParam({ name: 'timeOffId', description: 'Time-off request ID' })
  @ApiResponse({ status: 200, description: 'Time-off request canceled' })
  @Roles(Role.TECHNICIAN)
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
  @ApiOperation({ summary: 'Create a new technician' })
  @ApiResponse({ status: 201, description: 'Technician created' })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  @Roles(Role.ADMIN)
  async createTechnician(
    @Body() dto: CreateTechnicianDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    // Only ADMIN with canManageUsers can create technicians
    if (!user.canManageUsers) {
      throw new ForbiddenException('You do not have permission to manage users');
    }

    return firstValueFrom(
      this.authClient.send(
        { cmd: 'create_technician' },
        {
          ...dto,
          organizationId: user.organizationId,
        },
      ),
    );
  }

  // ============================================================================
  // GET DETAIL
  // ============================================================================

  @Get(':id')
  @ApiOperation({ summary: 'Get technician detail with stats' })
  @ApiParam({ name: 'id', description: 'Technician ID' })
  @ApiResponse({ status: 200, description: 'Technician detail retrieved' })
  @ApiResponse({ status: 404, description: 'Technician not found' })
  @Roles(Role.ADMIN, Role.DISPATCHER)
  async getTechnicianDetail(
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
  @ApiOperation({ summary: 'Get technician basic task stats' })
  @ApiParam({ name: 'id', description: 'Technician ID' })
  @ApiResponse({ status: 200, description: 'Stats retrieved' })
  @Roles(Role.ADMIN, Role.DISPATCHER)
  async getTechnicianStats(
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
  @ApiOperation({ summary: 'Update a technician' })
  @ApiParam({ name: 'id', description: 'Technician ID' })
  @ApiResponse({ status: 200, description: 'Technician updated' })
  @ApiResponse({ status: 404, description: 'Technician not found' })
  @Roles(Role.ADMIN)
  async updateTechnician(
    @Param('id') id: string,
    @Body() dto: UpdateTechnicianDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!user.canManageUsers) {
      throw new ForbiddenException('You do not have permission to manage users');
    }

    return firstValueFrom(
      this.authClient.send(
        { cmd: 'update_technician' },
        {
          id,
          organizationId: user.organizationId,
          dto,
        },
      ),
    );
  }

  // ============================================================================
  // DEACTIVATE (Soft Delete)
  // ============================================================================

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate a technician (soft delete)' })
  @ApiParam({ name: 'id', description: 'Technician ID' })
  @ApiResponse({ status: 200, description: 'Technician deactivated' })
  @ApiResponse({ status: 404, description: 'Technician not found' })
  @ApiResponse({
    status: 400,
    description: 'Cannot deactivate technician with active tasks',
  })
  @Roles(Role.ADMIN)
  async deactivateTechnician(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!user.canManageUsers) {
      throw new ForbiddenException('You do not have permission to manage users');
    }

    return firstValueFrom(
      this.authClient.send(
        { cmd: 'deactivate_technician' },
        {
          id,
          organizationId: user.organizationId,
        },
      ),
    );
  }

  // ============================================================================
  // PERFORMANCE METRICS
  // ============================================================================

  @Get(':id/performance')
  @ApiOperation({ summary: 'Get technician performance metrics' })
  @ApiParam({ name: 'id', description: 'Technician ID' })
  @ApiResponse({ status: 200, description: 'Performance metrics retrieved' })
  @ApiResponse({ status: 404, description: 'Technician not found' })
  @Roles(Role.ADMIN, Role.DISPATCHER)
  async getTechnicianPerformance(
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
  @ApiOperation({ summary: 'Get technician task history' })
  @ApiParam({ name: 'id', description: 'Technician ID' })
  @ApiResponse({ status: 200, description: 'Task history retrieved' })
  @Roles(Role.ADMIN, Role.DISPATCHER)
  async getTechnicianTasks(
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
          page,
          limit,
        },
      ),
    );
  }

  // ============================================================================
  // ATTENDANCE
  // ============================================================================

  @Get(':id/attendance')
  @ApiOperation({ summary: 'Get technician attendance history' })
  @ApiParam({ name: 'id', description: 'Technician ID' })
  @ApiResponse({ status: 200, description: 'Attendance history retrieved' })
  @Roles(Role.ADMIN, Role.DISPATCHER)
  async getTechnicianAttendance(
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
  @ApiOperation({ summary: 'Get technician location assignments' })
  @ApiParam({ name: 'id', description: 'Technician ID' })
  @ApiResponse({ status: 200, description: 'Assignments retrieved' })
  @Roles(Role.ADMIN, Role.DISPATCHER)
  async getTechnicianAssignments(
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
  @ApiOperation({ summary: 'Get technician weekly schedule' })
  @ApiParam({ name: 'id', description: 'Technician ID' })
  @ApiResponse({ status: 200, description: 'Schedule retrieved' })
  @Roles(Role.ADMIN, Role.DISPATCHER)
  async getTechnicianSchedule(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
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
  @ApiOperation({ summary: 'Set technician weekly schedule' })
  @ApiParam({ name: 'id', description: 'Technician ID' })
  @ApiResponse({ status: 200, description: 'Schedule updated' })
  @Roles(Role.ADMIN, Role.DISPATCHER)
  async setTechnicianSchedule(
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
  @ApiOperation({ summary: 'Get technician time-off requests' })
  @ApiParam({ name: 'id', description: 'Technician ID' })
  @ApiResponse({ status: 200, description: 'Time-off requests retrieved' })
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN)
  async getTechnicianTimeOff(
    @Param('id') id: string,
    @Query('status') status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED',
    @CurrentUser() user?: CurrentUserData,
  ) {
    // Technicians can only view their own time-off
    if (user?.role === Role.TECHNICIAN && user?.id !== id) {
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
  @ApiOperation({ summary: 'Request time off for technician' })
  @ApiParam({ name: 'id', description: 'Technician ID' })
  @ApiResponse({ status: 201, description: 'Time-off request created' })
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN)
  async requestTimeOff(
    @Param('id') id: string,
    @Body() body: { startDate: string; endDate: string; reason?: string },
    @CurrentUser() user: CurrentUserData,
  ) {
    // Technicians can only request time off for themselves
    if (user.role === Role.TECHNICIAN && user.id !== id) {
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
