import {
  candidateState,
  dueWave,
  isOpenToRole,
  minutesWaited,
  parseRoleSpots,
  rankCandidates,
  roleOfferTimings,
  spotsTaken,
  waveRecipients,
  type RoleCandidate,
} from '@hbcfield/shared/client';

/** A task open to a work role (packages/shared/src/tasks/role-pool.ts). */
const person = (o: Partial<RoleCandidate> & { userId: string }): RoleCandidate => ({
  name: o.userId, clockedIn: true, onActiveJob: false, onLeave: false, rosteredToday: true,
  distanceKm: null, jobsToday: 0, takenThisWeek: 0, ...o,
});

describe('who is free', () => {
  it('free = on the clock, no job running, not on leave', () => {
    expect(candidateState(person({ userId: 'a' }))).toBe('FREE');
    expect(candidateState(person({ userId: 'a', onActiveJob: true }))).toBe('BUSY');
    expect(candidateState(person({ userId: 'a', clockedIn: false }))).toBe('NOT_WORKING');
    expect(candidateState(person({ userId: 'a', onLeave: true, clockedIn: true }))).toBe('ON_LEAVE');
  });
});

describe('ranking', () => {
  it('free first, then nearest, then fewest jobs today, then fewest taken this week', () => {
    const ranked = rankCandidates([
      person({ userId: 'busy', onActiveJob: true, distanceKm: 0.1 }),
      person({ userId: 'far', distanceKm: 9 }),
      person({ userId: 'near', distanceKm: 2 }),
      person({ userId: 'near-loaded', distanceKm: 2, jobsToday: 3 }),
      person({ userId: 'off', clockedIn: false }),
      person({ userId: 'leave', onLeave: true }),
    ]);
    expect(ranked.map((r) => r.userId)).toEqual(['near', 'near-loaded', 'far', 'busy', 'off', 'leave']);
  });
  it('shares the work: fewer takes this week wins a tie', () => {
    const ranked = rankCandidates([person({ userId: 'a', takenThisWeek: 4 }), person({ userId: 'b', takenThisWeek: 1 })]);
    expect(ranked[0]!.userId).toBe('b');
  });
  it('an unknown position ranks after a known one', () => {
    const ranked = rankCandidates([person({ userId: 'unknown' }), person({ userId: 'known', distanceKm: 40 })]);
    expect(ranked[0]!.userId).toBe('known');
  });
});

describe('waves', () => {
  const t = roleOfferTimings(null);
  const at = (min: number) => new Date(Date.parse('2026-10-06T08:00:00Z') + min * 60_000);
  const opened = '2026-10-06T08:00:00Z';
  it('defaults 10 / 30 minutes, the alert never before the widening, bounded', () => {
    expect(t).toEqual({ widenMin: 10, alertMin: 30 });
    expect(roleOfferTimings({ roleOfferWidenMin: 20, roleOfferAlertMin: 5 })).toEqual({ widenMin: 20, alertMin: 20 });
    expect(roleOfferTimings({ roleOfferWidenMin: 0, roleOfferAlertMin: 99999 })).toEqual({ widenMin: 1, alertMin: 1440 });
  });
  it('free first, everyone working today after 10 min, the creator after 30', () => {
    expect(dueWave({ openedAt: opened }, at(3), t)).toBe(0);
    expect(dueWave({ openedAt: opened }, at(10), t)).toBe(1);
    expect(dueWave({ openedAt: opened }, at(30), t)).toBe(2);
  });
  it('urgent goes to everyone at once', () => {
    expect(dueWave({ openedAt: opened, priority: 'URGENT' }, at(0), t)).toBe(1);
  });
  it('wave 0 reaches the free; wave 1 everyone working today; never leave; never twice', () => {
    const ranked = rankCandidates([
      person({ userId: 'free' }),
      person({ userId: 'busy', onActiveJob: true }),
      person({ userId: 'later', clockedIn: false, rosteredToday: true }),
      person({ userId: 'dayoff', clockedIn: false, rosteredToday: false }),
      person({ userId: 'leave', onLeave: true }),
    ]);
    expect(waveRecipients(ranked, 0)).toEqual(['free']);
    expect(waveRecipients(ranked, 1, new Set(['free'])).sort()).toEqual(['busy', 'later']);
  });
});

describe('places', () => {
  it('open while a place is left and the work is not over', () => {
    expect(isOpenToRole({ openRoleId: 'r', openSpotsLeft: 1, status: 'NEW' })).toBe(true);
    expect(isOpenToRole({ openRoleId: 'r', openSpotsLeft: 0, status: 'NEW' })).toBe(false);
    expect(isOpenToRole({ openRoleId: 'r', openSpotsLeft: 1, status: 'DONE' })).toBe(false);
    expect(isOpenToRole({ openRoleId: null, openSpotsLeft: 1, status: 'NEW' })).toBe(false);
  });
  it('"1 of 2 taken", a clean number of people, minutes waited', () => {
    expect(spotsTaken({ openSpots: 2, openSpotsLeft: 1 })).toEqual({ taken: 1, of: 2 });
    expect(parseRoleSpots('3')).toBe(3);
    expect(parseRoleSpots(0)).toBe(1);
    expect(parseRoleSpots(99)).toBe(20);
    expect(parseRoleSpots('x')).toBe(1);
    expect(minutesWaited('2026-10-06T08:00:00Z', new Date('2026-10-06T08:04:30Z'))).toBe(5);
    expect(minutesWaited(null, new Date())).toBeNull();
  });
});
