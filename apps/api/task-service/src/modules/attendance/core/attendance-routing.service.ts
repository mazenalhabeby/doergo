import { Injectable, Optional } from '@nestjs/common';
import type { ApprovalKind } from '@hbcfield/shared';
import { NotificationRoutingService } from '../../notification-routing/notification-routing.service';
import { ApprovalRouteService } from '../../approvals/rules/approval-route.service';
import { alertRecipients, type WorkspaceDecider } from '../../approvals/rules/workspace-deciders';

/**
 * What an attendance notice is about — which decisions make somebody worth telling.
 *
 *   attendance  still clocked in, left early, no-show, an escalation resolved: whoever acts on this
 *               person's hours there — approves the day, decides extra time, settles a no-show (a team
 *               leader included, clock review A2/A10). May escalate to org-wide deciders, then admins.
 *   extraTime   a member asking for more time — those who decide it; never padded with admins (the
 *               own-request rule sends a leader's own to the administrators itself).
 *   outside     time outside the shift waiting for a decision — those who decide it (A10).
 */
export type AttendanceAudience = 'attendance' | 'extraTime' | 'outside';

const AUDIENCE_KINDS: Record<AttendanceAudience, readonly ApprovalKind[]> = {
  attendance: ['hours', 'extraTime', 'noShow'],
  extraTime: ['extraTime'],
  outside: ['outside'],
};

/** Per sweep: the workspace's deciders, built once per (audience, workspace) and reused for every member. */
export type DeciderCache = Map<string, WorkspaceDecider[]>;

/**
 * Who is told about one member's attendance (clock review A2–A4).
 *
 * One answer, the approvals inbox's own: "who may decide" from THE access resolver and each kind's decide
 * key, today's stand-ins in, nobody on leave, never the person themselves, never a stand-in about the
 * leader they cover. Tiered (`alertRecipients`): the workspace's own → the member's watchers → org-wide
 * deciders → admins, each only when the one before found nobody — so an alert that needs somebody always
 * reaches somebody, and the owner is not told about every late departure in a fifty-person company.
 * Shared by clock-out, extra time, the shift sweeps and the overtime service.
 */
@Injectable()
export class AttendanceRoutingService {
  constructor(
    private readonly notificationRouting: NotificationRoutingService,
    // Global in the app (ApprovalRulesModule). Absent only in narrow unit tests: then the watchers alone.
    @Optional() private readonly deciders?: ApprovalRouteService,
  ) {}

  private async listFor(organizationId: string, spaceId: string | null, kinds: readonly ApprovalKind[]) {
    return this.deciders ? this.deciders.workspaceDeciders(organizationId, spaceId, kinds) : [];
  }

  /**
   * Who to tell about ONE member's shift. The workspace half is cached per (audience, space) for a sweep — a
   * site has the same deciders for everybody there; the member half (watchers, the subject left out) is per
   * member, and is read only when the workspace has nobody on duty.
   */
  async notifyTargetsFor(
    entry: { locationId?: string | null; spaceId?: string | null; organizationId: string; userId: string },
    audience: AttendanceAudience,
    cache?: DeciderCache,
  ): Promise<string[]> {
    const spaceId = entry.locationId ?? entry.spaceId ?? null;
    const key = `${audience}:${spaceId ?? '-'}`;
    let list = cache?.get(key);
    if (list === undefined) {
      list = await this.listFor(entry.organizationId, spaceId, AUDIENCE_KINDS[audience]);
      cache?.set(key, list);
    }
    const mayEscalate = audience === 'attendance';
    const local = alertRecipients(list, [], { subjectUserId: entry.userId, mayEscalate: false });
    if (local.length) return local;
    const { ids } = await this.notificationRouting.resolveWatchers(entry.userId, entry.organizationId, 'attendance');
    return alertRecipients(list, ids, { subjectUserId: entry.userId, mayEscalate });
  }

  /**
   * A day waiting for review (clock review A3): the member's watchers AND the workspace's approvers — a watcher
   * is told, an approver can act, and an unconfigured workspace used to push nobody although its shift leader
   * could approve. Neither → org-wide approvers → admins.
   */
  async reviewTargetsFor(entry: {
    locationId?: string | null;
    organizationId: string;
    userId: string;
  }): Promise<string[]> {
    const spaceId = entry.locationId ?? null;
    const [list, watchers] = await Promise.all([
      this.listFor(entry.organizationId, spaceId, ['hours']),
      this.notificationRouting.resolveWatchers(entry.userId, entry.organizationId, 'attendance'),
    ]);
    const local = alertRecipients(list, [], { subjectUserId: entry.userId, mayEscalate: false });
    const both = [...new Set([...watchers.ids.filter((id) => id !== entry.userId), ...local])];
    return both.length ? both : alertRecipients(list, [], { subjectUserId: entry.userId, mayEscalate: true });
  }
}
