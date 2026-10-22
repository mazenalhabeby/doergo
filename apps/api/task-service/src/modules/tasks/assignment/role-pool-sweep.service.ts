import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { dueWave, isOpenToRole, minutesWaited, roleOfferTimings, runWithCronLock } from '@hbcfield/shared';
import { OVER, ROLE_WAVE_CLOSED } from './role-pool-helpers';
import { RolePoolBase } from './role-pool.base';
import { emitEvent, roleTaskUnclaimedEvent } from '@hbcfield/shared/microservices';

/** The minute sweep that widens an open role's offer in waves and alerts the creator. */
@Injectable()
export class RolePoolSweepService extends RolePoolBase {
  // ── Waves ─────────────────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_MINUTE)
  async sweepCron(): Promise<void> {
    await runWithCronLock(this.prisma, { name: 'task:roleOffers', ttlSeconds: 55, logger: this.logger }, () =>
      this.sweep(),
    );
  }

  /**
   * Move every still-open role task to the wave it is due: widen the offer,
   * then tell whoever opened it. Each step is CLAIMED (openWave from → to), so
   * a replica that slipped past the lease cannot send it twice. Bounded.
   */
  async sweep(now: Date = new Date()): Promise<number> {
    const open = await this.prisma.task.findMany({
      where: { openRoleId: { not: null }, openSpotsLeft: { gt: 0 }, openWave: { lt: 2 }, status: { notIn: OVER } },
      select: {
        id: true,
        status: true,
        priority: true,
        openedAt: true,
        openWave: true,
        openRoleId: true,
        openSpotsLeft: true,
        space: { select: { roleOfferWidenMin: true, roleOfferAlertMin: true } },
      },
      orderBy: { openedAt: 'asc' },
      take: 200,
    });
    let moved = 0;
    for (const t of open) {
      if (!t.openedAt || !isOpenToRole(t)) {
        // Finished by a name the query cannot know ("DONE"…): out of the queue, so it never blocks the oldest-first window.
        await this.prisma.task.updateMany({
          where: { id: t.id, openWave: t.openWave },
          data: { openWave: ROLE_WAVE_CLOSED, openSpotsLeft: 0 },
        });
        continue;
      }
      const due = dueWave({ openedAt: t.openedAt, priority: t.priority }, now, roleOfferTimings(t.space));
      if (due <= t.openWave) continue;
      const claimed = await this.prisma.task.updateMany({
        where: { id: t.id, openWave: t.openWave },
        data: { openWave: due },
      });
      if (claimed.count === 0) continue;
      moved++;
      try {
        if (t.openWave < 1) await this.offer(t.id, 1);
        if (due === 2) await this.alertCreator(t.id, now);
      } catch (e) {
        this.logger.error(`Role offer wave for ${t.id} failed: ${e}`);
      }
    }
    return moved;
  }

  /** Nobody took it in time: whoever opened it hears so, with the three best to give it to. */
  private async alertCreator(taskId: string, now: Date) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        title: true,
        organizationId: true,
        spaceId: true,
        createdById: true,
        openedAt: true,
        openRoleId: true,
        openSpotsLeft: true,
        status: true,
        locationLat: true,
        locationLng: true,
        openRole: { select: { name: true } },
      },
    });
    if (!task || !task.spaceId || !isOpenToRole(task)) return;
    const ranked = await this.candidates(task.organizationId, task.spaceId, task.openRoleId!, {
      lat: task.locationLat,
      lng: task.locationLng,
    });
    const best = ranked
      .filter((c) => c.state === 'FREE' || c.state === 'BUSY')
      .slice(0, 3)
      .map((c) => c.name);
    emitEvent(this.notifications, roleTaskUnclaimedEvent, {
      task: { id: task.id, title: task.title, organizationId: task.organizationId },
      roleName: task.openRole?.name ?? '',
      minutes: minutesWaited(task.openedAt, now) ?? 0,
      names: best,
      notifyIds: [task.createdById],
    });
  }
}
