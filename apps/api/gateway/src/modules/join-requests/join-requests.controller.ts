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
import { Role } from '@doergo/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  CurrentUserData,
} from '../../common/decorators/current-user.decorator';
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
  ) {}

  @Get()
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({ summary: 'List join requests for organization (ADMIN/DISPATCHER)' })
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
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({ summary: 'Approve join request with role assignment (ADMIN/DISPATCHER)' })
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

    return result;
  }

  @Patch(':id/reject')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({ summary: 'Reject join request (ADMIN/DISPATCHER)' })
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

    return result;
  }
}
