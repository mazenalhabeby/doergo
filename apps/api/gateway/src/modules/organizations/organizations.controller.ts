import {
  Controller,
  Get,
  Post,
  Patch,
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
import { Role, CurrentUser, CurrentUserData } from '@hbcfield/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermission } from '../../common/decorators';
import { UpdateOrgSettingsDto, UpdateMemberDto, ListMembersQueryDto } from './dto';

@ApiTags('organizations')
@Controller('organizations')
@ApiBearerAuth()
export class OrganizationsController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
  ) {}

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
          role: dto.role,
          platform: dto.platform,
          canCreateTasks: dto.canCreateTasks,
          canViewAllTasks: dto.canViewAllTasks,
          canAssignTasks: dto.canAssignTasks,
          canManageUsers: dto.canManageUsers,
        },
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
    @Body() body: { showRole: boolean; showType: boolean; showSpecialty: boolean },
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
    @Body() body: Record<string, any>,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'update_org_profile' }, {
        organizationId: user.organizationId,
        updates: body,
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
    @Body() body: Record<string, any>,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'update_notification_prefs' }, {
        organizationId: user.organizationId,
        prefs: body,
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
    @Body() body: Record<string, any>,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'update_security_settings' }, {
        organizationId: user.organizationId,
        settings: body,
      }),
    );

    if (result && result.success === false) {
      throw new HttpException({ message: result.message }, result.statusCode || HttpStatus.BAD_REQUEST);
    }

    return result;
  }
}
