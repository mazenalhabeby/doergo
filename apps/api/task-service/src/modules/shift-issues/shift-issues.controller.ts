import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ShiftIssuesService } from './shift-issues.service';
import { ShiftIssueActionsService } from './shift-issue-actions.service';
import {
  pattern,
  type RpcRequest,
  shiftIssueCreate,
  shiftIssueList,
  shiftIssueGet,
  shiftIssueMessage,
  shiftIssueAcknowledge,
  shiftIssueAssign,
  shiftIssueStatus,
  shiftIssuePresign,
} from '@hbcfield/shared/microservices';

@Controller()
export class ShiftIssuesController {
  constructor(
    private readonly service: ShiftIssuesService,
    private readonly issueActions: ShiftIssueActionsService,
  ) {}

  @MessagePattern(pattern(shiftIssueCreate))
  create(@Payload() data: RpcRequest<typeof shiftIssueCreate>) {
    return this.service.create(data);
  }

  @MessagePattern(pattern(shiftIssueList))
  list(@Payload() data: RpcRequest<typeof shiftIssueList>) {
    return this.service.list(data);
  }

  @MessagePattern(pattern(shiftIssueGet))
  get(@Payload() data: RpcRequest<typeof shiftIssueGet>) {
    return this.service.get(data);
  }

  @MessagePattern(pattern(shiftIssueMessage))
  message(@Payload() data: RpcRequest<typeof shiftIssueMessage>) {
    return this.issueActions.addMessage(data);
  }

  @MessagePattern(pattern(shiftIssueAcknowledge))
  acknowledge(@Payload() data: RpcRequest<typeof shiftIssueAcknowledge>) {
    return this.issueActions.acknowledge(data);
  }

  @MessagePattern(pattern(shiftIssueAssign))
  assign(@Payload() data: RpcRequest<typeof shiftIssueAssign>) {
    return this.issueActions.assign(data);
  }

  @MessagePattern(pattern(shiftIssueStatus))
  setStatus(@Payload() data: RpcRequest<typeof shiftIssueStatus>) {
    return this.issueActions.setStatus(data);
  }

  @MessagePattern(pattern(shiftIssuePresign))
  presign(@Payload() data: RpcRequest<typeof shiftIssuePresign>) {
    return this.service.presignAttachment(data);
  }
}
