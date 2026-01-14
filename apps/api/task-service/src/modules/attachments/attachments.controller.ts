import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AttachmentsService } from './attachments.service';

@Controller()
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @MessagePattern({ cmd: 'add_attachment' })
  async addAttachment(@Payload() data: any) {
    return this.attachmentsService.create(data);
  }

  @MessagePattern({ cmd: 'get_attachments' })
  async getAttachments(@Payload() data: { taskId: string }) {
    return this.attachmentsService.findByTask(data.taskId);
  }

  @MessagePattern({ cmd: 'delete_attachment' })
  async deleteAttachment(@Payload() data: { id: string }) {
    return this.attachmentsService.remove(data.id);
  }

  @MessagePattern({ cmd: 'get_presigned_url' })
  async getPresignedUrl(@Payload() data: { fileName: string; fileType: string }) {
    return this.attachmentsService.getPresignedUrl(data.fileName, data.fileType);
  }
}
