import { isObserverSeat, OBSERVER_SEAT_PERMISSIONS, BUILTIN_ROLES } from '@hbcfield/shared';

/**
 * Who pays two euros instead of ten.
 *
 * The rule that keeps this honest: the price follows the permissions a member
 * actually HOLDS, never the name of the role holding them. Roles are editable
 * per organization — were the price to follow the label, an admin would add
 * `canApproveOvertime` to a role called "Observer" and buy a supervisor for two
 * euros. Reading the grant makes the price follow it automatically.
 */
describe('the observer seat', () => {
  const held = (slug: string) => {
    const r = BUILTIN_ROLES.find((b) => b.slug === slug)!;
    return Object.entries(r.permissions as Record<string, unknown>)
      .filter(([, v]) => v === true)
      .map(([k]) => k);
  };
  const external = { isExternal: true };
  const staff = { isExternal: false };

  it('prices the External Observer role at the reduced seat', () => {
    expect(isObserverSeat(external, held('external-observer'))).toBe(true);
  });

  it('does NOT price the External Supervisor there — they approve hours', () => {
    expect(isObserverSeat(external, held('external-supervisor'))).toBe(false);
  });

  it('re-prices the moment somebody widens the role', () => {
    // The anti-gaming property as a test: the same person, one extra
    // permission, becomes a full seat without anyone touching billing code.
    const widened = [...held('external-observer'), 'canApproveOvertime'];
    expect(isObserverSeat(external, widened)).toBe(false);
  });

  it('never applies to our own staff, whatever they hold', () => {
    // The reduced price exists for somebody else's employee. An organization
    // must not be able to relabel its own people into cheap seats — and could
    // not run on them anyway: an external member holds no clock, no leave, no
    // personnel file and nothing the organization owns.
    expect(isObserverSeat(staff, held('external-observer'))).toBe(false);
    expect(isObserverSeat(staff, [])).toBe(false);
  });

  it('covers a member who holds nothing at all', () => {
    // They can sign in and read their own documents. Two euros, not ten.
    expect(isObserverSeat(external, [])).toBe(true);
  });

  it('allows exactly two permissions and no third', () => {
    expect([...OBSERVER_SEAT_PERMISSIONS].sort()).toEqual(['canCreateTasks', 'canViewAllTasks']);
    for (const extra of ['canManageUsers', 'canViewSpaceAttendance', 'canAssignTasks', 'canManageRota']) {
      expect(isObserverSeat(external, [...OBSERVER_SEAT_PERMISSIONS, extra])).toBe(false);
    }
  });
});
