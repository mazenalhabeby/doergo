import { OrgBillService } from '../org-bill.service';

/**
 * A personal role is just a role — the seat follows what it GRANTS.
 *
 * The permission builder stores one person's permissions in one workspace as a
 * role owned by their assignment. Billing reads every role an external member
 * holds (org role ∪ every space role) and never a role's name or kind, so a
 * personal role prices exactly like a shared one: watching and raising a job is
 * the €2 observer seat, anything more is a full seat.
 */
describe('the observer seat through a personal role', () => {
  function bill(spaceRolePermissions: Record<string, boolean>) {
    const prisma: any = {
      organization: { findUnique: jest.fn().mockResolvedValue({ addOns: [] }) },
      user: {
        count: jest.fn().mockResolvedValue(2),
        findMany: jest.fn().mockResolvedValue([
          {
            isExternal: true,
            memberRole: null,
            // The builder's personal role sits on the assignment like any role.
            spaceAssignments: [{ role: { permissions: spaceRolePermissions } }],
          },
        ]),
      },
      companyLocation: { findMany: jest.fn().mockResolvedValue([]) },
      assetCategory: { findMany: jest.fn().mockResolvedValue([]) },
      asset: { groupBy: jest.fn().mockResolvedValue([]) },
      customer: { groupBy: jest.fn().mockResolvedValue([]) },
      portal: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    return new OrgBillService(prisma).compute('org-1');
  }

  it('viewing and raising jobs only → the observer seat', async () => {
    const b: any = await bill({ canViewAllTasks: true, canCreateTasks: true });
    expect(b.observerSeatCount).toBe(1);
  });

  it('reading assets as well → a full seat', async () => {
    const b: any = await bill({ canViewAllTasks: true, canCreateTasks: true, canViewAssets: true });
    expect(b.observerSeatCount ?? 0).toBe(0);
  });
});
