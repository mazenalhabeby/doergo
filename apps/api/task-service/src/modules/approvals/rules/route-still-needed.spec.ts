import { stillNeededBy } from './route-still-needed';

const holderIds = jest.fn();
jest.mock('@hbcfield/shared', () => ({
  ...jest.requireActual('@hbcfield/shared'),
  roleHolderIds: (...a: unknown[]) => holderIds(...a),
}));

/*
  "Who else can decide" on an item half-way through office rules (real use #2): only who can still give a missing
  approval — never the person who already approved, their stand-in, or somebody without the role still needed.
*/
describe('stillNeededBy', () => {
  const d = (id: string, via: string) => ({ id, name: id, avatarUrl: null, via, onLeave: false, covers: [] }) as never;
  const everyone = [d('anna', 'ORG'), d('hassan', 'ORG'), d('david', 'ORG'), d('ben', 'ORG'), d('john', 'ADMIN')];
  function prisma(step: unknown, standIns: unknown[] = []) {
    return {
      approvalStep: { findMany: jest.fn().mockResolvedValue(step ? [step] : []) },
      approvalRule: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            {
              id: 'r1',
              kind: 'overtime',
              spaceId: null,
              minMinutes: 60,
              secondRoleId: 'payroll',
              isActive: true,
              createdAt: new Date(0),
            },
          ]),
      },
      approvalDelegation: { findMany: jest.fn().mockResolvedValue(standIns) },
    } as never;
  }
  const step = {
    id: 's1',
    firstById: 'anna',
    approverIds: ['anna'],
    requiredRoleIds: ['payroll'],
    doneRoleIds: [],
    firstAt: new Date('2026-10-28T08:00:00Z'),
    facts: { spaceIds: ['s1'], minutes: 90 },
  };
  const ask = { kind: 'overtime' as const, itemId: 'e1' };
  beforeEach(() => holderIds.mockReset().mockResolvedValue(['david', 'ben']));

  it('keeps only the holders of the missing role who have not approved, and administrators', async () => {
    const got = await stillNeededBy(prisma(step), 'o', ask, everyone);
    expect(got.map((x: { id: string }) => x.id)).toEqual(['david', 'ben', 'john']);
  });

  it('drops a stand-in of the person who already approved', async () => {
    const cover = {
      fromUserId: 'anna',
      toUserId: 'ben',
      startsOn: new Date('2026-10-27'),
      endsOn: new Date('2026-10-29'),
      revokedAt: null,
    };
    const got = await stillNeededBy(prisma(step, [cover]), 'o', ask, everyone);
    expect(got.map((x: { id: string }) => x.id)).toEqual(['david', 'john']);
  });

  it('not half-way (no step asked, or none open) → the list as it was', async () => {
    expect(await stillNeededBy(prisma(step), 'o', null, everyone)).toBe(everyone);
    expect(await stillNeededBy(prisma(null), 'o', ask, everyone)).toBe(everyone);
  });
});
