import { ApprovalService } from '../approval.service';
import { CountedTimeService } from '../counted-time.service';

/**
 * The office's correction paths, held to the rules every other path follows.
 *
 *  - an edit subtracts only the rests that do NOT count as work (it took paid
 *    rests off too);
 *  - the expected start is the persisted one, so a legacy-schedule entry keeps
 *    LATE_ARRIVAL; the daily limit is re-read like any time flag;
 *  - a clock-out at or before the clock-in is refused with a code;
 *  - correcting a temporarily closed entry makes it final, so the member's late
 *    tap cannot overwrite it;
 *  - closing an open entry does not approve away its review flags, and ends the
 *    rest still running;
 *  - deleting your own entry is refused like editing it, and leaves an audit row.
 */
const ORG = 'org-1';
const OFFICE = 'office-1';
const MEMBER = 'member-1';
const t = (hm: string) => new Date(`2026-09-07T${hm}:00Z`);

function build(entry: Record<string, any>, opts: { ownerAdmin?: boolean } = {}) {
  const prisma: any = {
    timeEntry: {
      findFirst: jest.fn().mockResolvedValue(entry),
      update: jest.fn().mockImplementation(async ({ data }: any) => ({ ...entry, ...data })),
      delete: jest.fn().mockResolvedValue({}),
    },
    break: { update: jest.fn().mockResolvedValue({}) },
    shift: { findUnique: jest.fn().mockResolvedValue(null) },
    user: { findFirst: jest.fn().mockResolvedValue(opts.ownerAdmin ? { id: OFFICE } : null) },
    activityLog: { create: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
  const svc = new ApprovalService(prisma, new CountedTimeService(prisma), { emit: jest.fn() } as any);
  return { svc, prisma };
}

const closedEntry = (over: Record<string, any> = {}) => ({
  id: 'e1',
  userId: MEMBER,
  organizationId: ORG,
  locationId: 'loc-1',
  status: 'CLOCKED_OUT',
  clockInAt: t('08:00'),
  clockOutAt: t('16:00'),
  expectedClockInAt: t('08:00'),
  expectedClockOutAt: t('16:00'),
  endIsDailyLimit: false,
  shiftId: null,
  breakMinutes: 45,
  unpaidBreakMinutes: 30, // a paid 15-minute rest + an unpaid 30-minute lunch
  flagReasons: [],
  approvalStatus: 'AUTO',
  isEdited: false,
  clockOutProvisional: false,
  breakPlan: null,
  breaks: [],
  notes: null,
  timezone: 'UTC',
  ...over,
});

const edit = (svc: ApprovalService, over: Record<string, any>) =>
  svc.editEntry({ entryId: 'e1', editorId: OFFICE, organizationId: ORG, reason: 'Correction', ...over } as any);
const written = (prisma: any) => prisma.timeEntry.update.mock.calls[0][0].data;

describe('office edit — counted time', () => {
  it('subtracts only the rests that do not count as work, like every other path', async () => {
    const { svc, prisma } = build(closedEntry());
    await edit(svc, { clockOutAt: t('16:00').toISOString(), clockInAt: t('08:00').toISOString() });
    // 8h = 480 min, less the 30 unpaid minutes. The paid 15 stays counted.
    expect(written(prisma).paidMinutes).toBe(450);
  });
});

describe('office edit — schedule flags', () => {
  it('keeps LATE_ARRIVAL on a legacy-schedule entry (expected start persisted, no shift bound)', async () => {
    const { svc, prisma } = build(closedEntry({ clockInAt: t('08:40') }));
    await edit(svc, { clockOutAt: t('16:05').toISOString() });
    expect(written(prisma).flagReasons).toContain('LATE_ARRIVAL');
  });

  it('re-reads the daily limit: corrected back inside it, PAST_DAILY_LIMIT goes', async () => {
    const { svc, prisma } = build(
      closedEntry({ endIsDailyLimit: true, expectedClockInAt: null, clockOutAt: t('18:00'), flagReasons: ['UNSCHEDULED_DAY', 'PAST_DAILY_LIMIT'] }),
    );
    await edit(svc, { clockOutAt: t('15:00').toISOString() });
    expect(written(prisma).flagReasons).toEqual(['UNSCHEDULED_DAY']);
  });

  it('re-reads the daily limit: moved past it, PAST_DAILY_LIMIT — never OVERTIME', async () => {
    const { svc, prisma } = build(closedEntry({ endIsDailyLimit: true, expectedClockInAt: null, flagReasons: ['UNSCHEDULED_DAY'] }));
    await edit(svc, { clockOutAt: t('18:00').toISOString() });
    expect(written(prisma).flagReasons).toEqual(['UNSCHEDULED_DAY', 'PAST_DAILY_LIMIT']);
  });
});

describe('office edit — refusals', () => {
  it('refuses a clock-out at or before the clock-in, with a code, and writes nothing', async () => {
    const { svc, prisma } = build(closedEntry());
    await expect(edit(svc, { clockOutAt: t('07:59').toISOString() })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CLOCK_OUT_BEFORE_CLOCK_IN' }),
      status: 400,
    });
    // Moving only the clock-in past the existing clock-out is the same mistake.
    await expect(edit(svc, { clockInAt: t('16:00').toISOString() })).rejects.toMatchObject({ status: 400 });
    expect(prisma.timeEntry.update).not.toHaveBeenCalled();
  });
});

describe('office edit — a temporarily closed entry', () => {
  it('becomes final: the provisional mark is cleared so a late phone tap cannot overwrite it', async () => {
    const { svc, prisma } = build(
      closedEntry({
        clockOutProvisional: true,
        clockOutBasis: 'SHIFT_END',
        approvalStatus: 'PENDING',
        flagReasons: ['MISSED_CLOCK_OUT', 'CLOCK_OUT_PROVISIONAL'],
      }),
    );
    await edit(svc, { clockOutAt: t('17:10').toISOString() });
    const data = written(prisma);
    expect(data.clockOutProvisional).toBe(false);
    expect(data.clockOutBasis).toBeNull();
    expect(data.flagReasons).not.toContain('CLOCK_OUT_PROVISIONAL');
    expect(data.flagReasons).toContain('MISSED_CLOCK_OUT');
  });
});

describe('office edit — closing an open entry', () => {
  const open = (over: Record<string, any> = {}) =>
    closedEntry({ status: 'CLOCKED_IN', clockOutAt: null, approvalStatus: 'PENDING', ...over });

  it('does not approve away a flag that still needs a person', async () => {
    const { svc, prisma } = build(open({ flagReasons: ['OUTSIDE_GEOFENCE_IN'] }));
    await edit(svc, { clockOutAt: t('16:00').toISOString() });
    expect(written(prisma).status).toBe('CLOCKED_OUT');
    expect(written(prisma).approvalStatus).toBe('PENDING');
  });

  it('approves the close when nothing on it needs a person', async () => {
    const { svc, prisma } = build(open());
    await edit(svc, { clockOutAt: t('16:00').toISOString() });
    expect(written(prisma).approvalStatus).toBe('APPROVED');
  });

  it('ends the rest still running at the new clock-out, in one transaction, and counts it', async () => {
    const { svc, prisma } = build(
      open({
        breakMinutes: 0,
        unpaidBreakMinutes: 0,
        breaks: [{ id: 'b1', startedAt: t('15:30'), endedAt: null, durationMinutes: null, isPaid: false }],
      }),
    );
    await edit(svc, { clockOutAt: t('16:00').toISOString() });
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.break.update).toHaveBeenCalledWith({ where: { id: 'b1' }, data: { endedAt: t('16:00'), durationMinutes: 30 } });
    const data = written(prisma);
    expect(data.breakMinutes).toBe(30);
    expect(data.unpaidBreakMinutes).toBe(30);
    expect(data.paidMinutes).toBe(450);
    expect(data.nextBreakRemindAt).toBeNull();
  });

  it('flags a required rest that fell due and was never taken', async () => {
    const plan = [{
      ruleId: 'lunch', name: 'Lunch', dueAt: t('12:00').toISOString(), expiresAt: t('13:30').toISOString(),
      durationMinutes: 30, isPaid: false, required: true, state: 'PENDING', snoozeCount: 0, snoozeMin: 10, maxSnoozes: null,
    }];
    const { svc, prisma } = build(open({ breakPlan: plan }));
    await edit(svc, { clockOutAt: t('16:00').toISOString() });
    expect(written(prisma).flagReasons).toContain('MISSED_BREAK');
    expect(written(prisma).approvalStatus).toBe('PENDING');
  });
});

