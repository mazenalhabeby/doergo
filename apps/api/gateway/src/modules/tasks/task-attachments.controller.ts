import { Controller, Get, Post, Delete, Body, Param, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { taskActor } from '../../common/task-actor';
import { PresignAttachmentDto, ConfirmAttachmentDto } from './dto';
import { TasksQueueService } from './tasks.queue.service';
import { TasksService } from './tasks.service';
import { assertExternalMayWrite } from './task-write-checks';

import type { AuthedRequest } from '../../common/request.types';
/** /tasks/:id/attachments — upload, list, delete. */
@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks')
export class TaskAttachmentsController {
  constructor(
    private readonly tasksQueueService: TasksQueueService,
    private readonly tasksService: TasksService,
  ) {}

  // ============ Attachment Endpoints ============

  /*
     ⚠️ No module gate existed on any of these. A workspace that had not
     switched attachments on could still use them.

     Refused at the presign, before a byte is uploaded — the confirm below is
     gated too, so a stale URL cannot finish the job either.
  */
  @RequireModule('attachments')
  @Post(':id/attachments/presign')
  @ApiOperation({ summary: 'Get presigned URL for uploading an attachment' })
  async getPresignedUrl(@Param('id') id: string, @Body() body: PresignAttachmentDto, @Request() req: AuthedRequest) {
    await assertExternalMayWrite(this.tasksService, req, id);
    return this.tasksQueueService.getPresignedUrl({
      taskId: id,
      fileName: body.fileName,
      fileType: body.fileType,
      ...taskActor(req),
    });
  }

  @RequireModule('attachments')
  @Post(':id/attachments')
  @ApiOperation({ summary: 'Confirm attachment upload after S3 upload' })
  async addAttachment(@Param('id') id: string, @Body() body: ConfirmAttachmentDto, @Request() req: AuthedRequest) {
    await assertExternalMayWrite(this.tasksService, req, id);
    return this.tasksQueueService.addAttachment({
      taskId: id,
      attachmentId: body.id,
      fileName: body.fileName,
      fileKey: body.fileKey,
      fileUrl: body.fileUrl,
      fileType: body.fileType ?? '',
      fileSize: body.fileSize ?? 0,
      uploadedById: req.user.id,
      ...taskActor(req),
    });
  }

  @Get(':id/attachments')
  @ApiOperation({ summary: 'Get task attachments' })
  async getAttachments(@Param('id') id: string, @Request() req: AuthedRequest) {
    // READ operation - use direct microservice call (faster, no queue overhead)
    return this.tasksService.getAttachments({
      taskId: id,
      ...taskActor(req),
    });
  }

  @RequireModule('attachments')
  @Delete(':id/attachments/:attachmentId')
  @ApiOperation({ summary: 'Delete an attachment' })
  async deleteAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Request() req: AuthedRequest,
  ) {
    await assertExternalMayWrite(this.tasksService, req, id, { attachmentId });
    return this.tasksQueueService.deleteAttachment({
      id: attachmentId,
      ...taskActor(req),
    });
  }
}
