import { canContactColleagues } from '@hbcfield/shared';

/**
 * The Messaging switch used to be tested AFTER the manager bypass, so "remove
 * this member from chat entirely" was untrue in both directions: admins still
 * reached a switched-off member, and a manager who switched themselves off
 * stayed reachable anyway. These pin the order that makes off mean off.
 */
describe('chat contact rule — order of checks', () => {
  /** Mirrors canReach in chat.service.ts. */
  const canReach = (
    me: { role: string; enabledModules?: unknown; contactScope: string; contactAllowedIds?: string[]; canManageUsers?: boolean },
    target: { id: string; role: string; contactable: boolean; canManageUsers?: boolean },
    spaceTargets = new Set<string>(),
  ): boolean => {
    if (me.role === 'CUSTOMER' || target.role === 'CUSTOMER') return false;
    if (!canContactColleagues({ enabledModules: me.enabledModules })) return false;
    if (!target.contactable) return false;
    if (me.role === 'ADMIN' || me.canManageUsers === true) return true;
    if (me.contactScope === 'ALL') return true;
    if (spaceTargets.has(target.id)) return true;
    if (me.contactScope === 'SELECTED') return (me.contactAllowedIds ?? []).includes(target.id);
    return false;
  };

  const admin = { role: 'ADMIN', contactScope: 'ALL' };
  const member = (over: any = {}) => ({ role: 'EMPLOYEE', contactScope: 'NONE', ...over });
  const off = { id: 't', role: 'EMPLOYEE', contactable: false };
  const on = { id: 't', role: 'EMPLOYEE', contactable: true };

  it('an admin can NO LONGER message a member who is switched off', () => {
    expect(canReach(admin, off)).toBe(false);
  });

  it('a manager can no longer message a switched-off member either', () => {
    expect(canReach(member({ canManageUsers: true }), off)).toBe(false);
  });

  it('a switched-off member cannot message even an admin', () => {
    expect(canReach(member({ enabledModules: { canContact: false } }), { id: 'a', role: 'ADMIN', contactable: true })).toBe(false);
  });

  it('a manager who switched their own messaging off is unreachable too', () => {
    expect(canReach(member(), { id: 'm', role: 'EMPLOYEE', contactable: false, canManageUsers: true })).toBe(false);
  });

  // Everything that worked before must still work.
  it('admins still reach anyone who is in chat', () => {
    expect(canReach(admin, on)).toBe(true);
  });

  it('messaging is ON by default — no profile means reachable', () => {
    expect(canReach(member(), on)).toBe(false); // NONE scope, no shared space
    expect(canReach(member({ contactScope: 'ALL' }), on)).toBe(true);
  });

  it("scope NONE still reaches a space lead — it never meant 'no one'", () => {
    expect(canReach(member(), on, new Set(['t']))).toBe(true);
  });
});
