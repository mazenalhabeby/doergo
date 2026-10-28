import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { notEndedWhere } from './assignment-window';
/**
 * May this caller read THIS member's record?
 *
 * "View all tasks" held by a SPACE role means all of that space's work — and
 * its people. Every per-member read (`/technicians/:id/...`) takes a member id
 * straight from the caller, so the guard cannot decide it: at guard time all we
 * know is that the caller holds the permission SOMEWHERE. This is where the
 * question is actually answered.
 *
 * Three states, and the middle one is the trap:
 *
 *   undefined  org-wide — no narrowing, return immediately
 *   [ids]      narrow: the member must be rostered in one of them
 *   []         granted NOWHERE — matches nothing, refuse
 *
 * Collapsing `[]` into `undefined` turns a member granted nothing into an
 * org-wide reader. That has happened in this codebase before, which is why the
 * empty case is written out rather than left to a truthiness check.
 *
 * One indexed query (`@@index([spaceId])` on SpaceAssignment) when narrowing.
 *
 * Org-wide, the member must still be OF THIS ORGANIZATION: another organization's
 * member id is 404, like a missing one (layer 1 test, 2026-10-28 — the stats,
 * performance and custody reads answered an empty 200 for any id at all). One
 * primary-key lookup, asked whenever the caller passes a client that can read users.
 */
export async function assertMemberInScope(
  prisma: {
    spaceAssignment: {
      findFirst: (args: unknown) => Promise<{ id: string } | null>;
    };
    user?: { findFirst: (args: unknown) => Promise<{ id: string } | null> };
  },
  data: {
    /** The member being read. */
    userId: string;
    organizationId: string;
    /** Spaces the caller holds the permission in. Server-resolved, never from the client. */
    scopeSpaceIds?: string[];
  },
): Promise<void> {
  if (data.scopeSpaceIds === undefined) {
    // org-wide: any member — of THIS organization
    if (!prisma.user) return;
    const member = await prisma.user.findFirst({
      where: { id: data.userId, organizationId: data.organizationId },
      select: { id: true },
    });
    if (!member) throw new NotFoundException('Member not found');
    return;
  }

  if (data.scopeSpaceIds.length === 0) {
    throw new ForbiddenException('You do not have access to this member');
  }

  const rostered = await prisma.spaceAssignment.findFirst({
    where: {
      userId: data.userId,
      organizationId: data.organizationId,
      spaceId: { in: data.scopeSpaceIds },
      // A membership that has ended is not a membership. Without this, somebody
      // who left the site last year still reads as "in my crew".
      ...notEndedWhere(),
    },
    select: { id: true },
  });

  if (!rostered) {
    throw new ForbiddenException('You do not have access to this member');
  }
}

/**
 * The same rule as a Prisma filter, for LIST reads.
 *
 * Returned as a fragment to spread into an existing `where`, so the narrowing
 * happens IN the query. Filtering a page after it is fetched would leave the
 * total describing a different set than the rows — and would still read every
 * row it was meant to exclude.
 *
 * Returns `{}` for an org-wide caller so the caller's own filters stand alone.
 */
export function memberScopeFilter(scopeSpaceIds?: string[]): Record<string, unknown> {
  if (scopeSpaceIds === undefined) return {};
  // `in: []` matches nothing in Prisma, which is exactly right for "granted
  // nowhere" — stated rather than relied upon.
  return {
    spaceAssignments: {
      some: {
        spaceId: { in: scopeSpaceIds },
        ...notEndedWhere(),
      },
    },
  };
}
