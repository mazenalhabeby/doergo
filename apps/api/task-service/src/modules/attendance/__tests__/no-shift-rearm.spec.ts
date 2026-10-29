/** A workspace's hours without a shift changed: the sessions running there follow at once. */
import { rearmMemberNoShiftSession, rearmNoShiftSessions } from '../core/no-shift-rearm';

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

describe('rearmMemberNoShiftSession (a member’s OWN hours changed)', () => {
  it('re-times only THAT member’s running session, by the same two updates', async () => {
    const $executeRaw = jest.fn().mockResolvedValue(1);
    const res = await rearmMemberNoShiftSession({ $executeRaw } as any, {
      userId: 'u1', spaceId: 's1', organizationId: 'o1', fromMinutes: 480, toMinutes: 360,
    });
    expect(res).toEqual({ reminders: 1, limits: 1 });
    for (const c of $executeRaw.mock.calls) {
      // The scope rides as a nested Prisma.Sql fragment.
      const scope = c.find((x: any) => x && typeof x === 'object' && !Array.isArray(x) && 'strings' in x) as any;
      expect(scope.sql).toContain('"userId" = ');
      expect(scope.values).toEqual(['u1']);
      expect(scope.sql).not.toContain('NOT EXISTS');
    }
    expect($executeRaw.mock.calls[1]).toContain(-120);
  });
});
