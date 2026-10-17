import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { PlatformSupportTeamsService } from './platform-support-teams.service';

import {
  pattern,
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
  type RpcRequest,
} from '@hbcfield/shared/microservices';
@Controller()
export class PlatformSupportTeamsController {
  constructor(private readonly svc: PlatformSupportTeamsService) {}

  @MessagePattern(pattern(platformSupportStaffList))
  listStaff() {
    return this.svc.listStaff();
  }

  @MessagePattern(pattern(platformSupportTeamsList))
  listTeams() {
    return this.svc.listTeams();
  }

  @MessagePattern(pattern(platformSupportTeamCreate))
  createTeam(@Payload() d: RpcRequest<typeof platformSupportTeamCreate>) {
    return this.svc.createTeam(d);
  }

  @MessagePattern(pattern(platformSupportTeamUpdate))
  updateTeam(@Payload() d: RpcRequest<typeof platformSupportTeamUpdate>) {
    return this.svc.updateTeam(d);
  }

  @MessagePattern(pattern(platformSupportTeamDelete))
  deleteTeam(@Payload() d: RpcRequest<typeof platformSupportTeamDelete>) {
    return this.svc.deleteTeam(d);
  }

  @MessagePattern(pattern(platformSupportTeamAddMember))
  addMember(@Payload() d: RpcRequest<typeof platformSupportTeamAddMember>) {
    return this.svc.addMember(d);
  }

  @MessagePattern(pattern(platformSupportTeamRemoveMember))
  removeMember(@Payload() d: RpcRequest<typeof platformSupportTeamRemoveMember>) {
    return this.svc.removeMember(d);
  }

  @MessagePattern(pattern(platformSupportRuleUpsert))
  upsertRule(@Payload() d: RpcRequest<typeof platformSupportRuleUpsert>) {
    return this.svc.upsertRule(d);
  }

  @MessagePattern(pattern(platformSupportRuleDelete))
  deleteRule(@Payload() d: RpcRequest<typeof platformSupportRuleDelete>) {
    return this.svc.deleteRule(d);
  }

  @MessagePattern(pattern(platformSupportPinOrg))
  pinOrg(@Payload() d: RpcRequest<typeof platformSupportPinOrg>) {
    return this.svc.pinOrg(d);
  }

  @MessagePattern(pattern(platformSupportTeamPinnedOrgs))
  listPinnedOrgs(@Payload() d: RpcRequest<typeof platformSupportTeamPinnedOrgs>) {
    return this.svc.listPinnedOrgs(d);
  }
}
