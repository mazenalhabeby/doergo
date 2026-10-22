import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import * as shared from '@hbcfield/shared';
import { StandInsService } from '../stand-ins.service';

jest.mock('@hbcfield/shared', () => ({
  ...jest.requireActual('@hbcfield/shared'),
  orgTimezone: jest.fn(),
  personRef: jest.fn(),
  activeMemberAccessFacts: jest.fn(),
  colleaguesByName: jest.fn(),
  isExternalAccount: jest.fn(),
  staffWithAccess: jest.fn(),
}));

/**
 * A stand-in is REAL authority, so who may arrange one and for whom is narrow:
 * the leader for themselves (only when they hold a decision to hand over) or a
 * people manager for anybody; the stand-in is an internal colleague, never the
 * leader; one hand-over per leader at a time; nothing decided in the past.
 * Ending is open to the leader, the stand-in and people managers — anybody else
 * reads it as missing.
 */
const ORG = 'org-1';
const mocked = shared as unknown as Record<string, jest.Mock>;
const leader = { userId: 'lea', organizationId: ORG, managesPeople: false };
const manager = { userId: 'hr', organizationId: ORG, managesPeople: true };

const ADMIN_FACTS = { role: 'ADMIN' };
const SPACE_LEADER = {
  role: 'MANAGER',
  spaceAssignments: [{ spaceId: 'site', role: { isActive: true, permissions: { canApproveAttendance: true } } }],
};
const ONLY_SEES_LISTS = {
  role: 'MANAGER',
  spaceAssignments: [{ spaceId: 'site', role: { isActive: true, permissions: { canViewSpaceAttendance: true } } }],
};
const person = (id: string, isExternal = false) => ({ id, firstName: id, lastName: 'X', isExternal });
const row = (over: Record<string, unknown> = {}) => ({
  id: 'd1',
  startsOn: new Date('2026-10-22T00:00:00Z'),
  endsOn: new Date('2026-10-24T00:00:00Z'),
  note: null,
  fromUser: person('lea'),
  toUser: person('sam'),
  ...over,
});

function setup() {
  const prisma: any = {
    approvalDelegation: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(async () => row()),
      update: jest.fn(),
    },
    spaceAssignment: { findMany: jest.fn().mockResolvedValue([{ spaceId: 'site' }]) },
  };
  mocked.orgTimezone.mockResolvedValue({ timezone: 'UTC' } as any);
  mocked.personRef.mockImplementation(async (_p: unknown, id: string) => person(id) as any);
  mocked.activeMemberAccessFacts.mockResolvedValue(SPACE_LEADER as any);
  mocked.colleaguesByName.mockResolvedValue([person('sam')] as any);
  mocked.isExternalAccount.mockResolvedValue(false);
  mocked.staffWithAccess.mockResolvedValue([] as any);
  return { prisma, svc: new StandInsService(prisma) };
}

const days = { toUserId: 'sam', startsOn: '2026-10-22', endsOn: '2026-10-24' };

