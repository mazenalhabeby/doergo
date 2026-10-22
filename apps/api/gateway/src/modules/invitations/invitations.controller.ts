import { ServiceCalls } from '../../common/microservices/service-calls';
import { Controller, Get, Post, Delete, Body, Param, Query, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiParam } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, assertServiceOk } from '@hbcfield/shared';
import {
  createInvitation,
  validateInvitation,
  acceptInvitation,
  listInvitations,
  revokeInvitation,
} from '@hbcfield/shared/microservices';
import { Public, RequirePermission } from '../../common/decorators';
import { OrgEventsService } from '../../common/events/org-events.service';
import { callerOrgId } from '../../common/caller-org';
import { CreateInvitationDto, AcceptInvitationDto, ListInvitationsDto } from './dto';
import type { SessionUser } from '../../common/request.types';

@ApiTags('invitations')
@Controller('invitations')
export class InvitationsController {
  constructor(
    private readonly services: ServiceCalls,
    private readonly orgEvents: OrgEventsService,
  ) {}

  @Post()
  @ApiBearerAuth()
  @RequirePermission('canManageUsers')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Create an invitation code' })
  @ApiResponse({ status: 201, description: 'Invitation created with code' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async create(@Body() dto: CreateInvitationDto, @CurrentUser() user: SessionUser) {
    const result = await this.services.auth.ask(createInvitation, {
      ...dto,
      organizationId: callerOrgId(user),
      createdById: user.id,
      creatorRole: user.role,
    });

    assertServiceOk(result, HttpStatus.INTERNAL_SERVER_ERROR);

    // No invitation email from here. auth-service sends it when `email` is in
    // the payload (it has done since client invites learned to email
    // themselves), and this emit on top meant every invited person got the
    // same email twice — the second one without the inviter, so it could not
    // be written in their language either.

    // A pending invitation is shown on /members alongside real members, so a new
    // one must reach every open admin screen (audit M-D2).
    this.orgEvents.memberChanged(user.organizationId, undefined, 'invitation.created');

    return result;
  }

  @Get()
  @ApiBearerAuth()
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'List organization invitations' })
  @ApiResponse({ status: 200, description: 'Invitations list' })
  async list(@Query() query: ListInvitationsDto, @CurrentUser() user: SessionUser) {
    return this.services.auth.ask(listInvitations, {
      ...query,
      organizationId: callerOrgId(user),
    });
  }

  @Public()
  @Get('validate/:code')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Validate an invitation code (Public)' })
  @ApiParam({ name: 'code', description: 'Invitation code to validate' })
  @ApiResponse({ status: 200, description: 'Validation result' })
  async validate(@Param('code') code: string) {
    return this.services.auth.ask(validateInvitation, { code });
  }

  @Public()
  @Post('accept')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Accept invitation and register new account (Public)' })
  @ApiResponse({ status: 201, description: 'Account created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired code' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async accept(@Body() dto: AcceptInvitationDto) {
    const result = await this.services.auth.ask(acceptInvitation, dto);

    assertServiceOk(result, HttpStatus.INTERNAL_SERVER_ERROR);

    return result;
  }

  @Delete(':id')
  @ApiBearerAuth()
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Revoke an invitation' })
  @ApiParam({ name: 'id', description: 'Invitation ID to revoke' })
  @ApiResponse({ status: 200, description: 'Invitation revoked' })
  @ApiResponse({ status: 404, description: 'Invitation not found' })
  async revoke(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    const result = await this.services.auth.ask(revokeInvitation, {
      invitationId: id,
      organizationId: callerOrgId(user),
      userId: user.id,
    });

    assertServiceOk(result, HttpStatus.INTERNAL_SERVER_ERROR);

    this.orgEvents.memberChanged(user.organizationId, undefined, 'invitation.revoked');

    return result;
  }
}
