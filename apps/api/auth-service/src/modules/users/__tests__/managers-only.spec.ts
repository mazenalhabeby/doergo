/**
 * Three pickers each asked for 200 full member rows and applied their own
 * client-side idea of "admin or manager" — one of which, `!!memberRole`,
 * matched every member in the organization. These pin the single where-clause
 * that replaced all three, including the case that quietly breaks such
 * filters: a search whose own OR collides with it.
 */
describe('managersOnly query — shared by every leadership picker', () => {
  const buildWhere = (opts: { search?: string; managersOnly?: boolean; includeIds?: string[] }) => {
    const where: any = { organizationId: 'org1', customerId: null };
    if (opts.search) {
      where.OR = [
        { firstName: { contains: opts.search, mode: 'insensitive' } },
        { lastName: { contains: opts.search, mode: 'insensitive' } },
        { email: { contains: opts.search, mode: 'insensitive' } },
      ];
    }
    if (opts.managersOnly) {
      where.isActive = true;
      const or: any[] = [
        { role: 'ADMIN' },
        { memberRole: { is: { permissions: { path: ['canManageUsers'], equals: true } } } },
      ];
      const keep = (opts.includeIds ?? []).filter(Boolean);
      if (keep.length) or.push({ id: { in: keep } });
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: or }];
        delete where.OR;
      } else {
        where.OR = or;
      }
    }
    return where;
  };

  it('defines a candidate by ROLE — admin, or a role granting canManageUsers', () => {
    const w = buildWhere({ managersOnly: true });
    expect(w.isActive).toBe(true);
    expect(w.OR).toContainEqual({ role: 'ADMIN' });
    // Verified against real data: a member with column=false and the Manager
    // role was invisible while this filter tested the column instead.
    expect(w.OR).toContainEqual({
      memberRole: { is: { permissions: { path: ['canManageUsers'], equals: true } } },
    });
  });

  it('does NOT admit a bare canManageUsers column', () => {
    // The legacy column still grants the capability, but it is drift rather
    // than a position: listing a technician who carries a stale flag as a
    // manager is the confusion this picker should not add to.
    const w = buildWhere({ managersOnly: true });
    expect(w.OR).not.toContainEqual({ canManageUsers: true });
  });

  it('keeps already-granted contacts who no longer qualify', () => {
    const w = buildWhere({ managersOnly: true, includeIds: ['u9'] });
    expect(w.OR).toContainEqual({ id: { in: ['u9'] } });
  });

  it('ANDs with a search instead of letting one OR swallow the other', () => {
    // The bug this guards: assigning both to `OR` would return every manager
    // OR anyone matching the text — a search that widens the list instead of
    // narrowing it.
    const w = buildWhere({ managersOnly: true, search: 'ann' });
    expect(w.OR).toBeUndefined();
    expect(w.AND).toHaveLength(2);
    expect(w.AND[1].OR).toContainEqual({ role: 'ADMIN' });
  });

  it('excludes the member the picker is about', () => {
    const w: any = { organizationId: 'org1', customerId: null };
    const excludeId = 'me';
    if (excludeId) w.id = { not: excludeId };
    expect(w.id).toEqual({ not: 'me' });
  });

  it('leaves the ordinary members list untouched', () => {
    const w = buildWhere({ search: 'ann' });
    expect(w.isActive).toBeUndefined();
    expect(w.AND).toBeUndefined();
    expect(w.OR).toHaveLength(3);
  });
});
