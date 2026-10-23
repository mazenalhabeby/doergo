import type { Prisma } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { personName, PrismaService } from '@hbcfield/shared';
import { keepOrgUserIds } from '../../common/records/org-user-ids';

/**
 * Who lives at an address (a member or a client) and the address's timeline:
 * resolving residents, keeping one home per member per space, and logging what
 * happened to the unit.
 */
@Injectable()
export class UnitResidentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Resolve residentUserId → member (staff resident) in one batched query. The
   *  id has no FK (removing a member never blocks), so we join it here. DRY: used
   *  by both getUnit and listSpaceUnits. */
  async withResidentUsers<T extends { residentUserId?: string | null }>(units: T[]) {
    const ids = Array.from(new Set(units.map((u) => u.residentUserId).filter(Boolean) as string[]));
    if (!ids.length) return units.map((u) => ({ ...u, residentUser: null }));
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, firstName: true, lastName: true, avatarUrl: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    return units.map((u) => ({ ...u, residentUser: u.residentUserId ? (byId.get(u.residentUserId) ?? null) : null }));
  }

  /** One home per member per space: when a member is set as an apartment's
   *  resident, clear them from every OTHER unit in the same space so a member
   *  never appears to live in two apartments at once. Single source of truth,
   *  called from createUnit / updateUnit / setMemberApartment. */
  async clearMemberElsewhere(
    userId: string,
    spaceId: string | null | undefined,
    organizationId: string,
    exceptUnitId?: string,
  ) {
    if (!userId || !spaceId) return;
    await this.prisma.customerUnit.updateMany({
      where: {
        organizationId,
        spaceId,
        residentUserId: userId,
        ...(exceptUnitId ? { id: { not: exceptUnitId } } : {}),
      },
      data: { residentUserId: null },
    });
  }

  /** Keep only ids that are real users in this org — the shared helper, capped at 20. */
  keepOrgUserIds(ids: string[], organizationId: string): Promise<string[]> {
    return keepOrgUserIds(this.prisma, ids, organizationId, { cap: 20 });
  }

  logUnitActivity(data: {
    unitId: string;
    organizationId: string;
    type: string;
    body?: string;
    authorId?: string | null;
    metadata?: Prisma.InputJsonValue;
  }) {
    return this.prisma.unitActivity
      .create({
        data: {
          organizationId: data.organizationId,
          unitId: data.unitId,
          type: data.type,
          body: data.body ?? null,
          authorId: data.authorId ?? null,
          metadata: data.metadata ?? undefined,
        },
      })
      .catch(() => undefined); // activity logging is best-effort, never blocks the write
  }

  /** Resolve a resident's display name (member or client) for a system log. */
  async residentDisplayName(
    residentUserId: string | null,
    customerId: string | null,
    organizationId: string,
  ): Promise<string | null> {
    if (residentUserId) {
      const u = await this.prisma.user.findFirst({
        where: { id: residentUserId, organizationId },
        select: { firstName: true, lastName: true },
      });
      return u ? personName(u) : null;
    }
    if (customerId) {
      const c = await this.prisma.customer.findFirst({
        where: { id: customerId, organizationId },
        select: { name: true },
      });
      return c?.name ?? null;
    }
    return null;
  }
}
