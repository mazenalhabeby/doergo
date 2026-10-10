/** Anything a screen names a person from: a record with name parts, a display name, or nothing. */
export type PersonLike =
  | { firstName?: string | null; lastName?: string | null; name?: string | null }
  | string
  | null
  | undefined;

/**
 * A person's name as one line: "Anna Müller", "Anna", or "".
 *
 * Three services kept a private copy, and two of them wrote
 * `${firstName} ${lastName}` — which prints "John null" for somebody with no
 * surname on file, straight into a push and a calendar invitation. Missing
 * parts are dropped, never printed. A record with no name parts falls back to
 * its `name` (a client, a contact); a string is a name already.
 */
export function personName(person: PersonLike): string {
  if (!person) return '';
  if (typeof person === 'string') return person.trim().replace(/\s+/g, ' ');
  const parts = [person.firstName, person.lastName]
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join(' ');
  return parts || (person.name ?? '').trim();
}

/** The first letter of a word, whole — "Ö", not half of a surrogate pair. */
const firstLetter = (word: string): string => Array.from(word)[0] ?? '';

/**
 * The letters on an avatar: "Anna Müller" → "AM", "Anna" → "A", nothing → "?".
 *
 * Twelve screens kept a copy, and they disagreed: one printed "UNDEFINED"'s
 * first letter for a missing surname, one split on a single space so a double
 * space gave an empty initial, one returned "" and drew an empty circle. A
 * record is read from its parts (a `name` only when it has none); a display
 * name from its first and last word.
 */
export function personInitials(person: PersonLike, fallback = '?'): string {
  const words = personName(person).split(' ').filter(Boolean);
  if (words.length === 0) return fallback;
  const first = firstLetter(words[0]!);
  const last = words.length > 1 ? firstLetter(words[words.length - 1]!) : '';
  return (first + last).toUpperCase() || fallback;
}

/** The minimal Prisma surface `personNameById` reads — any PrismaClient fits. */
export interface PersonNameReader {
  user: {
    findUnique(args: {
      where: { id: string };
      select: { firstName: true; lastName: true };
    }): Promise<{ firstName: string | null; lastName: string | null } | null>;
  };
}

/** Look a member up and name them; "" for no id or nobody found. */
export async function personNameById(prisma: PersonNameReader, userId: string | null | undefined): Promise<string> {
  if (!userId) return '';
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
  return personName(user);
}
