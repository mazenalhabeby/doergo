import { noShowResolvedTime } from '../../../handlers/attendance-notification.handler';

describe('the "arrived after all" time', () => {
  it('is the tap in the entry\'s own zone', () => {
    expect(noShowResolvedTime('2026-09-14T05:58:00.000Z', 'Europe/Vienna')).toBe('07:58');
  });
  it('falls back to UTC for a missing or broken zone rather than failing the notification', () => {
    expect(noShowResolvedTime('2026-09-14T05:58:00.000Z', null)).toBe('05:58');
    expect(noShowResolvedTime('2026-09-14T05:58:00.000Z', 'Not/AZone')).toBe('05:58');
  });
});
