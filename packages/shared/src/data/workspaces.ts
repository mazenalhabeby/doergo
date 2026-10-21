/**
 * Published reads of task-service's workspace tables (`CompanyLocation`, `SpaceAssignment`) — see db.ts.
 * Owner: task-service. Columns here are a contract: changing one is a change for every caller.
 */
import { activeAssignmentWhere, notEndedWhere } from '../access/assignment-window';
import type { On } from './db';

/** Is this workspace the organization's (and, with `activeOnly`, not archived)? */
export async function workspaceInOrg(
  db: On<'companyLocation', 'findFirst'>,
  spaceId: string,
  organizationId: string,
  opts: { activeOnly?: boolean } = {},
): Promise<boolean> {
  const found = await db.companyLocation.findFirst({
    where: { id: spaceId, organizationId, ...(opts.activeOnly ? { isActive: true } : {}) },
    select: { id: true },
  });
  return !!found;
}

/** Workspace names by id. */
export function workspaceNames(db: On<'companyLocation', 'findMany'>, ids: string[]) {
  return db.companyLocation.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
}

/** A workspace as sharing it with another organization needs it. */
export function workspaceToShare(db: On<'companyLocation', 'findFirst'>, spaceId: string, ownerOrgId: string) {
  return db.companyLocation.findFirst({
    where: { id: spaceId, organizationId: ownerOrgId },
    select: { id: true, name: true, organizationId: true },
  });
}

/** Every active workspace's modules — what the bill charges per workspace. */
export function orgWorkspaceModules(db: On<'companyLocation', 'findMany'>, organizationId: string) {
  return db.companyLocation.findMany({
    where: { organizationId, isActive: true },
    select: { id: true, name: true, enabledModules: true },
  });
}

/** The modules of the workspaces a member is in now (an administrator: every active one), ≤ 200. */
export function memberWorkspaceModules(
  db: On<'companyLocation', 'findMany'>,
  organizationId: string,
  userId: string,
  isAdmin: boolean,
) {
  return db.companyLocation.findMany({
    where: {
      organizationId,
      isActive: true,
      ...(isAdmin ? {} : { spaceAssignments: { some: { userId, ...notEndedWhere() } } }),
    },
    select: { enabledModules: true },
    take: 200,
  });
}

/** A workspace's own modules and its organization's (the fallback). */
export function workspaceModulesWithOrg(
  db: On<'companyLocation', 'findFirst'>,
  spaceId: string,
  organizationId: string,
) {
  return db.companyLocation.findFirst({
    where: { id: spaceId, organizationId },
    select: { enabledModules: true, organization: { select: { enabledModules: true } } },
  });
}

/** What an invoice for a workspace prints and bills by. */
export function workspaceInvoiceHeader(
  db: On<'companyLocation', 'findFirst'>,
  spaceId: string,
  organizationId: string,
) {
  return db.companyLocation.findFirst({
    where: { id: spaceId, organizationId },
    select: {
      name: true,
      contactName: true,
      contactEmail: true,
      address: true,
      currency: true,
      legalEntityId: true,
      sourceCustomerId: true,
    },
  });
}

/** Which company issues a workspace's invoices, and the client it was made from. */
export function workspaceIssuerFacts(db: On<'companyLocation', 'findFirst'>, spaceId: string, organizationId: string) {
  return db.companyLocation.findFirst({
    where: { id: spaceId, organizationId },
    select: { legalEntityId: true, sourceCustomerId: true },
  });
}

/** A workspace as gathering its work into an invoice needs it (kind, contact, rates, zone, currency). */
export function workspaceToInvoice(db: On<'companyLocation', 'findFirst'>, spaceId: string, organizationId: string) {
  return db.companyLocation.findFirst({
    where: { id: spaceId, organizationId },
    select: {
      id: true,
      name: true,
      kind: true,
      contactName: true,
      contactEmail: true,
      address: true,
      billableRateCents: true,
      costRateCents: true,
      timezone: true,
      currency: true,
      legalEntityId: true,
      sourceCustomerId: true,
    },
  });
}

const RATED_PERSON = { id: true, firstName: true, lastName: true, billRateCents: true, costRateCents: true } as const;

/** Everybody assigned to a workspace, with their terms there — the people an invoice prices. */
export function workspaceTermsToInvoice(
  db: On<'spaceAssignment', 'findMany'>,
  spaceId: string,
  organizationId: string,
) {
  return db.spaceAssignment.findMany({
    where: { spaceId, organizationId },
    select: {
      id: true,
      userId: true,
      billRateCents: true,
      costRateCents: true,
      billBy: true,
      hoursBasis: true,
      workRole: { select: { id: true, name: true, kind: true } },
      user: { select: { ...RATED_PERSON, isExternal: true } },
    },
  });
}

/** A member's workspaces (every assignment) as a document's routing reads them. */
export function memberWorkspacesForRouting(
  db: On<'spaceAssignment', 'findMany'>,
  memberId: string,
  organizationId: string,
) {
  return db.spaceAssignment.findMany({
    where: { userId: memberId, organizationId },
    select: {
      space: {
        select: { id: true, name: true, kind: true, contactName: true, contactEmail: true, enabledModules: true },
      },
    },
  });
}

/** A member's assignments with their cost terms — the worker's statement. */
export function memberTermsForStatement(
  db: On<'spaceAssignment', 'findMany'>,
  memberId: string,
  organizationId: string,
) {
  return db.spaceAssignment.findMany({
    where: { userId: memberId, organizationId },
    select: {
      id: true,
      spaceId: true,
      costRateCents: true,
      billBy: true,
      space: { select: { id: true, name: true, timezone: true, costRateCents: true } },
    },
  });
}

/** Has this member ever been assigned to this workspace (any window)? */
export async function memberEverIn(db: On<'spaceAssignment', 'findUnique'>, userId: string, spaceId: string) {
  return !!(await db.spaceAssignment.findUnique({
    where: { userId_spaceId: { userId, spaceId } },
    select: { id: true },
  }));
}

/** Is this member in any of these workspaces (a viewer's crew)? */
export async function memberInAnyOf(db: On<'spaceAssignment', 'findFirst'>, userId: string, spaceIds: string[]) {
  return !!(await db.spaceAssignment.findFirst({ where: { userId, spaceId: { in: spaceIds } }, select: { id: true } }));
}

/** Is this member assigned to this workspace RIGHT NOW? */
export async function memberActiveIn(
  db: On<'spaceAssignment', 'findFirst'>,
  userId: string,
  spaceId: string,
  organizationId: string,
) {
  return !!(await db.spaceAssignment.findFirst({
    where: { ...activeAssignmentWhere(userId), spaceId, organizationId },
    select: { id: true },
  }));
}
