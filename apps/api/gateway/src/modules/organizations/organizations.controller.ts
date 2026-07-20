import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Inject,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { Role, CurrentUser, CurrentUserData, minTierForFeature } from '@hbcfield/shared';
import { isFeatureEntitled } from '../../common/entitlements';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermission } from '../../common/decorators';
import { AuthTokenCache } from '../../common/cache/auth-token-cache.service';
import { UpdateOrgSettingsDto, UpdateMemberDto, ListMembersQueryDto, UpdateOrgProfileDto, UpdateNotificationPrefsDto, UpdateSecuritySettingsDto } from './dto';

@ApiTags('organizations')
@Controller('organizations')
@ApiBearerAuth()
export class OrganizationsController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
    @Inject('NOTIFICATION_SERVICE') private readonly notificationClient: ClientProxy,
    private readonly authCache: AuthTokenCache,
  ) {}

  /** Fire-and-forget: re-sync billable seat counts to Stripe after a member change. */
  private syncSeats(organizationId: string | null | undefined) {
    if (!organizationId) return;
    firstValueFrom(this.authClient.send({ cmd: 'billing_reconcile_seats' }, { organizationId })).catch(() => {});
  }

  @Get('join-code')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Get organization join code info' })
  @ApiResponse({ status: 200, description: 'Join code info' })
  async getJoinCode(@CurrentUser() user: CurrentUserData) {
    return firstValueFrom(
      this.authClient.send({ cmd: 'onboarding_get_join_code' }, {
        organizationId: user.organizationId,
      }),
    );
  }

  @Post('regenerate-join-code')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Regenerate organization join code (ADMIN only)' })
  @ApiResponse({ status: 200, description: 'New join code generated' })
  async regenerateJoinCode(@CurrentUser() user: CurrentUserData) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'onboarding_regenerate_join_code' }, {
        organizationId: user.organizationId,
      }),
    );

    if (result && result.success === false) {
      throw new HttpException(
        { message: result.message },
        result.statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return result;
  }

  @Patch('settings')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update organization settings (ADMIN only)' })
  @ApiResponse({ status: 200, description: 'Settings updated' })
  async updateSettings(
    @Body() dto: UpdateOrgSettingsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'onboarding_update_join_policy' }, {
        organizationId: user.organizationId,
        joinPolicy: dto.joinPolicy,
      }),
    );

    if (result && result.success === false) {
      throw new HttpException(
        { message: result.message },
        result.statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return result;
  }

  // ============================================================================
  // MEMBERS
  // ============================================================================

  @Get('members')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'List organization members' })
  @ApiResponse({ status: 200, description: 'Members list' })
  async listMembers(
    @Query() query: ListMembersQueryDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'list_org_members' }, {
        organizationId: user.organizationId,
        search: query.search,
        role: query.role,
        page: query.page ? Number(query.page) : undefined,
        limit: query.limit ? Number(query.limit) : undefined,
      }),
    );

    if (result && result.success === false) {
      throw new HttpException(
        { message: result.message },
        result.statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return result;
  }

  @Get('contacts')
  @ApiOperation({ summary: 'List the org admins/managers to contact — any org member' })
  @ApiResponse({ status: 200, description: 'Contacts list' })
  async listContacts(@CurrentUser() user: CurrentUserData) {
    return firstValueFrom(
      this.authClient.send({ cmd: 'list_org_contacts' }, {
        organizationId: user.organizationId,
        userId: user.id,
      }),
    );
  }

  @Patch('members/:id')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Update member profile, role, and permissions' })
  @ApiResponse({ status: 200, description: 'Member updated' })
  async updateMember(
    @Param('id') memberId: string,
    @Body() dto: UpdateMemberDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'update_member_profile' }, {
        memberId,
        organizationId: user.organizationId,
        requesterId: user.id,
        dto: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          position: dto.position,
          scheduleType: dto.scheduleType,
          monthlyHourBudget: dto.monthlyHourBudget,
          role: dto.role,
          canCreateTasks: dto.canCreateTasks,
          taskCreationScope: dto.taskCreationScope,
          canViewAllTasks: dto.canViewAllTasks,
          canAssignTasks: dto.canAssignTasks,
          canManageUsers: dto.canManageUsers,
          canViewReports: dto.canViewReports,
          enabledModules: dto.enabledModules,
          contactable: dto.contactable,
          contactScope: dto.contactScope,
          contactAllowedIds: dto.contactAllowedIds,
          showInManagement: dto.showInManagement,
          allowRemote: dto.allowRemote,
        },
      }),
    );

    if (result && result.success === false) {
      throw new HttpException(
        { message: result.message },
        result.statusCode || HttpStatus.BAD_REQUEST,
      );
    }

    // Purge the member's cached session so the new access profile (modules,
    // platform, scope, permissions) takes effect on their next request — no
    // logout/login required.
    await this.authCache.invalidateUser(memberId);

    // Access/role change may flip this member between office and field seat.
    this.syncSeats(user.organizationId);

    return result;
  }

  @Get('members/:id/watchers')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'List who is notified about this member (per-employee routing)' })
  async getMemberWatchers(@Param('id') memberId: string, @CurrentUser() user: CurrentUserData) {
    return firstValueFrom(
      this.authClient.send({ cmd: 'get_member_watchers' }, {
        memberId,
        organizationId: user.organizationId,
      }),
    );
  }

  @Put('members/:id/watchers')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Set who is notified about this member (empty = default space/admin routing)' })
  async setMemberWatchers(
    @Param('id') memberId: string,
    @Body() dto: { watcherIds: string[] },
    @CurrentUser() user: CurrentUserData,
  ) {
    return firstValueFrom(
      this.authClient.send({ cmd: 'set_member_watchers' }, {
        memberId,
        organizationId: user.organizationId,
        watcherIds: Array.isArray(dto?.watcherIds) ? dto.watcherIds : [],
      }),
    );
  }

  @Post('members/:id/reset-password')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Reset member password' })
  @ApiResponse({ status: 200, description: 'Temporary password generated' })
  async resetMemberPassword(
    @Param('id') memberId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'admin_reset_member_password' }, {
        memberId,
        organizationId: user.organizationId,
        requesterId: user.id,
      }),
    );

    if (result && result.success === false) {
      throw new HttpException(
        { message: result.message },
        result.statusCode || HttpStatus.BAD_REQUEST,
      );
    }

    return result;
  }

  @Delete('members/:id')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Remove member from organization' })
  @ApiResponse({ status: 200, description: 'Member removed' })
  async removeMember(
    @Param('id') memberId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'remove_member' }, {
        memberId,
        organizationId: user.organizationId,
        requesterId: user.id,
      }),
    );

    if (result && result.success === false) {
      throw new HttpException(
        { message: result.message },
        result.statusCode || HttpStatus.BAD_REQUEST,
      );
    }

    // Force-disconnect removed user's active socket connections
    this.notificationClient.emit('user_removed', {
      userId: memberId,
      organizationId: user.organizationId,
    });

    this.syncSeats(user.organizationId);

    return result;
  }

  // ========== Profile Badges ==========

  @Get('profile-badges')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get org profile badge visibility config' })
  async getProfileBadges(@CurrentUser() user: CurrentUserData) {
    return firstValueFrom(
      this.authClient.send({ cmd: 'get_profile_badges' }, { organizationId: user.organizationId }),
    );
  }

  @Patch('profile-badges')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update org profile badge visibility config' })
  async updateProfileBadges(
    @Body() body: { showRole: boolean; showSpecialty: boolean },
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'update_profile_badges' }, {
        organizationId: user.organizationId,
        profileBadges: body,
      }),
    );

    if (result && result.success === false) {
      throw new HttpException({ message: result.message }, result.statusCode || HttpStatus.BAD_REQUEST);
    }

    return result;
  }

  // ========== Organization Profile ==========

  @Get('profile')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get organization profile and all settings' })
  async getOrgProfile(@CurrentUser() user: CurrentUserData) {
    return firstValueFrom(
      this.authClient.send({ cmd: 'get_org_profile' }, { organizationId: user.organizationId }),
    );
  }

  @Patch('profile')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update organization profile (name, industry, address, etc.)' })
  async updateOrgProfile(
    @Body() dto: UpdateOrgProfileDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'update_org_profile' }, {
        organizationId: user.organizationId,
        updates: dto,
      }),
    );

    if (result && result.success === false) {
      throw new HttpException({ message: result.message }, result.statusCode || HttpStatus.BAD_REQUEST);
    }

    return result;
  }

  @Patch('notification-prefs')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update org notification preferences' })
  async updateNotificationPrefs(
    @Body() dto: UpdateNotificationPrefsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'update_notification_prefs' }, {
        organizationId: user.organizationId,
        prefs: dto,
      }),
    );

    if (result && result.success === false) {
      throw new HttpException({ message: result.message }, result.statusCode || HttpStatus.BAD_REQUEST);
    }

    return result;
  }

  @Patch('security-settings')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update org security settings' })
  async updateSecuritySettings(
    @Body() dto: UpdateSecuritySettingsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'update_security_settings' }, {
        organizationId: user.organizationId,
        settings: dto,
      }),
    );

    if (result && result.success === false) {
      throw new HttpException({ message: result.message }, result.statusCode || HttpStatus.BAD_REQUEST);
    }

    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // AUDIT LOGS
  // ═══════════════════════════════════════════════════════════════════════

  @Get('audit-logs')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get organization audit logs (ADMIN only)' })
  async getAuditLogs(
    @Query() query: {
      eventType?: string;
      userId?: string;
      resourceType?: string;
      startDate?: string;
      endDate?: string;
      page?: string;
      limit?: string;
    },
    @CurrentUser() user: CurrentUserData,
  ) {
    // audit_log is a Business capability. This is a READ (guards pass reads by
    // design), so gate the premium data here explicitly.
    if (!isFeatureEntitled(user as any, 'audit_log')) {
      throw new HttpException(
        {
          statusCode: HttpStatus.PAYMENT_REQUIRED,
          message: 'The "audit_log" feature is not available on your plan.',
          error: 'PlanUpgradeRequired',
          feature: 'audit_log',
          requiredTier: minTierForFeature('audit_log'),
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    return firstValueFrom(
      this.authClient.send({ cmd: 'audit_log_list' }, {
        organizationId: user.organizationId,
        eventType: query.eventType,
        userId: query.userId,
        resourceType: query.resourceType,
        startDate: query.startDate,
        endDate: query.endDate,
        page: query.page ? Number(query.page) : undefined,
        limit: query.limit ? Number(query.limit) : undefined,
      }),
    );
  }
}
