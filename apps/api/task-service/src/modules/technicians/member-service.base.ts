import { ApprovalRulesService } from '../../common/approval-rules/approval-rules.service';
import {
  REQUEST_KINDS,
  isAbsence,
  requestKindsOffered,
  resolveAwayAccess,
  type RequestKind,
  toISODateString,
  personRemoteFacts,
  activeAssignmentWhere,
} from '@hbcfield/shared';
import { Inject, Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService, SERVICE_NAMES } from '@hbcfield/shared';
import { NotificationRoutingService } from '../../common/notification-routing.service';
import { CoverService } from './cover.service';
import { CalendarRulesService } from '../calendar/calendar-rules.service';
import { LeaveLedgerService } from './leave-ledger.service';
import { ShiftRematchService } from '../attendance/shifts/shift-rematch.service';

// Leave dates are Postgres DATEs (stored at midnight UTC), so they are read back
// with toISODateString — the UTC day IS the stored day. Through the server's
// local zone they would move a day for anybody west of Greenwich.

/**
 * What the member services share: their dependencies, a member's request
 * workspaces, clashes and working days.
 */
@Injectable()
export abstract class MemberServiceBase {
  constructor(
    protected readonly prisma: PrismaService,
    /*
      Who is told ABOUT this member. Leave asks the organization for time, so the
      question "who hears about it" is the same question attendance already
      answers, and it is answered in one place: explicit watchers chosen on the
      member's Access page, UNION the routing configured on the spaces they work
      in (their per-space override first, the space's own notify roles second).
      Nothing configured anywhere → nobody is told, deliberately.
    */
    protected readonly notificationRouting: NotificationRoutingService,
    /*
      Cover is asked in two places here — the approvals list wants a verdict per
      request, and a member asking for days deserves the same answer the approver
      will see. One service, so those two can never disagree.
    */
    protected readonly cover: CoverService,
    // What a range of leave COSTS — weekends, rota rest days and holidays left out (shared calendar/days.ts).
    protected readonly calendarRules: CalendarRulesService,
    @Inject(SERVICE_NAMES.NOTIFICATION) protected readonly notificationClient: ClientProxy,
    // The ONE vacation balance (allowance + adjustments − taken, in the leave year).
    protected readonly leaveLedger: LeaveLedgerService,
    // A weekly schedule set after the clock-in reaches the entries it now covers.
    @Optional() protected readonly rematch?: ShiftRematchService,
    // Office rules (a threshold → a second approval). Global in the app; absent only in narrow unit tests.
    @Optional() protected readonly rules?: ApprovalRulesService,
  ) {}

  // ========================================================================
  // TIME-OFF MANAGEMENT
  // ========================================================================

  /**
   * The workspaces a member could ask a request about, and what each offers.
   *
   * ONE read of their active assignments (with the space's ceiling, its request kinds and the
   * per-assignment override) plus the member — the same facts the clock-in decides "away" from,
   * read through the same `resolveAwayAccess`, so a remote day is only offered where the clock-in
   * would honour it.
   */
  protected async requestSpaces(organizationId: string, userId: string) {
    const [member, assignments] = await Promise.all([
      personRemoteFacts(this.prisma, userId, organizationId),
      this.prisma.spaceAssignment.findMany({
        where: { ...activeAssignmentWhere(userId), space: { organizationId, isActive: true, isRemote: false } },
        select: {
          allowRemote: true,
          space: { select: { id: true, name: true, lat: true, lng: true, geofencePolicy: true, requestKinds: true } },
        },
      }),
    ]);
    if (!member) throw new NotFoundException('Employee not found in organization');

    const byId = new Map<string, { id: string; name: string; mayWorkRemotely: boolean; kinds: RequestKind[] }>();
    for (const a of assignments) {
      const s = a.space;
      const spaceHasPin = s.lat != null && s.lng != null;
      // Away means something only where there is a site to be away FROM (the clock-in list's rule).
      const mayHere =
        spaceHasPin &&
        resolveAwayAccess({
          spaceHasPin,
          policy: s.geofencePolicy,
          userAllowRemote: member.allowRemote,
          assignmentAllowRemote: a.allowRemote,
          isAdmin: member.role === 'ADMIN',
        }).allowed;
      const may = mayHere || !!byId.get(s.id)?.mayWorkRemotely;
      byId.set(s.id, {
        id: s.id,
        name: s.name,
        mayWorkRemotely: may,
        kinds: requestKindsOffered({ enabled: s.requestKinds, mayWorkRemotely: may }),
      });
    }
    const spaces = [...byId.values()];
    // A kind tied to no workspace: offered when ANY of their workspaces offers it (none = every kind but REMOTE).
    const kinds: RequestKind[] = spaces.length
      ? REQUEST_KINDS.filter((k) => spaces.some((s) => s.kinds.includes(k)))
      : requestKindsOffered({ enabled: [], mayWorkRemotely: false });
    return { spaces, kinds };
  }

  /**
   * What a leave range costs this person. Refuses a range with no working day in it — a request for
   * a weekend is a mistake the person should see now, not a zero-day row in the manager's queue.
   * `lenient` (a decision on an existing request) never refuses; it records what the range costs.
   */
  /**
   * What a request would collide with — the ONE overlap reader, for sending and
   * for the pre-check before sending. Leave collides only with leave; any other
   * kind with the same kind and with leave.
   */
  async requestClashes(technicianId: string, kind: string, start: Date, end: Date) {
    const leave = isAbsence(kind);
    return this.prisma.timeOff.findMany({
      where: {
        technicianId,
        status: { in: ['PENDING', 'APPROVED'] },
        kind: { in: leave ? ['LEAVE'] : [kind as never, 'LEAVE'] },
        startDate: { lte: end },
        endDate: { gte: start },
      },
      select: { kind: true, startDate: true, endDate: true, status: true },
      take: 5,
    });
  }

  /** Working days a range costs this member (weekend, holidays and their rota left out). */
  countWorkingDays(organizationId: string, userId: string, start: Date, end: Date): Promise<number> {
    return this.workingDaysOf(organizationId, userId, start, end);
  }

  protected async workingDaysOf(
    organizationId: string,
    userId: string,
    start: Date,
    end: Date,
    lenient = false,
  ): Promise<number> {
    const count = await this.calendarRules.countLeaveFor(
      organizationId,
      userId,
      toISODateString(start),
      toISODateString(end),
    );
    if (!lenient && count.counted === 0) {
      throw new BadRequestException({
        code: 'LEAVE_NO_WORKING_DAYS',
        message: 'Those days are all weekends or holidays — there is nothing to take off.',
      });
    }
    return count.counted;
  }
}
