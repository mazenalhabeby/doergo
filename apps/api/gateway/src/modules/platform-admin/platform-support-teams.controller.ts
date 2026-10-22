import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards, UseInterceptors } from '@nestjs/common';
import { assertServiceOk } from '@hbcfield/shared';
import { Public } from '../../common/decorators';
import { PlatformAuditInterceptor } from '../../common/interceptors/platform-audit.interceptor';
import { PlatformAuthGuard, RequirePlatformPerm } from '../../common/guards/platform-auth.guard';
import {
  SupportTeamCreateDto,
  SupportTeamUpdateDto,
  SupportTeamMemberDto,
  SupportRuleDto,
  PinOrgDto,
} from './dto/platform-bodies.dto';
import { PlatformSupportTeamsService } from './platform-support-teams.service';

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
  private unwrap<T>(r: unknown): T {
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
  async create(@Body() body: SupportTeamCreateDto) {
    return this.unwrap(await this.svc.createTeam(body));
  }

  @Put(':teamId')
  async update(@Param('teamId') teamId: string, @Body() body: SupportTeamUpdateDto) {
    return this.unwrap(await this.svc.updateTeam({ ...body, teamId }));
  }

  @Delete(':teamId')
  async remove(@Param('teamId') teamId: string) {
    return this.unwrap(await this.svc.deleteTeam({ teamId }));
  }

  @Post(':teamId/members')
  async addMember(@Param('teamId') teamId: string, @Body() body: SupportTeamMemberDto) {
    return this.unwrap(await this.svc.addMember({ ...body, teamId }));
  }

  @Delete(':teamId/members/:platformUserId')
  async removeMember(@Param('teamId') teamId: string, @Param('platformUserId') platformUserId: string) {
    return this.unwrap(await this.svc.removeMember({ teamId, platformUserId }));
  }

  @Post(':teamId/rules')
  async upsertRule(@Param('teamId') teamId: string, @Body() body: SupportRuleDto) {
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
  async pinOrg(@Body() body: PinOrgDto) {
    return this.unwrap(await this.svc.pinOrg(body));
  }
}
