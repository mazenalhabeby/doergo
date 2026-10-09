import { applyInvitationPlacement, invitationPlacesMember } from '../invitation-apply';

/**
 * One placement for both accept paths (register + mobile onboarding).
 *
 * Each wrote the rota and the workspace out by hand; the gate differed (one
 * checked the role, one trusted `create`). Now it is one function with the gate
 * stated, and the role on the assignment is never the member's ORG role.
 */
describe('applyInvitationPlacement', () => {
  const mkTx = (opts: { space?: unknown; spaceRole?: unknown } = {}) => ({
    technicianSchedule: { createMany: jest.fn() },
    companyLocation: { findFirst: jest.fn().mockResolvedValue(opts.space === undefined ? { id: 'sp1' } : opts.space) },
    accessRole: { findFirst: jest.fn().mockResolvedValue(opts.spaceRole ?? null) },
    spaceAssignment: { upsert: jest.fn() },
  });
  const inv = (over: Record<string, unknown> = {}) => ({
    organizationId: 'org1',
    targetRole: 'EMPLOYEE',
    isExternal: false,
    memberRoleId: null,
    spaceId: 'sp1',
    scheduleType: 'FIXED',
    schedule: [{ dayOfWeek: 1, startTime: '08:00', endTime: '16:00' }, { bogus: true }],
    ...over,
  });

  it('places a member: rota rows (well-formed only) and the workspace', async () => {
    const tx = mkTx();
    await applyInvitationPlacement(tx as any, inv() as any, 'u1');
    expect(tx.technicianSchedule.createMany.mock.calls[0][0].data).toHaveLength(1);
    expect(tx.spaceAssignment.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ userId: 'u1', spaceId: 'sp1', organizationId: 'org1', roleId: null }),
    }));
  });

  it('places nobody but a member — the gate is explicit', async () => {
    expect(invitationPlacesMember('EMPLOYEE')).toBe(true);
    for (const role of ['ADMIN', 'CUSTOMER']) {
      const tx = mkTx();
      await applyInvitationPlacement(tx as any, inv({ targetRole: role }) as any, 'u1');
      expect(tx.technicianSchedule.createMany).not.toHaveBeenCalled();
      expect(tx.spaceAssignment.upsert).not.toHaveBeenCalled();
    }
  });

  it("never copies an internal member's ORG role onto the space assignment", async () => {
    // The scoped lookup (scope SPACE) does not find an org role.
    const tx = mkTx({ spaceRole: null });
    await applyInvitationPlacement(tx as any, inv({ memberRoleId: 'org_manager' }) as any, 'u1');
    expect(tx.spaceAssignment.upsert.mock.calls[0][0].create.roleId).toBeNull();
  });

  it('skips a workspace that no longer exists in the org', async () => {
    const tx = mkTx({ space: null });
    await applyInvitationPlacement(tx as any, inv() as any, 'u1');
    expect(tx.spaceAssignment.upsert).not.toHaveBeenCalled();
  });
});
