import { ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { TaskEventType } from '@prisma/client';
import {
  HANDOVER_CODES,
  HANDOVER_PHOTOS_MAX,
  TaskStatus,
  cleanHandoverNote,
  createOnce,
  stepCapabilities,
  stepStartsWork,
  success,
} from '@hbcfield/shared';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { WorkflowConfigCache } from '../../../common/cache/workflow-config-cache.service';
import { resolveSpaceDefaultWorkflowId } from '../../../common/space-workflow.util';
import { JobTimeService } from './job-time.service';

/** A note written at the clock-out, for one job. */
export interface ClockOutHandover {
  /** Made on the phone, so a replayed clock-out writes it once. */
  id?: string;
  taskId: string;
  note: string;
  attachmentIds?: string[];
}

/** Steps a job is never "being worked" in, whatever its workflow says. */
const NEVER_WORKING = [TaskStatus.DRAFT, TaskStatus.NEW, TaskStatus.COMPLETED, TaskStatus.CLOSED, TaskStatus.CANCELED] as string[];

const AUTHOR = { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } as const;

type Candidate = { id: string; title: string; status: string; workflowId: string | null; spaceId: string | null; organizationId: string; assignedToId: string | null; pausedAt: Date | null };

/**
 * Paused at clock-out, and the handover note. Rule: packages/shared/src/tasks/handover.ts
 *
 * Its own service because the attendance side calls it from every way a shift
 * ends — the clock-out, "I forgot to clock out", the open-shift sweep and a
 * manager closing an open shift — and must not depend on the whole task service
 * to do it.
 *
 * ⚠️ `pauseAtClockOut` NEVER throws. The clock-out has already happened when it
 * runs; a job that could not be paused is logged, never a clock-out refused.
 */
@Injectable()
export class JobPauseService {
  private readonly logger = new Logger(JobPauseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflows: WorkflowConfigCache,
    @Inject('NOTIFICATION_SERVICE') private readonly notifications: ClientProxy,
    // The one job-time rule — the pause records what it says the worker put in.
    private readonly jobTime: JobTimeService,
  ) {}

  /**
   * The jobs this person is working right now: on the job (lead or crew), in a
   * step where work runs, not paused. What the clock-out sheet lists, and what
   * the clock-out pauses.
   */
  async workingJobsOf(userId: string, organizationId: string, opts: { includePaused?: boolean } = {}): Promise<Candidate[]> {
    const rows = await this.prisma.task.findMany({
      where: {
        organizationId,
        status: { notIn: NEVER_WORKING },
        ...(opts.includePaused ? {} : { pausedAt: null }),
        OR: [{ assignedToId: userId }, { assignees: { some: { userId } } }],
      },
      select: { id: true, title: true, status: true, workflowId: true, spaceId: true, organizationId: true, assignedToId: true, pausedAt: true },
      take: 50,
    });
    if (rows.length === 0) return [];

    // One workflow lookup per distinct flow, from the per-org cache.
    const spaceFlow = new Map<string, Promise<string | null>>();
    const flowOf = (r: Candidate) => {
      if (r.workflowId) return Promise.resolve(r.workflowId);
      if (!r.spaceId) return Promise.resolve(null);
      if (!spaceFlow.has(r.spaceId)) spaceFlow.set(r.spaceId, resolveSpaceDefaultWorkflowId(this.prisma, r.spaceId));
      return spaceFlow.get(r.spaceId)!;
    };
    const flows = new Map<string | null, Promise<any>>();
    const working = await Promise.all(
      rows.map(async (r) => {
        const flowId = await flowOf(r);
        if (!flows.has(flowId)) flows.set(flowId, this.workflows.getWorkflow(organizationId, flowId));
        const wf = await flows.get(flowId);
        return stepStartsWork(r.status, stepCapabilities(wf, r.status)) ? r : null;
      }),
    );
    return working.filter((r): r is Candidate => !!r);
  }

  /**
   * A shift ended at `at`: pause what this person was working on, and keep the
   * notes they wrote. A job somebody else on its crew is still clocked in for
   * keeps running — the crew is still on it.
   *
   * `since` (the shift's start) lets a replaced clock-out time move a pause it
   * already made: the open-shift sweep closes with a guess, and the member's
   * real clock-out arriving later is the truth.
   */
  async pauseAtClockOut(args: {
    userId: string;
    organizationId: string;
    at: Date;
    since?: Date | null;
    reason: 'CLOCK_OUT' | 'AUTO_CLOSE' | 'FORGOT' | 'OFFICE_CLOSE';
    handovers?: ClockOutHandover[];
  }): Promise<{ paused: string[] }> {
    try {
      return await this.pause(args);
    } catch (err) {
      this.logger.error(`Pausing jobs at clock-out failed for user=${args.userId}: ${(err as Error).message}`);
      return { paused: [] };
    }
  }

  private async pause(args: Parameters<JobPauseService['pauseAtClockOut']>[0]): Promise<{ paused: string[] }> {
    const { userId, organizationId, at } = args;

    // A pause this shift already made, at a time now known to be wrong.
    if (args.since) {
      await this.prisma.task.updateMany({
        where: { organizationId, pausedById: userId, pausedAt: { gte: args.since } },
        data: { pausedAt: at },
      });
    }

    const jobs = await this.workingJobsOf(userId, organizationId);
    const toPause: Candidate[] = [];
    if (jobs.length) {
      const crew = await this.prisma.taskAssignee.findMany({
        where: { taskId: { in: jobs.map((j) => j.id) }, userId: { not: userId } },
        select: { taskId: true, userId: true },
      });
      const others = new Map<string, Set<string>>();
      for (const j of jobs) if (j.assignedToId && j.assignedToId !== userId) others.set(j.id, new Set([j.assignedToId]));
      for (const c of crew) (others.get(c.taskId) ?? others.set(c.taskId, new Set()).get(c.taskId)!).add(c.userId);
      const otherIds = [...new Set([...others.values()].flatMap((s) => [...s]))];
      const stillOn = otherIds.length
        ? new Set(
            (await this.prisma.timeEntry.findMany({
              where: { organizationId, userId: { in: otherIds }, status: 'CLOCKED_IN' },
              select: { userId: true },
            })).map((e) => e.userId),
          )
        : new Set<string>();
      for (const j of jobs) if (![...(others.get(j.id) ?? [])].some((id) => stillOn.has(id))) toPause.push(j);
    }

    const notes = new Map<string, ClockOutHandover>();
    for (const h of args.handovers ?? []) if (h?.taskId && cleanHandoverNote(h.note)) notes.set(h.taskId, h);

    // Each job's time up to the pause, for the record — one calculation for all of them.
    const worked = await this.jobTime.workedForMany(toPause, userId, at);
    const paused: string[] = [];
    for (const job of toPause) {
      const claimed = await this.prisma.task.updateMany({
        where: { id: job.id, pausedAt: null, status: job.status },
        data: { pausedAt: at, pausedById: userId, handoverDueById: notes.has(job.id) ? null : userId },
      });
      if (claimed.count === 0) continue;
      paused.push(job.id);
      const workedMinutes = worked.get(job.id) ?? 0;
      await this.prisma.taskEvent.create({
        data: { taskId: job.id, userId, eventType: TaskEventType.PAUSED, metadata: { reason: args.reason, at: at.toISOString(), workedMinutes } },
      });
    }

    // The notes — for paused jobs, and for any job they are on that kept running.
    for (const h of notes.values()) {
      await this.addHandover({ id: h.id, taskId: h.taskId, note: h.note, attachmentIds: h.attachmentIds, userId, organizationId }).catch((err) =>
        this.logger.warn(`Handover at clock-out not saved (task=${h.taskId}): ${(err as Error).message}`),
      );
    }

    if (paused.length) {
      this.notifications.emit('tasks_paused', { taskIds: paused, userId, organizationId, reason: args.reason });
    }
    return { paused };
  }

  /**
   * "What I did, and what is left." Written by somebody on the job, or by the
   * person who owes it (they may have been taken off it since — the note is
   * exactly what the next person needs). Clears what they owed.
   */
  async addHandover(data: {
    id?: string;
    taskId: string;
    note: string;
    attachmentIds?: string[];
    userId: string;
    organizationId: string;
  }) {
    const note = cleanHandoverNote(data.note);
    const task = await this.prisma.task.findUnique({
      where: { id: data.taskId },
      select: { id: true, title: true, organizationId: true, assignedToId: true, pausedById: true, handoverDueById: true },
    });
    // Another organization's job is not there, as far as this caller knows.
    if (!task || task.organizationId !== data.organizationId) throw new NotFoundException('Task not found');
    const onTheJob =
      task.assignedToId === data.userId ||
      task.handoverDueById === data.userId ||
      task.pausedById === data.userId ||
      !!(await this.prisma.taskAssignee.findFirst({ where: { taskId: task.id, userId: data.userId }, select: { id: true } }));
    if (!onTheJob) {
      throw new ForbiddenException({ message: 'Only somebody on this job can write its handover', code: HANDOVER_CODES.NOT_ON_THE_JOB });
    }
    if (!note) throw new ForbiddenException({ message: 'Write what you did and what is left', code: 'HANDOVER_NOTE_REQUIRED' });

    // Photos are the job's own attachments — never another job's, whatever was sent.
    const wanted = [...new Set((data.attachmentIds ?? []).filter((x) => typeof x === 'string'))].slice(0, HANDOVER_PHOTOS_MAX);
    const attachmentIds = wanted.length
      ? (await this.prisma.attachment.findMany({ where: { id: { in: wanted }, taskId: task.id }, select: { id: true } })).map((a) => a.id)
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

    await this.prisma.task.updateMany({ where: { id: task.id, handoverDueById: data.userId }, data: { handoverDueById: null } });
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
    const recipientIds = [...new Set([task.assignedToId, ...crew.map((c) => c.userId)].filter((id): id is string => !!id && id !== data.userId))];
    this.notifications.emit('task_handover_added', {
      taskId: task.id,
      taskTitle: task.title,
      authorId: data.userId,
      authorName: `${row.author.firstName} ${row.author.lastName}`.trim(),
      recipientIds,
      organizationId: task.organizationId,
    });
    return success(row);
  }

  /**
   * The member's own picture: what they are working on (the clock-out sheet),
   * what they owe a note for (asked on every open), and what is paused on them
   * (offered to resume at the next clock-in).
   */
  async mine(data: { userId: string; organizationId: string }) {
    const select = { id: true, title: true, status: true, pausedAt: true, pausedById: true, locationAddress: true, customer: { select: { name: true } } } as const;
    const [working, owed, paused] = await Promise.all([
      this.workingJobsOf(data.userId, data.organizationId),
      this.prisma.task.findMany({ where: { organizationId: data.organizationId, handoverDueById: data.userId }, select, orderBy: { pausedAt: 'desc' }, take: 20 }),
      this.prisma.task.findMany({
        where: {
          organizationId: data.organizationId,
          pausedAt: { not: null },
          status: { notIn: NEVER_WORKING },
          OR: [{ assignedToId: data.userId }, { assignees: { some: { userId: data.userId } } }],
        },
        select,
        orderBy: { pausedAt: 'desc' },
        take: 20,
      }),
    ]);
    const open = working.length
      ? await this.prisma.task.findMany({ where: { id: { in: working.map((w) => w.id) } }, select, take: 50 })
      : [];
    // "Working 2h 15m" on the clock-out sheet, "2h 15m so far" on a paused job — the member's own share.
    const refs = await this.prisma.task.findMany({
      where: { id: { in: [...new Set([...open, ...paused].map((t) => t.id))] } },
      select: { id: true, workflowId: true, spaceId: true, organizationId: true },
    });
    const mins = await this.jobTime.workedForMany(refs, data.userId);
    const withTime = <T extends { id: string }>(list: T[]) => list.map((t) => ({ ...t, workedMinutes: mins.get(t.id) ?? 0 }));
    return success({ open: withTime(open), owed, paused: withTime(paused) });
  }
}
