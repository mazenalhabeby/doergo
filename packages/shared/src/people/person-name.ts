/**
 * A person's name as one line: "Anna Müller", "Anna", or "".
 *
 * Three services kept a private copy, and two of them wrote
 * `${firstName} ${lastName}` — which prints "John null" for somebody with no
 * surname on file, straight into a push and a calendar invitation. Missing
 * parts are dropped, never printed.
 */
export function personName(
  person: { firstName?: string | null; lastName?: string | null } | null | undefined,
): string {
  if (!person) return '';
  return [person.firstName, person.lastName]
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join(' ');
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
