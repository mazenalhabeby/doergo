import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AttachmentsService } from './attachments.service';

@Controller()
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @MessagePattern({ cmd: 'get_attachments' })
  async getAttachments(@Payload() data: { taskId: string; userId: string; userRole: string; organizationId: string }) {
    return this.attachmentsService.findByTask(data);
  }
}
