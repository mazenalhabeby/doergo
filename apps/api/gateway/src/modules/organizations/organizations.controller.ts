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
import { Role } from '@doergo/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  CurrentUserData,
} from '../../common/decorators/current-user.decorator';
import { UpdateOrgSettingsDto, UpdateMemberRoleDto, ListMembersQueryDto } from './dto';

@ApiTags('organizations')
@Controller('organizations')
@ApiBearerAuth()
export class OrganizationsController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
  ) {}

  @Get('join-code')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({ summary: 'Get organization join code info (ADMIN/DISPATCHER)' })
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
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({ summary: 'List organization members (ADMIN/DISPATCHER)' })
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

  @Patch('members/:id/role')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update member role and permissions (ADMIN only)' })
  @ApiResponse({ status: 200, description: 'Member role updated' })
  async updateMemberRole(
    @Param('id') memberId: string,
    @Body() dto: UpdateMemberRoleDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'update_member_role' }, {
        memberId,
        organizationId: user.organizationId,
        requesterId: user.id,
        dto: {
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

  @Delete('members/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Remove member from organization (ADMIN only)' })
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
}
