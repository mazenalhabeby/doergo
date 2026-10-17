/** A member's job title as shown. */

/**
 * What somebody does, in the words the organisation already uses.
 *
 * `position` is the free-form job title an admin typed ("IT Engineering",
 * "Sales", "CEO"), so it wins. Failing that, their access role names the job
 * closely enough ("Admin"), and a specialty ("Electrical") beats nothing.
 *
 * Stored values are slugs as often as sentences — the seed writes
 * "office_manager" — so they are unslugged rather than printed raw.
 *
 * Lives here because every list of people wants the same answer: a member
 * roster, a routing picker, a chat directory. Two copies would disagree the
 * first time one of them learned about a new fallback.
 */
export function jobTitleOf(person: {
  position?: string | null;
  specialty?: string | null;
  memberRole?: { name?: string | null } | null;
}): string | null {
  const raw = person.position?.trim() || person.memberRole?.name?.trim() || person.specialty?.trim();
  if (!raw) return null;
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\p{Ll}/gu, (c) => c.toUpperCase());
}
