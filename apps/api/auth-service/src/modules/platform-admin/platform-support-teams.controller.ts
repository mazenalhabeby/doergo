import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { PlatformSupportTeamsService } from './platform-support-teams.service';

@Controller()
export class PlatformSupportTeamsController {
  constructor(private readonly svc: PlatformSupportTeamsService) {}

  @MessagePattern({ cmd: 'platform_support_staff_list' })
  listStaff() { return this.svc.listStaff(); }

  @MessagePattern({ cmd: 'platform_support_teams_list' })
  listTeams() { return this.svc.listTeams(); }

  @MessagePattern({ cmd: 'platform_support_team_create' })
  createTeam(@Payload() d: any) { return this.svc.createTeam(d); }

  @MessagePattern({ cmd: 'platform_support_team_update' })
  updateTeam(@Payload() d: any) { return this.svc.updateTeam(d); }

  @MessagePattern({ cmd: 'platform_support_team_delete' })
  deleteTeam(@Payload() d: any) { return this.svc.deleteTeam(d); }

  @MessagePattern({ cmd: 'platform_support_team_add_member' })
  addMember(@Payload() d: any) { return this.svc.addMember(d); }

  @MessagePattern({ cmd: 'platform_support_team_remove_member' })
  removeMember(@Payload() d: any) { return this.svc.removeMember(d); }

  @MessagePattern({ cmd: 'platform_support_rule_upsert' })
  upsertRule(@Payload() d: any) { return this.svc.upsertRule(d); }

  @MessagePattern({ cmd: 'platform_support_rule_delete' })
  deleteRule(@Payload() d: any) { return this.svc.deleteRule(d); }

  @MessagePattern({ cmd: 'platform_support_pin_org' })
  pinOrg(@Payload() d: any) { return this.svc.pinOrg(d); }

  @MessagePattern({ cmd: 'platform_support_team_pinned_orgs' })
  listPinnedOrgs(@Payload() d: any) { return this.svc.listPinnedOrgs(d); }
}
