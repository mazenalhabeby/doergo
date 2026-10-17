import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ShiftIssuesService } from './shift-issues.service';
import { ShiftIssueActionsService } from './shift-issue-actions.service';

@Controller()
export class ShiftIssuesController {
  constructor(
    private readonly service: ShiftIssuesService,
    private readonly issueActions: ShiftIssueActionsService,
  ) {}

  @MessagePattern({ cmd: 'shift_issue_create' })
  create(@Payload() data: any) { return this.service.create(data); }

  @MessagePattern({ cmd: 'shift_issue_list' })
  list(@Payload() data: any) { return this.service.list(data); }

  @MessagePattern({ cmd: 'shift_issue_get' })
  get(@Payload() data: any) { return this.service.get(data); }

  @MessagePattern({ cmd: 'shift_issue_message' })
  message(@Payload() data: any) { return this.issueActions.addMessage(data); }

  @MessagePattern({ cmd: 'shift_issue_acknowledge' })
  acknowledge(@Payload() data: any) { return this.issueActions.acknowledge(data); }

  @MessagePattern({ cmd: 'shift_issue_assign' })
  assign(@Payload() data: any) { return this.issueActions.assign(data); }

  @MessagePattern({ cmd: 'shift_issue_status' })
  setStatus(@Payload() data: any) { return this.issueActions.setStatus(data); }

  @MessagePattern({ cmd: 'shift_issue_presign' })
  presign(@Payload() data: any) { return this.service.presignAttachment(data); }
}
