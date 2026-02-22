import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Inject,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiParam } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { firstValueFrom } from 'rxjs';
import { SkipOnboardingCheck } from '@doergo/shared';
import {
  CurrentUser,
  CurrentUserData,
} from '../../common/decorators/current-user.decorator';
import {
  CreateOrganizationDto,
  SubmitJoinRequestDto,
  AcceptInvitationExistingUserDto,
} from './dto';

@ApiTags('onboarding')
@Controller('onboarding')
@SkipOnboardingCheck()
export class OnboardingController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
  ) {}

  @Post('create-org')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Create organization (Path A - onboarding)' })
  @ApiResponse({ status: 201, description: 'Organization created' })
  @ApiResponse({ status: 400, description: 'Already onboarded or has org' })
  async createOrganization(
    @Body() dto: CreateOrganizationDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'onboarding_create_org' }, {
        userId: user.id,
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

  @Get('validate-org-code/:code')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Validate organization join code (Path B)' })
  @ApiParam({ name: 'code', description: 'Organization join code' })
  @ApiResponse({ status: 200, description: 'Validation result' })
  async validateOrgCode(@Param('code') code: string) {
    return firstValueFrom(
      this.authClient.send({ cmd: 'onboarding_validate_org_code' }, { code }),
    );
  }

  @Post('join-by-code')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Submit join request to organization (Path B)' })
  @ApiResponse({ status: 201, description: 'Join request submitted' })
  @ApiResponse({ status: 400, description: 'Invalid code or already onboarded' })
  @ApiResponse({ status: 409, description: 'Already have pending request to this org' })
  async submitJoinRequest(
    @Body() dto: SubmitJoinRequestDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'onboarding_submit_join_request' }, {
        userId: user.id,
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

  @Post('accept-invitation')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Accept invitation as existing user (Path C)' })
  @ApiResponse({ status: 200, description: 'Invitation accepted, user joined org' })
  @ApiResponse({ status: 400, description: 'Invalid/expired invitation or already onboarded' })
  async acceptInvitation(
    @Body() dto: AcceptInvitationExistingUserDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'onboarding_accept_invitation_existing' }, {
        userId: user.id,
        code: dto.code,
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

  @Get('status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get onboarding status' })
  @ApiResponse({ status: 200, description: 'Onboarding status' })
  async getStatus(@CurrentUser() user: CurrentUserData) {
    return firstValueFrom(
      this.authClient.send({ cmd: 'onboarding_get_status' }, { userId: user.id }),
    );
  }

  @Delete('join-requests/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel own join request' })
  @ApiParam({ name: 'id', description: 'Join request ID' })
  @ApiResponse({ status: 200, description: 'Join request canceled' })
  @ApiResponse({ status: 404, description: 'Join request not found' })
  async cancelJoinRequest(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      this.authClient.send({ cmd: 'onboarding_cancel_join_request' }, {
        requestId: id,
        userId: user.id,
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
