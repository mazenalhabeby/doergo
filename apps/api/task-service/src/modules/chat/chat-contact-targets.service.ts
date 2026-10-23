import { Injectable } from '@nestjs/common';
import { SPACE_LEADER_PERMISSION, resolveMemberRouting } from '@hbcfield/shared';
import { PrismaService } from '@hbcfield/shared';

/**
 * The people a member may contact through their workspaces: upward (the leaders
 * routing names) and downward (the people in the spaces they lead).
 */
@Injectable()
export class ChatContactTargets {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lazy, memoized space-target resolver for one caller.
   *
   * Resolves at most once and only if the contact rule actually reaches the
   * branch that needs it — so an admin sending a message, or a member whose
   * contactScope is ALL, pays nothing for it.
   */
  resolver(userId: string, organizationId: string): () => Promise<Set<string>> {
    let cached: Promise<Set<string>> | null = null;
    return () => (cached ??= this.myContactTargets(userId, organizationId));
  }

  /** User ids `me` may contact via their space(s) — per-member override, else the
   *  space default (holders of a contact role), PLUS anyone in a space where
   *  `me` is the leadership (see spaceMembersILead). */
  private async myContactTargets(userId: string, organizationId: string): Promise<Set<string>> {
    const [upward, downward] = await Promise.all([
      resolveMemberRouting(this.prisma, organizationId, userId, 'contact'),
      this.spaceMembersILead(userId, organizationId),
    ]);
    for (const id of downward) upward.add(id);
    return upward;
  }

  /**
   * People in the spaces this member LEADS.
   *
   * The routing above answers it upward — a worker may contact their space's
   * leaders — and had no downward half. So a supervisor could approve
   * somebody's overtime, reconcile their shift and see their attendance, and
   * not send them a message: "You are not allowed to contact this member",
   * about a person whose hours they sign off.
   *
   * Leadership is `SPACE_LEADER_PERMISSION` (canViewSpaceAttendance) — the same
   * marker that makes a role a space leader when the routing above picks
   * default contact targets. Using it here keeps one definition of "leads this
   * space" rather than inventing a second.
   *
   * Bounded by the spaces they actually hold it in, so it widens nobody's reach
   * beyond the sites they were given: an external supervisor of one site can
   * message that site's people and nobody else's.
   */
  private async spaceMembersILead(userId: string, organizationId: string): Promise<Set<string>> {
    /*
      ONE query, not two.

      The obvious shape — read my assignments, then read the rosters of the ones
      I lead — adds two round trips to a path with a query budget, and sending a
      message is on it. Expressed as a single relation filter instead: give me
      the assignments of spaces that have an assignment of MINE carrying the
      leader permission.

      The permission is matched by JSON path rather than read back and filtered
      in JS, so the database does the narrowing and nothing unnecessary crosses
      the wire.
    */
    const members = await this.prisma.spaceAssignment.findMany({
      where: {
        organizationId,
        userId: { not: userId },
        space: {
          spaceAssignments: {
            some: {
              userId,
              role: {
                isActive: true,
                permissions: { path: [SPACE_LEADER_PERMISSION], equals: true },
              },
            },
          },
        },
      },
      select: { userId: true },
    });
    return new Set(members.map((m) => m.userId));
  }
}
