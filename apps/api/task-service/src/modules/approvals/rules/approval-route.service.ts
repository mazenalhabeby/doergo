import { Injectable } from '@nestjs/common';
import {
  APPROVAL_KIND_SPECS,
  grantHolds,
  standInsOn,
  decideVia,
  isApprovalKind,
  memberAccessOf,
  personName,
  sortDeciders,
  type ApprovalDecider,
  type ApprovalRouting,
  type ApprovalKind,
  peopleNames,
  orgTimezone,
  orgMembersWithAccess,
} from '@hbcfield/shared';
import { PrismaService } from '@hbcfield/shared';
import { NotificationRoutingService } from '../../notification-routing/notification-routing.service';
import type { ApprovalRouteInput as SharedApprovalRouteInput } from '@hbcfield/shared/microservices';
import { decidersAbout, type WorkspaceDecider } from './workspace-deciders';
import { awayOn, leaveDay } from './away-today';

/** "Who else can decide" is a hint, not a directory: the first few, and how many more. */
const MAX_DECIDERS = 8;

export type ApprovalRouteInput = SharedApprovalRouteInput;

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
    const [all, told] = await Promise.all([
      this.workspaceDeciders(
        input.organizationId,
        input.spaceId || null,
        [input.kind],
        [input.callerId, ...(input.subjectUserId ? [input.subjectUserId] : [])],
      ),
      input.subjectUserId
        ? this.routing
            .resolveWatchers(input.subjectUserId, input.organizationId, 'attendance')
            .catch(() => ({ ids: [] as string[], emails: [] }))
        : Promise.resolve({ ids: [] as string[], emails: [] }),
    ]);
    const deciders: ApprovalDecider[] = decidersAbout(all, input.subjectUserId)
      .filter((d) => d.id !== input.callerId)
      .map(({ covers: _c, ...d }) => d);

    const sorted = sortDeciders(deciders);
    const deciderIds = new Set(deciders.map((d) => d.id));
    const toldIds = told.ids.filter((id) => !deciderIds.has(id) && id !== input.callerId);
    const toldPeople = toldIds.length ? await peopleNames(this.prisma, toldIds.slice(0, 20)) : [];

    return {
      deciders: sorted.slice(0, MAX_DECIDERS),
      moreDeciders: Math.max(0, sorted.length - MAX_DECIDERS),
      told: toldPeople.map((p) => ({ id: p.id, name: personName(p) })),
    };
  }

  /**
   * Everyone who may decide ANY of `kinds` in one workspace today — uncapped, nobody excluded yet (callers
   * drop the subject with `decidersAbout`, which also drops a stand-in covering them). Built once per
   * workspace and reused for every member there: one members query, one stand-ins read, one leave read.
   * Deciders come from THE access resolver and each kind's own decide key (`decideVia`), so this is the
   * answer every kind's guard gives; a stand-in decides where the leader they cover does, for today.
   */
  async workspaceDeciders(
    organizationId: string,
    spaceId: string | null,
    kinds: readonly ApprovalKind[],
    /** People who are not candidates at all (the caller, the subject) — left out of the query. */
    exclude: readonly string[] = [],
  ): Promise<WorkspaceDecider[]> {
    const now = new Date();
    const [members, org] = await Promise.all([
      orgMembersWithAccess(this.prisma, { organizationId, exclude: [...exclude], spaceId, now }),
      orgTimezone(this.prisma, organizationId),
    ]);
    const today = leaveDay(now, org?.timezone);
    const standIns = await standInsOn(this.prisma as never, organizationId, today).catch(() => new Map());

    const out: WorkspaceDecider[] = [];
    for (const m of members) {
      const access = memberAccessOf(m as never);
      let via: WorkspaceDecider['via'] | null = null;
      for (const kind of kinds) {
        via = strongest(via, decideVia({ isAdmin: m.role === 'ADMIN', access }, kind, spaceId));
      }
      let covers: string[] = [];
      const standIn = standIns.get(m.id);
      if (!via && standIn) {
        const coversHere = kinds.some((kind) => {
          const key = APPROVAL_KIND_SPECS[kind].decideKey;
          return APPROVAL_KIND_SPECS[kind].orgWide
            ? !!standIn.grant.org[key as never]
            : grantHolds(standIn.grant, key as never, spaceId);
        });
        if (coversHere) {
          via = 'DELEGATED';
          covers = standIn.from.map((f: { userId: string }) => f.userId);
        }
      }
      if (via) out.push({ id: m.id, name: personName(m), avatarUrl: m.avatarUrl ?? null, via, onLeave: false, covers });
    }

    // Who of them is away today — said, so an item is not left waiting on somebody on holiday.
    if (out.length) {
      const off = await awayOn(
        this.prisma,
        out.map((d) => d.id),
        today,
      );
      for (const d of out) d.onLeave = off.has(d.id);
    }
    return out;
  }
}

/** The closest authority of two (the workspace's own before the organization's before an admin's). */
function strongest(
  a: WorkspaceDecider['via'] | null,
  b: WorkspaceDecider['via'] | null,
): WorkspaceDecider['via'] | null {
  if (!a) return b;
  if (!b) return a;
  const rank: Record<string, number> = { ASSIGNED: 0, DELEGATED: 1, SPACE: 2, ORG: 3, ADMIN: 4 };
  return rank[a] <= rank[b] ? a : b;
}
