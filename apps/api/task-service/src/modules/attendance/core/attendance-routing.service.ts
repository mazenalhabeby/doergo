import { Injectable } from '@nestjs/common';
import { PrismaService } from '@hbcfield/shared';
import { NotificationRoutingService } from '../../../common/notification-routing.service';
import { spaceRoleHolders } from '../../../common/space-leaders.util';

/**
 * Who is told about an attendance event: the workspace's leaders for the
 * action, then the member's own watchers. Shared by clock-out, extra time,
 * the shift sweeps and the overtime service.
 */
@Injectable()
export class AttendanceRoutingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationRouting: NotificationRoutingService,
  ) {}

  /**
   * Resolve who to notify for a space attendance action: members of the space
   * whose dynamic sub-role grants the given permission. Falls back to org admins
   * when the space has no such leaders configured, so escalations/approvals are
   * never silently dropped.
   */
  /**
   * Who is told about this member, at this workspace.
   *
   * Three steps, and each one only runs because the one before it found nobody:
   *
   *   1. THE WORKSPACE'S OWN PEOPLE — whoever holds the permission there, by a
   *      space role. A site with a manager or a shift leader has an answer, and
   *      it is them.
   *   2. THE MEMBER'S OWN ROUTING — the watchers chosen on their Access page,
   *      through the same explicit-only resolver every other attendance
   *      notification uses.
   *   3. NOBODY.
   *
   * ⚠️ Step 3 replaces a fallback to every org ADMIN and everyone holding
   * `canManageUsers`. That fallback meant a workspace with nobody configured
   * sent every late departure, overtime request and no-show to the owner — who
   * in a fifty-person organization is the one person guaranteed not to be
   * managing that shift. Owners learn to ignore a channel like that, and then
   * they miss the one that mattered.
   *
   * Silence is not data loss. A flagged entry is still in the approval queue, a
   * no-show is still on the no-show board, and an overtime request still shows
   * as pending — all of them findable by anybody who looks. What stops is the
   * PUSH, to people who did not ask for it and cannot act on it.
   */
  async resolveSpaceLeaders(
    spaceId: string,
    organizationId: string,
    permission: 'canApproveOvertime' | 'canReconcileAttendance',
  ): Promise<string[]> {
    /*
      The same query assets asks (space-leaders.util): an assignment active NOW,
      an active member (external supervisors included), an active role granting
      it. This read every row of the space, so somebody who had left the
      workspace kept being told about its shifts.
    */
    return spaceRoleHolders(this.prisma as never, {
      organizationId,
      spaceId,
      grants: (p) => p[permission] === true,
      // The External Supervisor approves overtime and reconciles shifts here.
      includeExternal: true,
    });
  }

  /**
   * Who to tell about ONE member's shift.
   *
   * The workspace's own people first — cached per space, because a site with a
   * shift leader has the same answer for everybody working there. Only when it
   * has nobody does this fall to the MEMBER's routing, and that half must be
   * resolved per member.
   *
   * ⚠️ That distinction is the whole reason this is a separate method. The
   * escalation sweeps resolve once per space and reuse it for every member
   * escalating there — correct while the fallback was org-wide admins, and
   * quietly wrong the moment it became per-member: everyone at that site would
   * have been routed to whichever member the sweep happened to look at first.
   */
  // Public: the overtime-request flow (OvertimeService) asks the SAME routing,
  // rather than keeping its own "every admin" list.
  async notifyTargetsFor(
    entry: { locationId?: string; spaceId?: string; organizationId: string; userId: string },
    permission: 'canApproveOvertime' | 'canReconcileAttendance',
    spaceCache?: Map<string, string[]>,
  ): Promise<string[]> {
    const spaceId = entry.locationId ?? entry.spaceId!;
    let leaders = spaceCache?.get(spaceId);
    if (leaders === undefined) {
      leaders = await this.resolveSpaceLeaders(spaceId, entry.organizationId, permission);
      spaceCache?.set(spaceId, leaders);
    }
    if (leaders.length > 0) return leaders;

    /*
      The member half, and its cost, stated plainly.

      This resolves per member, so a sweep escalating N people at workspaces with
      no leaders does N resolutions rather than one. Three things keep that
      bounded: the resolver caches per subject for a minute, a sweep is capped at
      500 entries a tick, and this branch runs ONLY where a workspace has nobody
      configured — which is the case this change exists to make visible and which
      an organization fixes by naming a shift leader.

      A batch resolver would remove even that, and is the right move if a real
      deployment ever escalates dozens of people at once at leaderless sites. It
      is not worth the shared-service change before somebody has that problem.
    */
    const { ids } = await this.notificationRouting.resolveWatchers(
      entry.userId,
      entry.organizationId,
      'attendance',
    );
    return ids;
  }
}
