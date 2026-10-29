import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import type { RecurringTaskTemplate } from '@prisma/client';
import { success, assertFoundInOrg, PrismaService, workspaceZone } from '@hbcfield/shared';
import { nextRunPast, withinEnd } from './recurring-schedule';
import { activeTemplateAssignees, materializeTask } from './recurring-materialize';
import { TaskRecordsService } from '../tasks/records/task-records.service';
import { TASK_CREATE_INCLUDE } from '../tasks/records/task-create-steps';

/** The refusal a screen translates: the run was made a moment ago (by the scheduler or another tap). */
export const RECURRING_RUN_TAKEN = 'RECURRING_RUN_TAKEN';

type Outcome = { made: { id: string } } | { taken: true } | { paused: true };

/** Running repeats: the poller that makes every task that is due, and making one now by hand. */
@Injectable()
export class RecurringRunnerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RecurringRunnerService.name);

  constructor(
    private readonly prisma: PrismaService,
    /** A generated job is announced exactly like a typed one (TaskRecordsService.announceNew). */
    private readonly records: TaskRecordsService,
  ) {}

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  /** How often the scheduler scans for due templates. */
  private readonly POLL_INTERVAL_MS = 5 * 60 * 1000;

  onModuleInit() {
    // Poll for due recurring templates and auto-generate their tasks. One
    // indexed query per tick (`[nextRunAt, isActive]`), claims each template
    // atomically so multiple instances can't double-generate.
    this.pollTimer = setInterval(() => {
      this.runDue().catch((e) => this.logger.error(`Recurring scheduler error: ${e}`));
    }, this.POLL_INTERVAL_MS);
    this.logger.log('Recurring task scheduler started (every 5 min)');
    // Run once shortly after boot so a just-due template doesn't wait a full tick.
    setTimeout(() => {
      this.runDue().catch((e) => this.logger.error(`Recurring scheduler error: ${e}`));
    }, 15_000);
  }

  onModuleDestroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  /**
   * Make the NEXT planned run now, by hand. It is that run taken early — the schedule moves on from it —
   * and it is claimed exactly as the scheduler claims it, so a tap and a tick never make the same job twice.
   */
  async generate(data: { id: string; organizationId: string; userId: string }) {
    const template = await this.prisma.recurringTaskTemplate.findUnique({ where: { id: data.id } });

    assertFoundInOrg(template, data.organizationId, 'Recurring task template');

    if (!template.isActive) {
      throw new BadRequestException('Cannot generate task from inactive template');
    }
    // Past its end (or no run left before it).
    if ((template.endDate && new Date() > template.endDate) || !template.nextRunAt) {
      throw new BadRequestException('Template end date has passed');
    }

    const outcome = await this.runOnce(template, new Date(), data.userId);
    if ('paused' in outcome) throw new NotFoundException('Space not found in this organization');
    if ('taken' in outcome) {
      throw new ConflictException({ message: 'This run was just made. Refresh to see it.', code: RECURRING_RUN_TAKEN });
    }

    // Return the created task with includes
    const fullTask = await this.prisma.task.findUnique({
      where: { id: outcome.made.id },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        assignees: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
        checklistItems: { orderBy: { position: 'asc' } },
      },
    });

    return success(fullTask, 'Task generated from recurring template');
  }

  /** Scheduler tick: every active template whose planned run has arrived makes it (each claimed once). */
  async runDue(): Promise<number> {
    const now = new Date();
    const due = await this.prisma.recurringTaskTemplate.findMany({
      where: {
        isActive: true,
        nextRunAt: { lte: now },
        OR: [{ endDate: null }, { endDate: { gte: now } }],
      },
      take: 200,
    });

    let generated = 0;
    for (const template of due) {
      try {
        if ('made' in (await this.runOnce(template, now, template.createdById))) generated++;
      } catch (e) {
        this.logger.error(`Recurring generate failed for template ${template.id}: ${e}`);
      }
    }

    if (generated > 0) this.logger.log(`Recurring scheduler generated ${generated} task(s)`);
    return generated;
  }

  /**
   * One run: claim the PLANNED run (compare-and-swap on nextRunAt) and make its job in ONE transaction —
   * a failure gives the run back for the next tick instead of losing it. The next run is the planned one
   * plus a period in the workspace's zone (recurring-schedule.ts), never "now" plus a period.
   */
  private async runOnce(template: RecurringTaskTemplate, now: Date, userId: string): Promise<Outcome> {
    // An archived workspace takes no new work: the repeat is paused (switched off), not left failing.
    if (template.spaceId && !(await this.spaceIsActive(template.spaceId))) {
      await this.prisma.recurringTaskTemplate.updateMany({ where: { id: template.id }, data: { isActive: false } });
      this.logger.warn(`Recurring template ${template.id} paused: its workspace is archived`);
      return { paused: true };
    }
    const planned = template.nextRunAt!;
    const zone = await workspaceZone(this.prisma, template);
    const rule = {
      frequency: template.frequency,
      dayOfWeek: template.dayOfWeek,
      dayOfMonth: template.dayOfMonth,
      customDays: template.customDays,
    };
    // Due → the first planned run after now (runs missed while down make ONE job); early → the one after it.
    const floor = planned > now ? planned : now;
    const next = withinEnd(nextRunPast(rule, planned, floor, zone), template.endDate);
    const people = await activeTemplateAssignees(this.prisma, template, now);

    const made = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.recurringTaskTemplate.updateMany({
        where: { id: template.id, nextRunAt: planned, isActive: true },
        data: { lastGeneratedAt: now, nextRunAt: next },
      });
      if (claim.count !== 1) return null;
      return materializeTask(tx, template, userId, people);
    });
    if (!made) return { taken: true };

    const task = await this.prisma.task.findUniqueOrThrow({ where: { id: made.id }, include: TASK_CREATE_INCLUDE });
    await this.records.announceNew(task, userId, people[0] ?? null, {
      source: 'recurring_template',
      templateId: template.id,
      templateTitle: template.title,
    });
    return { made };
  }

  private async spaceIsActive(spaceId: string): Promise<boolean> {
    const space = await this.prisma.companyLocation.findUnique({ where: { id: spaceId }, select: { isActive: true } });
    return !!space?.isActive;
  }
}
