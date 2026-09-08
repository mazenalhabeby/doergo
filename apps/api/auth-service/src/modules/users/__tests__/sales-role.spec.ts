import { BUILTIN_ROLES, resolveCrmCaps, ownsClient } from '@hbcfield/shared';

/**
 * The Sales Rep role, and the one edit to it that looks harmless.
 *
 * A rep owns a book of clients. The scoping that makes that true is not in the
 * page — it is in `resolveCrmCaps`, which turns the role's permission set into
 * a view scope the customers service enforces. So the role's value is entirely
 * in which keys it does and does not carry, and both halves are worth asserting.
 */
describe('the Sales Rep role', () => {
  const sales = BUILTIN_ROLES.find((r) => r.slug === 'sales-rep');
  const caps = () => resolveCrmCaps('EMPLOYEE', sales!.permissions);

  it('exists and is seeded org-wide', () => {
    // ORG, not SPACE: resolveCrmCaps reads CRM keys off the member's org role
    // only, so a space-scoped sales role would grant no CRM access at all while
    // appearing perfectly configured.
    expect(sales).toBeDefined();
    expect(sales!.scope).toBe('ORG');
  });

  it('sees its own clients and not the whole book', () => {
    expect(caps().view).toBe('own');
  });

  it('can work and correct a client, but not reassign or delete one', () => {
    const c = caps();
    expect(c.work).toBe(true); // move the stage, add notes
    expect(c.editInfo).toBe(true); // keep the details right
    expect(c.manage).toBe(false); // reassigning ownership is a manager's act
  });

  /*
    Adding is a rep's act — they are the ones holding the business card — and
    it is deliberately NOT the same grant as deleting somebody else's client.
  */
  it('can add a client without being able to delete one', () => {
    const c = caps();
    expect(c.create).toBe(true);
    expect(c.manage).toBe(false);
  });

  it('managing still implies adding, so no existing role has to be re-edited', () => {
    const manager = BUILTIN_ROLES.find((r) => r.slug === 'manager')!;
    const mc = resolveCrmCaps('EMPLOYEE', manager.permissions);
    expect(mc.manage).toBe(true);
    expect(mc.create).toBe(true);
  });

  it('a role with neither cannot add', () => {
    expect(resolveCrmCaps('EMPLOYEE', { crmViewOwn: true }).create).toBe(false);
  });

  it('can raise the calls and visits that sales runs on', () => {
    expect(sales!.permissions.canCreateTasks).toBe(true);
  });

  /*
    The trap. `canViewAllTasks` reads as "see the team's jobs", and someone will
    eventually add it here for exactly that reason. `resolveCrmCaps` also treats
    it as the legacy "read every client", so the rep would silently gain the
    entire organization's client book — with no error, no 403, and a CRM list
    that simply looks fuller than it should.
  */
  it('does not carry canViewAllTasks, which would widen it to every client', () => {
    expect(sales!.permissions.canViewAllTasks).toBeFalsy();

    const widened = { ...sales!.permissions, canViewAllTasks: true };
    expect(resolveCrmCaps('EMPLOYEE', widened).view).toBe('all');
  });

  it('reaches a client by ownership or co-management, not by organization', () => {
    const me = 'user-rep';
    expect(ownsClient({ ownerId: me, managerIds: [] }, me)).toBe(true);
    expect(ownsClient({ ownerId: 'someone-else', managerIds: [me] }, me)).toBe(true);
    expect(ownsClient({ ownerId: 'someone-else', managerIds: [] }, me)).toBe(false);
  });

  it('is distinguishable from every other built-in', () => {
    // Slugs are the identity — names are editable per organization and
    // translated, so nothing may key off them.
    const slugs = BUILTIN_ROLES.map((r) => r.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
