import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AttachmentsService } from './attachments.service';
import { pattern, type RpcRequest, getAttachments } from '@hbcfield/shared/microservices';

@Controller()
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @MessagePattern(pattern(getAttachments))
  async getAttachments(@Payload() data: RpcRequest<typeof getAttachments>) {
    return this.attachmentsService.findByTask(data);
  }
}
