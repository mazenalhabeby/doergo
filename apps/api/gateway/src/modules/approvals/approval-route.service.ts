import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { APPROVAL_KIND_SPECS, BaseGatewayService, SERVICE_NAMES, type ApprovalKind, type ApprovalRouting } from '@hbcfield/shared';
import { ApprovalsService, type ApprovalCaller } from './approvals.service';

/**
 * "Who else can decide this, and who is told" for ONE item of the caller's
 * own inbox. The item is looked up in what the caller was actually given
 * (`ApprovalsService.item`) — never taken from the request — so the answer
 * can only ever be about something they may decide; anything else is 404.
 * task-service resolves the people (it holds the members, their roles, leave
 * and the notification routing).
 */
@Injectable()
export class ApprovalRouteService extends BaseGatewayService {
  constructor(
    @Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy,
    private readonly approvals: ApprovalsService,
  ) {
    super(taskClient, ApprovalRouteService.name);
  }

  async route(caller: ApprovalCaller, kind: ApprovalKind, id: string): Promise<ApprovalRouting> {
    const item = await this.approvals.item(caller, kind, id);
    if (!item) throw new NotFoundException('Not in your approvals');
    const spec = APPROVAL_KIND_SPECS[kind];
    return this.send<ApprovalRouting>({ cmd: 'approval_route' }, {
      organizationId: caller.user.organizationId,
      callerId: caller.user.id,
      kind,
      decideKey: spec.decideKey,
      orgWide: spec.orgWide,
      spaceId: item.space?.id ?? null,
      // A client or a joiner is not a member: nobody is "told" about them through member routing.
      subjectUserId: kind === 'clientRequest' || kind === 'guestRequest' || kind === 'join' ? null : item.subject.id,
    });
  }
}
