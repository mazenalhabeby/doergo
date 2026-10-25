/**
 * The paths that start from a time entry (heartbeats, clock-out, the close) read the workspace as THIS member
 * clocks there (clock review D1): their own "in the field" switches the ring off, their own hours replace the
 * workspace's — and a member without their own rules costs nothing but the one query.
 */
import { memberSiteRules } from '../core/member-site-rules';

const site = {
  geofencePolicy: 'STRICT',
  noShiftPolicy: 'SHIFT_ONLY',
  workModel: 'SHIFT',
  noShiftDailyMinutes: 480,
  name: 'Main',
};
const prismaWith = (row: unknown) => ({ spaceAssignment: { findFirst: jest.fn().mockResolvedValue(row) } }) as any;

describe('memberSiteRules', () => {
  it('a member without own rules gets the workspace back unchanged', async () => {
    const p = prismaWith({ workAs: null, workDailyMinutes: null });
    expect(await memberSiteRules(p, 'u1', 's1', site)).toBe(site);
  });

  it('"in the field" switches the ring off and keeps the rest of the site', async () => {
    const r = await memberSiteRules(prismaWith({ workAs: 'IN_THE_FIELD', workDailyMinutes: null }), 'u1', 's1', site);
    expect(r).toMatchObject({ geofencePolicy: 'NONE', noShiftPolicy: 'ALLOW', name: 'Main', noShiftDailyMinutes: 480 });
  });

  it('own hours replace the workspace hours only', async () => {
    const r = await memberSiteRules(prismaWith({ workAs: null, workDailyMinutes: 360 }), 'u1', 's1', site);
    expect(r).toMatchObject({ geofencePolicy: 'STRICT', noShiftDailyMinutes: 360 });
  });

  it('asks only the active assignment of this member in this workspace', async () => {
    const p = prismaWith(null);
    await memberSiteRules(p, 'u1', 's1', site);
    const where = p.spaceAssignment.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ userId: 'u1', spaceId: 's1' });
    expect(where.OR).toBeDefined();
  });

  it('no workspace, no query', async () => {
    const p = prismaWith(null);
    expect(await memberSiteRules(p, 'u1', null, site)).toBe(site);
    expect(p.spaceAssignment.findFirst).not.toHaveBeenCalled();
  });
});
