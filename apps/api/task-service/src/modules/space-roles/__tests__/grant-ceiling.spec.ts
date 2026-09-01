import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { SpaceRolesService } from '../space-roles.service';

/**
 * Nobody may grant what they do not hold.
 *
 * This is the escalation the org paths have guarded for a while — role
 * authoring, member role changes, invitation pre-assignment all refuse to hand
 * out a permission the requester lacks. The SPACE paths never did.
 *
 * It barely showed while a space role carried four attendance permissions: the
 * worst a space manager could do was make somebody an approver of overtime. A
 * space role now carries sixteen, including managing this space's members,
 * deleting assets, the CRM client grants and location tracking — so assigning
 * one is a real transfer of authority, and an unguarded path is how a shift
 * leader quietly becomes able to delete a customer.
 *
 * The ceiling arrives from the gateway, resolved there from `access` — which
 * validateToken builds server-side from the caller's own roles. It is never
 * read from the request body.
 */
describe('SpaceRolesService — the grant ceiling', () => {
  let service: SpaceRolesService;

  const prisma: Record<string, any> = {
    companyLocation: { findFirst: jest.fn() },
    user: { findFirst: jest.fn() },
    accessRole: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
    },
    spaceAssignment: { upsert: jest.fn() },
  };

  /** A role that hands out real authority, not just attendance. */
  const powerfulRole = {
    id: 'r-manager',
    name: 'Space Manager',
    organizationId: 'org1',
    permissions: { canViewSpaceAttendance: true, canManageAssets: true, crmManageClients: true },
  };

  /** What a shift leader actually holds: attendance, and nothing else. */
  const shiftLeaderPerms = { canViewSpaceAttendance: true, canApproveOvertime: true };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.companyLocation.findFirst.mockResolvedValue({ id: 's1' });
    prisma.user.findFirst.mockResolvedValue({ id: 'u2' });
    prisma.accessRole.findFirst.mockResolvedValue(powerfulRole);
    prisma.spaceAssignment.upsert.mockResolvedValue({
      id: 'a1', userId: 'u2', user: null, role: powerfulRole,
    });
    prisma.accessRole.update.mockResolvedValue(powerfulRole);
    // No sibling slugs, so uniqueSlug settles on the base in one query.
    prisma.accessRole.findMany.mockResolvedValue([]);
    prisma.accessRole.aggregate.mockResolvedValue({ _max: { position: 0 } });
    prisma.accessRole.create.mockImplementation(async ({ data }: any) => ({ id: 'r-new', ...data }));

    const mod = await Test.createTestingModule({
      providers: [SpaceRolesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(SpaceRolesService);
  });

  const assign = (requesterPerms: any) =>
    service.assignMember({
      organizationId: 'org1',
      spaceId: 's1',
      userId: 'u2',
      spaceRoleId: 'r-manager',
      requesterPerms,
    });

  describe('assigning a role', () => {
    it('refuses to hand out a permission the assigner does not hold', async () => {
      await expect(assign(shiftLeaderPerms)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.spaceAssignment.upsert).not.toHaveBeenCalled();
    });

    it('allows it when the assigner holds everything the role grants', async () => {
      await assign({ ...powerfulRole.permissions, canManageUsers: true });
      expect(prisma.spaceAssignment.upsert).toHaveBeenCalled();
    });

    it('does not stand in the way of an admin', async () => {
      // Null ceiling is set ONLY for an admin, who holds every permission and
      // could never trip the check anyway.
      await assign(null);
      expect(prisma.spaceAssignment.upsert).toHaveBeenCalled();
    });

    it('has nothing to check when no role is being granted', async () => {
      await service.assignMember({
        organizationId: 'org1',
        spaceId: 's1',
        userId: 'u2',
        spaceRoleId: null,
        requesterPerms: shiftLeaderPerms,
      });
      expect(prisma.spaceAssignment.upsert).toHaveBeenCalled();
    });
  });

  describe('editing a role', () => {
    it('refuses an edit to a role that already grants beyond the editor', async () => {
      /*
        The ceiling is about what the role GRANTS, not about the edit. Checking
        only the patch would let somebody who could not author this role rename
        it, recolour it and hand it out — keeping every permission they were
        never allowed to give.
      */
      await expect(
        service.updateRole({
          organizationId: 'org1',
          roleId: 'r-manager',
          name: 'Site Lead',
          requesterPerms: shiftLeaderPerms,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.accessRole.update).not.toHaveBeenCalled();
    });

    it('allows an edit by somebody who holds what it grants', async () => {
      await service.updateRole({
        organizationId: 'org1',
        roleId: 'r-manager',
        name: 'Site Lead',
        requesterPerms: { ...powerfulRole.permissions },
      });
      expect(prisma.accessRole.update).toHaveBeenCalled();
    });
  });

  describe('naming a role', () => {
    /*
      This used to be `while (true)` around a findFirst, exiting only when the
      database said no clash — one round trip per collision, and no bound at
      all if that answer never came. A request holds a connection open while it
      spins, so the loop mattered more than the collisions ever would.
    */
    it('asks once, however many roles share the name', async () => {
      prisma.accessRole.findMany.mockResolvedValue([
        { slug: 'shift-leader' }, { slug: 'shift-leader-2' }, { slug: 'shift-leader-3' },
      ]);

      await service.createRole({ organizationId: 'org1', name: 'Shift Leader' });

      expect(prisma.accessRole.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.accessRole.create.mock.calls[0][0].data.slug).toBe('shift-leader-4');
    });

    it('takes the plain name when nothing has it', async () => {
      prisma.accessRole.findMany.mockResolvedValue([]);
      await service.createRole({ organizationId: 'org1', name: 'Shift Leader' });
      expect(prisma.accessRole.create.mock.calls[0][0].data.slug).toBe('shift-leader');
    });

    it('terminates even when every candidate up to the count is taken', async () => {
      // The pigeonhole bound: with N siblings, one of base-2 … base-(N+2) is
      // free. A gap in the middle is found rather than skipped past.
      prisma.accessRole.findMany.mockResolvedValue([
        { slug: 'lead' }, { slug: 'lead-2' }, { slug: 'lead-4' },
      ]);
      await service.createRole({ organizationId: 'org1', name: 'Lead' });
      expect(prisma.accessRole.create.mock.calls[0][0].data.slug).toBe('lead-3');
    });
  });

  describe('what the server will store at all', () => {
    it('drops a permission that is not grantable on a space', async () => {
      // canManageInvoices is org-only in the catalogue. A crafted request must
      // not be able to smuggle it onto a space role, ceiling or no ceiling.
      await service.createRole({
        organizationId: 'org1',
        name: 'Bookkeeper',
        permissions: { canManageInvoices: true, canViewSpaceAttendance: true } as any,
      });
      expect(prisma.accessRole.create.mock.calls[0][0].data.permissions).toEqual({
        canViewSpaceAttendance: true,
      });
    });
  });
});
