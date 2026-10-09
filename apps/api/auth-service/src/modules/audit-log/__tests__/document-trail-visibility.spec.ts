import { AuditLogService } from '../audit-log.service';

/**
 * A document's audit trail follows the document visibility rule.
 *
 * Per-entity trails are open to any org-wide canViewAllTasks holder — right for
 * a task, wrong for a payslip of a type restricted to HR.
 */
describe('AuditLogService — a document trail obeys document visibility', () => {
  const restricted = {
    userId: 'worker', hiddenFromMember: false, rolesOverridden: false, visibleToRoleIds: [],
    type: { visibleToRoleIds: ['role-hr'] },
  };
  const setup = (doc: unknown, viewer: unknown) => {
    const prisma = {
      document: { findFirst: jest.fn().mockResolvedValue(doc) },
      user: { findFirst: jest.fn().mockResolvedValue(viewer) },
      activityLog: { findMany: jest.fn().mockResolvedValue([{ id: 'log1' }]), count: jest.fn().mockResolvedValue(1) },
    };
    return { prisma, service: new AuditLogService(prisma as any) };
  };
  const read = (service: AuditLogService, viewerId?: string) =>
    service.findAll({ organizationId: 'org1', resourceId: 'doc1', viewerId }) as Promise<any>;

  it('returns nothing to a manager outside the type’s roles', async () => {
    const { prisma, service } = setup(restricted, { role: 'EMPLOYEE', memberRoleId: 'role-dispatch' });
    const r = await read(service, 'manager');
    expect(r.data).toEqual([]);
    expect(prisma.activityLog.findMany).not.toHaveBeenCalled();
  });

  it('shows it to a role the type names, the subject, and an admin', async () => {
    for (const [viewerId, viewer] of [
      ['hr', { role: 'EMPLOYEE', memberRoleId: 'role-hr' }],
      ['worker', { role: 'EMPLOYEE', memberRoleId: null }],
      ['boss', { role: 'ADMIN', memberRoleId: null }],
    ] as const) {
      const { service } = setup(restricted, viewer);
      const r = await read(service, viewerId);
      expect(r.data).toHaveLength(1);
    }
  });

  it('fails closed on a document when the viewer is unknown', async () => {
    const { service } = setup(restricted, null);
    expect((await read(service)).data).toEqual([]);
  });

  it('leaves every other resource alone', async () => {
    const { prisma, service } = setup(null, null);
    const r = await read(service);
    expect(r.data).toHaveLength(1);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });
});
