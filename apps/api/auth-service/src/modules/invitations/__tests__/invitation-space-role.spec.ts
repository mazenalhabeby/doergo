import { defaultSpaceRoleId } from '../invitation-space-role';
import { BUILTIN_ROLES, EXTERNAL_DEFAULT_ROLE_SLUG } from '@hbcfield/shared';

/**
 * The gap that left a real external member holding nothing.
 *
 * He accepted a valid invitation, signed in, and every supervisor surface was
 * empty — correctly, because his space assignment carried no role and an
 * external member's entire authority is that role. Nothing errored anywhere.
 */
describe('the role an accepting member gets in their space', () => {
  const role = { id: 'role_ext' };
  const tx = (found: unknown) => ({ accessRole: { findFirst: jest.fn().mockResolvedValue(found) } }) as any;

  it('gives an external member the role that exists for exactly them', async () => {
    const t = tx(role);
    await expect(defaultSpaceRoleId(t, 'org1', { isExternal: true })).resolves.toBe('role_ext');
    expect(t.accessRole.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org1', slug: EXTERNAL_DEFAULT_ROLE_SLUG }),
      }),
    );
  });

  it('looks the role up by SLUG, never by name', async () => {
    // The name is editable per organization and is translated in some seeds;
    // matching on it would silently stop working the day somebody renames it.
    const t = tx(role);
    await defaultSpaceRoleId(t, 'org1', { isExternal: true });
    const where = t.accessRole.findFirst.mock.calls[0][0].where;
    expect(where).not.toHaveProperty('name');
    expect(where.slug).toBe(EXTERNAL_DEFAULT_ROLE_SLUG);
  });

  it('is only a default — an explicit choice wins', async () => {
    const t = tx({ id: 'role_chosen' });
    await expect(
      defaultSpaceRoleId(t, 'org1', { isExternal: true, chosenRoleId: 'role_chosen' }),
    ).resolves.toBe('role_chosen');
    expect(t.accessRole.findFirst).toHaveBeenCalledTimes(1);
  });

  /*
    An internal invitation's memberRoleId is their ORG role. Copied onto the
    space assignment, its permissions survived an org-wide demotion. A space
    assignment references a SPACE role, or none.
  */
  it('never puts an ORG role on a space assignment', async () => {
    // The chosen id is an org role: the scoped lookup finds nothing.
    const t = { accessRole: { findFirst: jest.fn().mockResolvedValue(null) } } as any;
    await expect(
      defaultSpaceRoleId(t, 'org1', { isExternal: false, chosenRoleId: 'org_role_manager' }),
    ).resolves.toBeNull();
    const where = t.accessRole.findFirst.mock.calls[0][0].where;
    expect(where).toEqual(expect.objectContaining({
      id: 'org_role_manager', organizationId: 'org1', scope: 'SPACE', kind: { not: 'WORK' },
    }));
  });

  it('an external member whose chosen role is not a space role still gets the default', async () => {
    const t = {
      accessRole: { findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(role) },
    } as any;
    await expect(
      defaultSpaceRoleId(t, 'org1', { isExternal: true, chosenRoleId: 'org_role' }),
    ).resolves.toBe('role_ext');
  });

  it('leaves our own staff alone', async () => {
    const t = tx(role);
    await expect(defaultSpaceRoleId(t, 'org1', { isExternal: false })).resolves.toBeNull();
    expect(t.accessRole.findFirst).not.toHaveBeenCalled();
  });

  it('returns null rather than failing onboarding when the role is missing', async () => {
    // Seeded for every org, but a seed can be deleted. A missing default must
    // not stop somebody joining.
    await expect(defaultSpaceRoleId(tx(null), 'org1', { isExternal: true })).resolves.toBeNull();
  });

  it('the slug it looks for is a real built-in, and space-scoped', () => {
    const preset = BUILTIN_ROLES.find((r) => r.slug === EXTERNAL_DEFAULT_ROLE_SLUG);
    expect(preset).toBeDefined();
    // An ORG-scoped default would reach every space — the exact thing an
    // external member must never have.
    expect(preset!.scope).toBe('SPACE');
    expect(preset!.permissions.canManageUsers).not.toBe(true);
  });
});
