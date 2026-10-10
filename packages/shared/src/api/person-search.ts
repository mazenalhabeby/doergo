/**
 * "Find a person by what I typed" — the Prisma `OR` every member list builds.
 *
 * Written by hand in five lists across two services (attendance ×2, the member
 * directory, employees, the calendar's invite picker). One place now, so a
 * field added to the search — or a change to how it matches — reaches all of
 * them. Case-insensitive `contains` on each field; a blank search is no filter.
 *
 * Use it under the relation the list is filtered on:
 *   where.OR = personSearchOr(q)                      // a list of users
 *   where.user = { OR: personSearchOr(q) }            // a list of their records
 */
export type PersonSearchField = 'firstName' | 'lastName' | 'email' | 'position';

export function personSearchOr(
  search: string | null | undefined,
  fields: readonly PersonSearchField[] = ['firstName', 'lastName', 'email'],
): Array<Record<string, { contains: string; mode: 'insensitive' }>> | undefined {
  const q = search?.trim();
  if (!q) return undefined;
  return fields.map((field) => ({ [field]: { contains: q, mode: 'insensitive' as const } }));
}

/**
 * A person as a list row shows them: id, name, email. The Prisma `select` it
 * replaced was written out ~25 times across the services.
 */
export const PERSON_BRIEF_SELECT = { id: true, firstName: true, lastName: true, email: true } as const;
