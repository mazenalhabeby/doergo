import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Inject,
  HttpException,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { firstValueFrom } from 'rxjs';
import { CurrentUser, CurrentUserData } from '@hbcfield/shared';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Public, RequirePermission } from '../../common/decorators';
import { MemberEventsService } from '../../common/events/member-events.service';
import {
  CreateInvitationDto,
  AcceptInvitationDto,
  ListInvitationsDto,
} from './dto';

@ApiTags('invitations')
@Controller('invitations')
export class InvitationsController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
    @Inject('NOTIFICATION_SERVICE') private readonly notificationClient: ClientProxy,
    private readonly memberEvents: MemberEventsService,
  ) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('canManageUsers')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Create an invitation code' })
  @ApiResponse({ status: 201, description: 'Invitation created with code' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async create(
    @Body() dto: CreateInvitationDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'create_invitation' }, {
        ...dto,
        organizationId: user.organizationId,
        createdById: user.id,
        creatorRole: user.role,
      }),
    );

    if (result && result.success === false) {
      throw new HttpException(
        { message: result.message },
        result.statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // Send invitation email if email was provided
    if (dto.email && result?.data?.code) {
      this.notificationClient.emit('invitation_created', {
        recipientEmail: dto.email,
        organizationName: result.data.organization?.name || 'your organization',
        invitationCode: result.data.code,
        targetRole: dto.targetRole,
        expiresAt: result.data.expiresAt,
      });
    }

    // A pending invitation is shown on /members alongside real members, so a new
    // one must reach every open admin screen (audit M-D2).
    this.memberEvents.changed(user.organizationId, undefined, 'invitation.created');

    return result;
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'List organization invitations' })
  @ApiResponse({ status: 200, description: 'Invitations list' })
  async list(
    @Query() query: ListInvitationsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return firstValueFrom(
      this.authClient.send({ cmd: 'list_invitations' }, {
        ...query,
        organizationId: user.organizationId,
      }),
    );
  }

  @Public()
  @Get('validate/:code')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Validate an invitation code (Public)' })
  @ApiParam({ name: 'code', description: 'Invitation code to validate' })
  @ApiResponse({ status: 200, description: 'Validation result' })
  async validate(@Param('code') code: string) {
    return firstValueFrom(
      this.authClient.send({ cmd: 'validate_invitation' }, { code }),
    );
  }

  @Public()
  @Post('accept')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Accept invitation and register new account (Public)' })
  @ApiResponse({ status: 201, description: 'Account created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired code' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async accept(@Body() dto: AcceptInvitationDto) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'accept_invitation' }, dto),
    );

    if (result && result.success === false) {
      throw new HttpException(
        { message: result.message },
        result.statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return result;
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Revoke an invitation' })
  @ApiParam({ name: 'id', description: 'Invitation ID to revoke' })
  @ApiResponse({ status: 200, description: 'Invitation revoked' })
  @ApiResponse({ status: 404, description: 'Invitation not found' })
  async revoke(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'revoke_invitation' }, {
        invitationId: id,
        organizationId: user.organizationId,
        userId: user.id,
      }),
    );

    if (result && result.success === false) {
      throw new HttpException(
        { message: result.message },
        result.statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    this.memberEvents.changed(user.organizationId, undefined, 'invitation.revoked');

    return result;
  }
}
