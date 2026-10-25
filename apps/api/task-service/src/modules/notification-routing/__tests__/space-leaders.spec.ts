import { readFileSync } from 'fs';
import { join } from 'path';
import { spaceRoleHolders } from '../space-leaders.util';

/**
 * "Who leads this workspace" — one query for attendance and assets. Attendance
 * read every assignment row, so somebody who LEFT the workspace, a deactivated
 * account or an external member kept receiving its shift pushes.
 */
describe('spaceRoleHolders', () => {
  const findMany = jest.fn();
  const prisma = { spaceAssignment: { findMany } };
  const NOW = new Date('2026-10-09T08:00:00Z');

  it('asks for an assignment active NOW, an active internal member, and a role', async () => {
    findMany.mockResolvedValue([]);
    await spaceRoleHolders(prisma, { organizationId: 'o', spaceId: 's', grants: () => true, now: NOW });
    expect(findMany.mock.calls[0][0].where).toEqual({
      organizationId: 'o',
      spaceId: 's',
      roleId: { not: null },
      effectiveFrom: { lte: NOW },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: NOW } }],
      user: { isActive: true, isExternal: false },
    });
  });

  it('keeps holders of an ACTIVE role that grants the question, once each', async () => {
    findMany.mockResolvedValue([
      { userId: 'a', role: { isActive: true, permissions: { canApproveOvertime: true } } },
      { userId: 'a', role: { isActive: true, permissions: { canApproveOvertime: true } } },
      { userId: 'b', role: { isActive: false, permissions: { canApproveOvertime: true } } },
      { userId: 'c', role: { isActive: true, permissions: {} } },
    ]);
    const ids = await spaceRoleHolders(prisma, {
      organizationId: 'o',
      spaceId: 's',
      grants: (p) => p.canApproveOvertime === true,
    });
    expect(ids).toEqual(['a']);
  });

  it('a missing space has no leaders (no query)', async () => {
    findMany.mockClear();
    expect(await spaceRoleHolders(prisma, { organizationId: 'o', spaceId: null, grants: () => true })).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it.each([['assets', '../../assets/core/asset-responsible.service.ts', 'spaceManagers']])(
    '%s asks it through the one function',
    (_n, file, method) => {
      const src = readFileSync(join(__dirname, file), 'utf8');
      const body = src.slice(src.indexOf(`async ${method}(`), src.indexOf(`async ${method}(`) + 1500);
      expect(body).toContain('spaceRoleHolders(');
      expect(body).not.toContain('spaceAssignment.findMany');
    },
  );

  // Attendance asks the approvals inbox's own "who may decide" (clock review A2): never a role list of its own.
  it('attendance asks who may decide through the approvals resolver', () => {
    const src = readFileSync(join(__dirname, '../../attendance/core/attendance-routing.service.ts'), 'utf8');
    expect(src).toContain('workspaceDeciders(');
    expect(src).not.toContain('spaceAssignment.findMany');
  });
});

describe('spaceRoleHolders — the External Supervisor', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { spaceRoleHolders: holders } = require('../space-leaders.util');
  const prisma = { spaceAssignment: { findMany: jest.fn().mockResolvedValue([]) } };
  it('attendance counts external members holding the role; assets do not', async () => {
    await holders(prisma, { organizationId: 'o', spaceId: 's', grants: () => true, includeExternal: true });
    expect(prisma.spaceAssignment.findMany.mock.calls[0][0].where.user).toEqual({ isActive: true });
    await holders(prisma, { organizationId: 'o', spaceId: 's', grants: () => true });
    expect(prisma.spaceAssignment.findMany.mock.calls[1][0].where.user).toEqual({ isActive: true, isExternal: false });
  });
});
