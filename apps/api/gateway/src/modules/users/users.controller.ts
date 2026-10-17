import { Controller, Get, Post, Patch, Query, Body, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { SERVICE_NAMES, CurrentUser, CurrentUserData } from '@hbcfield/shared';
import { AuthTokenCache } from '../../common/cache/auth-token-cache.service';
import { TasksQueueService } from '../tasks/tasks.queue.service';
import { StorageService } from '../../common/storage/storage.service';
import { UpdateMeDto, UpdateMyEmailDto, MarkNotificationsReadDto, UpdateMyNotificationPrefsDto } from './users.dto';

export { MarkNotificationsReadDto } from './users.dto';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {

  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
    @Inject(SERVICE_NAMES.TASK) private readonly taskClient: ClientProxy,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
    private readonly tasksQueueService: TasksQueueService,
    private readonly authCache: AuthTokenCache,
    private readonly storage: StorageService,
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

    // notification-service caches languages briefly; tell it so the very next
    // push is written in the one just chosen.
    if (dto.locale !== undefined) {
      this.notificationClient.emit('user_locale_changed', { userId: user.id });
    }

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
    @Body() dto: MarkNotificationsReadDto,
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
      this.authClient.send({ cmd: 'get_my_notification_prefs' }, { userId: user.id }),
    );
  }

  @Patch('me/notification-prefs')
  @ApiOperation({ summary: 'Update your notification opt-out preferences (category → boolean)' })
  async updateNotificationPrefs(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: UpdateMyNotificationPrefsDto,
  ) {
    return firstValueFrom(
      this.authClient.send({ cmd: 'update_my_notification_prefs' }, {
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
}
