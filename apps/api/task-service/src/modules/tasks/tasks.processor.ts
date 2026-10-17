import { Processor } from '@nestjs/bullmq';
import { JobProcessor } from '../../common/queue/job-processor';
import { Job } from 'bullmq';
import { QUEUE_NAMES, TASK_JOB_TYPES } from '@hbcfield/shared';
import { TasksService } from './tasks.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { JobPauseService } from './handover/job-pause.service';
import { CrewService } from './handover/crew.service';
import { AttachmentFilesService } from '../attachments/attachment-files.service';

/**
 * BullMQ Processor for Task Queue
 *
 * Handles WRITE task jobs with exactly-once processing semantics.
 * Each job type is routed to the appropriate service method.
 *
 * NOTE: READ operations (findAll, findOne, getTimeline, getComments, getAttachments)
 * are handled via direct microservice communication (MessagePattern) for better performance.
 * Only WRITE operations go through BullMQ for exactly-once guarantees.
 */
@Processor(QUEUE_NAMES.TASKS, { concurrency: 10 })
export class TasksProcessor extends JobProcessor {
  constructor(
    private readonly tasksService: TasksService,
    private readonly attachmentsService: AttachmentsService,
    private readonly attachmentFiles: AttachmentFilesService,
    private readonly jobPause: JobPauseService,
    private readonly crew: CrewService,
  ) {
    super();
  }

  /**
   * Route job to appropriate handler based on job name
   */
  protected async handleJob(job: Job<any, any, string>): Promise<unknown> {
    const { name, data } = job;

    switch (name) {
      // ============ Task Write Operations ============
      // READ operations (findAll, findOne, getTimeline, getComments) use direct microservice calls
      case TASK_JOB_TYPES.CREATE:
        return this.tasksService.create(data);

      case TASK_JOB_TYPES.UPDATE:
        return this.tasksService.update(data);

      case TASK_JOB_TYPES.ASSIGN:
        return this.tasksService.assign(data);

      case TASK_JOB_TYPES.DECLINE:
        return this.tasksService.decline(data);

      case TASK_JOB_TYPES.UPDATE_STATUS:
        return this.tasksService.updateStatus(data);

      case TASK_JOB_TYPES.DELETE:
        return this.tasksService.remove(data);

      // ============ Comment Write Operations ============
      case TASK_JOB_TYPES.ADD_COMMENT:
        return this.tasksService.addComment(data);

      // ============ Paused at clock-out, and the handover ============
      case TASK_JOB_TYPES.RESUME_WORK:
        return this.tasksService.resumeWork(data);

      case TASK_JOB_TYPES.ADD_HANDOVER:
        return this.jobPause.addHandover(data);

      // ============ A crew on one job ============
      case TASK_JOB_TYPES.CREW_JOIN:
        return this.crew.join(data);
      case TASK_JOB_TYPES.CREW_LEAVE:
        return this.crew.leave(data);
      case TASK_JOB_TYPES.CREW_SELF_ISSUE:
        return this.crew.selfIssue(data);
      case TASK_JOB_TYPES.CREW_SELF_RESUME:
        return this.crew.selfResume(data);
      case TASK_JOB_TYPES.CREW_CHANGE_LEAD:
        return this.crew.changeLead(data);

      // ============ Assignee Write Operations ============
      case TASK_JOB_TYPES.ADD_ASSIGNEE:
        return this.tasksService.addAssignee(data);

      case TASK_JOB_TYPES.REMOVE_ASSIGNEE:
        return this.tasksService.removeAssignee(data);

      // ============ Checklist Write Operations ============
      case TASK_JOB_TYPES.ADD_CHECKLIST_ITEM:
        return this.tasksService.addChecklistItem(data);

      case TASK_JOB_TYPES.UPDATE_CHECKLIST_ITEM:
        return this.tasksService.updateChecklistItem(data);

      case TASK_JOB_TYPES.DELETE_CHECKLIST_ITEM:
        return this.tasksService.deleteChecklistItem(data);

      case TASK_JOB_TYPES.REORDER_CHECKLIST:
        return this.tasksService.reorderChecklist(data);

      // ============ Subtask & Dependency Write Operations ============
      case TASK_JOB_TYPES.CREATE_SUBTASK:
        return this.tasksService.createSubtask(data);

      case TASK_JOB_TYPES.ADD_DEPENDENCY:
        return this.tasksService.addDependency(data);

      case TASK_JOB_TYPES.REMOVE_DEPENDENCY:
        return this.tasksService.removeDependency(data);

      // ============ Attachment Write Operations ============
      case TASK_JOB_TYPES.ADD_ATTACHMENT:
        return this.attachmentsService.create(data);

      case TASK_JOB_TYPES.DELETE_ATTACHMENT:
        return this.attachmentFiles.remove(data);

      case TASK_JOB_TYPES.GET_PRESIGNED_URL:
        return this.attachmentFiles.getPresignedUrl(data);

      default:
        this.logger.warn(`Unknown job type: ${name}`);
        throw new Error(`Unknown job type: ${name}`);
    }
  }
}
