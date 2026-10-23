import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { TaskEventType } from '@prisma/client';
import {
  personName,
  HANDOVER_CODES,
  HANDOVER_PHOTOS_MAX,
  cleanHandoverNote,
  createOnce,
  success,
  assertFoundInOrg,
  PrismaService,
  TASK_JOBS,
  type JobData,
} from '@hbcfield/shared';
import { emitEvent, taskHandoverAddedEvent } from '@hbcfield/shared/microservices';
import { AUTHOR } from './job-pause-helpers';

/**
 * The handover note (packages/shared/src/tasks/handover.ts): written at the
 * clock-out sheet or on the job page, and told to whoever has the job now.
 */
@Injectable()
export class HandoverNoteService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('NOTIFICATION_SERVICE') private readonly notifications: ClientProxy,
  ) {}

  /**
   * "What I did, and what is left." Written by somebody on the job, or by the
   * person who owes it (they may have been taken off it since — the note is
   * exactly what the next person needs). Clears what they owed.
   */
  async addHandover(data: JobData<typeof TASK_JOBS.addHandover>) {
    const note = cleanHandoverNote(data.note);
    const task = await this.prisma.task.findUnique({
      where: { id: data.taskId },
      select: {
        id: true,
        title: true,
        organizationId: true,
        assignedToId: true,
        pausedById: true,
        handoverDueById: true,
      },
    });
    // Another organization's job is not there, as far as this caller knows.
    assertFoundInOrg(task, data.organizationId, 'Task');
    const onTheJob =
      task.assignedToId === data.userId ||
      task.handoverDueById === data.userId ||
      task.pausedById === data.userId ||
      !!(await this.prisma.taskAssignee.findFirst({
        where: { taskId: task.id, userId: data.userId },
        select: { id: true },
      }));
    if (!onTheJob) {
      throw new ForbiddenException({
        message: 'Only somebody on this job can write its handover',
        code: HANDOVER_CODES.NOT_ON_THE_JOB,
      });
    }
    if (!note)
      throw new ForbiddenException({ message: 'Write what you did and what is left', code: 'HANDOVER_NOTE_REQUIRED' });

    // Photos are the job's own attachments — never another job's, whatever was sent.
    const wanted = [...new Set((data.attachmentIds ?? []).filter((x) => typeof x === 'string'))].slice(
      0,
      HANDOVER_PHOTOS_MAX,
    );
    const attachmentIds = wanted.length
      ? (
          await this.prisma.attachment.findMany({
            where: { id: { in: wanted }, taskId: task.id },
            select: { id: true },
          })
        ).map((a) => a.id)
      : [];

    const lastPause = await this.prisma.taskEvent.findFirst({
      where: { taskId: task.id, userId: data.userId, eventType: TaskEventType.PAUSED },
      orderBy: { createdAt: 'desc' },
      select: { metadata: true },
    });
    const workedMinutes = (lastPause?.metadata as { workedMinutes?: number } | null)?.workedMinutes ?? null;

    const include = { author: AUTHOR } as const;
    const { row, created } = await createOnce({
      id: data.id,
      find: (id) => this.prisma.taskHandover.findUnique({ where: { id }, include }),
      isSame: (h) => h.taskId === task.id && h.authorId === data.userId,
      create: () =>
        this.prisma.taskHandover.create({
          data: {
            ...(data.id ? { id: data.id } : {}),
            organizationId: task.organizationId,
            taskId: task.id,
            authorId: data.userId,
            note,
            attachmentIds,
            workedMinutes,
          },
          include,
        }),
    });
    if (!created) return success(row);

    await this.prisma.task.updateMany({
      where: { id: task.id, handoverDueById: data.userId },
      data: { handoverDueById: null },
    });
    await this.prisma.taskEvent.create({
      data: {
        taskId: task.id,
        userId: data.userId,
        eventType: TaskEventType.HANDOVER_ADDED,
        metadata: { handoverId: row.id, content: note.length > 100 ? `${note.slice(0, 100)}...` : note },
      },
    });

    // Whoever has the job now hears it — including a note written after they were given it.
    const crew = await this.prisma.taskAssignee.findMany({ where: { taskId: task.id }, select: { userId: true } });
    const recipientIds = [
      ...new Set(
        [task.assignedToId, ...crew.map((c) => c.userId)].filter((id): id is string => !!id && id !== data.userId),
      ),
    ];
    emitEvent(this.notifications, taskHandoverAddedEvent, {
      taskId: task.id,
      taskTitle: task.title,
      authorId: data.userId,
      authorName: personName(row.author),
      recipientIds,
      organizationId: task.organizationId,
    });
    return success(row);
  }
}
