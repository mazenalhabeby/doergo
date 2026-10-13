import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DELEGATABLE_KEYS,
  DELEGATION_MAX_DAYS,
  ORG_ACCESS_SELECT,
  delegatedGrant,
  delegationDay,
  grantIsEmpty,
  memberAccessOf,
  personName,
  standInDatesProblem,
  type StandInInput,
  type StandInView,
  type StandInsResponse,
} from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface StandInCaller {
  organizationId: string;
  userId: string;
  /** Admin, or `canManageUsers` held org-wide on their OWN access: may arrange anybody's. */
  managesPeople: boolean;
}

/** Holds, themselves, an approval DECISION a stand-in could carry (seeing the lists alone is nothing to decide). */
function decides(u: any): boolean {
  if (!u) return false;
  const grant = delegatedGrant(memberAccessOf(u), u.role === 'ADMIN');
  if (grantIsEmpty(grant)) return false;
  const deciding = DELEGATABLE_KEYS.filter((k) => k !== 'canViewSpaceAttendance');
  return deciding.some((k) => grant.org[k] || Object.values(grant.perSpace).some((p) => p[k]));
}

const PERSON = { select: { id: true, firstName: true, lastName: true } } as const;

/**
 * Hand-overs of approval decisions (`ApprovalDelegation`). What a stand-in may
 * then do is decided where every permission is — the session and the kinds'
 * own checks (shared `access/delegation.ts`); this only records who, to whom,
 * for which days.
 *
 * Who may arrange one: the leader for themselves (and only when they hold an
 * approval permission to hand over), or whoever manages people for anybody.
 * The stand-in: an active internal member of the same organization, not the
 * leader. One hand-over per leader at a time (no overlapping days). Ending one
 * is open to the leader, the stand-in (they may decline) and people managers.
 */
