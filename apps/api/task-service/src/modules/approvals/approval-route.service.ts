import { Injectable } from '@nestjs/common';
import {
  ABSENCE_WHERE,
  ORG_ACCESS_SELECT,
  decideVia,
  isApprovalKind,
  memberAccessOf,
  personName,
  sortDeciders,
  type ApprovalDecider,
  type ApprovalKind,
  type ApprovalRouting,
} from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationRoutingService } from '../../common/notification-routing.service';

/** "Who else can decide" is a hint, not a directory: the first few, and how many more. */
const MAX_DECIDERS = 8;

export interface ApprovalRouteInput {
  organizationId: string;
  callerId: string;
  kind: ApprovalKind;
  spaceId: string | null;
  subjectUserId: string | null;
}

/**
 * Who could decide one approval, and who is told about the person.
 *
 * Deciders are worked out with THE access resolver (`memberAccessOf`) and the
 * kind's own decide key (`decideVia`) — the same answer each kind's guard
 * gives — for every active member of the organization, in ONE query. The
 * person it is about never decides their own; the caller is left out (they
 * know). "Told" is the notification routing that already exists (watchers ∪
 * the workspace's notify routing) — informed, not deciding.
 *
 * The gateway only asks about an item of the caller's own inbox.
 */
@Injectable()
export class ApprovalRouteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly routing: NotificationRoutingService,
  ) {}

  async route(input: ApprovalRouteInput): Promise<ApprovalRouting> {
    if (!input?.organizationId || !isApprovalKind(input.kind)) return { deciders: [], moreDeciders: 0, told: [] };
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const [members, told] = await Promise.all([
      this.prisma.user.findMany({
        where: { organizationId: input.organizationId, isActive: true, id: { notIn: [input.callerId, ...(input.subjectUserId ? [input.subjectUserId] : [])] } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          isExternal: true,
          ...ORG_ACCESS_SELECT,
          // Only the workspace in question matters; none for an org-wide kind or an item with no workspace.
          spaceAssignments: input.spaceId
            ? { where: { spaceId: input.spaceId, ...activeWindow(now) }, select: { spaceId: true, role: { select: { permissions: true, isActive: true } } } }
            : { where: { id: '__none__' }, select: { spaceId: true } },
        },
      }),
      input.subjectUserId
        ? this.routing.resolveWatchers(input.subjectUserId, input.organizationId, 'attendance').catch(() => ({ ids: [] as string[], emails: [] }))
        : Promise.resolve({ ids: [] as string[], emails: [] }),
    ]);

    const deciders: ApprovalDecider[] = [];
    for (const m of members) {
      const via = decideVia({ isAdmin: m.role === 'ADMIN', access: memberAccessOf(m as never) }, input.kind, input.spaceId);
      if (via) deciders.push({ id: m.id, name: personName(m), avatarUrl: m.avatarUrl ?? null, via, onLeave: false });
    }

    // Who of them is away today — said, so an item is not left waiting on somebody on holiday.
    if (deciders.length) {
      const away = await this.prisma.timeOff.findMany({
        where: { technicianId: { in: deciders.map((d) => d.id) }, status: 'APPROVED', ...ABSENCE_WHERE, startDate: { lte: today }, endDate: { gte: today } },
        select: { technicianId: true },
      });
      const off = new Set(away.map((a) => a.technicianId));
      for (const d of deciders) d.onLeave = off.has(d.id);
    }

    const sorted = sortDeciders(deciders);
    const deciderIds = new Set(deciders.map((d) => d.id));
    const toldIds = told.ids.filter((id) => !deciderIds.has(id) && id !== input.callerId);
    const toldPeople = toldIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: toldIds.slice(0, 20) } }, select: { id: true, firstName: true, lastName: true } })
      : [];

    return {
      deciders: sorted.slice(0, MAX_DECIDERS),
      moreDeciders: Math.max(0, sorted.length - MAX_DECIDERS),
      told: toldPeople.map((p) => ({ id: p.id, name: personName(p) })),
    };
  }
}

function activeWindow(now: Date) {
  return { effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] };
}
