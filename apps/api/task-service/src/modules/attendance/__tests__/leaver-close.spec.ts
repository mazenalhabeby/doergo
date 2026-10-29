import { closeShiftsOfLeaver, leaverCloseAt, LEAVER_CLOSE_NOTE } from '../entries/leaver-close';

/*
  Somebody leaves with a shift still running. It used to stay open — counting, and reminding leaders daily, for a
  person who could no longer sign in to clock out. It closes now through THE office close (ShiftCloser.closeEntry:
  a running rest ends, jobs pause, the clock-out is announced) where the office would close a forgotten shift.
*/
const t = (hhmm: string) => new Date(`2026-10-29T${hhmm}:00Z`);

describe('leaverCloseAt', () => {
  it('removed mid-shift: now', () => {
    expect(leaverCloseAt({ clockInAt: t('08:00'), expectedClockOutAt: t('17:00') }, t('11:00'))).toEqual(t('11:00'));
  });

  it('a forgotten shift: its planned end, never "when the office looked"', () => {
    expect(leaverCloseAt({ clockInAt: t('08:00'), expectedClockOutAt: t('12:00') }, t('20:00'))).toEqual(t('12:00'));
  });

  it('a daily-limit marker is not an end; the last moment seen is', () => {
    const at = leaverCloseAt(
      { clockInAt: t('08:00'), expectedClockOutAt: t('12:00'), endIsDailyLimit: true, lastSeenAt: t('15:00') },
      t('20:00'),
    );
    expect(at).toEqual(t('15:00'));
  });

  it('never before the clock-in or a rest already taken', () => {
    const at = leaverCloseAt(
      {
        clockInAt: t('13:00'),
        expectedClockOutAt: t('12:00'),
        breaks: [{ startedAt: t('14:00'), endedAt: t('14:30') }],
      },
      t('20:00'),
    );
    expect(at).toEqual(t('14:30'));
  });
});

describe('closeShiftsOfLeaver', () => {
  const entry = {
    id: 'e1',
    userId: 'u1',
    organizationId: 'o1',
    locationId: 's1',
    clockInAt: t('08:00'),
    expectedClockOutAt: t('17:00'),
    flagReasons: ['LATE_ARRIVAL'],
    notes: 'own note',
    breaks: [{ id: 'b1', startedAt: t('10:00'), endedAt: null, durationMinutes: null, isPaid: false }],
    geofenceExcursions: [],
  };

  it('closes each open shift through the office close, flagged for a glance', async () => {
    const prisma: any = {
      timeEntry: { findMany: jest.fn().mockResolvedValue([entry]), findUniqueOrThrow: jest.fn().mockResolvedValue({}) },
    };
    const closer: any = { closeEntry: jest.fn().mockResolvedValue(true) };
    const n = await closeShiftsOfLeaver(closer, prisma, { organizationId: 'o1', userId: 'u1' }, t('11:00'));
    expect(n).toBe(1);
    expect(prisma.timeEntry.findMany.mock.calls[0][0].where).toEqual({
      userId: 'u1',
      organizationId: 'o1',
      status: 'CLOCKED_IN',
    });
    const [closed, spec] = closer.closeEntry.mock.calls[0];
    expect(closed.id).toBe('e1');
    // The running rest travels with the entry: closeEntry ends it at the close.
    expect(closed.breaks).toHaveLength(1);
    expect(spec.at).toEqual(t('11:00'));
    expect(spec.from).toBe('OPEN');
    expect(spec.labels).toEqual({ closedHow: 'OFFICE' });
    expect(spec.fields.approvalStatus).toBe('PENDING');
    expect(spec.fields.flagReasons).toEqual(['LATE_ARRIVAL', 'MISSED_CLOCK_OUT']);
    expect(spec.fields.notes).toBe(`own note · ${LEAVER_CLOSE_NOTE}`);
  });

  it('a shift the member closed meanwhile is skipped, not an error (offboarding stays idempotent)', async () => {
    const prisma: any = { timeEntry: { findMany: jest.fn().mockResolvedValue([entry]) } };
    const closer: any = { closeEntry: jest.fn().mockResolvedValue(null) };
    await expect(
      closeShiftsOfLeaver(closer, prisma, { organizationId: 'o1', userId: 'u1' }, t('11:00')),
    ).resolves.toBe(0);
  });
});
