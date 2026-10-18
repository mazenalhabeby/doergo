import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Inject,
  HttpStatus,
  UseInterceptors,
} from '@nestjs/common';
import { RebillService } from '../../common/billing/rebill.service';
import { LabourCostInterceptor } from '../../common/interceptors/labour-cost.interceptor';
import { ClientProxy } from '@nestjs/microservices';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { OrgEventsService } from '../../common/events/org-events.service';
import { CurrentUser, CurrentUserData, assertServiceOk } from '@hbcfield/shared';
import { RequirePermission } from '../../common/decorators';
import { AuthTokenCache } from '../../common/cache/auth-token-cache.service';
import { SetMemberHomeDto, UpdateMemberDto } from './dto';
import { ChatReachLookup } from '../chat/chat-reach.lookup';
import {
  sendRpc,
  updateMemberProfile,
  getMemberWatchers,
  setMemberWatchers,
  adminResetMemberPassword,
  setMemberHome,
  removeMember,
  emitEvent,
  memberAccessUpdatedEvent,
  userRemovedEvent,
} from '@hbcfield/shared/microservices';
import type { Role } from '@hbcfield/shared';
import { callerOrgId } from '../../common/caller-org';
import type { SessionUser } from '../../common/request.types';
import { MemberWatchersDto } from './dto/org-bodies.dto';

/**
 * /organizations/members/:id — changing a member: profile, watchers, password
 * reset, home workspace, removal.
 */
