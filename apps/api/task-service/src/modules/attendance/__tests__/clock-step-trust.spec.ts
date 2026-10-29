/**
 * What the server believes at clock-in / clock-out (audit 2026-10-29): the moment, the zone,
 * the leniency of an offline record, the replacing clock-out, the Remote bucket.
 */
import { judgeClockStep, approvalFor } from '../core/attendance-occurrence';
import { clockInZones } from '../clock-in/clock-in-helpers';
import { applyNoShiftAllowance } from '../clock-in/clock-in-no-shift';
import { ClockInContextService } from '../clock-in/clock-in-context.service';
import { judgeProvisionalReplacement } from '../clock-out/provisional-replacement';
import { assertSpaceInOrg } from '../../../common/tenant-scope.util';
import { SpaceMembershipService } from '../../spaces/space-membership.service';

const NOW = new Date('2026-10-29T12:00:00Z');
const minsAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);
const unanchored = (at: Date) => ({ occurredAt: at.toISOString() });
/** Anchored, but the phone's clock disagrees with the anchored estimate by an hour. */
const suspect = (at: Date) => ({
  occurredAt: at.toISOString(),
  uptimeMs: 2_000_000,
  anchor: { serverTime: new Date(at.getTime() - 3_600_000 - 1_000_000).toISOString(), uptimeMs: 1_000_000 },
});

describe('judgeClockStep — is the moment vouched for', () => {
  it('UNANCHORED and more than 15 min old → TIME_UNVERIFIED, PENDING', () => {
    const judged = judgeClockStep(unanchored(minsAgo(5 * 60)), null, NOW);
    expect(judged.flags).toEqual(expect.arrayContaining(['UNANCHORED', 'RECORDED_OFFLINE', 'TIME_UNVERIFIED']));
    expect(approvalFor(judged.flags)).toBe('PENDING');
  });
  it('CLOCK_SUSPECT and more than 15 min old → TIME_UNVERIFIED', () => {
    expect(judgeClockStep(suspect(minsAgo(20)), null, NOW).flags).toContain('TIME_UNVERIFIED');
  });
  it('within 15 minutes nothing changes (network delay) — still approved on its own', () => {
    const judged = judgeClockStep(unanchored(minsAgo(14)), null, NOW);
    expect(judged.flags).not.toContain('TIME_UNVERIFIED');
    expect(approvalFor(judged.flags)).toBe('AUTO');
  });
  it('no evidence at all (a screen online) is now — never unverified, never lenient', () => {
    expect(judgeClockStep(undefined, null, NOW)).toMatchObject({ at: NOW, flags: [], lenient: false });
  });
  it('the offline leniency needs a moment more than 10 minutes old, not any RECORDED_OFFLINE (2 min)', () => {
    const threeMin = judgeClockStep(unanchored(minsAgo(3)), null, NOW);
    expect(threeMin.flags).toContain('RECORDED_OFFLINE');
    expect(threeMin.lenient).toBe(false);
    expect(judgeClockStep(unanchored(minsAgo(11)), null, NOW).lenient).toBe(true);
  });
});

describe('clockInZones — one planning zone', () => {
  const austria = { lat: 47.9813, lng: 13.8269 };
  it('a workspace WITH coordinates plans in its own zone; the GPS zone is stored for display', () => {
    const z = clockInZones(austria, { ...austria, timezone: 'Europe/London' }, 'UTC');
    expect(z).toEqual({ planningTz: 'Europe/London', entryTz: 'Europe/Vienna' });
  });
  it('a workspace WITHOUT coordinates plans in the GPS zone, else the organization zone', () => {
    const logical = { lat: null, lng: null, timezone: 'Europe/London' };
    expect(clockInZones(austria, logical, 'America/New_York').planningTz).toBe('Europe/Vienna');
    expect(clockInZones({}, logical, 'America/New_York')).toEqual({
      planningTz: 'America/New_York',
      entryTz: 'America/New_York',
    });
  });
});

