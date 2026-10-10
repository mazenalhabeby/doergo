/**
 * How a person is written on screen — the phone's thin layer over the shared
 * rule (`personName` / `personInitials` in packages/shared/src/people).
 *
 * What this adds is the e-mail fallback: the phone's own account always has an
 * address, and a header or avatar that says nothing is worse than one that says
 * "j.owner" / "J". It is never shown beside a real name — only instead of one.
 * Everything else (missing parts dropped, never "John null"; first + last
 * letter; a surrogate pair kept whole) is the shared rule, so the same person
 * has the same initials on every screen.
 */
import { personInitials, personName } from '@hbcfield/shared/client';

interface NamedPerson {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

/** `JO` — two letters, upper-cased; the e-mail's first letter, then `?`, when there is no name. */
export function initialsOf(p: NamedPerson | null | undefined): string {
  const fromEmail = p?.email?.trim()?.[0]?.toLocaleUpperCase() || '?';
  return personInitials(p ? { firstName: p.firstName, lastName: p.lastName } : null, fromEmail);
}

/** `John Owner`, or the part of their address before the @ when we have no name. */
export function displayName(p: NamedPerson | null | undefined): string {
  return personName(p ? { firstName: p.firstName, lastName: p.lastName } : null) || p?.email?.split('@')[0] || '';
}

/** ONE letter — the tab bar's and a few small badges' avatar: the first of `initialsOf`. */
export function initialOf(p: NamedPerson | null | undefined): string {
  return Array.from(initialsOf(p))[0] ?? '?';
}
