import { ForbiddenException } from '@nestjs/common';
import { MemberSpacesService } from '../member-spaces.service';

/**
 * GET /employees/:id/assignments — the gateway sent `scopeSpaceIds` (the
 * workspaces the caller holds canViewAllTasks in) and the service never read it,
 * so a viewer scoped to one workspace saw the member's assignments everywhere.
 * Found when the message was typed (CODE_AUDIT.md §12, mismatch 1).
 */
describe('MemberSpacesService.getTechnicianAssignments — workspace scope', () => {
  const rows = [
    { id: 'a1', spaceId: 'sp-1', space: { id: 'sp-1', name: 'Main' } },
    { id: 'a2', spaceId: 'sp-2', space: { id: 'sp-2', name: 'Client site' } },
  ];

  function setup(memberSpaces: string[]) {
    const prisma: any = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'u-9' }) },
      spaceAssignment: {
        // The roster check (assertMemberInScope)…
        findFirst: jest.fn(async ({ where }: any) =>
          memberSpaces.some((s) => where.spaceId.in.includes(s)) ? { id: 'x' } : null,
        ),
        // …and the list itself.
        findMany: jest.fn(async ({ where }: any) =>
          rows.filter((r) => !where.spaceId || where.spaceId.in.includes(r.spaceId)),
        ),
      },
    };
    return { prisma, service: new MemberSpacesService(prisma, { emit: jest.fn() } as any) };
  }
  const ids = (res: any) => res.data.map((a: any) => a.locationId);

  it('org-wide (no scope): every assignment, as before', async () => {
    const { service } = setup(['sp-1', 'sp-2']);
    expect(ids(await service.getTechnicianAssignments({ userId: 'u-9', organizationId: 'org' }))).toEqual([
      'sp-1',
      'sp-2',
    ]);
  });

  it('scoped to one workspace: only that workspace’s assignment', async () => {
    const { service } = setup(['sp-1', 'sp-2']);
    const res = await service.getTechnicianAssignments({
      userId: 'u-9',
      organizationId: 'org',
      scopeSpaceIds: ['sp-1'],
    });
    expect(ids(res)).toEqual(['sp-1']);
  });

  it('a member in none of the caller’s workspaces is refused, like every scoped member read', async () => {
    const { service } = setup(['sp-2']);
    await expect(
      service.getTechnicianAssignments({ userId: 'u-9', organizationId: 'org', scopeSpaceIds: ['sp-1'] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('granted nowhere ([]) reads nothing', async () => {
    const { service } = setup(['sp-1']);
    await expect(
      service.getTechnicianAssignments({ userId: 'u-9', organizationId: 'org', scopeSpaceIds: [] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
