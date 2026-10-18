import { Processor } from '@nestjs/bullmq';
import { JobProcessor } from '../../common/queue/job-processor';
import { Job } from 'bullmq';
import { QUEUE_NAMES, TASK_JOBS, jobKeysByName, type JobHandlers, type TaskJobs } from '@hbcfield/shared';
import { TasksService } from './tasks.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { JobPauseService } from './handover/job-pause.service';
import { CrewService } from './handover/crew.service';
import { AttachmentFilesService } from '../attachments/attachment-files.service';

/** The job name on the wire → its contract in TASK_JOBS. */
const TASK_JOB_KEYS = jobKeysByName(TASK_JOBS);

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
  /**
   * One handler per job, each typed by its contract's data (shared queues/task-jobs.ts):
   * a handler that stops accepting what the gateway queues no longer compiles.
   */
  private readonly handlers: JobHandlers<TaskJobs>;

  constructor(
    private readonly tasksService: TasksService,
    private readonly attachmentsService: AttachmentsService,
    private readonly attachmentFiles: AttachmentFilesService,
    private readonly jobPause: JobPauseService,
    private readonly crew: CrewService,
  ) {
    super();
    this.handlers = {
      // ============ Task Write Operations ============
      // READ operations (findAll, findOne, getTimeline, getComments) use direct microservice calls
      create: (data) => this.tasksService.create(data),
      update: (data) => this.tasksService.update(data),
      assign: (data) => this.tasksService.assign(data),
      decline: (data) => this.tasksService.decline(data),
      updateStatus: (data) => this.tasksService.updateStatus(data),
      remove: (data) => this.tasksService.remove(data),
      // ============ Comment Write Operations ============
      addComment: (data) => this.tasksService.addComment(data),
      // ============ Paused at clock-out, and the handover ============
      resumeWork: (data) => this.tasksService.resumeWork(data),
      addHandover: (data) => this.jobPause.addHandover(data),
      // ============ A crew on one job ============
      crewJoin: (data) => this.crew.join(data),
      crewLeave: (data) => this.crew.leave(data),
      crewSelfIssue: (data) => this.crew.selfIssue(data),
      crewSelfResume: (data) => this.crew.selfResume(data),
      crewChangeLead: (data) => this.crew.changeLead(data),
      // ============ Assignee Write Operations ============
      addAssignee: (data) => this.tasksService.addAssignee(data),
      removeAssignee: (data) => this.tasksService.removeAssignee(data),
      // ============ Checklist Write Operations ============
      addChecklistItem: (data) => this.tasksService.addChecklistItem(data),
      updateChecklistItem: (data) => this.tasksService.updateChecklistItem(data),
      deleteChecklistItem: (data) => this.tasksService.deleteChecklistItem(data),
      reorderChecklist: (data) => this.tasksService.reorderChecklist(data),
      // ============ Subtask & Dependency Write Operations ============
      createSubtask: (data) => this.tasksService.createSubtask(data),
      addDependency: (data) => this.tasksService.addDependency(data),
      removeDependency: (data) => this.tasksService.removeDependency(data),
      // ============ Attachment Write Operations ============
      addAttachment: (data) => this.attachmentsService.create(data),
      deleteAttachment: (data) => this.attachmentFiles.remove(data),
      getPresignedUrl: (data) => this.attachmentFiles.getPresignedUrl(data),
    };
  }

  /**
   * Route job to appropriate handler based on job name
   */
  protected async handleJob(job: Job<unknown, unknown, string>): Promise<unknown> {
    const key = TASK_JOB_KEYS.get(job.name);
    if (!key) {
      this.logger.warn(`Unknown job type: ${job.name}`);
      throw new Error(`Unknown job type: ${job.name}`);
    }
    // The queue carries JSON: what the gateway queued through this same contract (runJob).
    const handle = this.handlers[key] as (data: unknown) => Promise<unknown> | unknown;
    return handle(job.data);
  }
}
