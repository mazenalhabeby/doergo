import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SpaceMemberPermissionsController } from '../space-member-permissions.controller';
import { spaceRolesControllers } from './space-roles-controllers.fixture';
import { managesMembersOrgWide, outrankCeiling, spaceMemberAuthority } from '../space-member-access';

/**
 * The doors into a workspace's people, as the gateway decides them from the
 * session and the space in the ROUTE (never the body). The service is the
 * boundary for WHAT may be granted; these tests pin WHO may knock.
 */

/** An external member running site s1: may add people and give roles there — nothing else, nowhere else. */
const externalLead = {
  id: 'ext-1', role: 'EMPLOYEE', organizationId: 'org-1', isExternal: true,
  access: { org: {}, perSpace: { s1: { canViewAllTasks: true, canAddSpaceMembers: true, canGrantSpaceRoles: true } } },
};
/** A member who may add people to s1 but not give roles. */
const adderOnly = {
  id: 'u-add', role: 'EMPLOYEE', organizationId: 'org-1',
  access: { org: {}, perSpace: { s1: { canAddSpaceMembers: true } } },
};
const admin = { id: 'a-1', role: 'ADMIN', organizationId: 'org-1', access: { org: {}, perSpace: {} } };

function builder() {
  const service = {
    getMemberPermissions: jest.fn(async () => ({ success: true, data: {} })),
    setMemberPermissions: jest.fn(async () => ({ success: true, data: { userId: 'u-target' } })),
  };
  const billing = { rebill: jest.fn() };
  const authCache = { invalidateUser: jest.fn(async () => undefined) };
  return { c: new SpaceMemberPermissionsController(service as any, billing as any, authCache as any), service, billing, authCache };
}

describe('the permission builder routes', () => {
  it('refuses a caller who may not give roles in THIS workspace', async () => {
    const { c, service } = builder();
    expect(() => c.get('s1', 'a1', { user: adderOnly })).toThrow(ForbiddenException);
    await expect(c.set('s1', 'a1', { roleId: 'r1' }, { user: adderOnly })).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.setMemberPermissions).not.toHaveBeenCalled();
  });

  it('a grant in space A does not open space B', async () => {
    const { c, service } = builder();
    await expect(c.set('s2', 'a9', { permissions: { canViewAllTasks: true } }, { user: externalLead })).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.setMemberPermissions).not.toHaveBeenCalled();
  });

  it('wants exactly one of a role or a set of keys', async () => {
    const { c } = builder();
    await expect(c.set('s1', 'a1', {}, { user: admin })).rejects.toBeInstanceOf(BadRequestException);
    await expect(c.set('s1', 'a1', { roleId: 'r', permissions: {} }, { user: admin })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a key that means nothing in a workspace rather than dropping it', async () => {
    const { c, service } = builder();
    await expect(c.set('s1', 'a1', { permissions: { canViewAllTasks: true, canViewLabourCost: true } }, { user: admin }))
      .rejects.toMatchObject({ response: { code: 'PERMISSION_KEY_NOT_IN_SPACE', params: { keys: ['canViewLabourCost'] } } });
    await expect(c.set('s1', 'a1', { permissions: { canViewAllTasks: 'yes' as any } }, { user: admin })).rejects.toBeInstanceOf(BadRequestException);
    expect(service.setMemberPermissions).not.toHaveBeenCalled();
  });

  it('sends the ceiling from the session, re-bills and refreshes the member’s session', async () => {
    const { c, service, billing, authCache } = builder();
    await c.set('s1', 'a1', { permissions: { canViewAllTasks: true, canViewAssets: false } }, { user: externalLead });
    expect(service.setMemberPermissions).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1',
      spaceId: 's1',
      assignmentId: 'a1',
      choice: { permissions: { canViewAllTasks: true } },
      requesterPerms: externalLead.access.perSpace.s1,
      requesterId: 'ext-1',
      outrankCheck: true,
    }));
    expect(billing.rebill).toHaveBeenCalledWith('org-1');
    expect(authCache.invalidateUser).toHaveBeenCalledWith('u-target');
  });

  it('an admin has no ceiling and no outrank rule', async () => {
    const { c, service } = builder();
    await c.set('s1', 'a1', { roleId: 'r-observer' }, { user: admin });
    expect(service.setMemberPermissions).toHaveBeenCalledWith(expect.objectContaining({ requesterPerms: null, outrankCheck: false, choice: { roleId: 'r-observer' } }));
  });
});

describe('the three trusts over a workspace’s people', () => {
  it('an external lead adds and gives roles in their workspace, never the billing terms', () => {
    expect(spaceMemberAuthority(externalLead, 's1')).toEqual({ addMembers: true, grantRoles: true, manageTerms: false });
    expect(spaceMemberAuthority(externalLead, 's2')).toEqual({ addMembers: false, grantRoles: false, manageTerms: false });
  });

  it('whoever manages the space’s people today keeps all three', () => {
    const spaceManager = { id: 'm', role: 'EMPLOYEE', access: { org: {}, perSpace: { s1: { canManageUsers: true } } } };
    expect(spaceMemberAuthority(spaceManager, 's1')).toEqual({ addMembers: true, grantRoles: true, manageTerms: true });
  });

  it('only a space-only actor gets the outrank rule', () => {
    expect(managesMembersOrgWide(externalLead)).toBe(false);
    expect(outrankCeiling(externalLead, 's1')).toEqual(externalLead.access.perSpace.s1);
    const orgManager = { id: 'o', role: 'EMPLOYEE', canManageUsers: true, access: { org: { canManageUsers: true }, perSpace: {} } };
    expect(managesMembersOrgWide(orgManager)).toBe(true);
    expect(outrankCeiling(orgManager, 's1')).toBeNull();
  });
});

describe('the member routes ask the split trusts', () => {
  function members() {
    const service = {
      assignMember: jest.fn(async () => ({ success: true })),
      removeMember: jest.fn(async () => ({ success: true })),
      updateMemberRoles: jest.fn(async () => ({ success: true })),
    };
    return { c: spaceRolesControllers(service as any, { rebill: jest.fn() } as any), service };
  }

  it('an external lead may assign in their workspace, with the authority the service enforces', async () => {
    const { c, service } = members();
    await c.assignMember('s1', { userId: 'u2', spaceRoleId: 'r-obs' }, { user: externalLead });
    expect(service.assignMember).toHaveBeenCalledWith(expect.objectContaining({
      authority: { addMembers: true, grantRoles: true, manageTerms: false },
      requesterPerms: externalLead.access.perSpace.s1,
      outrankCheck: true,
    }));
  });

  it('…and nowhere else', () => {
    const { c, service } = members();
    expect(() => c.assignMember('s2', { userId: 'u2' }, { user: externalLead })).toThrow(ForbiddenException);
    expect(() => c.removeMember('s2', 'a1', { user: externalLead })).toThrow(ForbiddenException);
    expect(service.assignMember).not.toHaveBeenCalled();
    expect(service.removeMember).not.toHaveBeenCalled();
  });

  it('removing sends the outrank ceiling for a space-only actor', async () => {
    const { c, service } = members();
    await c.removeMember('s1', 'a1', { user: externalLead });
    expect(service.removeMember).toHaveBeenCalledWith(expect.objectContaining({ spaceId: 's1', outrankPerms: externalLead.access.perSpace.s1 }));
  });
});
