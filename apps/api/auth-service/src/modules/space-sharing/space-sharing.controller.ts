import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { SpaceSharingService } from './space-sharing.service';
import { SpacePurgeService } from './space-purge.service';

import {
  pattern,
  spaceShareCreate,
  spaceShareUpdate,
  spaceShareRevoke,
  spaceShareListForSpace,
  spaceShareListIncoming,
  spaceShareRespond,
  spaceShareRequestCreate,
  spaceShareRequestList,
  spaceShareRequestResolve,
  spacePurgeAuthSide,
  type RpcRequest,
} from '@hbcfield/shared/microservices';
@Controller()
export class SpaceSharingController {
  constructor(
    private readonly svc: SpaceSharingService,
    private readonly purge: SpacePurgeService,
  ) {}

  /** task-service is removing a workspace for good — drop what auth owns for it. */
  @MessagePattern(pattern(spacePurgeAuthSide))
  purgeForSpace(@Payload() data: RpcRequest<typeof spacePurgeAuthSide>) {
    return this.purge.purgeForSpace(data);
  }

  @MessagePattern(pattern(spaceShareCreate))
  create(@Payload() data: RpcRequest<typeof spaceShareCreate>) {
    return this.svc.createShare(data);
  }

  @MessagePattern(pattern(spaceShareUpdate))
  update(@Payload() data: RpcRequest<typeof spaceShareUpdate>) {
    return this.svc.updateShare(data);
  }

  @MessagePattern(pattern(spaceShareRevoke))
  revoke(@Payload() data: RpcRequest<typeof spaceShareRevoke>) {
    return this.svc.revokeShare(data);
  }

  @MessagePattern(pattern(spaceShareListForSpace))
  listForSpace(@Payload() data: RpcRequest<typeof spaceShareListForSpace>) {
    return this.svc.listForSpace(data);
  }

  @MessagePattern(pattern(spaceShareListIncoming))
  listIncoming(@Payload() data: RpcRequest<typeof spaceShareListIncoming>) {
    return this.svc.listIncoming(data);
  }

  @MessagePattern(pattern(spaceShareRespond))
  respond(@Payload() data: RpcRequest<typeof spaceShareRespond>) {
    return this.svc.respondToShare(data);
  }

  @MessagePattern(pattern(spaceShareRequestCreate))
  createRequest(@Payload() data: RpcRequest<typeof spaceShareRequestCreate>) {
    return this.svc.createRequest(data);
  }

  @MessagePattern(pattern(spaceShareRequestList))
  listRequests(@Payload() data: RpcRequest<typeof spaceShareRequestList>) {
    return this.svc.listRequests(data);
  }

  @MessagePattern(pattern(spaceShareRequestResolve))
  resolveRequest(@Payload() data: RpcRequest<typeof spaceShareRequestResolve>) {
    return this.svc.resolveRequest(data);
  }
}
