import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';
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
  type RpcRequest,
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
  createTeam(d: RpcRequest<typeof platformSupportTeamCreate>) {
    return this.call(platformSupportTeamCreate, d);
  }
  updateTeam(d: RpcRequest<typeof platformSupportTeamUpdate>) {
    return this.call(platformSupportTeamUpdate, d);
  }
  deleteTeam(d: RpcRequest<typeof platformSupportTeamDelete>) {
    return this.call(platformSupportTeamDelete, d);
  }
  addMember(d: RpcRequest<typeof platformSupportTeamAddMember>) {
    return this.call(platformSupportTeamAddMember, d);
  }
  removeMember(d: RpcRequest<typeof platformSupportTeamRemoveMember>) {
    return this.call(platformSupportTeamRemoveMember, d);
  }
  upsertRule(d: RpcRequest<typeof platformSupportRuleUpsert>) {
    return this.call(platformSupportRuleUpsert, d);
  }
  deleteRule(d: RpcRequest<typeof platformSupportRuleDelete>) {
    return this.call(platformSupportRuleDelete, d);
  }
  pinOrg(d: RpcRequest<typeof platformSupportPinOrg>) {
    return this.call(platformSupportPinOrg, d);
  }
  pinnedOrgs(d: RpcRequest<typeof platformSupportTeamPinnedOrgs>) {
    return this.call(platformSupportTeamPinnedOrgs, d);
  }
}
