import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ShiftIssuesService } from './shift-issues.service';

@Controller()
export class ShiftIssuesController {
  constructor(private readonly service: ShiftIssuesService) {}

  @MessagePattern({ cmd: 'shift_issue_create' })
  create(@Payload() data: any) { return this.service.create(data); }

  @MessagePattern({ cmd: 'shift_issue_list' })
  list(@Payload() data: any) { return this.service.list(data); }

  @MessagePattern({ cmd: 'shift_issue_get' })
  get(@Payload() data: any) { return this.service.get(data); }

  @MessagePattern({ cmd: 'shift_issue_message' })
  message(@Payload() data: any) { return this.service.addMessage(data); }

  @MessagePattern({ cmd: 'shift_issue_acknowledge' })
  acknowledge(@Payload() data: any) { return this.service.acknowledge(data); }

  @MessagePattern({ cmd: 'shift_issue_assign' })
  assign(@Payload() data: any) { return this.service.assign(data); }

  @MessagePattern({ cmd: 'shift_issue_status' })
  setStatus(@Payload() data: any) { return this.service.setStatus(data); }

  @MessagePattern({ cmd: 'shift_issue_presign' })
  presign(@Payload() data: any) { return this.service.presignAttachment(data); }
}
