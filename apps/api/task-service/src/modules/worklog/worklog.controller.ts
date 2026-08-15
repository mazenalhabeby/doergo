import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { WorklogService } from './worklog.service';

@Controller()
export class WorklogController {
  constructor(private readonly worklog: WorklogService) {}

  @MessagePattern({ cmd: 'worklog_add_note' })
  addNote(@Payload() d: any) {
    return this.worklog.addNote(d);
  }

  @MessagePattern({ cmd: 'worklog_add_notes_batch' })
  addNotesBatch(@Payload() d: any) {
    return this.worklog.addNotesBatch(d);
  }

  @MessagePattern({ cmd: 'worklog_list' })
  list(@Payload() d: any) {
    return this.worklog.listNotes(d);
  }

  @MessagePattern({ cmd: 'worklog_delete_note' })
  deleteNote(@Payload() d: any) {
    return this.worklog.deleteNote(d);
  }

  @MessagePattern({ cmd: 'worklog_presign_attachment' })
  presign(@Payload() d: any) {
    return this.worklog.presignAttachment(d);
  }

  @MessagePattern({ cmd: 'worklog_confirm_attachment' })
  confirm(@Payload() d: any) {
    return this.worklog.confirmAttachment(d);
  }

  @MessagePattern({ cmd: 'worklog_delete_attachment' })
  deleteAttachment(@Payload() d: any) {
    return this.worklog.deleteAttachment(d);
  }
}
