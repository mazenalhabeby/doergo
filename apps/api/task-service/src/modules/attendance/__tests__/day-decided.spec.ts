/** A person hears once, when the last waiting entry of their day is decided (day-decided.ts). */
import { announceDayDecided } from '../day-decided';

type Row = {
  clockInAt: Date;
  timezone: string | null;
  status: string;
  approvalStatus: string;
  paidMinutes: number | null;
};

const setup = (rows: Row[]) => {
  const prisma = { timeEntry: { findMany: jest.fn().mockResolvedValue(rows) } };
  const client = { emit: jest.fn() };
  return {
    prisma,
    client,
    run: (at: string) =>
      announceDayDecided(prisma as never, client as never, {
        userId: 'u',
        organizationId: 'o',
        clockInAt: new Date(at),
        timezone: 'Europe/Vienna',
      }),
  };
};
const row = (at: string, approvalStatus: string, paidMinutes: number | null = 240, status = 'CLOCKED_OUT'): Row => ({
  clockInAt: new Date(at),
  timezone: 'Europe/Vienna',
  status,
  approvalStatus,
  paidMinutes,
});
const payloads = (client: { emit: jest.Mock }) => client.emit.mock.calls.map((c) => [c[0], c[1]]);

describe('the day is decided', () => {
  it('approved: counted minutes of the day, in the workspace’s local day', async () => {
    const { client, run } = setup([
      row('2026-10-16T05:58:00Z', 'APPROVED', 280),
      row('2026-10-16T11:00:00Z', 'AUTO', 280),
    ]);
    await run('2026-10-16T05:58:00Z');
    expect(payloads(client)).toEqual([
      [
        'attendance_day_decided',
        { userId: 'u', organizationId: 'o', localDate: '2026-10-16', approved: true, countedMinutes: 560 },
      ],
    ]);
  });

  it('one rejected entry makes the day not approved and is not counted', async () => {
    const { client, run } = setup([
      row('2026-10-16T05:58:00Z', 'APPROVED', 280),
      row('2026-10-16T11:00:00Z', 'REJECTED', 280),
    ]);
    await run('2026-10-16T11:00:00Z');
    expect(client.emit.mock.calls[0]![1]).toMatchObject({ approved: false, countedMinutes: 280 });
  });

  it('says nothing while an entry of the day still waits or a shift is running', async () => {
    for (const rows of [
      [row('2026-10-16T05:58:00Z', 'APPROVED'), row('2026-10-16T11:00:00Z', 'PENDING')],
      [row('2026-10-16T05:58:00Z', 'APPROVED'), row('2026-10-16T11:00:00Z', 'AUTO', null, 'CLOCKED_IN')],
    ]) {
      const { client, run } = setup(rows);
      await run('2026-10-16T05:58:00Z');
      expect(client.emit).not.toHaveBeenCalled();
    }
  });

  it('another local day waiting does not hold this one back', async () => {
    // 22:30 UTC on the 16th is the 17th in Vienna.
    const { client, run } = setup([row('2026-10-16T05:58:00Z', 'APPROVED'), row('2026-10-16T22:30:00Z', 'PENDING')]);
    await run('2026-10-16T05:58:00Z');
    expect(client.emit).toHaveBeenCalledTimes(1);
  });
});
