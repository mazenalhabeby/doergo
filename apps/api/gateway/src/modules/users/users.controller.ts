import { ServiceCalls } from '../../common/microservices/service-calls';
import { Controller, Get, Post, Patch, Query, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '@hbcfield/shared';
import { AuthTokenCache } from '../../common/cache/auth-token-cache.service';
import { UpdateMeDto, UpdateMyEmailDto, MarkNotificationsReadDto, UpdateMyNotificationPrefsDto } from './users.dto';
import {
  getProfile,
  updateOwnProfile,
  listNotifications,
  markNotificationsRead,
  getMyNotificationPrefs,
  updateMyNotificationPrefs,
  updateOwnEmail,
  presenceChangedEvent,
  userLocaleChangedEvent,
} from '@hbcfield/shared/microservices';
import type { SessionUser } from '../../common/request.types';

export { MarkNotificationsReadDto } from './users.dto';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(
    private readonly services: ServiceCalls,
    private readonly authCache: AuthTokenCache,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  async getProfile(@CurrentUser() user: SessionUser) {
    return this.services.auth.ask(getProfile, { userId: user.id });
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update your own profile (name) — any authenticated user' })
  async updateMe(@CurrentUser() user: SessionUser, @Body() dto: UpdateMeDto) {
    const result = await this.services.auth.ask(updateOwnProfile, { userId: user.id, dto });
    // Drop the cached session so the new name takes effect on the next request.
    await this.authCache.invalidateUser(user.id);

    // notification-service caches languages briefly; tell it so the very next
    // push is written in the one just chosen.
    if (dto.locale !== undefined) {
      this.services.notification.tell(userLocaleChangedEvent, { userId: user.id });
    }

    // Real-time: broadcast availability changes so teammates' dashboards /
    // contact lists update without a refresh.
    if (dto.presence !== undefined) {
      this.services.notification.tell(presenceChangedEvent, {
        userId: user.id,
        presence: dto.presence,
        organizationId: user.organizationId,
      });
    }
    return result;
  }

  @Get('me/notifications')
  @ApiOperation({ summary: 'Your in-app notification inbox (recent + unread count)' })
  async listNotifications(@CurrentUser() user: SessionUser, @Query('limit') limit?: string) {
    return this.services.notification.ask(listNotifications, {
      userId: user.id,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('me/notifications/read')
  @ApiOperation({ summary: 'Mark notifications read (all, or the given ids)' })
  async markNotificationsRead(@CurrentUser() user: SessionUser, @Body() dto: MarkNotificationsReadDto) {
    return this.services.notification.ask(markNotificationsRead, {
      userId: user.id,
      ids: dto?.ids,
    });
  }

  @Get('me/notification-prefs')
  @ApiOperation({ summary: 'Get your notification opt-out preferences' })
  async getNotificationPrefs(@CurrentUser() user: SessionUser) {
    return this.services.auth.ask(getMyNotificationPrefs, { userId: user.id });
  }

  @Patch('me/notification-prefs')
  @ApiOperation({ summary: 'Update your notification opt-out preferences (category → boolean)' })
  async updateNotificationPrefs(@CurrentUser() user: SessionUser, @Body() dto: UpdateMyNotificationPrefsDto) {
    return this.services.auth.ask(updateMyNotificationPrefs, {
      userId: user.id,
      prefs: dto?.prefs || {},
    });
  }

  @Patch('me/email')
  @ApiOperation({ summary: 'Change your own email (requires current password)' })
  async updateMyEmail(@CurrentUser() user: SessionUser, @Body() dto: UpdateMyEmailDto) {
    const result = await this.services.auth.ask(updateOwnEmail, {
      userId: user.id,
      newEmail: dto.newEmail,
      currentPassword: dto.currentPassword,
    });
    await this.authCache.invalidateUser(user.id);
    return result;
  }
}
