import { Injectable, NotFoundException } from '@nestjs/common';
import { WorkflowConfigCache } from '../../common/cache/workflow-config-cache.service';
import { MediaSigner } from '../../common/storage/media-signer.service';
import { JobTimeService } from './handover/job-time.service';
import { CrewService } from './handover/crew.service';
import { PrismaService, peopleFaces } from '@hbcfield/shared';
import { type TaskAccessFacts } from '../../common/task-access/task-access.service';
import { success, parseStoredStepForm, stepFormFileIds, type StepFormAnswers } from '@hbcfield/shared';
import { TaskSupportService } from './task-support.service';

/** A task's form submissions — moved here unchanged from task-query.service.ts. */
@Injectable()
export abstract class TaskQueryBase {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly workflowCache: WorkflowConfigCache,
    protected readonly media: MediaSigner,
    // Job time (shared tasks/job-time.ts) — read, never stored.
    protected readonly jobTime: JobTimeService,
    // A crew on one job: presence, own stops, the lead (shared tasks/crew.ts).
    protected readonly crew: CrewService,
    protected readonly support: TaskSupportService,
  ) {}

  /**
   * The step forms answered on the way through this job — its report section.
   *
   * Gated exactly like reading the task. Each submission carries the form it
   * answered (the snapshot, not today's definition), and every photo and
   * signature it names is resolved to a short-lived signed link, the same way
   * attachments are everywhere else. One query for the submissions, one for all
   * their files — no N+1 however many moves the job made.
   */
  async getSubmissions(data: TaskAccessFacts & { id: string }) {
    const task = await this.prisma.task.findUnique({ where: { id: data.id } });
    if (!task) throw new NotFoundException('Task not found');
    /*
      NOT open to a holder of the job's open role. The role-holder exemption is
      for deciding whether to TAKE the job — the task itself. A step submission
      carries what somebody already did on site: answers, signed photo links, a
      customer's signature. That belongs to the people on the job.
    */
    await this.support.taskAccess.assert(task, data);

    const rows = await this.prisma.taskStepSubmission.findMany({
      where: { taskId: task.id },
      orderBy: { submittedAt: 'asc' },
      take: 100,
      select: {
        id: true,
        statusKey: true,
        formVersion: true,
        form: true,
        answers: true,
        submittedById: true,
        submittedAt: true,
      },
    });
    if (!rows.length) return success([]);

    const fileIds = new Set<string>();
    for (const r of rows) {
      const form = parseStoredStepForm(r.form);
      if (form) stepFormFileIds(form, (r.answers ?? {}) as StepFormAnswers).forEach((id) => fileIds.add(id));
    }
    const userIds = [...new Set(rows.map((r) => r.submittedById))];
    const [files, users] = await Promise.all([
      fileIds.size
        ? this.prisma.attachment.findMany({
            // Scoped to THIS task: a stored id can only ever resolve to this job's own file.
            where: { id: { in: [...fileIds] }, taskId: task.id },
            select: {
              id: true,
              fileName: true,
              fileKey: true,
              fileUrl: true,
              mimeType: true,
              fileType: true,
              fileSize: true,
              createdAt: true,
            },
          })
        : Promise.resolve([]),
      peopleFaces(this.prisma, userIds),
    ]);
    const signed = await this.media.signAll(files);
    const fileById = Object.fromEntries(signed.map((f) => [f.id, f]));
    const userById = new Map(users.map((u) => [u.id, u]));

    return success(
      rows.map((r) => {
        const form = parseStoredStepForm(r.form);
        const answers = (r.answers ?? {}) as StepFormAnswers;
        const own = form ? stepFormFileIds(form, answers) : [];
        return {
          id: r.id,
          statusKey: r.statusKey,
          formVersion: r.formVersion,
          form: r.form,
          answers,
          files: Object.fromEntries(own.filter((id) => fileById[id]).map((id) => [id, fileById[id]])),
          submittedAt: r.submittedAt,
          submittedBy: userById.get(r.submittedById) ?? {
            id: r.submittedById,
            firstName: null,
            lastName: null,
            avatarUrl: null,
          },
        };
      }),
    );
  }
}
