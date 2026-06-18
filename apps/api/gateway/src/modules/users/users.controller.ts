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
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiBody, ApiConsumes } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { IsString, IsOptional, IsEmail, IsNotEmpty } from 'class-validator';
import { join } from 'path';
import { mkdir, writeFile, unlink } from 'fs/promises';
import { Role, SERVICE_NAMES, CurrentUser, CurrentUserData } from '@hbcfield/shared';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthTokenCache } from '../../common/cache/auth-token-cache.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TasksQueueService } from '../tasks/tasks.queue.service';

class RegisterPushTokenDto {
  @IsString()
  token: string;

  @IsString()
  platform: string; // 'ios' | 'android' | 'web'

  @IsString()
  @IsOptional()
  deviceId?: string;
}

class UpdateMeDto {
  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;
}

class UpdateMyEmailDto {
  @IsEmail({}, { message: 'A valid email is required' })
  newEmail: string;

  @IsString()
  @IsNotEmpty({ message: 'Current password is required' })
  currentPassword: string;
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
    private readonly tasksQueueService: TasksQueueService,
    private readonly authCache: AuthTokenCache,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  async getProfile(@CurrentUser() user: CurrentUserData) {
    return firstValueFrom(
      this.authClient.send({ cmd: 'get_profile' }, { userId: user.id }),
    );
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update your own profile (name) — any authenticated user' })
  async updateMe(@CurrentUser() user: CurrentUserData, @Body() dto: UpdateMeDto) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'update_own_profile' }, { userId: user.id, dto }),
    );
    // Drop the cached session so the new name takes effect on the next request.
    await this.authCache.invalidateUser(user.id);
    return result;
  }

  @Patch('me/email')
  @ApiOperation({ summary: 'Change your own email (requires current password)' })
  async updateMyEmail(@CurrentUser() user: CurrentUserData, @Body() dto: UpdateMyEmailDto) {
    const result = await firstValueFrom(
      this.authClient.send(
        { cmd: 'update_own_email' },
        { userId: user.id, newEmail: dto.newEmail, currentPassword: dto.currentPassword },
      ),
    );
    await this.authCache.invalidateUser(user.id);
    return result;
  }

  // =========================================================================
  // AVATAR (local file upload)
  // =========================================================================

  @Post('avatar/upload')
  @ApiOperation({ summary: 'Upload avatar image (multipart/form-data)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async avatarUpload(
    @CurrentUser() user: CurrentUserData,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('File too large (max 5MB)');
    }
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file type. Only JPEG, PNG, and WebP are allowed.');
    }

    // Save file to local uploads directory
    const uploadDir = join(process.cwd(), 'uploads', 'avatars', user.id);
    await mkdir(uploadDir, { recursive: true });

    const ext = file.originalname.split('.').pop() || 'jpg';
    const fileName = `${Date.now()}.${ext}`;
    const filePath = join(uploadDir, fileName);
    await writeFile(filePath, file.buffer);

    // Build URL path (served as static files)
    const avatarUrl = `/uploads/avatars/${user.id}/${fileName}`;

    // Update user in database
    await firstValueFrom(
      this.authClient.send(
        { cmd: 'update_avatar' },
        { userId: user.id, avatarUrl },
      ),
    );

    return { success: true, data: { avatarUrl } };
  }

  @Delete('avatar')
  @ApiOperation({ summary: 'Remove avatar from user profile and local storage' })
  async avatarRemove(@CurrentUser() user: CurrentUserData) {
    // 1. Remove from DB and get old URL
    const result: any = await firstValueFrom(
      this.authClient.send(
        { cmd: 'remove_avatar' },
        { userId: user.id },
      ),
    );

    // 2. Delete old file from local storage if exists (fire-and-forget)
    const oldUrl = result?.data?.oldAvatarUrl;
    if (oldUrl) {
      try {
        const filePath = join(process.cwd(), oldUrl);
        await unlink(filePath);
      } catch (err: any) {
        console.warn(`[AvatarRemove] Failed to delete local avatar for user ${user.id}: ${err?.message}`);
      }
    }

    return result;
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
        { token, userId: user.id },
      ),
    );
  }

  @Get('workers')
  @ApiOperation({ summary: 'Get all employees (ADMIN or MANAGER)' })
  @ApiQuery({ name: 'organizationId', required: false })
  @Roles(Role.ADMIN, Role.MANAGER)
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
    if (user.id !== id && user.role !== Role.MANAGER) {
      throw new ForbiddenException('You can only access your own profile');
    }

    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'find_user' }, { id }),
    );

    if (!result?.data) {
      throw new NotFoundException('User not found');
    }

    // DISPATCHER can only access users in their organization
    if (user.role === Role.MANAGER && result.data.organizationId !== user.organizationId) {
      throw new ForbiddenException('You can only access users in your organization');
    }

    return result;
  }

  @Get(':id/tasks')
  @ApiOperation({ summary: 'Get tasks assigned to an employee' })
  @Roles(Role.MANAGER, Role.EMPLOYEE)
  async getWorkerTasks(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    // Employees can only see their own tasks, MANAGER can see any employee's tasks in their org
    if (user.role === Role.EMPLOYEE && user.id !== id) {
      throw new ForbiddenException('You can only access your own tasks');
    }

    // For MANAGER, verify the employee is in their organization
    if (user.role === Role.MANAGER) {
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
  @Roles(Role.ADMIN, Role.MANAGER)
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
