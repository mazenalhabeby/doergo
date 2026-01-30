import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  Inject,
  UseGuards,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiBody } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { IsString, IsOptional } from 'class-validator';
import { Role, SERVICE_NAMES } from '@doergo/shared';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, CurrentUserData } from '../../common/decorators/current-user.decorator';

class RegisterPushTokenDto {
  @IsString()
  token: string;

  @IsString()
  platform: string; // 'ios' | 'android' | 'web'

  @IsString()
  @IsOptional()
  deviceId?: string;
}

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
    @Inject(SERVICE_NAMES.TASK) private readonly taskClient: ClientProxy,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  async getProfile(@CurrentUser() user: CurrentUserData) {
    return firstValueFrom(
      this.authClient.send({ cmd: 'get_profile' }, { userId: user.id }),
    );
  }

  // =========================================================================
  // PUSH NOTIFICATIONS
  // =========================================================================

  @Post('push-token')
  @ApiOperation({ summary: 'Register a push notification token for the current user' })
  @ApiBody({ type: RegisterPushTokenDto })
  async registerPushToken(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: RegisterPushTokenDto,
  ) {
    return firstValueFrom(
      this.notificationClient.send(
        { cmd: 'register_push_token' },
        {
          userId: user.id,
          token: dto.token,
          platform: dto.platform,
          deviceId: dto.deviceId,
        },
      ),
    );
  }

  @Delete('push-token/:token')
  @ApiOperation({ summary: 'Remove a push notification token' })
  async removePushToken(
    @Param('token') token: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return firstValueFrom(
      this.notificationClient.send(
        { cmd: 'remove_push_token' },
        { token },
      ),
    );
  }

  @Get('workers')
  @ApiOperation({ summary: 'Get all technicians (CLIENT or DISPATCHER)' })
  @ApiQuery({ name: 'organizationId', required: false })
  @Roles(Role.ADMIN, Role.DISPATCHER)
  async getWorkers(
    @CurrentUser() user: CurrentUserData,
    @Query() query: Record<string, any>,
  ) {
    // Office can only see workers in their organization
    return firstValueFrom(
      this.authClient.send({ cmd: 'get_workers' }, {
        ...query,
        organizationId: user.organizationId,
      }),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    // Users can only access their own data, or DISPATCHER can access users in their org
    if (user.id !== id && user.role !== Role.DISPATCHER) {
      throw new ForbiddenException('You can only access your own profile');
    }

    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'find_user' }, { id }),
    );

    if (!result?.data) {
      throw new NotFoundException('User not found');
    }

    // DISPATCHER can only access users in their organization
    if (user.role === Role.DISPATCHER && result.data.organizationId !== user.organizationId) {
      throw new ForbiddenException('You can only access users in your organization');
    }

    return result;
  }

  @Get(':id/tasks')
  @ApiOperation({ summary: 'Get tasks assigned to a technician' })
  @Roles(Role.DISPATCHER, Role.TECHNICIAN)
  async getWorkerTasks(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    // Technicians can only see their own tasks, DISPATCHER can see any technician's tasks in their org
    if (user.role === Role.TECHNICIAN && user.id !== id) {
      throw new ForbiddenException('You can only access your own tasks');
    }

    // For DISPATCHER, verify the technician is in their organization
    if (user.role === Role.DISPATCHER) {
      const workerResult = await firstValueFrom(
        this.authClient.send({ cmd: 'find_user' }, { id }),
      );

      if (!workerResult?.data) {
        throw new NotFoundException('Worker not found');
      }

      if (workerResult.data.organizationId !== user.organizationId) {
        throw new ForbiddenException('You can only access workers in your organization');
      }
    }

    return firstValueFrom(
      this.authClient.send({ cmd: 'get_worker_tasks' }, { workerId: id }),
    );
  }

  @Get(':id/assignments')
  @ApiOperation({ summary: 'Get company location assignments for a user' })
  @Roles(Role.ADMIN, Role.DISPATCHER)
  async getUserAssignments(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    // Verify user is in the same organization
    const targetUser = await firstValueFrom(
      this.authClient.send({ cmd: 'find_user' }, { id }),
    );

    if (!targetUser?.data) {
      throw new NotFoundException('User not found');
    }

    if (targetUser.data.organizationId !== user.organizationId) {
      throw new ForbiddenException('You can only access users in your organization');
    }

    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'get_technician_assignments' },
        { userId: id, organizationId: user.organizationId },
      ),
    );
  }
}
