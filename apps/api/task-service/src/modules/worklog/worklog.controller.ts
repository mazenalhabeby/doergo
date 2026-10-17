import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { WorklogService } from './worklog.service';
import { WorklogAttachmentsService } from './worklog-attachments.service';
import {
  pattern,
  type RpcRequest,
  worklogAddNote,
  worklogAddNotesBatch,
  worklogList,
  worklogDeleteNote,
  worklogPresignAttachment,
  worklogConfirmAttachment,
  worklogDeleteAttachment,
} from '@hbcfield/shared/microservices';

@Controller()
export class WorklogController {
  constructor(
    private readonly worklog: WorklogService,
    private readonly worklogFiles: WorklogAttachmentsService,
  ) {}

  @MessagePattern(pattern(worklogAddNote))
  addNote(@Payload() d: RpcRequest<typeof worklogAddNote>) {
    return this.worklog.addNote(d);
  }

  @MessagePattern(pattern(worklogAddNotesBatch))
  addNotesBatch(@Payload() d: RpcRequest<typeof worklogAddNotesBatch>) {
    return this.worklog.addNotesBatch(d);
  }

  @MessagePattern(pattern(worklogList))
  list(@Payload() d: RpcRequest<typeof worklogList>) {
    return this.worklog.listNotes(d);
  }

  @MessagePattern(pattern(worklogDeleteNote))
  deleteNote(@Payload() d: RpcRequest<typeof worklogDeleteNote>) {
    return this.worklog.deleteNote(d);
  }

  @MessagePattern(pattern(worklogPresignAttachment))
  presign(@Payload() d: RpcRequest<typeof worklogPresignAttachment>) {
    return this.worklogFiles.presignAttachment(d);
  }

  @MessagePattern(pattern(worklogConfirmAttachment))
  confirm(@Payload() d: RpcRequest<typeof worklogConfirmAttachment>) {
    return this.worklogFiles.confirmAttachment(d);
  }

  @MessagePattern(pattern(worklogDeleteAttachment))
  deleteAttachment(@Payload() d: RpcRequest<typeof worklogDeleteAttachment>) {
    return this.worklogFiles.deleteAttachment(d);
  }
}
