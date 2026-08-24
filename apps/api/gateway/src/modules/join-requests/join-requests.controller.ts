import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Query,
  Inject,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiParam } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { CurrentUser, CurrentUserData } from '@hbcfield/shared';
import { RequirePermission } from '../../common/decorators';
import { AuthTokenCache } from '../../common/cache/auth-token-cache.service';
import { MemberEventsService } from '../../common/events/member-events.service';
import {
  ListJoinRequestsDto,
  ApproveJoinRequestDto,
  RejectJoinRequestDto,
} from './dto';

@ApiTags('join-requests')
@Controller('join-requests')
@ApiBearerAuth()
export class JoinRequestsController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
    @Inject('NOTIFICATION_SERVICE') private readonly notificationClient: ClientProxy,
    private readonly memberEvents: MemberEventsService,
    private readonly authCache: AuthTokenCache,
  ) {}

  @Get()
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'List join requests for organization' })
  @ApiResponse({ status: 200, description: 'Join requests list' })
  async list(
    @Query() query: ListJoinRequestsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return firstValueFrom(
      this.authClient.send({ cmd: 'onboarding_list_join_requests' }, {
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
  async approve(
    @Param('id') id: string,
    @Body() dto: ApproveJoinRequestDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'onboarding_approve_join_request' }, {
        requestId: id,
        organizationId: user.organizationId,
        approverId: user.id,
        ...dto,
      }),
    );

    if (result && result.success === false) {
      throw new HttpException(
        { message: result.message },
        result.statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // Approved user just got an org + onboardingCompleted — drop their cached
    // (pre-approval) user so their next /auth/me lets them into the app without
    // a restart.
    if (result?.data?.userId) {
      await this.authCache.invalidateUser(result.data.userId);
    }

    // Emit notification event
    if (result?.data?.userId) {
      this.notificationClient.emit('join_request_approved', {
        userId: result.data.userId,
        organizationId: user.organizationId,
        organizationName: result.data.organizationName || '',
        role: dto.role,
        approvedByName: `${user.firstName} ${user.lastName}`,
      });
    }

    // An approved request adds a real member to the org — refresh /members and the
    // pending-requests list on every open admin screen (audit M-D2, M-D3).
    this.memberEvents.changed(user.organizationId, result?.data?.userId, 'join_request.approved');

    return result;
  }

  @Patch(':id/reject')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Reject join request' })
  @ApiParam({ name: 'id', description: 'Join request ID' })
  @ApiResponse({ status: 200, description: 'Join request rejected' })
  @ApiResponse({ status: 404, description: 'Join request not found' })
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectJoinRequestDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'onboarding_reject_join_request' }, {
        requestId: id,
        organizationId: user.organizationId,
        approverId: user.id,
        ...dto,
      }),
    );

    if (result && result.success === false) {
      throw new HttpException(
        { message: result.message },
        result.statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // Emit notification event
    if (result?.data?.userId) {
      this.notificationClient.emit('join_request_rejected', {
        userId: result.data.userId,
        organizationId: user.organizationId,
        organizationName: result.data.organizationName || '',
        reason: dto.reason || '',
        rejectedByName: `${user.firstName} ${user.lastName}`,
      });
    }

    return result;
  }
}
