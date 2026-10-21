import { Injectable } from '@nestjs/common';
import { PrismaService } from '@hbcfield/shared';
import { ResolverSpace, ShiftResolverService } from './shift-resolver.service';
import {
  zoneOf,
  success,
  addDaysStr,
  localPartsIn,
  activeAssignmentWhere,
  resolveAwayAccess,
  memberDayZone,
  effectiveNoShiftPolicy,
  endOfDayIn,
  type NoShiftTag,
} from '@hbcfield/shared';
import {
  agreedOvertimeMinutes,
  approvedRequestsAround,
  remoteApprovedAt,
  type DayRequestRow,
} from './approved-requests';
import { ClockInContextService } from './clock-in-context.service';
import { pickNextShift, type NextShift } from './next-shift';

/**
 * Where the caller may clock in right now, each workspace tagged with whether away
 * is allowed and what the clock would do there.
 */
@Injectable()
export class ClockInLocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shiftResolver: ShiftResolverService,
    private readonly context: ClockInContextService,
  ) {}

  /**
   * Tag each workspace a member may clock in at with what the one-button
   * clock-in needs to choose and to answer before the tap:
   *   `shiftToday` — a shift for them here now, `isPrimary`, and
   *   `noShift`    — their allowance with no shift (null where it is free).
   *
   * One shift resolution per workspace (a member has a handful), and ONE read
   * of today's hours per time zone, only for workspaces that limit it.
   */
  async tagClockInContext<
    T extends ResolverSpace & { noShiftPolicy?: string | null; noShiftDailyMinutes?: number | null },
  >(
    spaces: T[],
    userId: string,
    now: Date,
    primarySpaceIds: ReadonlySet<string>,
  ): Promise<(T & { noShift: NoShiftTag | null; shiftToday: boolean; isPrimary: boolean })[]> {
    /*
      ONE day for the person, whichever workspace asks (memberDayZone): today's
      hours are read once, in their zone, and only if some workspace limits them.
    */
    let dayTz: Promise<string> | null = null;
    let worked: Promise<number> | null = null;
    let overtimeRows: Promise<DayRequestRow[]> | null = null;
    // Asked by every workspace at once (Promise.all), so the promise is shared, not the answer.
    const memberDay = (fallback: string): Promise<string> =>
      (dayTz ??= this.prisma.user
        .findUnique({ where: { id: userId }, select: { timezone: true, organization: { select: { timezone: true } } } })
        .then((u) => memberDayZone(u?.timezone, u?.organization?.timezone, fallback)));
    return Promise.all(
      spaces.map(async (space) => {
        const tz = zoneOf(space.timezone);
        // The rule that APPLIES here: SHIFT_ONLY where nothing is scheduled is no rule at all.
        const policy = effectiveNoShiftPolicy(space.noShiftPolicy, space.workModel);
        const limited = policy === 'LIMIT' || policy === 'SHIFT_ONLY';
        /*
          A shift is only worth resolving where it changes something: ordering a
          choice (more than one workspace) or a no-shift rule. A member with one
          workspace that allows it freely — most of them, on an endpoint the
          phone polls — costs nothing here. Wrapped so a resolver that throws,
          however it throws, never takes the list down with it.
        */
        const hasShiftNow =
          spaces.length > 1 || limited
            ? await Promise.resolve()
                .then(() => this.shiftResolver.resolveForClockIn({ userId, space, clockInAt: now, clockInTz: tz }))
                .then((r) => !!r)
                .catch(() => false)
            : false;
        const isPrimary = primarySpaceIds.has(space.id);
        if (!limited) return { ...space, noShift: null, shiftToday: hasShiftNow, isPrimary };
        const day = await memberDay(tz);
        let workedTodayMinutes = 0;
        let extraMinutes = 0;
        if (policy === 'LIMIT' && !hasShiftNow) {
          overtimeRows ??= approvedRequestsAround(this.prisma, userId, now, ['OVERTIME']);
          extraMinutes = agreedOvertimeMinutes(await overtimeRows, space.id, now, day);
          worked ??= this.context
            .noShiftAllowanceFor(
              userId,
              { noShiftPolicy: 'LIMIT', noShiftDailyMinutes: space.noShiftDailyMinutes, workModel: space.workModel },
              now,
              day,
            )
            .then((a) => a.workedTodayMinutes);
          workedTodayMinutes = await worked;
        }
        const noShift: NoShiftTag = {
          policy,
          dailyMinutes: space.noShiftDailyMinutes ?? 480,
          hasShiftNow,
          workedTodayMinutes,
          extraMinutes,
          dayEndsAt: endOfDayIn(now, day).toISOString(),
        };
        return { ...space, noShift, shiftToday: hasShiftNow, isPrimary };
      }),
    );
  }

  /**
   * Where may THIS member clock in, right now?
   *
   * The web and the phone both used to answer this themselves, from the org's
   * space directory, by picking whichever site was nearest. That is wrong in
   * three separate ways and each one was reachable:
   *
   *   • A member assigned to several workspaces could not CHOOSE. Two sites a
   *     few hundred metres apart, or a fuzzy GPS fix, and they were silently
   *     clocked in at the wrong one — which is a payroll error nobody notices
   *     until a timesheet is queried.
   *   • A manager sees the whole directory (`canViewAllTasks`), so "nearest"
   *     could pick a workspace they are not assigned to, and the clock-in came
   *     back "You are not assigned to this location" with nothing they could do.
   *   • Workspaces with no coordinates were filtered out client-side as
   *     "no GPS", even though a space without coordinates is geofence-exempt
   *     and clocks in perfectly well. An organization that had never set
   *     coordinates simply could not clock in from the web at all.
   *
   * So the question is answered here, by the same rule that enforces it.
   *
   * ⚠️ The ONLY thing excluded is the remote bucket, because that is the "Clock
   * in remotely" button rather than a place — clocking in "at" it would record
   * an on-site shift at a space with no location.
   *
   * ⚠️ Customer spaces are NOT excluded, though a first version of this did
   * exclude them on the reasoning that they are somebody else's premises. In a
   * field-service product that is exactly backwards: a technician spends the day
   * at a customer site and clocks in there, and the clock-in has always accepted
   * it. Filtering them out made this list STRICTER than the check it is supposed
   * to mirror, which hid two of three workspaces from a member who works across
   * all of them — the same class of bug as offering a site that is then refused,
   * in the other direction.
   */

  /**
   * Tag each workspace with whether THIS member may clock in there without being
   * on site.
   *
   * Two endpoints hand a member a list of their workspaces — the clock-in list
   * and the status payload the phone reads — and both decide whether to offer
   * "away". Answering it in one place, with the same rule the clock-in refuses
   * by, is what stops a third answer appearing: a list looser than the check
   * offers a workspace the clock-in rejects, and a stricter one hides an option
   * nobody can then find.
   */
  async tagAwayAllowed<
    T extends {
      id: string;
      lat?: number | null;
      lng?: number | null;
      geofencePolicy?: string | null;
      timezone?: string | null;
    },
  >(
    spaces: T[],
    userId: string,
    organizationId: string,
    /** Passed when the caller already has them, so this costs no extra query. */
    knownOverrides?: Map<string, boolean | null>,
  ): Promise<(T & { awayAllowed: boolean })[]> {
    /*
      A missing space would crash the endpoint a phone polls all day.

      The relation is required, so this should not happen — but `getStatus` maps
      assignments to their space, and one bad row there would take down the whole
      status payload rather than one entry in a list.
    */
    const rows = spaces.filter(Boolean);
    if (rows.length === 0) return [];

    const now = new Date();
    const [member, overrides, remoteDays] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: userId, organizationId },
        select: { allowRemote: true, role: true },
      }),
      knownOverrides
        ? Promise.resolve(knownOverrides)
        : this.prisma.spaceAssignment
            .findMany({
              where: { ...activeAssignmentWhere(userId), spaceId: { in: rows.map((s) => s.id) } },
              select: { spaceId: true, allowRemote: true },
            })
            .then((rows) => new Map(rows.map((r) => [r.spaceId, r.allowRemote]))),
      // An approved remote day authorises away HERE, today, whatever the grant and the ceiling say —
      // the approver decided that day. Read in parallel, so the list costs no extra round trip.
      approvedRequestsAround(this.prisma, userId, now, ['REMOTE']),
    ]);

    return rows.map((s) => {
      const spaceHasPin = s.lat != null && s.lng != null;
      const tz = zoneOf(s.timezone);
      if (spaceHasPin && remoteApprovedAt(remoteDays, s.id, now, tz)) return { ...s, awayAllowed: true };
      const allowed = resolveAwayAccess({
        spaceHasPin,
        policy: s.geofencePolicy,
        userAllowRemote: member?.allowRemote,
        assignmentAllowRemote: overrides.get(s.id),
        isAdmin: member?.role === 'ADMIN',
      }).allowed;
      /*
        `awayAllowed` means "away is a real, permitted choice HERE".

        ⚠️ Not the same as the clock-in's answer, and deliberately narrower: a
        workspace with no pin never refuses anybody, but there is nothing there
        to be away FROM — the ordinary clock-in already does the same thing. A
        member whose only ringed workspace refuses them would otherwise be shown
        an "Away from the site" button that changes nothing, which is a worse
        answer than not offering it.
      */
      return { ...s, awayAllowed: spaceHasPin && allowed };
    });
  }

  async listClockInLocations(data: { userId: string; organizationId: string }) {
    const { assignments, locations: clockable } = await this.context.clockableWorkspaces(
      data.userId,
      data.organizationId,
      new Date(),
    );
    if (!clockable.length) return success([]);

    // The overrides are already on the assignment rows read above, so tagging
    // costs one lookup for the member and no second query for them.
    const overrideBySpace = new Map(assignments.map((a) => [a.spaceId, a.allowRemote]));
    const tagged = await this.tagAwayAllowed(clockable, data.userId, data.organizationId, overrideBySpace);
    const primary = new Set(assignments.filter((a) => a.isPrimary).map((a) => a.spaceId));
    return success(await this.tagClockInContext(tagged, data.userId, new Date(), primary));
  }

  /**
   * The next planned shift today (or one running now) across these workspaces —
   * the clock card's "starts in N minutes" before clock-in. The same reader as
   * the automatic clock's plan: two queries, none when no workspace runs shifts.
   */
  async nextShiftToday(
    userId: string,
    spaces: (ResolverSpace & { name?: string | null })[],
    now: Date,
  ): Promise<NextShift | null> {
    // Today and yesterday (a night shift still running), in each workspace's own zone.
    const daysOf = (s: ResolverSpace) => {
      const today = localPartsIn(now, zoneOf(s.timezone)).dateStr;
      return [addDaysStr(today, -1), today];
    };
    const windows = await this.shiftResolver.plannedWindows(userId, spaces, daysOf).catch(() => new Map());
    return pickNextShift(windows, new Map(spaces.map((s) => [s.id, s.name ?? null])), now);
  }
}
