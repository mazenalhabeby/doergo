/** A workspace's hours without a shift changed: the sessions running there follow at once. */
import { rearmNoShiftSessions } from '../no-shift-rearm';

const sqlOf = (call: unknown[]) => (call[0] as TemplateStringsArray).join('?');

describe('rearmNoShiftSessions', () => {
  it('moves the first reminder of free sessions and the end of limited ones, in two bulk updates', async () => {
    const $executeRaw = jest.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(1);
    const res = await rearmNoShiftSessions({ $executeRaw } as any, { spaceId: 's1', organizationId: 'o1', fromMinutes: 480, toMinutes: 600 });
    expect(res).toEqual({ reminders: 3, limits: 1 });
    expect($executeRaw).toHaveBeenCalledTimes(2);
    const [free, limited] = $executeRaw.mock.calls;
    // Only open sessions in THIS workspace and organization; never a closed row.
    for (const c of [free, limited]) {
      expect(sqlOf(c)).toContain('"locationId" = ?');
      expect(sqlOf(c)).toContain('"organizationId" = ?');
      expect(sqlOf(c)).toContain('"status" = ?');
    }
    expect(free).toContain(600);
    expect(sqlOf(free)).toContain('"reminderCount" = 0');
    expect(limited).toContain(120); // the change, applied to the limit's end
    expect(sqlOf(limited)).toContain('"endIsDailyLimit" = true');
  });

  it('no change, no write', async () => {
    const $executeRaw = jest.fn();
    expect(await rearmNoShiftSessions({ $executeRaw } as any, { spaceId: 's1', organizationId: 'o1', fromMinutes: 480, toMinutes: 480 })).toEqual({ reminders: 0, limits: 0 });
    expect($executeRaw).not.toHaveBeenCalled();
  });
});
