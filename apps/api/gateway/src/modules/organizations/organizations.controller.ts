import { Controller, Get, Post, Patch, Body, Inject, HttpStatus, UseInterceptors } from '@nestjs/common';
import { RebillService } from '../../common/billing/rebill.service';
import { LabourCostInterceptor } from '../../common/interceptors/labour-cost.interceptor';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { OrgEventsService } from '../../common/events/org-events.service';
import { Role, CurrentUser, CurrentUserData, assertServiceOk, type LeavePolicyInput } from '@hbcfield/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermission } from '../../common/decorators';
import { AuthTokenCache } from '../../common/cache/auth-token-cache.service';
import {
  UpdateOrgSettingsDto,
  UpdateOrgProfileDto,
  UpdateNotificationPrefsDto,
  UpdateSecuritySettingsDto,
} from './dto';
import { ChatReachLookup } from '../chat/chat-reach.lookup';
import {
  sendRpc,
  onboardingGetJoinCode,
  onboardingRegenerateJoinCode,
  onboardingUpdateLeavePolicy,
  onboardingUpdateJoinPolicy,
  getProfileBadges,
  updateProfileBadges,
  getOrgProfile,
  updateOrgProfile,
  updateOrgNotificationPrefs,
  updateSecuritySettings,
} from '@hbcfield/shared/microservices';
import { callerOrgId } from '../../common/caller-org';

@ApiTags('organizations')
@UseInterceptors(LabourCostInterceptor)
@Controller('organizations')
@ApiBearerAuth()
export class OrganizationsController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
    private readonly billing: RebillService,
    @Inject('NOTIFICATION_SERVICE') private readonly notificationClient: ClientProxy,
    private readonly orgEvents: OrgEventsService,
    private readonly authCache: AuthTokenCache,
    private readonly chatReach: ChatReachLookup,
  ) {}

  @Get('join-code')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Get organization join code info' })
  @ApiResponse({ status: 200, description: 'Join code info' })
  async getJoinCode(@CurrentUser() user: CurrentUserData) {
    return firstValueFrom(
      sendRpc(this.authClient, onboardingGetJoinCode, {
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
      sendRpc(this.authClient, onboardingRegenerateJoinCode, {
        organizationId: user.organizationId,
      }),
    );

    assertServiceOk(result, HttpStatus.INTERNAL_SERVER_ERROR);

    return result;
  }

  @Patch('leave-policy')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary:
      "The organization's leave policy: annual days, leave year, carry-over, " +
      'when HBCField started counting (ADMIN only)',
  })
  async updateLeavePolicy(@Body() dto: LeavePolicyInput, @CurrentUser() user: CurrentUserData) {
    const result = await firstValueFrom(
      sendRpc(this.authClient, onboardingUpdateLeavePolicy, {
        organizationId: callerOrgId(user),
        // Read in auth-service with the shared parseLeavePolicy; only the known fields travel.
        policy: {
          defaultLeaveAllowance: dto?.defaultLeaveAllowance,
          leaveYearMode: dto?.leaveYearMode,
          carryOverMode: dto?.carryOverMode,
          carryOverMaxDays: dto?.carryOverMaxDays,
          carryExpiresAfterMonths: dto?.carryExpiresAfterMonths,
          leaveTrackingStartedOn: dto?.leaveTrackingStartedOn,
        },
      }),
    );
    assertServiceOk(result, HttpStatus.INTERNAL_SERVER_ERROR);
    return result;
  }

  @Patch('settings')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update organization settings (ADMIN only)' })
  @ApiResponse({ status: 200, description: 'Settings updated' })
  async updateSettings(@Body() dto: UpdateOrgSettingsDto, @CurrentUser() user: CurrentUserData) {
    const result = await firstValueFrom(
      sendRpc(this.authClient, onboardingUpdateJoinPolicy, {
        organizationId: user.organizationId,
        joinPolicy: dto.joinPolicy,
      }),
    );

    assertServiceOk(result, HttpStatus.INTERNAL_SERVER_ERROR);

    return result;
  }

  // ========== Profile Badges ==========

  @Get('profile-badges')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get org profile badge visibility config' })
  async getProfileBadges(@CurrentUser() user: CurrentUserData) {
    return firstValueFrom(sendRpc(this.authClient, getProfileBadges, { organizationId: user.organizationId }));
  }

  @Patch('profile-badges')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update org profile badge visibility config' })
  async updateProfileBadges(
    @Body() body: { showRole: boolean; showSpecialty: boolean },
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await firstValueFrom(
      sendRpc(this.authClient, updateProfileBadges, {
        organizationId: callerOrgId(user),
        profileBadges: body,
      }),
    );

    assertServiceOk(result, HttpStatus.BAD_REQUEST);

    return result;
  }

  // ========== Organization Profile ==========

  @Get('profile')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get organization profile and all settings' })
  async getOrgProfile(@CurrentUser() user: CurrentUserData) {
    return firstValueFrom(sendRpc(this.authClient, getOrgProfile, { organizationId: user.organizationId }));
  }

  @Patch('profile')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update organization profile (name, industry, address, etc.)' })
  async updateOrgProfile(@Body() dto: UpdateOrgProfileDto, @CurrentUser() user: CurrentUserData) {
    const result = await firstValueFrom(
      sendRpc(this.authClient, updateOrgProfile, {
        organizationId: callerOrgId(user),
        updates: dto,
      }),
    );

    assertServiceOk(result, HttpStatus.BAD_REQUEST);

    // The currency rides on every session (orgCurrency); drop the cached ones so
    // screens read the new one on their next request, not a minute later.
    if ((dto as any).currency !== undefined) {
      await this.authCache.invalidateOrganization(user.organizationId!).catch(() => undefined);
    }

    // Toggling the in-house/external capability (or changing industry, which can
    // re-default it) changes how field seats are classified → re-sync to Stripe.
    if ((dto as any).usesExternalWorkers !== undefined || (dto as any).industry !== undefined) {
      this.billing.rebill(user.organizationId);
    }

    return result;
  }

  @Patch('notification-prefs')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update org notification preferences' })
  async updateNotificationPrefs(@Body() dto: UpdateNotificationPrefsDto, @CurrentUser() user: CurrentUserData) {
    const result = await firstValueFrom(
      sendRpc(this.authClient, updateOrgNotificationPrefs, {
        organizationId: callerOrgId(user),
        prefs: dto,
      }),
    );

    assertServiceOk(result, HttpStatus.BAD_REQUEST);

    return result;
  }

  @Patch('security-settings')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update org security settings' })
  async updateSecuritySettings(@Body() dto: UpdateSecuritySettingsDto, @CurrentUser() user: CurrentUserData) {
    const result = await firstValueFrom(
      sendRpc(this.authClient, updateSecuritySettings, {
        organizationId: callerOrgId(user),
        settings: dto,
      }),
    );

    assertServiceOk(result, HttpStatus.BAD_REQUEST);

    return result;
  }
}
