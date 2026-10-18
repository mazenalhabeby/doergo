import { isClockableAssignment, statusSpace } from '../status-clockable';

/*
  The status read's workspaces carry `clockable` — the clock-in check's own rule
  (clockableWorkspaces: started, active, not Remote, this org, Time Tracking on).
  The phone chooses where to clock in from it; without the tag it offered
  workspaces the server then refused.
*/
const now = new Date('2026-10-18T08:00:00Z');
const a = (over: Record<string, unknown> = {}, space: Record<string, unknown> = {}) =>
  ({
    effectiveFrom: new Date('2026-10-01T00:00:00Z'),
    ...over,
    space: {
      id: 'sp-1',
      isActive: true,
      isRemote: false,
      organizationId: 'org',
      enabledModules: ['time_tracking'],
      organization: { enabledModules: ['time_tracking'] },
      ...space,
    },
  }) as never;

describe('isClockableAssignment', () => {
  it('a started assignment at an active workspace running Time Tracking is clockable', () => {
    expect(isClockableAssignment(a(), 'org', now)).toBe(true);
  });
  it('an assignment that starts later is not (it was offered and refused)', () => {
    expect(isClockableAssignment(a({ effectiveFrom: new Date('2026-10-25T00:00:00Z') }), 'org', now)).toBe(false);
  });
  it('Time Tracking off at the workspace is not', () => {
    expect(isClockableAssignment(a({}, { enabledModules: ['tasks'] }), 'org', now)).toBe(false);
  });
  it('inactive, the Remote bucket, or another organization is not', () => {
    expect(isClockableAssignment(a({}, { isActive: false }), 'org', now)).toBe(false);
    expect(isClockableAssignment(a({}, { isRemote: true }), 'org', now)).toBe(false);
    expect(isClockableAssignment(a(), 'other-org', now)).toBe(false);
  });
  it('the reply keeps its old shape — the extra columns stay server-side', () => {
    const out = statusSpace({ id: 'x', name: 'X', isRemote: false, enabledModules: [], organization: null });
    expect(out).toEqual({ id: 'x', name: 'X' });
  });
});
