import { dropUpcomingShifts, endRotaFor } from '../rota-end';

/*
  Every way off a workspace ends the person's rota there — or the materializer goes on expecting them, a no-show
  every day. Ended, never deleted (a past rota is history); only PENDING shifts AHEAD go.
*/
describe('endRotaFor', () => {
  const db = () => ({
    shiftAssignment: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    shiftInstance: { deleteMany: jest.fn().mockResolvedValue({ count: 3 }) },
  });
  const now = new Date('2026-10-29T09:00:00Z');

  it('ends one person in one workspace as of now and drops their pending shifts ahead', async () => {
    const d = db();
    const r = await endRotaFor(d as any, { userId: 'u1', spaceId: 's1' }, now);
    expect(r).toEqual({ rotaEnded: 2, shiftsDropped: 3 });
    const { where, data } = d.shiftAssignment.updateMany.mock.calls[0][0];
    expect(data).toEqual({ effectiveTo: now });
    expect(where).toMatchObject({ userId: 'u1', spaceId: 's1' });
    // A row already ended keeps its own (earlier) date: only rows still running at `now` are touched.
    expect(where.OR).toEqual([{ effectiveTo: null }, { effectiveTo: { gte: now } }]);
    expect(d.shiftInstance.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', spaceId: 's1', state: 'PENDING', expectedClockInAt: { gt: now } },
    });
  });

  it('an archived workspace: every member there', async () => {
    const d = db();
    await endRotaFor(d as any, { spaceId: 's1' }, now);
    expect(d.shiftAssignment.updateMany.mock.calls[0][0].where.userId).toBeUndefined();
    expect(d.shiftAssignment.updateMany.mock.calls[0][0].where.spaceId).toBe('s1');
  });

  it('never a scope that would end everything', async () => {
    await expect(endRotaFor(db() as any, { organizationId: 'o1' }, now)).rejects.toThrow();
    await expect(endRotaFor(db() as any, { userId: 'u1' }, now)).rejects.toThrow();
  });

  it('dropUpcomingShifts (the clock switched off) keeps the past and what was already acted on', async () => {
    const d = db();
    await dropUpcomingShifts(d as any, { userId: 'u1', organizationId: 'o1' }, now);
    expect(d.shiftInstance.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: 'o1', userId: 'u1', state: 'PENDING', expectedClockInAt: { gt: now } },
    });
    expect(d.shiftAssignment.updateMany).not.toHaveBeenCalled();
  });
});
