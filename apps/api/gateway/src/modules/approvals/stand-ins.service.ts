import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  BaseGatewayService,
  SERVICE_NAMES,
  accessAllows,
  isAdmin,
  ownAccess,
  type StandInInput,
} from '@hbcfield/shared';
import {
  pattern,
  type RpcReply,
  type RpcRequest,
  type StandInCaller,
  standInsList,
  standInsCreate,
  standInsEnd,
} from '@hbcfield/shared/microservices';
import { AuthTokenCache } from '../../common/cache/auth-token-cache.service';
import { ApprovalsService } from './approvals.service';

import type { SessionUser } from '../../common/request.types';
import { callerOrgId } from '../../common/caller-org';
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

  list(user: SessionUser) {
    return this.send<RpcReply<typeof standInsList>>(pattern(standInsList), {
      caller: callerOf(user),
    } satisfies RpcRequest<typeof standInsList>);
  }

  async create(user: SessionUser, input: StandInInput) {
    const view = await this.sendOnce<RpcReply<typeof standInsCreate>>(pattern(standInsCreate), {
      caller: callerOf(user),
      input,
    } satisfies RpcRequest<typeof standInsCreate>);
    await this.refresh(view.to.id);
    return view;
  }

  async end(user: SessionUser, id: string) {
    const r = await this.sendOnce<RpcReply<typeof standInsEnd>>(pattern(standInsEnd), {
      caller: callerOf(user),
      id,
    } satisfies RpcRequest<typeof standInsEnd>);
    await this.refresh(r.toUserId);
    return { ended: true };
  }

  private async refresh(userId: string) {
    this.approvals.forget(userId);
    await this.authCache.invalidateUser(userId).catch(() => undefined);
  }
}

/** Who is asking — "manages people" read on their OWN access: a stand-in never arranges stand-ins. */
function callerOf(user: SessionUser): StandInCaller {
  return {
    organizationId: callerOrgId(user),
    userId: user.id,
    managesPeople: isAdmin(user) || accessAllows(ownAccess(user.access), 'canManageUsers'),
  };
}
