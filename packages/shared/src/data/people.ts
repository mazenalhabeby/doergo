/**
 * Common published reads of auth-service's `User` table for other services — see db.ts. The filters are
 * named (who counts), never a raw `where`, and the columns are one of a few fixed shapes, so the owner can
 * read exactly what others rely on. Owner: auth-service.
 */
import { activeWindowWhere } from '../access/assignment-window';
import type { On } from './db';

/** How a list of people is filtered — each one a rule, not a column. */
export interface PeopleFilter {
  /** Only people of this organization. */
  organizationId?: string;
  /** Only accounts that are switched on. */
  active?: boolean;
  /** Only the organization's own people: not external members, not portal clients. */
  staffOnly?: boolean;
  /** Not external members (portal clients allowed). */
  internalOnly?: boolean;
  /** Not portal clients (external members allowed). */
  notClients?: boolean;
}

function filterWhere(f: PeopleFilter = {}) {
  return {
    ...(f.organizationId ? { organizationId: f.organizationId } : {}),
    ...(f.active ? { isActive: true } : {}),
    ...(f.staffOnly || f.internalOnly ? { isExternal: false } : {}),
    ...(f.staffOnly || f.notClients ? { role: { not: 'CUSTOMER' as never } } : {}),
  };
}

/** The shapes a person is read in. */
export const PERSON_NAME = { firstName: true, lastName: true } as const;
export const PERSON_BRIEF = { id: true, firstName: true, lastName: true } as const;
export const PERSON_FACE = { id: true, firstName: true, lastName: true, avatarUrl: true } as const;

/** One person's name (null = no such account). */
export function personNameOf(db: On<'user', 'findUnique'>, userId: string) {
  return db.user.findUnique({ where: { id: userId }, select: PERSON_NAME });
}

/** One person's name and address. */
export function personNameAndEmail(db: On<'user', 'findUnique'>, userId: string) {
  return db.user.findUnique({ where: { id: userId }, select: { ...PERSON_NAME, email: true } });
}

/** One person, id and name, when they pass the filter (null otherwise). */
export function personBrief(db: On<'user', 'findFirst'>, userId: string, filter: PeopleFilter = {}) {
  return db.user.findFirst({ where: { id: userId, ...filterWhere(filter) }, select: PERSON_BRIEF });
}

/** Does this person exist and pass the filter? */
export async function personPasses(
  db: On<'user', 'findFirst'>,
  userId: string,
  filter: PeopleFilter,
): Promise<boolean> {
  return !!(await db.user.findFirst({ where: { id: userId, ...filterWhere(filter) }, select: { id: true } }));
}

/** Is this person external (null = no such account in the organization)? */
export async function personIsExternal(
  db: On<'user', 'findFirst'>,
  userId: string,
  organizationId: string,
): Promise<boolean | null> {
  const u = await db.user.findFirst({ where: { id: userId, organizationId }, select: { id: true, isExternal: true } });
  return u ? u.isExternal : null;
}

/** Names of these people (id, first, last) — those who pass the filter. */
export function peopleNames(db: On<'user', 'findMany'>, ids: string[], filter: PeopleFilter = {}) {
  return db.user.findMany({ where: { id: { in: ids }, ...filterWhere(filter) }, select: PERSON_BRIEF });
}

/** Names and photos of these people — those who pass the filter. */
export function peopleFaces(db: On<'user', 'findMany'>, ids: string[], filter: PeopleFilter = {}) {
  return db.user.findMany({ where: { id: { in: ids }, ...filterWhere(filter) }, select: PERSON_FACE });
}

/** Which of these ids are people who pass the filter. */
export async function peopleWhoPass(
  db: On<'user', 'findMany'>,
  ids: string[],
  filter: PeopleFilter,
): Promise<string[]> {
  return (await db.user.findMany({ where: { id: { in: ids }, ...filterWhere(filter) }, select: { id: true } })).map(
    (u) => u.id,
  );
}

/** A person's role and name in the organization (null = not one of its people). */
export function personRoleAndName(db: On<'user', 'findFirst'>, userId: string, organizationId: string) {
  return db.user.findFirst({
    where: { id: userId, organizationId },
    select: { role: true, firstName: true, lastName: true },
  });
}

/** A person of the organization as an assignment needs them: `{ id, isExternal }` or null. */
export function personRef(
  db: On<'user', 'findFirst'>,
  userId: string,
  organizationId: string,
  filter: PeopleFilter = {},
) {
  return db.user.findFirst({
    where: { id: userId, ...filterWhere({ ...filter, organizationId }) },
    select: { id: true, isExternal: true },
  });
}

/** Is this account an external member? (false = internal, or no such account) */
export async function isExternalAccount(db: On<'user', 'findUnique'>, userId: string): Promise<boolean> {
  return !!(await db.user.findUnique({ where: { id: userId }, select: { isExternal: true } }))?.isExternal;
}

/** First and last names of these people, sorted by first name. */
export function peopleNamesSorted(db: On<'user', 'findMany'>, ids: string[]) {
  return db.user.findMany({ where: { id: { in: ids } }, select: PERSON_NAME, orderBy: { firstName: 'asc' } });
}

/**
 * The organization's active internal people except one, by name (≤ 500) — those in these workspaces
 * today when `spaceIds` is given. The pickers that hand work to a colleague.
 */
export function colleaguesByName(
  db: On<'user', 'findMany'>,
  input: { organizationId: string; exceptUserId: string; spaceIds?: string[]; now: Date },
) {
  return db.user.findMany({
    where: {
      organizationId: input.organizationId,
      isActive: true,
      isExternal: false,
      id: { not: input.exceptUserId },
      ...(input.spaceIds
        ? { spaceAssignments: { some: { spaceId: { in: input.spaceIds }, ...activeWindowWhere(input.now) } } }
        : {}),
    },
    select: PERSON_BRIEF,
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    take: 500,
  });
}
