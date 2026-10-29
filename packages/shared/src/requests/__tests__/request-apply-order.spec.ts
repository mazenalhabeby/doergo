/**
 * Two changed-hours answers for one day (one with no workspace, one for this workspace) used to
 * be decided by whichever the database returned last. The rule is fixed now: the more specific
 * answer last, then the newer approval, then the id.
 */
import { applyApprovedRequests, requestApplyOrder, type ApprovedDayRequest } from '../request-kinds';

const atLocal = (hm: string, nextDay?: boolean) => new Date(`2026-10-2${nextDay ? 5 : 4}T${hm}:00.000Z`);
const apply = (requests: ApprovedDayRequest[]) =>
  applyApprovedRequests({ spaceId: 's', expectedClockInAt: null, expectedClockOutAt: null, requests, atLocal });

const everywhere: ApprovedDayRequest = { id: 'b', kind: 'HOURS', spaceId: null, startTime: '07:00', endTime: '15:00' };
const here: ApprovedDayRequest = { id: 'a', kind: 'HOURS', spaceId: 's', startTime: '09:00', endTime: '17:00' };

describe('requestApplyOrder — the same answer whatever order the rows arrive in', () => {
  it("this workspace's own hours win over hours set for everywhere", () => {
    for (const rows of [[everywhere, here], [here, everywhere]]) {
      const e = apply(rows);
      expect(e.expectedClockInAt).toEqual(new Date('2026-10-24T09:00:00Z'));
      expect(e.expectedClockOutAt).toEqual(new Date('2026-10-24T17:00:00Z'));
    }
  });

  it('two answers at one level: the newer approval wins, then the id', () => {
    const older = { ...here, id: 'z', approvedAt: '2026-10-20T08:00:00Z', endTime: '16:00' };
    const newer = { ...here, id: 'y', approvedAt: '2026-10-22T08:00:00Z', endTime: '18:00' };
    expect(requestApplyOrder([newer, older]).map((r) => r.id)).toEqual(['z', 'y']);
    expect(apply([newer, older]).expectedClockOutAt).toEqual(new Date('2026-10-24T18:00:00Z'));
    expect(requestApplyOrder([{ ...here, id: 'q' }, { ...here, id: 'p' }]).map((r) => r.id)).toEqual(['p', 'q']);
  });
});
