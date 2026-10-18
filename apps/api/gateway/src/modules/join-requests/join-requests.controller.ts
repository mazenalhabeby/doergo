import { Controller, Get, Patch, Body, Param, Query, Inject, HttpStatus } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiParam } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { personName, CurrentUser, assertServiceOk } from '@hbcfield/shared';
import { RequirePermission } from '../../common/decorators';
import { AuthTokenCache } from '../../common/cache/auth-token-cache.service';
import { OrgEventsService } from '../../common/events/org-events.service';
import { ListJoinRequestsDto, ApproveJoinRequestDto, RejectJoinRequestDto } from './dto';
import {
  sendRpc,
  onboardingListJoinRequests,
  onboardingApproveJoinRequest,
  onboardingRejectJoinRequest,
  emitEvent,
  joinRequestApprovedEvent,
  joinRequestRejectedEvent,
} from '@hbcfield/shared/microservices';
import { callerOrgId } from '../../common/caller-org';
import type { SessionUser } from '../../common/request.types';

@ApiTags('join-requests')
@Controller('join-requests')
@ApiBearerAuth()
export class JoinRequestsController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
    @Inject('NOTIFICATION_SERVICE') private readonly notificationClient: ClientProxy,
    private readonly orgEvents: OrgEventsService,
    private readonly authCache: AuthTokenCache,
  ) {}

  @Get()
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'List join requests for organization' })
  @ApiResponse({ status: 200, description: 'Join requests list' })
  async list(@Query() query: ListJoinRequestsDto, @CurrentUser() user: SessionUser) {
    return firstValueFrom(
      sendRpc(this.authClient, onboardingListJoinRequests, {
        ...query,
        organizationId: user.organizationId,
      }),
    );
  }

  @Patch(':id/approve')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Approve join request with role assignment' })
  @ApiParam({ name: 'id', description: 'Join request ID' })
  @ApiResponse({ status: 200, description: 'Join request approved' })
  @ApiResponse({ status: 404, description: 'Join request not found' })
  async approve(@Param('id') id: string, @Body() dto: ApproveJoinRequestDto, @CurrentUser() user: SessionUser) {
    const result = await firstValueFrom(
      sendRpc(this.authClient, onboardingApproveJoinRequest, {
        // The body first, the caller's identity after it: nothing sent can stand in for who is deciding.
        ...dto,
        requestId: id,
        organizationId: callerOrgId(user),
        approverId: user.id,
      }),
    );

    assertServiceOk(result, HttpStatus.INTERNAL_SERVER_ERROR);

    // Approved user just got an org + onboardingCompleted — drop their cached
    // (pre-approval) user so their next /auth/me lets them into the app without
    // a restart.
    if (result?.data?.userId) {
      await this.authCache.invalidateUser(result.data.userId);
    }

    // Emit notification event
    if (result?.data?.userId) {
      emitEvent(this.notificationClient, joinRequestApprovedEvent, {
        userId: result.data.userId,
        organizationId: callerOrgId(user),
        organizationName: result.data.organizationName || '',
        role: dto.role,
        approvedByName: personName(user),
      });
    }

    // An approved request adds a real member to the org — refresh /members and the
    // pending-requests list on every open admin screen (audit M-D2, M-D3).
    this.orgEvents.memberChanged(user.organizationId, result?.data?.userId, 'join_request.approved');

    return result;
  }

  @Patch(':id/reject')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Reject join request' })
  @ApiParam({ name: 'id', description: 'Join request ID' })
  @ApiResponse({ status: 200, description: 'Join request rejected' })
  @ApiResponse({ status: 404, description: 'Join request not found' })
  async reject(@Param('id') id: string, @Body() dto: RejectJoinRequestDto, @CurrentUser() user: SessionUser) {
    const result = await firstValueFrom(
      sendRpc(this.authClient, onboardingRejectJoinRequest, {
        // The body first, the caller's identity after it: nothing sent can stand in for who is deciding.
        ...dto,
        requestId: id,
        organizationId: callerOrgId(user),
        approverId: user.id,
      }),
    );

    assertServiceOk(result, HttpStatus.INTERNAL_SERVER_ERROR);

    // Emit notification event
    if (result?.data?.userId) {
      emitEvent(this.notificationClient, joinRequestRejectedEvent, {
        userId: result.data.userId,
        organizationId: callerOrgId(user),
        organizationName: result.data.organizationName || '',
        reason: dto.reason || '',
        rejectedByName: personName(user),
      });
    }

    // Two admins can be looking at the pending list at once — without this the
    // other one keeps seeing a request that is already decided, and acts on it
    // (audit A-D2). No member was added, but the LIST changed.
    this.orgEvents.memberChanged(user.organizationId, undefined, 'join_request.rejected');

    return result;
  }
}
