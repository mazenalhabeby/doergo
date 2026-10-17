import { Controller, Get, Post, Delete, Body, Param, Inject, HttpStatus } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiParam } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { firstValueFrom } from 'rxjs';
import { SkipOnboardingCheck, CurrentUser, CurrentUserData, assertServiceOk } from '@hbcfield/shared';
import { AuthTokenCache } from '../../common/cache/auth-token-cache.service';
import { CreateOrganizationDto, SubmitJoinRequestDto, AcceptInvitationExistingUserDto } from './dto';
import {
  sendRpc,
  onboardingCreateOrg,
  onboardingValidateOrgCode,
  onboardingSubmitJoinRequest,
  onboardingAcceptInvitationExisting,
  onboardingGetStatus,
  onboardingCancelJoinRequest,
} from '@hbcfield/shared/microservices';
import type { SessionUser } from '../../common/request.types';

@ApiTags('onboarding')
@Controller('onboarding')
@SkipOnboardingCheck()
export class OnboardingController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
    private readonly authCache: AuthTokenCache,
  ) {}

  @Post('create-org')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Create organization (Path A - onboarding)' })
  @ApiResponse({ status: 201, description: 'Organization created' })
  @ApiResponse({ status: 400, description: 'Already onboarded or has org' })
  async createOrganization(@Body() dto: CreateOrganizationDto, @CurrentUser() user: SessionUser) {
    const result = await firstValueFrom(
      sendRpc(this.authClient, onboardingCreateOrg, {
        ...dto,
        userId: user.id,
      }),
    );

    assertServiceOk(result, HttpStatus.INTERNAL_SERVER_ERROR);

    // Onboarding just completed — drop the cached (pre-onboarding) user so the
    // next /auth/me reflects the new org + onboardingCompleted immediately.
    await this.authCache.invalidateUser(user.id);
    return result;
  }

  @Get('validate-org-code/:code')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Validate organization join code (Path B)' })
  @ApiParam({ name: 'code', description: 'Organization join code' })
  @ApiResponse({ status: 200, description: 'Validation result' })
  async validateOrgCode(@Param('code') code: string) {
    return firstValueFrom(sendRpc(this.authClient, onboardingValidateOrgCode, { code }));
  }

  @Post('join-by-code')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Submit join request to organization (Path B)' })
  @ApiResponse({ status: 201, description: 'Join request submitted' })
  @ApiResponse({ status: 400, description: 'Invalid code or already onboarded' })
  @ApiResponse({ status: 409, description: 'Already have pending request to this org' })
  async submitJoinRequest(@Body() dto: SubmitJoinRequestDto, @CurrentUser() user: SessionUser) {
    const result = await firstValueFrom(
      sendRpc(this.authClient, onboardingSubmitJoinRequest, {
        ...dto,
        userId: user.id,
      }),
    );

    assertServiceOk(result, HttpStatus.INTERNAL_SERVER_ERROR);

    // An OPEN join policy auto-approves and completes onboarding immediately —
    // drop the cached (pre-onboarding) user so the next /auth/me reflects the
    // new org + onboardingCompleted right away (mirrors create-org / accept-invite).
    if (result?.data?.autoApproved) {
      await this.authCache.invalidateUser(user.id);
    }

    return result;
  }

  @Post('accept-invitation')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Accept invitation as existing user (Path C)' })
  @ApiResponse({ status: 200, description: 'Invitation accepted, user joined org' })
  @ApiResponse({ status: 400, description: 'Invalid/expired invitation or already onboarded' })
  async acceptInvitation(@Body() dto: AcceptInvitationExistingUserDto, @CurrentUser() user: SessionUser) {
    const result = await firstValueFrom(
      sendRpc(this.authClient, onboardingAcceptInvitationExisting, {
        userId: user.id,
        code: dto.code,
      }),
    );

    assertServiceOk(result, HttpStatus.INTERNAL_SERVER_ERROR);

    // Onboarding just completed — drop the cached (pre-onboarding) user so the
    // next /auth/me reflects the new org + onboardingCompleted immediately.
    await this.authCache.invalidateUser(user.id);
    return result;
  }

  @Get('status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get onboarding status' })
  @ApiResponse({ status: 200, description: 'Onboarding status' })
  async getStatus(@CurrentUser() user: SessionUser) {
    return firstValueFrom(sendRpc(this.authClient, onboardingGetStatus, { userId: user.id }));
  }

  @Delete('join-requests/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel own join request' })
  @ApiParam({ name: 'id', description: 'Join request ID' })
  @ApiResponse({ status: 200, description: 'Join request canceled' })
  @ApiResponse({ status: 404, description: 'Join request not found' })
  async cancelJoinRequest(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    const result = await firstValueFrom(
      sendRpc(this.authClient, onboardingCancelJoinRequest, {
        requestId: id,
        userId: user.id,
      }),
    );

    assertServiceOk(result, HttpStatus.INTERNAL_SERVER_ERROR);

    return result;
  }
}
