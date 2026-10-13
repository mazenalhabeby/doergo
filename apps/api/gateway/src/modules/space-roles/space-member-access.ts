import { ForbiddenException } from '@nestjs/common';
import {
  isAdmin,
  accessAllows,
  permissionsExceed,
  permissionsFromOrgRole,
  mayAddSpaceMembers,
  mayGrantSpaceRoles,
  mayManageSpaceMembers,
  ownAccess,
  type PermissionSet,
  type ResolvedAccess,
} from '@hbcfield/shared';

/**
 * Who may change what about the people in ONE workspace — read off the
 * session (`access`, resolved server-side by validateToken, never the body)
 * against the workspace in the ROUTE.
 *
 * Shared by the member routes (space-roles.controller), the permission builder
 * (space-member-permissions.controller) and the location member routes, so the
 * three doors into a workspace's roster answer the same question the same way.
 */

/**
 * Everything the caller holds when acting on THIS space: org-wide grants plus
 * whatever their assignment in this space adds. It is the ceiling for what they
 * may hand to somebody else.
 */
export function actorPermsForSpace(user: any, spaceId: string): PermissionSet {
  // OWN access: a stand-in's borrowed approval keys are never something to hand on.
  const access = ownAccess(user?.access as ResolvedAccess | undefined);
  return { ...(access?.org ?? {}), ...(access?.perSpace?.[spaceId] ?? {}) };
}

/** The ceiling to send a service: null for an admin (who holds everything and could never trip it). */
export function grantCeiling(user: any, spaceId: string): PermissionSet | null {
  return isAdmin(user) ? null : actorPermsForSpace(user, spaceId);
}

/**
 * Nobody may grant what they do not hold. No spaceId = authoring a role
 * DEFINITION, which is org-wide and usable in any space, so it is measured
 * against org grants alone — a space manager's extra powers in one workspace
 * must not let them mint a role carrying those powers everywhere.
 */
export function assertMayGrant(user: any, rolePerms: unknown, spaceId?: string) {
  if (isAdmin(user)) return;
  const ceiling = spaceId ? actorPermsForSpace(user, spaceId) : (ownAccess(user?.access as ResolvedAccess | undefined)?.org ?? {});
  if (permissionsExceed(ceiling, permissionsFromOrgRole(rolePerms))) {
    throw new ForbiddenException('You cannot grant permissions beyond your own');
  }
}

export interface SpaceMemberAuthority {
  addMembers: boolean;
  grantRoles: boolean;
  manageTerms: boolean;
}

/**
 * The three trusts over a workspace's people, split so an external member can
 * hold the first two and never the third:
 *   • add / remove people — `canAddSpaceMembers`;
 *   • choose their management role — `canGrantSpaceRoles` (the ceiling decides WHICH);
 *   • trades, bill rates, billing basis, routing — `canManageUsers` here
 *     (`mayManageSpaceMembers`), which no external member may hold.
 * Whoever manages the space's people today keeps the first two as well, so a
 * custom role made before the split loses nothing.
 */
export function spaceMemberAuthority(user: any, spaceId: string): SpaceMemberAuthority {
  const manageTerms = mayManageSpaceMembers(user, spaceId);
  return {
    addMembers: manageTerms || mayAddSpaceMembers(user, spaceId),
    grantRoles: manageTerms || mayGrantSpaceRoles(user, spaceId),
    manageTerms,
  };
}

/**
 * Does the caller manage members ORG-wide (admin, `canManageUsers` or
 * `canManageWorkspaces` across the organization)? Those keep today's rules.
 * Everybody else acts through a grant in this one workspace, and may not
 * re-shape or remove somebody who holds more there than they do.
 */
export function managesMembersOrgWide(user: any): boolean {
  if (isAdmin(user)) return true;
  if (user?.canManageUsers === true || user?.canManageWorkspaces === true) return true;
  const access = user?.access as ResolvedAccess | undefined;
  return accessAllows(access, 'canManageUsers') || accessAllows(access, 'canManageWorkspaces');
}

/** The outrank ceiling to send for a removal: only for a caller acting through this workspace alone. */
export function outrankCeiling(user: any, spaceId: string): PermissionSet | null {
  return managesMembersOrgWide(user) ? null : actorPermsForSpace(user, spaceId);
}

export function assertAnyAuthority(a: SpaceMemberAuthority, what = 'manage the members of this workspace') {
  if (!a.addMembers && !a.grantRoles && !a.manageTerms) {
    throw new ForbiddenException(`You do not have permission to ${what}`);
  }
}
