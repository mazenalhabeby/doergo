import { memberWorkFootprint } from '@hbcfield/shared';
import { MemberAdminService } from '../member-admin.service';

/**
 * Removing a member gives back what they hold (decision 2026-10-29).
 *
 * A member with no other history used to be hard-deleted BEFORE offboarding
 * ran, so the van they held stayed open in custody with nobody to give it back,
 * and custody / money rows (no foreign key to the user) were left pointing at a
 * deleted person.
 */
describe('removing a member who holds equipment', () => {
  const counts = (n: number) => ({ count: jest.fn(async () => n) });

  it('custody, holding and asset money count as history', () => {
    const db: any = Object.fromEntries(
      [
        'task', 'comment', 'attachment', 'taskEvent', 'serviceReport', 'reportDefinition', 'reportSchedule',
        'recurringTaskTemplate', 'supportTicket', 'message', 'timeEntry', 'overtimeRequest',
        'assetCustody', 'assetHolder', 'assetMoney',
      ].map((m) => [m, { count: jest.fn((args: unknown) => ({ m, args })) }]),
    );
    const probes = memberWorkFootprint(db, 'u1') as unknown as Array<{ m: string; args: any }>;
    expect(probes.map((p) => p.m)).toEqual(expect.arrayContaining(['assetCustody', 'assetHolder', 'assetMoney']));
    expect(db.assetHolder.count).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });

  it('releases what they hold through offboarding, then keeps the row (soft delete)', async () => {
    const order: string[] = [];
    const prisma: any = {
      user: {
        findFirst: jest.fn(async () => ({ id: 'u1', organizationId: 'o1', role: 'EMPLOYEE' })),
        delete: jest.fn(() => order.push('delete')),
        update: jest.fn(() => 'update'),
      },
      refreshToken: { deleteMany: jest.fn() },
      invoice: counts(0),
      invitation: { deleteMany: jest.fn() },
      // Only the van: one open custody period and its holder row.
      $transaction: jest.fn(async (ops: unknown[]) =>
        ops.length > 3 ? new Array(ops.length).fill(0).map((_, i) => (i === 13 || i === 14 ? 1 : 0)) : ops),
    };
    for (const m of ['task', 'comment', 'attachment', 'taskEvent', 'serviceReport', 'reportDefinition',
      'reportSchedule', 'recurringTaskTemplate', 'supportTicket', 'message', 'timeEntry', 'overtimeRequest',
      'assetCustody', 'assetHolder', 'assetMoney']) prisma[m] = counts(0);
    const checks: any = { assertNotOwner: jest.fn(), assertCanGrantRoleAndPerms: jest.fn() };
    const offboarding: any = { release: jest.fn(async () => order.push('release')) };
    const service = new MemberAdminService(prisma, checks, undefined, offboarding);

    await service.removeMember({ memberId: 'u1', organizationId: 'o1', requesterId: 'admin' } as any);

    expect(offboarding.release).toHaveBeenCalledWith('o1', 'u1', 'admin');
    expect(prisma.user.delete).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalled();
  });

  it('releases first even when there is no history and the row is deleted', async () => {
    const order: string[] = [];
    const prisma: any = {
      user: {
        findFirst: jest.fn(async () => ({ id: 'u1', organizationId: 'o1', role: 'EMPLOYEE' })),
        delete: jest.fn(() => 'delete'),
      },
      invoice: counts(0),
      invitation: { deleteMany: jest.fn(() => 'inv') },
      $transaction: jest.fn(async (ops: unknown[]) => {
        if (ops.length > 3) return new Array(ops.length).fill(0);
        order.push('delete');
        return ops;
      }),
    };
    for (const m of ['task', 'comment', 'attachment', 'taskEvent', 'serviceReport', 'reportDefinition',
      'reportSchedule', 'recurringTaskTemplate', 'supportTicket', 'message', 'timeEntry', 'overtimeRequest',
      'assetCustody', 'assetHolder', 'assetMoney']) prisma[m] = counts(0);
    const checks: any = { assertNotOwner: jest.fn(), assertCanGrantRoleAndPerms: jest.fn() };
    const offboarding: any = { release: jest.fn(async () => order.push('release')) };
    const service = new MemberAdminService(prisma, checks, undefined, offboarding);

    await service.removeMember({ memberId: 'u1', organizationId: 'o1', requesterId: 'admin' } as any);
    expect(order).toEqual(['release', 'delete']);
  });
});
