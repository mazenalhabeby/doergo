import { canContactColleagues, orgAllows, type OrgAccessRow } from '@hbcfield/shared';

/**
 * Contact-permission rule: may `me` message `target`? Admins/managers reach
 * anyone and are always reachable. Otherwise a member reaches: their
 * space-driven targets (leader roles in a shared space — the new default),
 * plus whatever their `contactScope` allows (ALL = everyone, SELECTED = their
 * allow-list). `contactScope: NONE` (the default) means space targets only.
 * `spaceTargets` is resolved server-side from the caller's OWN spaces, so it
 * can't be spoofed.
 */
export async function canReach(
  me: OrgAccessRow & { enabledModules: unknown; contactScope: string; contactAllowedIds: string[] },
  target: { id: string; role: string; contactable: boolean; canManageUsers?: boolean },
  // A thunk, not a Set: resolving space targets costs several queries, and
  // most calls are settled by the cheap checks above without ever needing it.
  // See ChatContactTargets.resolver — it resolves at most once, on demand.
  spaceTargets: () => Promise<Set<string>>,
): Promise<boolean> {
  // External customers are never part of member chat (neither direction).
  if (me.role === 'CUSTOMER' || target.role === 'CUSTOMER') return false;

  /*
    The Messaging switch is absolute, and is tested BEFORE the manager bypass.

    It used to come after, which made "remove this member from chat entirely"
    untrue in both directions: an admin or any canManageUsers holder still
    reached a member who had been switched off, and a manager who switched
    their own messaging off stayed reachable regardless (the `targetIsManager`
    escape). The control muted a member toward their peers and nothing more —
    an admin who used it to take someone out of chat had not done that.

    Off now means off. It is the admin's own setting, defaults to on, and they
    can turn it back on; a switch that half works is worse than either answer.
  */
  if (!canContactColleagues({ enabledModules: me.enabledModules })) return false;
  if (!target.contactable) return false;

  // Admins and managers (canManageUsers) reach anyone who is IN chat, with no
  // shared space or allow-list entry needed. RESOLVED access — role ∪ the
  // legacy columns while they are read, admin = everything — not the flat
  // `User.canManageUsers` column, which missed every manager whose authority
  // comes from their role and kept granting after a move to a narrower one.
  if (orgAllows(me, 'canManageUsers')) return true;
  if (me.contactScope === 'ALL') return true;
  // Space-driven: a leader in a space we share is always reachable. Only this
  // branch and SELECTED need the space lookup.
  if ((await spaceTargets()).has(target.id)) return true;
  if (me.contactScope === 'SELECTED') return (me.contactAllowedIds ?? []).includes(target.id);
  return false; // NONE and not a space target
}