@Injectable()
export class StandInsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(caller: StandInCaller): Promise<StandInsResponse> {
    const today = await this.today(caller.organizationId);
    const day = new Date(`${today}T00:00:00Z`);
    const rows = await this.prisma.approvalDelegation.findMany({
      where: {
        organizationId: caller.organizationId,
        revokedAt: null,
        endsOn: { gte: day },
        ...(caller.managesPeople ? {} : { OR: [{ fromUserId: caller.userId }, { toUserId: caller.userId }] }),
      },
      select: { id: true, startsOn: true, endsOn: true, note: true, fromUser: PERSON, toUser: PERSON },
      orderBy: { startsOn: 'asc' },
      take: 200,
    });
    const view = (r: (typeof rows)[number]): StandInView => ({
      id: r.id,
      from: { id: r.fromUser.id, name: personName(r.fromUser) },
      to: { id: r.toUser.id, name: personName(r.toUser) },
      startsOn: r.startsOn.toISOString().slice(0, 10),
      endsOn: r.endsOn.toISOString().slice(0, 10),
      note: r.note,
      active: r.startsOn <= day && r.endsOn >= day,
      canEnd: caller.managesPeople || r.fromUser.id === caller.userId || r.toUser.id === caller.userId,
    });
    const all = rows.map(view);
    return {
      given: all.filter((v) => v.from.id === caller.userId),
      received: all.filter((v) => v.to.id === caller.userId),
      others: all.filter((v) => v.from.id !== caller.userId && v.to.id !== caller.userId),
      mayHandOver: await this.holdsSomethingToHandOver(caller.userId, caller.organizationId),
      mayArrange: caller.managesPeople,
      candidates: await this.candidates(caller),
      leaders: caller.managesPeople ? await this.leaders(caller.organizationId) : [],
    };
  }

  /** Internal, active colleagues sharing a workspace with the caller — everybody internal for a people manager. */
  private async candidates(caller: StandInCaller): Promise<Array<{ id: string; name: string }>> {
    const now = new Date();
    let spaceFilter = {};
    if (!caller.managesPeople) {
      const mine = await this.prisma.spaceAssignment.findMany({
        where: { userId: caller.userId, organizationId: caller.organizationId, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] },
        select: { spaceId: true },
      });
      const spaceIds = [...new Set(mine.map((a) => a.spaceId))];
      if (!spaceIds.length) return [];
      spaceFilter = { spaceAssignments: { some: { spaceId: { in: spaceIds }, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] } } };
    }
    const people = await this.prisma.user.findMany({
      where: { organizationId: caller.organizationId, isActive: true, isExternal: false, id: { not: caller.userId }, ...spaceFilter },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 500,
    });
    return people.map((p) => ({ id: p.id, name: personName(p) }));
  }

  /** Everybody who holds an approval permission to hand over (for a people manager arranging one). */
  private async leaders(organizationId: string): Promise<Array<{ id: string; name: string }>> {
    const now = new Date();
    const people = await this.prisma.user.findMany({
      where: { organizationId, isActive: true, isExternal: false },
      select: {
        id: true, firstName: true, lastName: true, ...ORG_ACCESS_SELECT,
        spaceAssignments: {
          where: { effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] },
          select: { spaceId: true, role: { select: { permissions: true, isActive: true } } },
        },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 500,
    });
    return people.filter((u) => decides(u)).map((u) => ({ id: u.id, name: personName(u) }));
  }

  async create(caller: StandInCaller, input: StandInInput): Promise<StandInView> {
    const fromUserId = input.fromUserId && input.fromUserId !== caller.userId ? input.fromUserId : caller.userId;
    if (fromUserId !== caller.userId && !caller.managesPeople) {
      throw new ForbiddenException({ message: 'Only somebody who manages people can arrange a stand-in for someone else.', code: 'STAND_IN_NOT_YOURS' });
    }
    if (!input.toUserId || input.toUserId === fromUserId) {
      throw new BadRequestException({ message: 'Choose somebody else to stand in.', code: 'STAND_IN_SELF' });
    }
    const today = await this.today(caller.organizationId);
    const problem = standInDatesProblem(input.startsOn, input.endsOn, today, DELEGATION_MAX_DAYS);
    if (problem) {
      throw new BadRequestException({ message: STAND_IN_MESSAGES[problem], code: problem, params: { maxDays: DELEGATION_MAX_DAYS } });
    }
    // A hand-over that began earlier starts today: nothing is decided in the past.
    const startsOn = input.startsOn < today ? today : input.startsOn;

    const [from, to] = await Promise.all([
      this.prisma.user.findFirst({ where: { id: fromUserId, organizationId: caller.organizationId, isActive: true }, select: { id: true } }),
      this.prisma.user.findFirst({
        where: { id: input.toUserId, organizationId: caller.organizationId, isActive: true },
        select: { id: true, isExternal: true },
      }),
    ]);
    if (!from || !to) throw new NotFoundException('Member not found');
    // A leader hands over to somebody they work with; a people manager may choose anybody internal.
    if (!caller.managesPeople && !(await this.candidates(caller)).some((c) => c.id === input.toUserId)) {
      throw new BadRequestException({ message: 'Choose somebody who works in one of your workspaces.', code: 'STAND_IN_NOT_A_COLLEAGUE' });
    }
    if (to.isExternal) {
      throw new BadRequestException({ message: 'An external member cannot stand in for one of your leaders.', code: 'STAND_IN_EXTERNAL' });
    }
    if (!(await this.holdsSomethingToHandOver(fromUserId, caller.organizationId))) {
      throw new BadRequestException({ message: 'There are no approval decisions to hand over.', code: 'STAND_IN_NOTHING_TO_HAND_OVER' });
    }
    const overlap = await this.prisma.approvalDelegation.findFirst({
      where: {
        organizationId: caller.organizationId,
        fromUserId,
        revokedAt: null,
        startsOn: { lte: new Date(`${input.endsOn}T00:00:00Z`) },
        endsOn: { gte: new Date(`${startsOn}T00:00:00Z`) },
      },
      select: { id: true },
    });
    if (overlap) {
      throw new BadRequestException({ message: 'There is already a stand-in for some of these days. End it first.', code: 'STAND_IN_OVERLAP' });
    }

    const row = await this.prisma.approvalDelegation.create({
      data: {
        organizationId: caller.organizationId,
        fromUserId,
        toUserId: input.toUserId,
        startsOn: new Date(`${startsOn}T00:00:00Z`),
        endsOn: new Date(`${input.endsOn}T00:00:00Z`),
        note: input.note?.trim().slice(0, 300) || null,
        createdById: caller.userId,
      },
      select: { id: true, startsOn: true, endsOn: true, note: true, fromUser: PERSON, toUser: PERSON },
    });
    const day = new Date(`${today}T00:00:00Z`);
    return {
      id: row.id,
      from: { id: row.fromUser.id, name: personName(row.fromUser) },
      to: { id: row.toUser.id, name: personName(row.toUser) },
      startsOn: row.startsOn.toISOString().slice(0, 10),
      endsOn: row.endsOn.toISOString().slice(0, 10),
      note: row.note,
      active: row.startsOn <= day && row.endsOn >= day,
      canEnd: true,
    };
  }

  /** End a hand-over now. Returns who was standing in, so their session can be refreshed. */
  async end(caller: StandInCaller, id: string): Promise<{ ended: true; toUserId: string; fromUserId: string }> {
    const row = await this.prisma.approvalDelegation.findFirst({
      where: { id, organizationId: caller.organizationId, revokedAt: null },
      select: { id: true, fromUserId: true, toUserId: true },
    });
    // Somebody else's hand-over reads as missing, not as forbidden.
    if (!row || !(caller.managesPeople || row.fromUserId === caller.userId || row.toUserId === caller.userId)) {
      throw new NotFoundException('Stand-in not found');
    }
    await this.prisma.approvalDelegation.update({ where: { id: row.id }, data: { revokedAt: new Date(), revokedById: caller.userId } });
    return { ended: true, toUserId: row.toUserId, fromUserId: row.fromUserId };
  }

  /** Does this member hold, themselves, any approval permission a stand-in could carry? */
  private async holdsSomethingToHandOver(userId: string, organizationId: string): Promise<boolean> {
    return decides(await this.leaderRow(userId, organizationId));
  }

  private async leaderRow(userId: string, organizationId: string) {
    const now = new Date();
    const u = await this.prisma.user.findFirst({
      where: { id: userId, organizationId, isActive: true },
      select: {
        ...ORG_ACCESS_SELECT,
        spaceAssignments: {
          where: { effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] },
          select: { spaceId: true, role: { select: { permissions: true, isActive: true } } },
        },
      },
    });
    return u;
  }

  private async today(organizationId: string): Promise<string> {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { timezone: true } });
    return delegationDay(new Date(), org?.timezone).toISOString().slice(0, 10);
  }
}

const STAND_IN_MESSAGES: Record<string, string> = {
  STAND_IN_DATES_INVALID: 'Choose a first and a last day, the last not before the first.',
  STAND_IN_IN_THE_PAST: 'These days are over.',
  STAND_IN_TOO_LONG: `A stand-in can cover at most ${DELEGATION_MAX_DAYS} days at a time.`,
};
