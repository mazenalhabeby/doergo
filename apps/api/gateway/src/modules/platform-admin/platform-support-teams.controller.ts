import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Post, Put, UseGuards } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';
import { Public } from '../../common/decorators';
import { PlatformAuthGuard, RequirePlatformPerm } from '../../common/guards/platform-auth.guard';

/** Gateway → auth-service proxy for support-team administration. */
@Injectable()
export class PlatformSupportTeamsService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.AUTH) authClient: ClientProxy) {
    super(authClient, PlatformSupportTeamsService.name);
  }
  listStaff() { return this.send({ cmd: 'platform_support_staff_list' }, {}); }
  listTeams() { return this.send({ cmd: 'platform_support_teams_list' }, {}); }
  createTeam(d: any) { return this.send({ cmd: 'platform_support_team_create' }, d); }
  updateTeam(d: any) { return this.send({ cmd: 'platform_support_team_update' }, d); }
  deleteTeam(d: any) { return this.send({ cmd: 'platform_support_team_delete' }, d); }
  addMember(d: any) { return this.send({ cmd: 'platform_support_team_add_member' }, d); }
  removeMember(d: any) { return this.send({ cmd: 'platform_support_team_remove_member' }, d); }
  upsertRule(d: any) { return this.send({ cmd: 'platform_support_rule_upsert' }, d); }
  deleteRule(d: any) { return this.send({ cmd: 'platform_support_rule_delete' }, d); }
  pinOrg(d: any) { return this.send({ cmd: 'platform_support_pin_org' }, d); }
  pinnedOrgs(d: any) { return this.send({ cmd: 'platform_support_team_pinned_orgs' }, d); }
}

/**
 * Support Teams admin — create teams, define routing rules, pin orgs, manage
 * members. Gated by the platform login + `manageSupportTeams` (Owner/Controller).
 */
@Controller('platform/support/teams')
@Public()
@UseGuards(PlatformAuthGuard)
@RequirePlatformPerm('manageSupportTeams')
export class PlatformSupportTeamsController {
  constructor(private readonly svc: PlatformSupportTeamsService) {}
  private unwrap<T>(r: any): T { if (r && r.success === false) throw new HttpException({ message: r.message ?? 'Error' }, r.statusCode ?? HttpStatus.BAD_REQUEST); return r; }

  @Get('staff')
  async staff() { return this.unwrap(await this.svc.listStaff()); }

  @Get()
  async list() { return this.unwrap(await this.svc.listTeams()); }

  @Post()
  async create(@Body() body: any) { return this.unwrap(await this.svc.createTeam(body)); }

  @Put(':teamId')
  async update(@Param('teamId') teamId: string, @Body() body: any) { return this.unwrap(await this.svc.updateTeam({ ...body, teamId })); }

  @Delete(':teamId')
  async remove(@Param('teamId') teamId: string) { return this.unwrap(await this.svc.deleteTeam({ teamId })); }

  @Post(':teamId/members')
  async addMember(@Param('teamId') teamId: string, @Body() body: { platformUserId: string; teamRole?: 'MANAGER' | 'AGENT' }) {
    return this.unwrap(await this.svc.addMember({ ...body, teamId }));
  }

  @Delete(':teamId/members/:platformUserId')
  async removeMember(@Param('teamId') teamId: string, @Param('platformUserId') platformUserId: string) {
    return this.unwrap(await this.svc.removeMember({ teamId, platformUserId }));
  }

  @Post(':teamId/rules')
  async upsertRule(@Param('teamId') teamId: string, @Body() body: any) { return this.unwrap(await this.svc.upsertRule({ ...body, teamId })); }

  @Delete('rules/:ruleId')
  async deleteRule(@Param('ruleId') ruleId: string) { return this.unwrap(await this.svc.deleteRule({ ruleId })); }

  @Get(':teamId/pinned-orgs')
  async pinnedOrgs(@Param('teamId') teamId: string) { return this.unwrap(await this.svc.pinnedOrgs({ teamId })); }

  @Post('pin-org')
  async pinOrg(@Body() body: { organizationId: string; teamId: string | null }) { return this.unwrap(await this.svc.pinOrg(body)); }
}
