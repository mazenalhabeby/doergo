import { Injectable } from '@nestjs/common';
import {
  canContactColleagues,
  SPACE_LEADER_PERMISSION,
  orgAllows,
  type OrgAccessRow,
  resolveMemberRouting,
  personOrgAccess,
} from '@hbcfield/shared';
import { PrismaService } from '@hbcfield/shared';
import { ChatCrossOrgService } from './chat-cross-org.service';

/**
 * Who may message whom — the parts every check reads: managing people, the
 * caller's contact targets, the people they lead, and the reach rule itself.
 */
@Injectable()
export abstract class ChatReachBase {
  constructor(
    protected readonly prisma: PrismaService,
    readonly crossOrg: ChatCrossOrgService,
  ) {}

  // ── groups (docs/plans/chat-team.md phase 3, D3) ─────────────────────────────

  /** Does this person manage people org-wide (resolved access, not the legacy column)? */
  async managesPeople(userId: string): Promise<boolean> {
    const me = await personOrgAccess(this.prisma, userId);
    return !!me && orgAllows(me as OrgAccessRow, 'canManageUsers');
  }

  /** User ids `me` may contact via their space(s) — per-member override, else the
   *  space default (holders of a contact role), PLUS anyone in a space where
   *  `me` is the leadership (see spaceMembersILead). */
  protected async myContactTargets(userId: string, organizationId: string): Promise<Set<string>> {
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
  protected async spaceMembersILead(userId: string, organizationId: string): Promise<Set<string>> {
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

  /**
   * Contact-permission rule: may `me` message `target`? Admins/managers reach
   * anyone and are always reachable. Otherwise a member reaches: their
   * space-driven targets (leader roles in a shared space — the new default),
   * plus whatever their `contactScope` allows (ALL = everyone, SELECTED = their
   * allow-list). `contactScope: NONE` (the default) means space targets only.
   * `spaceTargets` is resolved server-side from the caller's OWN spaces, so it
   * can't be spoofed.
   */
  protected async canReach(
    me: OrgAccessRow & { enabledModules: unknown; contactScope: string; contactAllowedIds: string[] },
    target: { id: string; role: string; contactable: boolean; canManageUsers?: boolean },
    // A thunk, not a Set: resolving space targets costs several queries, and
    // most calls are settled by the cheap checks above without ever needing it.
    // See contactTargetsResolver — it resolves at most once, on demand.
    spaceTargets: () => Promise<Set<string>>,
  ): Promise<boolean> {
    // External customers are never part of member chat (neither direction).
    if (me.role === 'CUSTOMER' || target.role === 'CUSTOMER') return false;

    /*
      The Messaging switch is absolute, and is tested BEFORE the manager bypass.

      It used to come after, which made "remove this member from chat entirely"
      untrue in both directions: an admin or any canManageUsers holder still
      reached a member who had been switched off, and a manager who switched
      their own messaging off stayed reachable regardless (the `targetIsManager`
      escape). The control muted a member toward their peers and nothing more —
      an admin who used it to take someone out of chat had not done that.

      Off now means off. It is the admin's own setting, defaults to on, and they
      can turn it back on; a switch that half works is worse than either answer.
    */
    if (!canContactColleagues({ enabledModules: me.enabledModules })) return false;
    if (!target.contactable) return false;

    // Admins and managers (canManageUsers) reach anyone who is IN chat, with no
    // shared space or allow-list entry needed. RESOLVED access — role ∪ the
    // legacy columns while they are read, admin = everything — not the flat
    // `User.canManageUsers` column, which missed every manager whose authority
    // comes from their role and kept granting after a move to a narrower one.
    if (orgAllows(me, 'canManageUsers')) return true;
    if (me.contactScope === 'ALL') return true;
    // Space-driven: a leader in a space we share is always reachable. Only this
    // branch and SELECTED need the space lookup.
    if ((await spaceTargets()).has(target.id)) return true;
    if (me.contactScope === 'SELECTED') return (me.contactAllowedIds ?? []).includes(target.id);
    return false; // NONE and not a space target
  }

  /**
   * Lazy, memoized space-target resolver for one caller.
   *
   * Resolves at most once and only if the contact rule actually reaches the
   * branch that needs it — so an admin sending a message, or a member whose
   * contactScope is ALL, pays nothing for it.
   */
  protected contactTargetsResolver(userId: string, organizationId: string): () => Promise<Set<string>> {
    let cached: Promise<Set<string>> | null = null;
    return () => (cached ??= this.myContactTargets(userId, organizationId));
  }
}