describe('the no-shift day: SHIFT_ONLY kept only when genuinely recorded offline', () => {
  const context = {
    noShiftAllowanceFor: jest.fn().mockResolvedValue({ kind: 'refused', reason: 'SHIFT_ONLY' }),
  } as unknown as ClockInContextService;
  const user = { timezone: null, organization: { timezone: 'Europe/Vienna' } } as never;
  const location = { id: 'loc', name: 'Yard', timezone: 'Europe/Vienna' } as never;
  const run = (lenient: boolean, flagReasons: string[]) =>
    applyNoShiftAllowance(context, 'u1', user, location, 'Europe/Vienna', NOW, {
      dayRequests: [],
      stampCols: {},
      flagReasons,
      lenient,
    });

  it('RECORDED_OFFLINE 3 minutes old is refused NO_SHIFT_TODAY — it could have been refused live', async () => {
    await expect(run(false, ['RECORDED_OFFLINE'])).rejects.toMatchObject({ response: { code: 'NO_SHIFT_TODAY' } });
  });
  it('more than 10 minutes old is kept as a day without a shift', async () => {
    const flags = ['RECORDED_OFFLINE'];
    await run(true, flags);
    expect(flags).toContain('UNSCHEDULED_DAY');
  });
});

describe('a clock-out replacing a temporary close', () => {
  const provisionalAt = new Date('2026-10-28T18:00:00Z');
  it('later than the next shift began → refused CLOCK_OUT_AFTER_NEXT_SHIFT (409)', () => {
    expect(() =>
      judgeProvisionalReplacement({
        provisionalAt,
        at: new Date('2026-10-29T07:00:00Z'),
        nextClockInAt: new Date('2026-10-29T06:00:00Z'),
      }),
    ).toThrow(
      expect.objectContaining({
        status: 409,
        response: expect.objectContaining({ code: 'CLOCK_OUT_AFTER_NEXT_SHIFT' }),
      }),
    );
  });
  it('more than 12 h past the temporary close → counted, flagged for a person', () => {
    const flags = judgeProvisionalReplacement({
      provisionalAt,
      at: new Date('2026-10-29T06:01:00Z'),
      nextClockInAt: null,
    });
    expect(flags).toEqual(['CLOCK_OUT_LONG_AFTER_CLOSE']);
    expect(approvalFor(flags)).toBe('PENDING');
  });
  it('within 12 h (and before the next shift) → nothing to say', () => {
    expect(
      judgeProvisionalReplacement({
        provisionalAt,
        at: new Date('2026-10-28T21:00:00Z'),
        nextClockInAt: new Date('2026-10-29T06:00:00Z'),
      }),
    ).toEqual([]);
  });
});

describe('the Remote bucket', () => {
  it('two first remote clock-ins at once: the loser of the unique index reads the winner', async () => {
    const winner = { id: 'bucket-1', isRemote: true };
    const prisma = {
      companyLocation: {
        findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(winner),
        create: jest.fn().mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' })),
      },
    };
    const context = new ClockInContextService(prisma as never, {} as never);
    await expect(context.getOrCreateRemoteBucket('org-1')).resolves.toBe(winner);
  });
  it('nobody is assigned to it — a workspace role write refuses REMOTE_BUCKET_NOT_ASSIGNABLE', async () => {
    const prisma = { companyLocation: { findFirst: jest.fn().mockResolvedValue({ id: 'b', isRemote: true }) } };
    await expect(assertSpaceInOrg(prisma as never, 'b', 'org-1', { assignable: true })).rejects.toMatchObject({
      response: { code: 'REMOTE_BUCKET_NOT_ASSIGNABLE' },
    });
    // Reads of it (the past, the attendance pages) are unchanged.
    await expect(assertSpaceInOrg(prisma as never, 'b', 'org-1')).resolves.toBeUndefined();
  });
  it('…and so does assigning a member to it as a location', async () => {
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'u1' }) },
      companyLocation: { findFirst: jest.fn().mockResolvedValue({ id: 'b', isRemote: true }) },
      spaceAssignment: { upsert: jest.fn(), updateMany: jest.fn() },
    };
    const service = new SpaceMembershipService(prisma as never, {} as never);
    await expect(
      service.assignTechnician({ userId: 'u1', locationId: 'b', requestingUserId: 'admin', organizationId: 'org-1' }),
    ).rejects.toMatchObject({ response: { code: 'REMOTE_BUCKET_NOT_ASSIGNABLE' } });
    expect(prisma.spaceAssignment.upsert).not.toHaveBeenCalled();
  });
});