beforeAll(() => jest.useFakeTimers({ now: new Date('2026-10-22T10:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] }));
afterAll(() => jest.useRealTimers());
beforeEach(() => jest.clearAllMocks());

describe('arranging a stand-in', () => {
  it('a leader arranges one for themselves, to a colleague, for whole days', async () => {
    const { prisma, svc } = setup();
    await svc.create(leader, { ...days, note: '  On holiday  ' });
    expect(prisma.approvalDelegation.create.mock.calls[0][0].data).toMatchObject({
      organizationId: ORG,
      fromUserId: 'lea',
      toUserId: 'sam',
      startsOn: new Date('2026-10-22T00:00:00Z'),
      endsOn: new Date('2026-10-24T00:00:00Z'),
      note: 'On holiday',
      createdById: 'lea',
    });
  });

  it('only a people manager arranges one for somebody else', async () => {
    const { prisma, svc } = setup();
    await expect(svc.create(leader, { ...days, fromUserId: 'boss' })).rejects.toThrow(ForbiddenException);
    await svc.create(manager, { ...days, fromUserId: 'lea' });
    expect(prisma.approvalDelegation.create.mock.calls[0][0].data.fromUserId).toBe('lea');
  });

  it('never the leader themselves', async () => {
    const { svc } = setup();
    await expect(svc.create(leader, { ...days, toUserId: 'lea' })).rejects.toMatchObject({
      response: { code: 'STAND_IN_SELF' },
    });
  });

  it.each([
    [{ startsOn: '2026-10-25', endsOn: '2026-10-24' }, 'STAND_IN_DATES_INVALID'],
    [{ startsOn: '22.10.2026', endsOn: '2026-10-24' }, 'STAND_IN_DATES_INVALID'],
    [{ startsOn: '2026-10-01', endsOn: '2026-10-21' }, 'STAND_IN_IN_THE_PAST'],
    [{ startsOn: '2026-10-22', endsOn: '2027-10-22' }, 'STAND_IN_TOO_LONG'],
  ])('refuses the days %p with %s', async (range, code) => {
    const { prisma, svc } = setup();
    await expect(svc.create(leader, { toUserId: 'sam', ...range })).rejects.toMatchObject({ response: { code } });
    expect(prisma.approvalDelegation.create).not.toHaveBeenCalled();
  });

  it('a hand-over that began earlier starts today — nothing is decided in the past', async () => {
    const { prisma, svc } = setup();
    await svc.create(leader, { ...days, startsOn: '2026-10-20' });
    expect(prisma.approvalDelegation.create.mock.calls[0][0].data.startsOn).toEqual(new Date('2026-10-22T00:00:00Z'));
  });

  it('a leader hands over to somebody in one of their workspaces; a people manager to anybody internal', async () => {
    const { svc } = setup();
    mocked.colleaguesByName.mockResolvedValue([person('other')] as any);
    await expect(svc.create(leader, days)).rejects.toMatchObject({ response: { code: 'STAND_IN_NOT_A_COLLEAGUE' } });
    await expect(svc.create(manager, { ...days, fromUserId: 'lea' })).resolves.toBeDefined();
  });

  it('a leader assigned to no workspace has no colleagues to choose', async () => {
    const { prisma, svc } = setup();
    prisma.spaceAssignment.findMany.mockResolvedValueOnce([]);
    await expect(svc.create(leader, days)).rejects.toMatchObject({ response: { code: 'STAND_IN_NOT_A_COLLEAGUE' } });
    expect(mocked.colleaguesByName).not.toHaveBeenCalled();
  });

  it('an external member never hands over, and never stands in', async () => {
    const { svc } = setup();
    mocked.personRef.mockImplementation(async (_p: unknown, id: string) => person(id, id === 'lea') as any);
    await expect(svc.create(leader, days)).rejects.toThrow('cannot hand their decisions');
    mocked.personRef.mockImplementation(async (_p: unknown, id: string) => person(id, id === 'sam') as any);
    await expect(svc.create(leader, days)).rejects.toThrow('cannot stand in');
  });

  it('a member of another organization (or a gone one) is not found', async () => {
    const { svc } = setup();
    mocked.personRef.mockImplementation(async (_p: unknown, id: string) => (id === 'sam' ? null : person(id)) as any);
    await expect(svc.create(leader, days)).rejects.toThrow(NotFoundException);
    expect(mocked.personRef.mock.calls[1]).toEqual([expect.anything(), 'sam', ORG, { active: true }]);
  });

  it('there must be a DECISION to hand over — seeing the lists alone is nothing', async () => {
    const { svc } = setup();
    mocked.activeMemberAccessFacts.mockResolvedValue(ONLY_SEES_LISTS as any);
    await expect(svc.create(leader, days)).rejects.toMatchObject({
      response: { code: 'STAND_IN_NOTHING_TO_HAND_OVER' },
    });
    mocked.activeMemberAccessFacts.mockResolvedValue({ role: 'EMPLOYEE' } as any);
    await expect(svc.create(leader, days)).rejects.toMatchObject({
      response: { code: 'STAND_IN_NOTHING_TO_HAND_OVER' },
    });
    mocked.activeMemberAccessFacts.mockResolvedValue(ADMIN_FACTS as any);
    await expect(svc.create(leader, days)).resolves.toBeDefined();
  });

  it('one hand-over per leader at a time', async () => {
    const { prisma, svc } = setup();
    prisma.approvalDelegation.findFirst.mockResolvedValueOnce({ id: 'existing' });
    await expect(svc.create(leader, days)).rejects.toMatchObject({ response: { code: 'STAND_IN_OVERLAP' } });
    expect(prisma.approvalDelegation.findFirst.mock.calls[0][0].where).toEqual({
      organizationId: ORG,
      fromUserId: 'lea',
      revokedAt: null,
      startsOn: { lte: new Date('2026-10-24T00:00:00Z') },
      endsOn: { gte: new Date('2026-10-22T00:00:00Z') },
    });
    expect(prisma.approvalDelegation.create).not.toHaveBeenCalled();
  });
});

describe('ending a stand-in', () => {
  it.each([
    ['the leader', leader],
    ['the stand-in (they may decline)', { userId: 'sam', organizationId: ORG, managesPeople: false }],
    ['a people manager', manager],
  ])('%s may end it', async (_who, caller) => {
    const { prisma, svc } = setup();
    prisma.approvalDelegation.findFirst.mockResolvedValueOnce({ id: 'd1', fromUserId: 'lea', toUserId: 'sam' });
    await expect(svc.end(caller, 'd1')).resolves.toEqual({ ended: true, toUserId: 'sam', fromUserId: 'lea' });
    expect(prisma.approvalDelegation.update.mock.calls[0][0].data).toMatchObject({ revokedById: caller.userId });
  });

  it("anybody else's hand-over reads as missing, and is not touched", async () => {
    const { prisma, svc } = setup();
    prisma.approvalDelegation.findFirst.mockResolvedValueOnce({ id: 'd1', fromUserId: 'lea', toUserId: 'sam' });
    await expect(svc.end({ userId: 'eve', organizationId: ORG, managesPeople: false }, 'd1')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.approvalDelegation.update).not.toHaveBeenCalled();
    expect(prisma.approvalDelegation.findFirst.mock.calls[0][0].where).toEqual({
      id: 'd1',
      organizationId: ORG,
      revokedAt: null,
    });
  });
});

describe('listing', () => {
  it('a member sees only their own hand-overs; a people manager sees all, and the leaders', async () => {
    const { prisma, svc } = setup();
    await svc.list(leader);
    expect(prisma.approvalDelegation.findMany.mock.calls[0][0].where).toMatchObject({
      OR: [{ fromUserId: 'lea' }, { toUserId: 'lea' }],
    });
    mocked.staffWithAccess.mockResolvedValueOnce([
      { id: 'a', firstName: 'A', lastName: 'Lead', ...SPACE_LEADER },
      { id: 'b', firstName: 'B', lastName: 'Worker', role: 'EMPLOYEE' },
    ] as any);
    const res = await svc.list(manager);
    expect(prisma.approvalDelegation.findMany.mock.calls[1][0].where.OR).toBeUndefined();
    expect(res.leaders.map((l) => l.id)).toEqual(['a']);
  });

  it('sorts into given / received / others, with today marked active', async () => {
    const { prisma, svc } = setup();
    prisma.approvalDelegation.findMany.mockResolvedValueOnce([
      row(),
      row({
        id: 'd2',
        fromUser: person('sam'),
        toUser: person('lea'),
        startsOn: new Date('2026-11-01T00:00:00Z'),
        endsOn: new Date('2026-11-02T00:00:00Z'),
      }),
    ]);
    const res = await svc.list(leader);
    expect(res.given.map((g) => [g.id, g.active, g.canEnd])).toEqual([['d1', true, true]]);
    expect(res.received.map((g) => [g.id, g.active])).toEqual([['d2', false]]);
    expect(res.others).toEqual([]);
    expect(res.mayArrange).toBe(false);
    expect(res.mayHandOver).toBe(true);
  });

  it('an external member may never hand over', async () => {
    const { svc } = setup();
    mocked.isExternalAccount.mockResolvedValueOnce(true);
    expect((await svc.list(leader)).mayHandOver).toBe(false);
  });
});