@ApiTags('organizations')
@UseInterceptors(LabourCostInterceptor)
@Controller('organizations')
@ApiBearerAuth()
export class MemberManagementController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
    private readonly billing: RebillService,
    @Inject('NOTIFICATION_SERVICE') private readonly notificationClient: ClientProxy,
    private readonly orgEvents: OrgEventsService,
    private readonly authCache: AuthTokenCache,
    private readonly chatReach: ChatReachLookup,
  ) {}

  @Patch('members/:id')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Update member profile, role, and permissions' })
  @ApiResponse({ status: 200, description: 'Member updated' })
  async updateMember(@Param('id') memberId: string, @Body() dto: UpdateMemberDto, @CurrentUser() user: SessionUser) {
    const result = await firstValueFrom(
      sendRpc(this.authClient, updateMemberProfile, {
        memberId,
        organizationId: callerOrgId(user),
        requesterId: user.id,
        dto: {
          email: dto.email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          position: dto.position,
          employerEntityId: dto.employerEntityId,
          // Vacation entitlement. Forwarded even when null — null means "use
          // the organization's default" and has to reach the database as a
          // clear, not be dropped as an omitted field.
          leaveAllowance: dto.leaveAllowance,
          employmentStartDate: dto.employmentStartDate,
          scheduleType: dto.scheduleType,
          monthlyHourBudget: dto.monthlyHourBudget,
          // @IsEnum(['ADMIN', 'EMPLOYEE']) on the DTO: the value is a Role.
          role: dto.role as Role | undefined,
          canCreateTasks: dto.canCreateTasks,
          taskCreationScope: dto.taskCreationScope,
          canViewAllTasks: dto.canViewAllTasks,
          canAssignTasks: dto.canAssignTasks,
          canManageUsers: dto.canManageUsers,
          canViewReports: dto.canViewReports,
          memberRoleId: dto.memberRoleId,
          isExternal: dto.isExternal,
          enabledModules: dto.enabledModules,
          contactable: dto.contactable,
          contactScope: dto.contactScope,
          contactAllowedIds: dto.contactAllowedIds,
          allowRemote: dto.allowRemote,
        },
      }),
    );

    assertServiceOk(result, HttpStatus.BAD_REQUEST);

    // Purge the member's cached session so the new access profile (modules,
    // platform, scope, permissions) takes effect on their next request — no
    // logout/login required.
    await this.authCache.invalidateUser(memberId);

    // Push a live signal to the member's own sockets (web + mobile) so their
    // nav/screens re-render in place with the new access — no reload, no
    // re-login, and no waiting for the next foreground resume.
    emitEvent(this.notificationClient, memberAccessUpdatedEvent, {
      memberId,
      organizationId: user.organizationId,
    });

    // …and tell every OTHER open admin screen in the org that the roster changed,
    // so a second admin's /members tab updates in place (audit M-D2).
    this.orgEvents.memberChanged(user.organizationId, memberId, 'member.updated');

    // Access/role change may flip this member between office and field seat.
    this.billing.rebill(user.organizationId);

    return result;
  }

  @Get('members/:id/watchers')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'List who is notified about this member (per-employee routing)' })
  async getMemberWatchers(@Param('id') memberId: string, @CurrentUser() user: SessionUser) {
    return firstValueFrom(
      sendRpc(this.authClient, getMemberWatchers, {
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
    @Body() dto: MemberWatchersDto,
    @CurrentUser() user: SessionUser,
  ) {
    return firstValueFrom(
      sendRpc(this.authClient, setMemberWatchers, {
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
  async resetMemberPassword(@Param('id') memberId: string, @CurrentUser() user: SessionUser) {
    const result = await firstValueFrom(
      sendRpc(this.authClient, adminResetMemberPassword, {
        memberId,
        organizationId: user.organizationId,
        requesterId: user.id,
      }),
    );

    // The reset moved the member's session cut-off; drop their cached session
    // so the old access token is refused now, not when the cache expires.
    if (result?.success !== false) await this.authCache.invalidateUser(memberId);

    assertServiceOk(result, HttpStatus.BAD_REQUEST);

    return result;
  }

  /*
    A member's phone home screen, set up from the office. The phone applies it
    once and the member can change it afterwards. PUT with a layout sets it;
    DELETE clears it (the member keeps whatever they have).
  */
  @Put('members/:id/home')
  @RequirePermission('canManageUsers')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: "Set up a member's phone home screen (applied once, then theirs)" })
  async setMemberHome(@Param('id') memberId: string, @Body() body: SetMemberHomeDto, @CurrentUser() user: SessionUser) {
    const result = await firstValueFrom(
      sendRpc(this.authClient, setMemberHome, {
        memberId,
        organizationId: callerOrgId(user),
        layout: { widgets: body?.widgets, shortcuts: body?.shortcuts },
      }),
    );
    // Their next /auth/me carries it, not a cached copy.
    await this.authCache.invalidateUser(memberId);
    return result;
  }

  @Delete('members/:id/home')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Clear an office-set home screen' })
  async clearMemberHome(@Param('id') memberId: string, @CurrentUser() user: SessionUser) {
    const result = await firstValueFrom(
      sendRpc(this.authClient, setMemberHome, { memberId, organizationId: callerOrgId(user), layout: null }),
    );
    await this.authCache.invalidateUser(memberId);
    return result;
  }

  @Delete('members/:id')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Remove member from organization' })
  @ApiResponse({ status: 200, description: 'Member removed' })
  async removeMember(@Param('id') memberId: string, @CurrentUser() user: SessionUser) {
    const result = await firstValueFrom(
      sendRpc(this.authClient, removeMember, {
        memberId,
        organizationId: user.organizationId,
        requesterId: user.id,
      }),
    );

    assertServiceOk(result, HttpStatus.BAD_REQUEST);

    // Drop the removed user's cached session so their access token stops passing
    // the guard chain immediately, not after the cache TTL. (Sec audit H6.)
    await this.authCache.invalidateUser(memberId);

    // Force-disconnect removed user's active socket connections
    emitEvent(this.notificationClient, userRemovedEvent, {
      userId: memberId,
      organizationId: user.organizationId,
    });

    // Refresh every open admin screen in the org (audit M-D2).
    this.orgEvents.memberChanged(user.organizationId, memberId, 'member.removed');

    this.billing.rebill(user.organizationId);

    return result;
  }
}
