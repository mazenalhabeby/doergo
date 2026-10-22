import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { WorkflowConfigCache } from '../../workflows/config-cache/workflow-config-cache.service';
import { MediaSigner } from '../../../common/storage/media-signer.service';
import { JobTimeService } from '../handover/job-time.service';
import { CrewService } from '../handover/crew.service';
import { PrismaService, peopleNames } from '@hbcfield/shared';
import { type TaskAccessFacts } from '../access/task-access.service';
import { TaskStatus, TaskEventType, success, getStatusCapabilities } from '@hbcfield/shared';
import { TaskSupportService } from '../core/task-support.service';
import { CHECKLIST_PEOPLE } from '../checklist/task-checklist.service';

/**
 * One task as its page reads it: its workspace, the task with its relations and
 * pause facts, and its job time.
 */
@Injectable()
export class TaskDetailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowCache: WorkflowConfigCache,
    private readonly media: MediaSigner,
    // Job time (shared tasks/job-time.ts) — read, never stored.
    private readonly jobTime: JobTimeService,
    // A crew on one job: presence, own stops, the lead (shared tasks/crew.ts).
    private readonly crew: CrewService,
    private readonly support: TaskSupportService,
  ) {}

  /**
   * Find a single task by ID with authorization
   */
  /** The workspace a task lives in, or null. The space id only — no task data. */
  async spaceOf(data: { id: string; organizationId: string }) {
    const task = await this.prisma.task.findFirst({
      where: { id: data.id, organizationId: data.organizationId },
      select: { spaceId: true },
    });
    return success({ spaceId: task?.spaceId ?? null });
  }

  async findOne(data: {
    id: string;
    userId: string;
    userRole: string;
    canViewAllTasks?: boolean;
    organizationId: string;
    sharedSpaceIds?: string[];
    viewAllSpaceIds?: string[];
  }) {
    const task = await this.prisma.task.findUnique({
      where: { id: data.id },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
        organization: { select: { id: true, name: true } },
        openRole: { select: { id: true, name: true } },
        asset: {
          include: {
            category: { select: { id: true, name: true, color: true, icon: true } },
            type: { select: { id: true, name: true } },
          },
        },
        comments: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
        },
        attachments: { orderBy: { createdAt: 'desc' }, take: 50 },
        // What the people before wrote — the newest is the card at the top of the job.
        handovers: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: { author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
        },
        assignees: {
          take: 20,
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
          },
        },
        checklistItems: {
          orderBy: { position: 'asc' },
          take: 100,
          include: CHECKLIST_PEOPLE,
        },
        // Subtask hierarchy
        parent: { select: { id: true, title: true } },
        subtasks: {
          orderBy: { position: 'asc' },
          take: 50,
          include: {
            assignedTo: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
            _count: { select: { subtasks: true, checklistItems: true } },
          },
        },
        // Space — only need its workflowId; the workflow itself comes from the
        // per-org cache (no workflow_statuses join on the hot path).
        space: { select: { id: true, name: true, enabledModules: true, workflowId: true } },
        // Phase & Sprint
        phase: { select: { id: true, name: true, color: true, type: true } },
        sprint: { select: { id: true, name: true, status: true } },
        // Dependencies
        predecessors: {
          take: 50,
          include: {
            predecessor: { select: { id: true, title: true, status: true } },
          },
        },
        successors: {
          take: 50,
          include: {
            successor: { select: { id: true, title: true, status: true } },
          },
        },
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Authorization check
    await this.support.taskAccess.assert(task, data, { roleHolderMayRead: true });

    // Derive task-time anchors from the status history (no schema change), so the
    // timer is DB-backed and identical on web, mobile and the admin view:
    //   acceptedAt  = when the employee first accepted (status → ACCEPTED)
    //   completedAt = when it was completed/closed (freezes the running timer)
    const statusEvents = await this.prisma.taskEvent.findMany({
      where: { taskId: data.id, eventType: TaskEventType.STATUS_CHANGED },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true, metadata: true },
    });
    const ACTIVE = [TaskStatus.ACCEPTED, TaskStatus.EN_ROUTE, TaskStatus.ARRIVED, TaskStatus.IN_PROGRESS];
    let acceptedAt: Date | null = null;
    let completedAt: Date | null = null;
    for (const ev of statusEvents) {
      const ns = (ev.metadata as { newStatus?: string } | null)?.newStatus;
      if (!acceptedAt && ns === TaskStatus.ACCEPTED) acceptedAt = ev.createdAt;
      if (!completedAt && (ns === TaskStatus.COMPLETED || ns === TaskStatus.CLOSED)) completedAt = ev.createdAt;
    }
    // Fallback chain for tasks with no recorded ACCEPTED event (e.g. created
    // directly in an active state, or seed data): first active transition →
    // route start → the task's creation time. Always stable/DB-backed so the
    // timer never resets on reopen.
    if (!acceptedAt) {
      const firstActive = statusEvents.find((ev) => {
        const ns = (ev.metadata as { newStatus?: string } | null)?.newStatus;
        return ACTIVE.some((s) => s === ns);
      });
      const ACTIVE_OR_DONE = [...ACTIVE, TaskStatus.BLOCKED, TaskStatus.COMPLETED, TaskStatus.CLOSED];
      acceptedAt =
        firstActive?.createdAt ??
        task.routeStartedAt ??
        (ACTIVE_OR_DONE.some((s) => s === task.status) ? task.createdAt : null);
    }

    // Effective flow = the task's own workflow, else its space's workflow —
    // resolved from the per-org cache (Redis) instead of a DB join.
    const effWorkflowId = task.workflowId ?? task.space?.workflowId ?? null;
    const effectiveWorkflow = await this.workflowCache.getWorkflow(data.organizationId, effWorkflowId);
    // Capabilities active AT the current status (per-step). The status's own
    // DB-stored capabilities are authoritative (admin-editable); fall back to the
    // shared map only when there's no matching workflow status (legacy tasks).
    const currentStatus = effectiveWorkflow?.statuses?.find((s) => s.key === task.status);
    const capabilities = currentStatus
      ? (currentStatus.capabilities ?? [])
      : getStatusCapabilities(effectiveWorkflow?.name, task.status);

    return success({
      ...task,
      // Signed links, never the stored provider URL — see MediaSigner.
      attachments: await this.media.signAll(task.attachments),
      ...(await this.pauseFacts(task)),
      acceptedAt,
      completedAt,
      capabilities,
      workflow: effectiveWorkflow,
    });
  }

  /**
   * Who paused the job and who still owes its note, by name, with the time they
   * put in — what the reassign warning says ("Mike hasn't written a handover yet
   * — he worked 2h 15m"). Nothing is asked of a job that is neither.
   */
  private async pauseFacts(task: { id: string; pausedById?: string | null; handoverDueById?: string | null }) {
    const ids = [...new Set([task.pausedById, task.handoverDueById].filter((x): x is string => !!x))];
    if (ids.length === 0) return { pausedBy: null, handoverDue: null };
    const [people, lastPause] = await Promise.all([
      peopleNames(this.prisma, ids),
      task.handoverDueById
        ? this.prisma.taskEvent.findFirst({
            where: { taskId: task.id, userId: task.handoverDueById, eventType: TaskEventType.PAUSED },
            orderBy: { createdAt: 'desc' },
            select: { metadata: true },
          })
        : null,
    ]);
    const byId = new Map(people.map((p) => [p.id, p]));
    const who = (id?: string | null) => (id && byId.get(id)) || null;
    return {
      pausedBy: who(task.pausedById),
      handoverDue: task.handoverDueById
        ? {
            user: who(task.handoverDueById),
            workedMinutes: (lastPause?.metadata as { workedMinutes?: number } | null)?.workedMinutes ?? null,
          }
        : null,
    };
  }

  /**
   * A job's time — travel, working, blocked — per worker and in total, and who
   * started it. Anybody who may see the job may see its time.
   */
  async getJobTime(data: TaskAccessFacts & { id: string }) {
    const task = await this.prisma.task.findUnique({ where: { id: data.id } });
    if (!task) throw new NotFoundException('Task not found');
    await this.support.taskAccess.assert(task, data, { roleHolderMayRead: true });
    // The crew panel rides with the time: one request for the job page and the phone.
    const [time, crew] = await Promise.all([this.jobTime.forTask(task), this.crew.viewFor(task.id)]);
    return success({ ...time, crew });
  }

  /** One worker's job time over a period. The gateway decides who may ask about whom. */
  async getJobTimeReport(data: { userId: string; organizationId: string; from: string; to: string }) {
    const from = new Date(data.from);
    const to = new Date(data.to);
    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      to <= from ||
      to.getTime() - from.getTime() > 93 * 86_400_000
    ) {
      throw new BadRequestException('Choose a period of up to three months.');
    }
    return success(await this.jobTime.report({ userId: data.userId, organizationId: data.organizationId, from, to }));
  }
}
