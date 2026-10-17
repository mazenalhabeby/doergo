import { overtimeRoundMinutes, overtimeRoundState } from '@hbcfield/shared';
import { OvertimeRecordService } from '../overtime-record.service';
import { overtimeRecordParts, type OvertimeRecordServiceParts } from './overtime-record.service.fixture';

/*
  One round of overtime as the Overtime page reads it (shared
  attendance/overtime-round.ts). A round stays APPROVED after the clock-out,
  so "running" and "how long did it count" are read from the SHIFT.
*/
const NOW = new Date('2026-10-14T17:00:00Z');
const agreed = (o: Record<string, unknown> = {}) => ({
  status: 'APPROVED',
  maxDurationMinutes: 90,
  overtimeStartAt: '2026-10-14T16:00:00Z',
  overtimeEndAt: '2026-10-14T17:30:00Z',
  clockOutAt: null,
  ...o,
});

describe('a round of overtime', () => {
  it('running: agreed and still on the clock inside the agreed time — counts up to now', () => {
    expect(overtimeRoundState(agreed(), NOW)).toBe('RUNNING');
    expect(overtimeRoundMinutes(agreed(), NOW)).toEqual({ agreed: 90, worked: 60, overBy: 0 });
  });

  it('over: still on the clock past the agreed end — the extra is shown, never counted', () => {
    const late = new Date('2026-10-14T17:45:00Z');
    expect(overtimeRoundState(agreed(), late)).toBe('OVER');
    expect(overtimeRoundMinutes(agreed(), late)).toEqual({ agreed: 90, worked: 90, overBy: 15 });
  });

  it('done at the clock-out, counted only up to it', () => {
    const r = agreed({ clockOutAt: '2026-10-14T16:40:00Z' });
    expect(overtimeRoundState(r, NOW)).toBe('DONE');
    expect(overtimeRoundMinutes(r, NOW)).toEqual({ agreed: 90, worked: 40, overBy: 0 });
  });

  it('a later round took over: this one counted its whole agreed window', () => {
    const r = agreed({ superseded: true });
    expect(overtimeRoundState(r, new Date('2026-10-14T18:00:00Z'))).toBe('DONE');
    expect(overtimeRoundMinutes(r, new Date('2026-10-14T18:00:00Z'))).toEqual({ agreed: 90, worked: 90, overBy: 0 });
  });

  it('plain words for every way a round ends; only an agreed one counts', () => {
    expect(overtimeRoundState({ status: 'PENDING_TECHNICIAN' })).toBe('WAITING_PERSON');
    expect(overtimeRoundState({ status: 'PENDING_APPROVAL' })).toBe('WAITING_DECISION');
    expect(overtimeRoundState({ status: 'EXPIRED_NO_APPROVAL' })).toBe('NO_ANSWER');
    expect(overtimeRoundState({ status: 'CANCELED' })).toBe('NOT_NEEDED');
    expect(overtimeRoundState({ status: 'EXPIRED_NO_RESPONSE' })).toBe('NOT_NEEDED');
    expect(overtimeRoundState({ status: 'REJECTED' })).toBe('REFUSED');
    expect(overtimeRoundMinutes({ status: 'REJECTED', maxDurationMinutes: 120, overtimeStartAt: '2026-10-14T10:00:00Z' }, NOW)).toEqual({ agreed: 0, worked: 0, overBy: 0 });
  });
});

describe('the period summary', () => {
  function service(rows: any[], running: any[] = [], latest: Record<string, number> = {}) {
    const svc = overtimeRecordParts() as any;
    svc.prisma = {
      overtimeRequest: {
        findMany: jest.fn().mockResolvedValueOnce(rows).mockResolvedValueOnce(running),
        count: jest.fn().mockResolvedValue(2),
        groupBy: jest.fn().mockResolvedValue(Object.entries(latest).map(([timeEntryId, cycle]) => ({ timeEntryId, _max: { cycle } }))),
      },
    };
    return svc as OvertimeRecordServiceParts;
  }
  const person = { id: 'mike', firstName: 'Mike', lastName: 'Weber', avatarUrl: null };
  const place = { id: 'main', name: 'Main Office', timezone: 'Europe/Vienna' };
  const row = (o: Record<string, unknown>) => ({
    id: 'r', cycle: 1, status: 'APPROVED', technicianId: 'mike', timeEntryId: 'e1', createdAt: new Date('2026-10-13T16:00:00Z'),
    maxDurationMinutes: 60, overtimeStartAt: new Date('2026-10-13T16:00:00Z'), overtimeEndAt: new Date('2026-10-13T17:00:00Z'),
    technician: person, location: place, timeEntry: { clockInAt: new Date('2026-10-13T07:00:00Z'), clockOutAt: new Date('2026-10-13T16:45:00Z') },
    ...o,
  });

  it('adds up what was counted per person and day; refused and unanswered never count', async () => {
    const svc = service([
      row({ id: 'a' }),
      row({ id: 'b', status: 'REJECTED' }),
      row({ id: 'c', status: 'EXPIRED_NO_APPROVAL' }),
    ], [], { e1: 1 });
    const res: any = await svc.summary({ organizationId: 'o', from: '2026-10-12T00:00:00Z', to: '2026-10-19T00:00:00Z' });
    expect(res.data.totals).toEqual({ workedMinutes: 45, rounds: 1, people: 1, noAnswer: 1, waiting: 2 });
    expect(res.data.people[0]).toMatchObject({ userId: 'mike', rounds: 1, agreedMinutes: 60, workedMinutes: 45, byDay: { '2026-10-13': 45 } });
  });

  it('running now shows one card per shift — its newest round', async () => {
    const open = { clockInAt: new Date(), clockOutAt: null };
    const svc = service([], [row({ id: 'r2', cycle: 2, timeEntry: open }), row({ id: 'r1', cycle: 1, timeEntry: open })], { e1: 2 });
    const res: any = await svc.summary({ organizationId: 'o' });
    expect(res.data.running.map((r: any) => r.id)).toEqual(['r2']);
  });

  it('refuses a period longer than three months', async () => {
    await expect(service([]).summary({ organizationId: 'o', from: '2026-01-01T00:00:00Z', to: '2026-10-01T00:00:00Z' })).rejects.toMatchObject({ response: { code: 'OVERTIME_PERIOD_TOO_LONG' } });
  });
});
