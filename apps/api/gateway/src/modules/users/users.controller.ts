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
import { IsString, IsOptional, IsEmail, IsNotEmpty, IsIn, ValidateIf, IsBoolean } from 'class-validator';
import { join } from 'path';
import { mkdir, writeFile, unlink } from 'fs/promises';
import { Role, SERVICE_NAMES, CurrentUser, CurrentUserData, AllowCustomer } from '@hbcfield/shared';
import { RequirePermission } from '../../common/decorators';
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

  // Manual availability override; null clears it back to auto.
  @IsOptional()
  @ValidateIf((o) => o.presence !== null)
  @IsIn(['AVAILABLE', 'BUSY', 'AWAY'])
  presence?: 'AVAILABLE' | 'BUSY' | 'AWAY' | null;

  // Per-user clock display preference ("12h" | "24h"); display-only.
  @IsOptional()
  @IsIn(['12h', '24h'])
  timeFormat?: '12h' | '24h';

  // One-time welcome-tour flag; the client only ever sets this to true.
  @IsOptional()
  @IsBoolean()
  guidesSeen?: boolean;
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

    // Real-time: broadcast availability changes so teammates' dashboards /
    // contact lists update without a refresh.
    if (dto.presence !== undefined) {
      this.notificationClient.emit('presence_changed', {
        userId: user.id,
        presence: dto.presence,
        organizationId: user.organizationId,
      });
    }
    return result;
  }

  @Get('me/notifications')
  @ApiOperation({ summary: 'Your in-app notification inbox (recent + unread count)' })
  async listNotifications(
    @CurrentUser() user: CurrentUserData,
    @Query('limit') limit?: string,
  ) {
    return firstValueFrom(
      this.authClient.send({ cmd: 'list_notifications' }, {
        userId: user.id,
        limit: limit ? Number(limit) : undefined,
      }),
    );
  }

  @Post('me/notifications/read')
  @ApiOperation({ summary: 'Mark notifications read (all, or the given ids)' })
  async markNotificationsRead(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: { ids?: string[] },
  ) {
    return firstValueFrom(
      this.authClient.send({ cmd: 'mark_notifications_read' }, {
        userId: user.id,
        ids: dto?.ids,
      }),
    );
  }

  @Get('me/notification-prefs')
  @ApiOperation({ summary: 'Get your notification opt-out preferences' })
  async getNotificationPrefs(@CurrentUser() user: CurrentUserData) {
    return firstValueFrom(
      this.authClient.send({ cmd: 'get_notification_prefs' }, { userId: user.id }),
    );
  }

  @Patch('me/notification-prefs')
  @ApiOperation({ summary: 'Update your notification opt-out preferences (category → boolean)' })
  async updateNotificationPrefs(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: { prefs?: Record<string, boolean> },
  ) {
    return firstValueFrom(
      this.authClient.send({ cmd: 'update_notification_prefs' }, {
        userId: user.id,
        prefs: dto?.prefs || {},
      }),
    );
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
    // The on-disk extension is derived from the validated MIME type, NOT from
    // the client-supplied filename. `uploads/` is served by express.static, which
    // sets Content-Type from the extension — deriving it from `originalname` would
    // let an attacker upload `x.html` (with an image mimetype header) and have it
    // served as text/html → stored XSS on the app origin. (Sec audit C3.)
    const MIME_EXT: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };
    const ext = MIME_EXT[file.mimetype];
    if (!ext) {
      throw new BadRequestException('Invalid file type. Only JPEG, PNG, and WebP are allowed.');
    }

    // Save file to local uploads directory
    const uploadDir = join(process.cwd(), 'uploads', 'avatars', user.id);
    await mkdir(uploadDir, { recursive: true });

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
  @AllowCustomer() // portal customers register their device to get request-status pushes
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
  @AllowCustomer() // portal customers unregister their device on logout
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
  @RequirePermission('canViewAllTasks')
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
    // Users can access their own data; admins and members granted "view all
    // tasks" can access other users (scoped to their org below).
    const privileged = user.role === Role.ADMIN || !!user.canViewAllTasks;
    if (user.id !== id && !privileged) {
      throw new ForbiddenException('You can only access your own profile');
    }

    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'find_user' }, { id, organizationId: user.organizationId }),
    );

    if (!result?.data) {
      throw new NotFoundException('User not found');
    }

    // Tenant isolation (S1): EVERY accessor — including an org ADMIN — is limited
    // to their own organization. An org owner is not a platform superadmin, so
    // there is no legitimate cross-tenant read. (find_user is also org-scoped now.)
    if (result.data.organizationId !== user.organizationId) {
      throw new ForbiddenException('You can only access users in your organization');
    }

    return result;
  }

  @Get(':id/tasks')
  @ApiOperation({ summary: 'Get tasks assigned to an employee' })
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  async getWorkerTasks(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    // Plain workers see only their own tasks; admins and "view all tasks" members
    // can see any worker's tasks (scoped to their org).
    const privileged = user.role === Role.ADMIN || !!user.canViewAllTasks;
    if (!privileged && user.id !== id) {
      throw new ForbiddenException('You can only access your own tasks');
    }

    if (privileged && user.id !== id) {
      const workerResult = await firstValueFrom(
        this.authClient.send({ cmd: 'find_user' }, { id, organizationId: user.organizationId }),
      );

      if (!workerResult?.data) {
        throw new NotFoundException('Worker not found');
      }

      if (workerResult.data.organizationId !== user.organizationId) {
        throw new ForbiddenException('You can only access workers in your organization');
      }
    }

    return firstValueFrom(
      this.authClient.send({ cmd: 'get_worker_tasks' }, { workerId: id, organizationId: user.organizationId }),
    );
  }

  @Get(':id/assignments')
  @ApiOperation({ summary: 'Get company location assignments for a user' })
  @RequirePermission('canViewAllTasks')
  async getUserAssignments(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    // Verify user is in the same organization
    const targetUser = await firstValueFrom(
      this.authClient.send({ cmd: 'find_user' }, { id, organizationId: user.organizationId }),
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
