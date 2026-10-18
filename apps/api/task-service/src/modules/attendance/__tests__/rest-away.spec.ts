import { RestAwayService, LEFT_FOR_REST_REASON, type RestAwayEntry } from '../rest-away.service';

/**
 * Lunch off site is the rest (decided 2026-10-18): leaving inside a planned rest's
 * window starts it — no excursion — and coming back ends it. New entries only.
 */
const at = (hhmm: string) => new Date(`2026-10-20T${hhmm}:00.000Z`);
const lunch = {
  ruleId: 'r-lunch',
  name: 'Lunch',
  dueAt: at('12:00').toISOString(),
  expiresAt: at('13:30').toISOString(),
  durationMinutes: 30,
  isPaid: false,
  required: true,
  state: 'PENDING',
  snoozeCount: 0,
  snoozeMin: 10,
  maxSnoozes: 3,
};

function build() {
  const breaks = {
    startBreak: jest.fn().mockResolvedValue({ success: true, data: { id: 'b-new' } }),
    endBreak: jest.fn().mockResolvedValue({ success: true }),
  };
  const notify = { emit: jest.fn() };
  const svc = new RestAwayService(breaks as never, notify as never);
  return { svc, breaks, notify };
}

const entry = (over: Partial<RestAwayEntry> = {}): RestAwayEntry => ({
  id: 'e1',
  userId: 'u1',
  organizationId: 'org',
  labelRules: 1,
  breakPlan: [lunch] as never,
  breaks: [],
  location: { name: 'Warehouse' },
  ...over,
});

describe('rest on leaving the site', () => {
  it('leaving inside the lunch window starts the lunch, as the Break button would', async () => {
    const { svc, breaks, notify } = build();
    const r = await svc.onLeftSite(entry(), at('12:08'));
    expect(r).toEqual({ isRest: true, startedBreakId: 'b-new' });
    expect(breaks.startBreak).toHaveBeenCalledWith(
      expect.objectContaining({
        entryId: 'e1',
        ruleId: 'r-lunch',
        type: 'LUNCH',
        reason: LEFT_FOR_REST_REASON,
        evidence: { occurredAt: at('12:08').toISOString() },
      }),
    );
    expect(notify.emit).toHaveBeenCalledWith('attendance_rest_started', expect.objectContaining({ restName: 'Lunch' }));
  });

  it('leaving outside any rest window is not a rest — the excursion flow decides', async () => {
    const { svc, breaks } = build();
    expect(await svc.onLeftSite(entry(), at('10:00'))).toEqual({ isRest: false, startedBreakId: null });
    expect(breaks.startBreak).not.toHaveBeenCalled();
  });

  it('an old entry (no label rules) keeps today’s behaviour', async () => {
    const { svc, breaks } = build();
    expect((await svc.onLeftSite(entry({ labelRules: null }), at('12:08'))).isRest).toBe(false);
    expect(breaks.startBreak).not.toHaveBeenCalled();
  });

  it('already resting: leaving is part of that rest, nothing new started', async () => {
    const { svc, breaks } = build();
    const r = await svc.onLeftSite(entry({ breaks: [{ id: 'b1', reason: null }] }), at('12:08'));
    expect(r).toEqual({ isRest: true, startedBreakId: null });
    expect(breaks.startBreak).not.toHaveBeenCalled();
  });

  it('a rest that cannot start leaves the excursion flow in charge', async () => {
    const { svc, breaks } = build();
    breaks.startBreak.mockRejectedValue(new Error('You are already on a break'));
    expect((await svc.onLeftSite(entry(), at('12:08'))).isRest).toBe(false);
  });

  it('coming back ends only a rest that started by leaving', async () => {
    const { svc, breaks } = build();
    expect(await svc.onBackOnSite(entry({ breaks: [{ id: 'b1', reason: null }] }), at('12:40'))).toBe(false);
    expect(breaks.endBreak).not.toHaveBeenCalled();
    expect(await svc.onBackOnSite(entry({ breaks: [{ id: 'b2', reason: LEFT_FOR_REST_REASON }] }), at('12:40'))).toBe(
      true,
    );
    expect(breaks.endBreak).toHaveBeenCalledWith(
      expect.objectContaining({ breakId: 'b2', evidence: { occurredAt: at('12:40').toISOString() } }),
    );
  });
});
