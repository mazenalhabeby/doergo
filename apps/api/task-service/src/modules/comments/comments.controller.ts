import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CommentsService } from './comments.service';

@Controller()
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @MessagePattern({ cmd: 'add_comment' })
  async addComment(@Payload() data: { taskId: string; userId: string; content: string }) {
    return this.commentsService.create(data.taskId, data.userId, data.content);
  }

  @MessagePattern({ cmd: 'get_comments' })
  async getComments(@Payload() data: { taskId: string }) {
    return this.commentsService.findByTask(data.taskId);
  }
}
