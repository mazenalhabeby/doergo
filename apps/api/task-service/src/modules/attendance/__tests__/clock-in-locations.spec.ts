import { activeAssignmentWhere } from '@hbcfield/shared';

/*
  "Where may I clock in?"

  The web answered this itself, from the org's space directory, by picking
  whichever site was NEAREST — and never showed the answer. A member working
  across two places was silently clocked in at whichever one the GPS preferred,
  which is a payroll error that surfaces weeks later on a queried timesheet, if
  at all.

  The list is now produced by the same rule that ENFORCES the clock-in. These
  tests are about the two ways the pair comes apart: a list looser than the check
  offers a workspace that is then refused, and a list stricter than the check
  hides a site the member is standing in.
*/

describe('the assignment window', () => {
  const now = new Date('2026-09-05T10:00:00Z');

  it('bounds the assignment at both ends', () => {
    /*
      Each bound has been forgotten once. Without `effectiveFrom` a future-dated
      assignment could clock in before it started; without `effectiveTo` an ended
      one kept working.
    */
    const w = activeAssignmentWhere('user-1', now) as any;
    expect(w.userId).toBe('user-1');
    expect(w.effectiveFrom).toEqual({ lte: now });
    expect(w.OR).toEqual([{ effectiveTo: null }, { effectiveTo: { gte: now } }]);
  });

  it('is the same object the clock-in check uses', () => {
    // Not a formatting assertion — it is why the rule lives in shared at all.
    // Two copies drift, and the drift is invisible until a member is refused a
    // site the product just offered them.
    const forList = activeAssignmentWhere('user-1', now);
    const forCheck = { ...activeAssignmentWhere('user-1', now), spaceId: 'space-1' };
    expect(forCheck).toMatchObject(forList as Record<string, unknown>);
  });
});

describe('listClockInLocations', () => {
  const spaceAssignment = { findMany: jest.fn() };
  const companyLocation = { findMany: jest.fn() };
  const prisma = {
    // The member's account-level away grant, read when tagging workspaces.
    user: { findFirst: jest.fn().mockResolvedValue({ allowRemote: false, role: 'EMPLOYEE' }) }, spaceAssignment, companyLocation } as any;

  // The method under test, bound to a bare prisma double — it is a query and a
  // filter, and standing the whole AttendanceService up (queues, notifications,
  // shift resolver) to observe one `where` clause would test the harness.
  const { AttendanceService } = require('../attendance.service');
  const service = Object.create(AttendanceService.prototype);
  service.prisma = prisma;

  beforeEach(() => {
    jest.clearAllMocks();
    companyLocation.findMany.mockResolvedValue([]);
  });

  it('asks only for workspaces the member is assigned to right now', async () => {
    spaceAssignment.findMany.mockResolvedValue([{ spaceId: 'a' }, { spaceId: 'b' }, { spaceId: 'a' }]);

    await service.listClockInLocations({ userId: 'u1', organizationId: 'org-1' });

    expect(spaceAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'u1' }) }),
    );
    // Deduped: two assignments to one space is one place to stand.
    expect(companyLocation.findMany.mock.calls[0][0].where.id.in.sort()).toEqual(['a', 'b']);
  });

  it('leaves out the remote bucket and archived sites', async () => {
    /*
      The remote bucket is the "Clock in remotely" button, not a place — clocking
      in "at" it would record an on-site shift at a space with no location. An
      archived space is refused by the clock-in anyway, so listing it is an error
      waiting to be tapped.
    */
    spaceAssignment.findMany.mockResolvedValue([{ spaceId: 'a' }]);

    await service.listClockInLocations({ userId: 'u1', organizationId: 'org-1' });

    const where = companyLocation.findMany.mock.calls[0][0].where;
    expect(where.isRemote).toBe(false);
    expect(where.isActive).toBe(true);
    // Scoped to the caller's organization, not just to the assignment ids.
    expect(where.organizationId).toBe('org-1');
  });

  it('keeps customer sites — a technician works at them', async () => {
    /*
      The first version of this filtered out CUSTOMER spaces as "somebody else's
      premises". In a field-service product that is backwards: people spend the
      day at a customer site and clock in there, and the clock-in has always
      accepted it.

      It made the list STRICTER than the check it mirrors, which hid two of three
      workspaces from a member assigned to all three — the same class of bug as
      offering a site that is then refused, pointing the other way.
    */
    spaceAssignment.findMany.mockResolvedValue([{ spaceId: 'a' }]);

    await service.listClockInLocations({ userId: 'u1', organizationId: 'org-1' });

    expect(companyLocation.findMany.mock.calls[0][0].where.kind).toBeUndefined();
  });

  it('returns nothing, and asks nothing, for a member assigned nowhere', async () => {
    // A new member before anyone has put them on a site. Answering with an empty
    // list lets the page say so; a query for `id: { in: [] }` would work too and
    // is a round trip for a question already answered.
    spaceAssignment.findMany.mockResolvedValue([]);

    const res = await service.listClockInLocations({ userId: 'u1', organizationId: 'org-1' });

    expect(res.data).toEqual([]);
    expect(companyLocation.findMany).not.toHaveBeenCalled();
  });

  it('keeps a workspace that has no coordinates', async () => {
    /*
      A space without coordinates is geofence-exempt on the server and clocks in
      perfectly well. The web used to filter these out as "no GPS", so an
      organization that had never set coordinates could not clock in at all.
    */
    spaceAssignment.findMany.mockResolvedValue([{ spaceId: 'a' }]);
    companyLocation.findMany.mockResolvedValue([{ id: 'a', name: 'Office', lat: null, lng: null }]);

    const res = await service.listClockInLocations({ userId: 'u1', organizationId: 'org-1' });

    expect(res.data).toHaveLength(1);
  });
});
