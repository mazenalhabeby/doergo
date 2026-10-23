/**
 * The Time page says when today's hours were changed (set by the office, or agreed), and by whom.
 */
import { changedHoursToday } from '../changed-hours';

const req = (over: Record<string, unknown>) =>
  ({
    id: 'r',
    technicianId: 'u',
    status: 'APPROVED',
    kind: 'HOURS',
    startDate: '2026-10-23T00:00:00.000Z',
    endDate: '2026-10-23T00:00:00.000Z',
    startTime: '07:00',
    endTime: '16:00',
    approvedBy: { id: 'a', firstName: 'Anna', lastName: 'Müller' },
    reason: 'Delivery',
    createdAt: '',
    updatedAt: '',
    ...over,
  }) as never;

describe('changedHoursToday', () => {
  it('names the hours, who set them and why', () => {
    expect(changedHoursToday([req({})], '2026-10-23')).toEqual({
      start: '07:00',
      end: '16:00',
      night: false,
      by: 'Anna Müller',
      reason: 'Delivery',
    });
  });
  it('knows a night', () => {
    expect(changedHoursToday([req({ startTime: '18:00', endTime: '06:00' })], '2026-10-23')?.night).toBe(true);
  });
  it('ignores another day, a pending request, and leave', () => {
    expect(changedHoursToday([req({})], '2026-10-24')).toBeNull();
    expect(changedHoursToday([req({ status: 'PENDING' })], '2026-10-23')).toBeNull();
    expect(changedHoursToday([req({ kind: 'LEAVE' })], '2026-10-23')).toBeNull();
  });
});
