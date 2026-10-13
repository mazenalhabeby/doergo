import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { BaseGatewayService, SERVICE_NAMES, accessAllows, isAdmin, ownAccess, type StandInInput, type StandInView, type StandInsResponse } from '@hbcfield/shared';
import { AuthTokenCache } from '../../common/cache/auth-token-cache.service';
import { ApprovalsService } from './approvals.service';

/**
 * Hand-overs of approval decisions — recorded in task-service; what they then
 * allow is decided where every permission is (session + the kinds' checks).
 * After a change the stand-in's cached session is dropped, so the decisions
 * arrive (or leave) on their next request, not a minute later.
 */
@Injectable()
export class StandInsService extends BaseGatewayService {
  constructor(
    @Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy,
    private readonly authCache: AuthTokenCache,
    private readonly approvals: ApprovalsService,
  ) {
    super(taskClient, StandInsService.name);
  }

  list(user: any) {
    return this.send<StandInsResponse>({ cmd: 'stand_ins_list' }, { caller: callerOf(user) });
  }

  async create(user: any, input: StandInInput) {
    const view = await this.sendOnce<StandInView>({ cmd: 'stand_ins_create' }, { caller: callerOf(user), input });
    await this.refresh(view.to.id);
    return view;
  }

  async end(user: any, id: string) {
    const r = await this.sendOnce<{ ended: true; toUserId: string }>({ cmd: 'stand_ins_end' }, { caller: callerOf(user), id });
    await this.refresh(r.toUserId);
    return { ended: true };
  }

  private async refresh(userId: string) {
    this.approvals.forget(userId);
    await this.authCache.invalidateUser(userId).catch(() => undefined);
  }
}

/** Who is asking — "manages people" read on their OWN access: a stand-in never arranges stand-ins. */
function callerOf(user: any) {
  return {
    organizationId: user.organizationId,
    userId: user.id,
    managesPeople: isAdmin(user) || accessAllows(ownAccess(user.access), 'canManageUsers'),
  };
}
