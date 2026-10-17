import { Injectable, BadRequestException, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { success, assertFoundInOrg } from '@hbcfield/shared';
import { RecurringTasksBase } from './recurring-tasks.base';

/** Running repeats: the poller that makes every task that is due, and making one now by hand. */
@Injectable()
export class RecurringRunnerService extends RecurringTasksBase implements OnModuleInit, OnModuleDestroy {

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
   * Manually generate a task from a recurring template
   */
  async generate(data: { id: string; organizationId: string; userId: string }) {
    const template = await this.prisma.recurringTaskTemplate.findUnique({
      where: { id: data.id } });

    assertFoundInOrg(template, data.organizationId, 'Recurring task template');

    if (!template.isActive) {
      throw new BadRequestException('Cannot generate task from inactive template');
    }

    // Check if endDate has passed
    if (template.endDate && new Date() > template.endDate) {
      throw new BadRequestException('Template end date has passed');
    }

    // Create the task (space-, type- and flow-aware)
    const task = await this.materializeTask(template, data.userId);

    // Update template: set lastGeneratedAt and calculate next run
    const now = new Date();
    const nextRunAt = this.calculateNextRun(
      template.frequency,
      template.startDate,
      now,
      template.dayOfWeek ?? undefined,
      template.dayOfMonth ?? undefined,
      template.customDays ?? undefined,
    );

    // If nextRunAt is past endDate, keep it null (template expired)
    const finalNextRunAt = template.endDate && nextRunAt && nextRunAt > template.endDate
      ? null
      : nextRunAt;

    await this.prisma.recurringTaskTemplate.update({
      where: { id: template.id },
      data: {
        lastGeneratedAt: now,
        nextRunAt: finalNextRunAt } });

    // Return the created task with includes
    const fullTask = await this.prisma.task.findUnique({
      where: { id: task.id },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        assignees: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } } },
        checklistItems: { orderBy: { position: 'asc' } } } });

    return success(fullTask, 'Task generated from recurring template');
  }

  /**
   * Scheduler tick: find every active template whose nextRunAt has arrived,
   * claim each atomically (compare-and-swap on nextRunAt so concurrent workers
   * don't double-generate), then create its task.
   */
  async runDue(): Promise<number> {
    const now = new Date();
    const due = await this.prisma.recurringTaskTemplate.findMany({
      where: {
        isActive: true,
        nextRunAt: { lte: now },
        OR: [{ endDate: null }, { endDate: { gte: now } }] },
      take: 200 });

    let generated = 0;
    for (const template of due) {
      const next = this.calculateNextRun(
        template.frequency,
        template.startDate,
        now,
        template.dayOfWeek ?? undefined,
        template.dayOfMonth ?? undefined,
        template.customDays ?? undefined,
      );
      const finalNext = template.endDate && next && next > template.endDate ? null : next;

      // Claim: only proceed if nextRunAt is still exactly what we read.
      const claim = await this.prisma.recurringTaskTemplate.updateMany({
        where: { id: template.id, nextRunAt: template.nextRunAt },
        data: { lastGeneratedAt: now, nextRunAt: finalNext } });
      if (claim.count !== 1) continue;

      try {
        await this.materializeTask(template, template.createdById);
        generated++;
      } catch (e) {
        this.logger.error(`Recurring generate failed for template ${template.id}: ${e}`);
      }
    }

    if (generated > 0) this.logger.log(`Recurring scheduler generated ${generated} task(s)`);
    return generated;
  }
}