describe('deleting an entry', () => {
  const del = (svc: ApprovalService, editorId: string) =>
    svc.deleteEntry({ entryId: 'e1', editorId, organizationId: ORG });

  it('refuses a shift leader deleting their own entry', async () => {
    const { svc, prisma } = build(closedEntry({ userId: OFFICE }));
    await expect(del(svc, OFFICE)).rejects.toMatchObject({ status: 403 });
    expect(prisma.timeEntry.delete).not.toHaveBeenCalled();
  });

  it('lets the org owner delete their own (nobody above them)', async () => {
    const { svc, prisma } = build(closedEntry({ userId: OFFICE }), { ownerAdmin: true });
    await del(svc, OFFICE);
    expect(prisma.timeEntry.delete).toHaveBeenCalled();
  });

  it('writes an audit row naming who removed what', async () => {
    const { svc, prisma } = build(closedEntry());
    await del(svc, OFFICE);
    expect(prisma.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'TIME_ENTRY_DELETED',
        userId: OFFICE,
        targetUserId: MEMBER,
        resourceType: 'timeEntry',
        resourceId: 'e1',
        organizationId: ORG,
      }),
    });
  });
});

describe('edit history', () => {
  it('checks a scoped caller against the ENTRY — the activity log has no space column', async () => {
    const { svc, prisma } = build(closedEntry());
    await svc.getEntryHistory({ entryId: 'e1', organizationId: ORG, scopeSpaceIds: ['loc-1'] });
    expect(prisma.timeEntry.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'e1', locationId: { in: ['loc-1'] } });
    expect(prisma.activityLog.findMany.mock.calls[0][0].where).not.toHaveProperty('locationId');
  });

  it('an entry outside the caller\'s spaces reads as not found', async () => {
    const { svc, prisma } = build(closedEntry());
    prisma.timeEntry.findFirst.mockResolvedValue(null);
    await expect(svc.getEntryHistory({ entryId: 'e1', organizationId: ORG, scopeSpaceIds: ['other'] })).rejects.toMatchObject({ status: 404 });
  });
});
