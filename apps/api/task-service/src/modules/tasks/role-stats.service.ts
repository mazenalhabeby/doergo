import { Injectable } from '@nestjs/common';
import { personName, success } from '@hbcfield/shared';
import { TaskEventType } from '@prisma/client';
import { OVER } from './role-pool-helpers';
import { RolePoolBase } from './role-pool.base';

/** Per role: opened, taken, how long it took, open and overdue now, who takes them. */
@Injectable()
export class RoleStatsService extends RolePoolBase {
  // ── The report ────────────────────────────────────────────────────────

  /**
   * Per role: how many were opened, taken, still open and overdue, the average
   * minutes to take (from the latest offer — a hand-back re-offers it), and who
   * takes most. From the OPENED_TO_ROLE / TAKEN events and the open rows —
   * three queries for any period.
   */
  async stats(data: { organizationId: string; spaceIds?: string[]; from?: string; to?: string }) {
    if (data.spaceIds && data.spaceIds.length === 0) return success({ roles: [] });
    const range = {
      ...(data.from ? { gte: new Date(`${data.from}T00:00:00.000Z`) } : {}),
      ...(data.to ? { lte: new Date(`${data.to}T23:59:59.999Z`) } : {}),
    };
    const spaceWhere = data.spaceIds ? { spaceId: { in: data.spaceIds } } : {};
    const [opened, openNow, takes] = await Promise.all([
      // "Opened" from the history, not `Task.openedAt` — a hand-back restarts that clock and would move the job into another period.
      this.prisma.taskEvent.findMany({
        where: {
          eventType: TaskEventType.OPENED_TO_ROLE,
          task: { organizationId: data.organizationId, ...spaceWhere },
          ...(data.from || data.to ? { createdAt: range } : {}),
        },
        select: { metadata: true },
        orderBy: { createdAt: 'desc' },
        take: 5000,
      }),
      this.prisma.task.findMany({
        where: {
          organizationId: data.organizationId,
          openRoleId: { not: null },
          openSpotsLeft: { gt: 0 },
          status: { notIn: OVER },
          ...spaceWhere,
        },
        select: { openRoleId: true, openWave: true },
      }),
      this.prisma.taskEvent.findMany({
        where: {
          eventType: TaskEventType.TAKEN,
          task: { organizationId: data.organizationId, ...spaceWhere },
          ...(data.from || data.to ? { createdAt: range } : {}),
        },
        select: { userId: true, metadata: true, user: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5000,
      }),
    ]);
    const openedBy = new Map<string, number>();
    for (const o of opened) {
      const id = (o.metadata as any)?.roleId as string | undefined;
      if (id) openedBy.set(id, (openedBy.get(id) ?? 0) + 1);
    }
    const roleIds = [...new Set([...openedBy.keys(), ...openNow.map((o) => o.openRoleId!)])];
    const roles = await this.prisma.accessRole.findMany({
      where: { id: { in: roleIds } },
      select: { id: true, name: true },
    });
    const out = roles.map((r) => {
      const mine = takes.filter((t) => (t.metadata as any)?.roleId === r.id);
      const waits = mine
        .map((t) => (t.metadata as any)?.waitedMinutes)
        .filter((n): n is number => typeof n === 'number');
      const byPerson = new Map<string, { name: string; count: number }>();
      for (const t of mine) {
        const cur = byPerson.get(t.userId) ?? { name: personName(t.user), count: 0 };
        cur.count++;
        byPerson.set(t.userId, cur);
      }
      return {
        roleId: r.id,
        roleName: r.name,
        opened: openedBy.get(r.id) ?? 0,
        taken: mine.length,
        avgMinutesToTake: waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null,
        openNow: openNow.filter((o) => o.openRoleId === r.id).length,
        overdue: openNow.filter((o) => o.openRoleId === r.id && o.openWave >= 2).length,
        topTakers: [...byPerson.values()].sort((a, b) => b.count - a.count).slice(0, 5),
      };
    });
    return success({ roles: out.sort((a, b) => a.roleName.localeCompare(b.roleName)) });
  }
}
