import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards, UseInterceptors } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService, assertServiceOk } from '@hbcfield/shared';
import { Public } from '../../common/decorators';
import { PlatformAuditInterceptor } from '../../common/interceptors/platform-audit.interceptor';
import { PlatformAuthGuard, RequirePlatformPerm } from '../../common/guards/platform-auth.guard';
import {
  platformSupportStaffList,
  platformSupportTeamsList,
  platformSupportTeamCreate,
  platformSupportTeamUpdate,
  platformSupportTeamDelete,
  platformSupportTeamAddMember,
  platformSupportTeamRemoveMember,
  platformSupportRuleUpsert,
  platformSupportRuleDelete,
  platformSupportPinOrg,
  platformSupportTeamPinnedOrgs,
} from '@hbcfield/shared/microservices';

/** Gateway → auth-service proxy for support-team administration. */
@Injectable()
export class PlatformSupportTeamsService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.AUTH) authClient: ClientProxy) {
    super(authClient, PlatformSupportTeamsService.name);
  }
  listStaff() {
    return this.call(platformSupportStaffList, {});
  }
  listTeams() {
    return this.call(platformSupportTeamsList, {});
  }
  createTeam(d: any) {
    return this.call(platformSupportTeamCreate, d);
  }
  updateTeam(d: any) {
    return this.call(platformSupportTeamUpdate, d);
  }
  deleteTeam(d: any) {
    return this.call(platformSupportTeamDelete, d);
  }
  addMember(d: any) {
    return this.call(platformSupportTeamAddMember, d);
  }
  removeMember(d: any) {
    return this.call(platformSupportTeamRemoveMember, d);
  }
  upsertRule(d: any) {
    return this.call(platformSupportRuleUpsert, d);
  }
  deleteRule(d: any) {
    return this.call(platformSupportRuleDelete, d);
  }
  pinOrg(d: any) {
    return this.call(platformSupportPinOrg, d);
  }
  pinnedOrgs(d: any) {
    return this.call(platformSupportTeamPinnedOrgs, d);
  }
}

/**
 * Support Teams admin — create teams, define routing rules, pin orgs, manage
 * members. Gated by the platform login + `manageSupportTeams` (Owner/Controller).
 */
@Controller('platform/support/teams')
@Public()
@UseGuards(PlatformAuthGuard)
@UseInterceptors(PlatformAuditInterceptor)
@RequirePlatformPerm('manageSupportTeams')
export class PlatformSupportTeamsController {
  constructor(private readonly svc: PlatformSupportTeamsService) {}
  private unwrap<T>(r: any): T {
    return assertServiceOk(r) as T;
  }

  @Get('staff')
  async staff() {
    return this.unwrap(await this.svc.listStaff());
  }

  @Get()
  async list() {
    return this.unwrap(await this.svc.listTeams());
  }

  @Post()
  async create(@Body() body: any) {
    return this.unwrap(await this.svc.createTeam(body));
  }

  @Put(':teamId')
  async update(@Param('teamId') teamId: string, @Body() body: any) {
    return this.unwrap(await this.svc.updateTeam({ ...body, teamId }));
  }

  @Delete(':teamId')
  async remove(@Param('teamId') teamId: string) {
    return this.unwrap(await this.svc.deleteTeam({ teamId }));
  }

  @Post(':teamId/members')
  async addMember(
    @Param('teamId') teamId: string,
    @Body() body: { platformUserId: string; teamRole?: 'MANAGER' | 'AGENT' },
  ) {
    return this.unwrap(await this.svc.addMember({ ...body, teamId }));
  }

  @Delete(':teamId/members/:platformUserId')
  async removeMember(@Param('teamId') teamId: string, @Param('platformUserId') platformUserId: string) {
    return this.unwrap(await this.svc.removeMember({ teamId, platformUserId }));
  }

  @Post(':teamId/rules')
  async upsertRule(@Param('teamId') teamId: string, @Body() body: any) {
    return this.unwrap(await this.svc.upsertRule({ ...body, teamId }));
  }

  @Delete('rules/:ruleId')
  async deleteRule(@Param('ruleId') ruleId: string) {
    return this.unwrap(await this.svc.deleteRule({ ruleId }));
  }

  @Get(':teamId/pinned-orgs')
  async pinnedOrgs(@Param('teamId') teamId: string) {
    return this.unwrap(await this.svc.pinnedOrgs({ teamId }));
  }

  @Post('pin-org')
  async pinOrg(@Body() body: { organizationId: string; teamId: string | null }) {
    return this.unwrap(await this.svc.pinOrg(body));
  }
}
