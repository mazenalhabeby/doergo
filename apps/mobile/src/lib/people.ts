/**
 * How a person is written on screen.
 *
 * ⚠️ THIS IS WRITTEN EIGHT TIMES IN THIS APP. `getInitials` already existed —
 * inside `components/team/helpers.ts`, beside that screen's avatar gradients,
 * where nothing outside the Team tab would ever look for it. So the chat
 * screen wrote its own, and the tab bar, and extra-time, and the technician
 * picker, and three more.
 *
 * None of them are WRONG. They just differ: some upper-case, some do not; some
 * fall back to `?`, some render an empty circle; the tab bar takes one letter
 * and everywhere else takes two. That is the shape of a rule with no home —
 * it is not a bug until somebody notices the same person has different
 * initials on two screens.
 *
 * This is the home. New code uses it; the existing seven can move here one at
 * a time, and `components/team/helpers.ts` re-exports so its caller did not
 * have to change to make room.
 */

export interface NamedPerson {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

/**
 * `JO` — two letters, upper-cased, `?` when there is nothing to take.
 *
 * ⚠️ `toLocaleUpperCase` and not `toUpperCase`: Turkish lower-case i upper-cases
 * to İ, and the ASCII version silently gets it wrong for a name that is
 * somebody's own.
 */
export function initialsOf(p: NamedPerson | null | undefined): string {
  const a = p?.firstName?.trim()?.[0] ?? '';
  const b = p?.lastName?.trim()?.[0] ?? '';
  const both = `${a}${b}`.toLocaleUpperCase();
  return both || p?.email?.trim()?.[0]?.toLocaleUpperCase() || '?';
}

/**
 * `John Owner`, or the part of their address before the @ when we have no name.
 *
 * ⚠️ The e-mail fallback is deliberate and it is a LAST resort: it is the one
 * thing we always have, and a header that says nothing is worse than one that
 * says "j.owner". It is never shown beside a real name — only instead of one.
 */
export function displayName(p: NamedPerson | null | undefined): string {
  const full = `${p?.firstName ?? ''} ${p?.lastName ?? ''}`.replace(/\s+/g, ' ').trim();
  return full || p?.email?.split('@')[0] || '';
}
