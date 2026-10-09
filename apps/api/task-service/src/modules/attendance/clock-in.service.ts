import { Injectable, Inject, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ShiftResolverService, ResolverSpace } from './shift-resolver.service';
import {
  success,
  TimeEntryStatus,
  isAtSite,
  formatDistance,
  siteEnforcesZone,
  parseGeofencePolygon,
  activeAssignmentWhere,
  ATTENDANCE_CONSTANTS,
  computeScheduleFlags,
  SHIFT_REMINDER_DEFAULTS,
  resolveAwayAccess,
  UNSCHEDULED_SESSION_DEFAULTS,
  SERVICE_NAMES,
  mayClockInRemotely as canClockInRemotely,
  noShiftAllowance,
  countedMinutesBetween,
  startOfDayIn,
  endOfDayIn,
  type NoShiftAllowance,
  type NoShiftTag,
  spaceRunsClock,
} from '@hbcfield/shared';
import { clockEventEntry } from './clock-event';
import type { OccurrenceEvidence } from '@hbcfield/shared';
import { fixOfTap, judgeOccurrence } from '../../common/occurrence.util';
import { alreadyClockedIn, approvalFor, sameRecordOrRefuse } from './attendance-occurrence';
import { BreakRulesService } from './break-rules.service';
import { PresenceService } from './presence/presence.service';
import { AttendanceGeocoderService } from './attendance-geocoder.service';
import { ShiftSweepService } from './shift-sweep.service';

// tz-lookup: offline coords → IANA timezone (single in-memory lookup, no types pkg).
const tzlookup: (lat: number, lon: number) => string = require('tz-lookup');

/**
 * Starting a shift: where a member may clock in, the clock-in itself, and the
 * context it is stamped with (shift, no-shift allowance, away, timezone).
 */
@Injectable()
export class ClockInService {
  private readonly logger = new Logger(ClockInService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION)
    private readonly notificationClient: ClientProxy,
    private readonly shiftResolver: ShiftResolverService,
    private readonly breakRules: BreakRulesService,
    // Where they are working now — display only, and never in the way of a clock-in.
    private readonly presence: PresenceService,
    private readonly geocoder: AttendanceGeocoderService,
    private readonly shiftSweeps: ShiftSweepService,
  ) {}

  /**
   * Resolve the shift expectation for a clock-in and return the DB fields to
   * stamp on the TimeEntry. Returns {} for spaces without hour expectations
   * (workModel NONE/TASK) or when no shift/schedule matches — leaving the entry
   * with the default reminderState=NONE and no expected end. Never throws:
   * a resolver failure must not block a clock-in.
   */
  /**
   * Resolve the IANA timezone WHERE the worker physically clocked in, from the
   * clock-in GPS. Computed once here (offline, microsecond lookup) and stored on
   * the entry so display is a zero-cost read — and correct for remote clock-ins.
   * Falls back to the space's timezone when GPS is unavailable/invalid.
   */
  private resolveEntryTimezone(lat: number | null | undefined, lng: number | null | undefined, spaceTz?: string | null): string | null {
    // (0,0) is Null Island — a missing/failed GPS fix, not a real location.
    if (lat != null && lng != null && !(lat === 0 && lng === 0)) {
      try {
        return tzlookup(lat, lng);
      } catch {
        // out-of-range / lookup miss → fall through to the space timezone
      }
    }
    return spaceTz ?? null;
  }

  /**
   * What this workspace allows a member with no shift, at this moment.
   *
   * One indexed read (userId, clockInAt) of the member's sessions touching
   * today, at EVERY workspace — a limit that only counted its own hours would
   * be walked around by clocking in next door. Rejected sessions count nothing.
   */
  async noShiftAllowanceFor(
    userId: string,
    space: { noShiftPolicy?: string | null; noShiftDailyMinutes?: number | null },
    at: Date,
    tz: string,
  ): Promise<NoShiftAllowance & { workedTodayMinutes: number }> {
    const policy = space.noShiftPolicy ?? 'ALLOW';
    if (policy !== 'LIMIT') {
      return { ...noShiftAllowance({ policy, dailyMinutes: space.noShiftDailyMinutes, workedTodayMinutes: 0, at }), workedTodayMinutes: 0 };
    }
    const dayStart = startOfDayIn(at, tz);
    const entries = await this.prisma.timeEntry.findMany({
      where: {
        userId,
        // Bounded below so the index does the work; nothing stays open a day (the sweep closes it).
        clockInAt: { gte: new Date(dayStart.getTime() - 24 * 3_600_000), lt: at },
        OR: [{ clockOutAt: null }, { clockOutAt: { gt: dayStart } }],
        approvalStatus: { not: 'REJECTED' },
      },
      select: { clockInAt: true, clockOutAt: true, paidMinutes: true, totalMinutes: true, unpaidBreakMinutes: true },
    });
    const workedTodayMinutes = countedMinutesBetween(entries, dayStart, at);
    return {
      ...noShiftAllowance({ policy, dailyMinutes: space.noShiftDailyMinutes, workedTodayMinutes, at }),
      workedTodayMinutes,
    };
  }

  /**
   * Tag each workspace a member may clock in at with what the one-button
   * clock-in needs to choose and to answer before the tap:
   *   `shiftToday` — a shift for them here now, `isPrimary`, and
   *   `noShift`    — their allowance with no shift (null where it is free).
   *
   * One shift resolution per workspace (a member has a handful), and ONE read
   * of today's hours per time zone, only for workspaces that limit it.
   */
  async tagClockInContext<T extends ResolverSpace & { noShiftPolicy?: string | null; noShiftDailyMinutes?: number | null }>(
    spaces: T[],
    userId: string,
    now: Date,
    primarySpaceIds: ReadonlySet<string>,
  ): Promise<(T & { noShift: NoShiftTag | null; shiftToday: boolean; isPrimary: boolean })[]> {
    const worked = new Map<string, Promise<number>>();
    return Promise.all(
      spaces.map(async (space) => {
        const tz = space.timezone || 'UTC';
        const policy = space.noShiftPolicy ?? 'ALLOW';
        const limited = policy === 'LIMIT' || policy === 'SHIFT_ONLY';
        /*
          A shift is only worth resolving where it changes something: ordering a
          choice (more than one workspace) or a no-shift rule. A member with one
          workspace that allows it freely — most of them, on an endpoint the
          phone polls — costs nothing here. Wrapped so a resolver that throws,
          however it throws, never takes the list down with it.
        */
        const hasShiftNow = spaces.length > 1 || limited
          ? await Promise.resolve()
              .then(() => this.shiftResolver.resolveForClockIn({ userId, space, clockInAt: now, clockInTz: tz }))
              .then((r) => !!r)
              .catch(() => false)
          : false;
        const isPrimary = primarySpaceIds.has(space.id);
        if (!limited) return { ...space, noShift: null, shiftToday: hasShiftNow, isPrimary };
        let workedTodayMinutes = 0;
        if (policy === 'LIMIT' && !hasShiftNow) {
          if (!worked.has(tz)) {
            worked.set(tz, this.noShiftAllowanceFor(userId, { noShiftPolicy: 'LIMIT', noShiftDailyMinutes: space.noShiftDailyMinutes }, now, tz).then((a) => a.workedTodayMinutes));
          }
          workedTodayMinutes = await worked.get(tz)!;
        }
        const noShift: NoShiftTag = {
          policy,
          dailyMinutes: space.noShiftDailyMinutes ?? 480,
          hasShiftNow,
          workedTodayMinutes,
          dayEndsAt: endOfDayIn(now, tz).toISOString(),
        };
        return { ...space, noShift, shiftToday: hasShiftNow, isPrimary };
      }),
    );
  }

  private async buildShiftStamp(
    userId: string,
    space: ResolverSpace,
    clockInAt: Date,
    clockInTz?: string,
  ): Promise<{
    shiftId?: string;
    /**
     * PERSISTED now, not derived. It used to be read once for the LATE_ARRIVAL
     * flag and dropped before the row was written — and nothing can clamp paid
     * time to a shift start it did not keep.
     */
    expectedClockInAt?: Date;
    expectedClockOutAt?: Date;
    nextRemindAt?: Date;
    flagToleranceMin?: number;
    scheduled: boolean;
  }> {
    try {
      const resolved = await this.shiftResolver.resolveForClockIn({ userId, space, clockInAt, clockInTz });
      if (!resolved) return { ...this.unscheduledStamp(clockInAt), scheduled: false };
      return {
        ...(resolved.shiftId ? { shiftId: resolved.shiftId } : {}),
        expectedClockInAt: resolved.expectedClockInAt,
        expectedClockOutAt: resolved.expectedClockOutAt,
        nextRemindAt: resolved.nextRemindAt,
        flagToleranceMin: resolved.flagToleranceMin,
        scheduled: true,
      };
    } catch (err) {
      this.logger.error(`Shift resolution failed for user=${userId} space=${space.id}: ${err}`);
      // Even on resolver failure, arm the safety-net so the session can't run silently forever.
      return { ...this.unscheduledStamp(clockInAt), scheduled: false };
    }
  }

  /**
   * Safety-net stamp for a clock-in with NO resolved shift: leave shiftId /
   * expectedClockOutAt null (marks it "unscheduled") but arm nextRemindAt at
   * SOFT_HOURS so the reminder sweep picks it up and can't let it run to 71h.
   */
  private unscheduledStamp(clockInAt: Date): { nextRemindAt: Date } {
    return {
      nextRemindAt: new Date(clockInAt.getTime() + UNSCHEDULED_SESSION_DEFAULTS.SOFT_HOURS * 3_600_000),
    };
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
  async tagAwayAllowed<T extends { id: string; lat?: number | null; lng?: number | null; geofencePolicy?: string | null }>(
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

    const [member, overrides] = await Promise.all([
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
    ]);

    return rows.map((s) => {
      const spaceHasPin = s.lat != null && s.lng != null;
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
    const assignments = await this.prisma.spaceAssignment.findMany({
      where: activeAssignmentWhere(data.userId),
      // The per-workspace override rides along: it is half of the answer to
      // "may they work away from HERE", and it is on the row we already read.
      select: { spaceId: true, allowRemote: true, isPrimary: true },
    });
    const spaceIds = [...new Set(assignments.map((a) => a.spaceId))];
    if (!spaceIds.length) return success([]);

    const locations = await this.prisma.companyLocation.findMany({
        where: {
          id: { in: spaceIds },
          organizationId: data.organizationId,
          isActive: true,
          isRemote: false,
        },
        select: {
          id: true, name: true, address: true, lat: true, lng: true,
          geofenceRadius: true, geofencePolygon: true, timezone: true, isDefault: true,
          // The ceiling. Needed to answer `awayAllowed` below.
          geofencePolicy: true,
          // The rule for clocking in with no shift, and what the resolver needs to ask it.
          workModel: true, noShiftPolicy: true, noShiftDailyMinutes: true,
          // Whether Time Tracking runs HERE — a space's own list, else the organization's.
          enabledModules: true,
          organization: { select: { enabledModules: true } },
        },
      orderBy: { name: 'asc' },
    });
    /*
      ⚠️ ONLY WHERE TIME TRACKING RUNS. The list offered a workspace whose
      Modules tab has Time Tracking off, and the clock-in there was accepted
      (the module gate read `spaceId`, the clock-in sends `locationId`). Both
      now ask the workspace — the list must never be looser than the check.
    */
    const clockable = locations.filter((l) =>
      // The same answer the job-start gate uses (shared clock-gate.ts).
      spaceRunsClock(l.enabledModules as string[] | null, l.organization?.enabledModules as string[] | null),
    ).map(({ enabledModules: _m, organization: _o, ...rest }) => rest);

    // The overrides are already on the assignment rows read above, so tagging
    // costs one lookup for the member and no second query for them.
    const overrideBySpace = new Map(assignments.map((a) => [a.spaceId, a.allowRemote]));
    const tagged = await this.tagAwayAllowed(clockable as typeof locations, data.userId, data.organizationId, overrideBySpace);
    const primary = new Set(assignments.filter((a) => a.isPrimary).map((a) => a.spaceId));
    return success(await this.tagClockInContext(tagged, data.userId, new Date(), primary));
  }

  /**
   * Clock in at a company location
   */
  async clockIn(data: {
    userId: string;
    locationId?: string;
    lat: number;
    lng: number;
    accuracy?: number;
    organizationId: string;
    /**
     * The org's Remote bucket, for somebody who belongs to no workspace at all.
     *
     * Working away from a workspace you ARE assigned to no longer goes through
     * here: send the `locationId` and the server decides from the site's ceiling
     * and your grant. Kept because a member with no assignment has no workspace
     * to be away from, and because it is what every shipped client still sends.
     */
    isRemote?: boolean;
    /** Why they are away from the site, when they are. Optional, never trusted. */
    awayReason?: string;
    /** The entry's id, made on the phone — a resend returns the same entry. */
    id?: string;
    /** When and where the tap happened, for a clock-in recorded offline. */
    evidence?: OccurrenceEvidence;
  }) {
    this.logger.log(`Clock in attempt: user=${data.userId}, location=${data.locationId}, remote=${!!data.isRemote}`);

    /*
      ── A clock-in the phone already sent ──
      Its id was made on the phone, so a resend — after the first reached the
      server and only the answer was lost, even after the shift has since been
      closed — returns that entry instead of starting a second shift.
    */
    if (data.id) {
      const prior = await this.prisma.timeEntry.findUnique({ where: { id: data.id }, include: { location: true } });
      if (prior) return success(sameRecordOrRefuse(prior, data.userId), 'Already clocked in');
    }

    /*
      ── When it happened ──
      The tap's own time, never the time it arrived: an 07:58 clock-in synced at
      11:14 is a 07:58 clock-in, judged as late or on time at 07:58. It cannot be
      earlier than the member's previous shift ended.
    */
    const lastClosed = data.evidence
      ? await this.prisma.timeEntry.findFirst({
          // Only a shift that has actually ended. One entered for a day still to
          // come would make every real clock-in before it "out of order".
          where: { userId: data.userId, clockOutAt: { not: null, lte: new Date() } },
          orderBy: { clockOutAt: 'desc' },
          select: { clockOutAt: true },
        })
      : null;
    const occurrence = judgeOccurrence(data.evidence, lastClosed?.clockOutAt);
    const tapFix = fixOfTap(data.evidence, occurrence.at, occurrence.flags);
    if (tapFix) {
      data.lat = tapFix.lat;
      data.lng = tapFix.lng;
      data.accuracy = tapFix.accuracy;
    }

    // Any STAFF member may clock in (EMPLOYEE and ADMIN — admins clock in too);
    // only external portal CUSTOMER accounts are excluded. Previously this was
    // hardcoded role:'EMPLOYEE', so admins hit "Employee not found".
    const user = await this.prisma.user.findFirst({
      where: {
        id: data.userId,
        organizationId: data.organizationId,
        role: { not: 'CUSTOMER' },
      },
      select: {
        id: true,
        organizationId: true,
        allowRemote: true,
        role: true,
        organization: { select: { timezone: true } },
      },
    });

    if (!user) {
      throw new NotFoundException('Employee not found');
    }

    // No-GPS fallback timezone: for a logical space (or remote bucket) with no
    // resolvable worker location, fall back to the ORG's timezone (not a space's
    // stored value, which may be stale/wrong). UTC only if the org has none.
    const orgTz = user.organization?.timezone || 'UTC';

    // Admins have full org access — they may always clock in remotely, without
    // needing the per-user allowRemote flag toggled on (nothing to configure for
    // an admin). Everyone else still requires an explicit remote-clock-in grant.
    //
    // Shared with all three clock surfaces (web attendance page, web widget,
    // mobile) so the button appears exactly where the API would allow it. They
    // each used to restate this and each left out the admin half.
    const mayClockInRemotely = canClockInRemotely(user);

    // ---- Remote clock-in (WFH/anywhere): geofence-exempt, coarse place captured ----
    if (data.isRemote) {
      if (!mayClockInRemotely) {
        throw new BadRequestException(
          'You are not permitted to clock in remotely. Ask your administrator to enable remote clock-in for your account.',
        );
      }
      const already = await this.prisma.timeEntry.findFirst({
        where: { userId: data.userId, status: TimeEntryStatus.CLOCKED_IN },
        include: { location: true },
      });
      if (already) throw alreadyClockedIn(already, occurrence.fromEvidence);
      const bucket = await this.getOrCreateRemoteBucket(data.organizationId);
      const place = await this.geocoder.reverseGeocode(data.lat, data.lng);
      const remoteClockInAt = occurrence.at;
      // Remote clock-in: the bucket is a logical (pin-less) space, so anchor the
      // shift to the worker's own timezone.
      // Strip only what is genuinely derived — `expectedClockInAt` is a column.
      const { scheduled: _s, flagToleranceMin: _ft, ...remoteStamp } = await this.buildShiftStamp(
        data.userId,
        bucket,
        remoteClockInAt,
        this.resolveEntryTimezone(data.lat, data.lng, orgTz) ?? undefined,
      );
      /*
        Rests apply to a day worked from home or a car exactly as they do to one
        worked on site — the obligation is about hours worked, not about where.
        Omitting this here was an oversight when planned rests were added: the
        on-site path got a plan and the remote path silently got none, so the one
        population most likely to work straight through was the one nobody
        reminded.
      */
      const remoteRests = await this.breakRules.planForClockIn({
        spaceId: bucket.id,
        shiftId: remoteStamp.shiftId ?? null,
        clockInAt: remoteClockInAt,
        expectedStartAt: remoteStamp.expectedClockInAt ?? null,
        expectedEndAt: remoteStamp.expectedClockOutAt ?? null,
        timezone: this.resolveEntryTimezone(data.lat, data.lng, orgTz) ?? orgTz,
      });

      const remoteFlags = [...occurrence.flags];
      const remotePresence = await this.presence.atClockIn({
        userId: data.userId,
        organizationId: data.organizationId,
        point: { lat: data.lat, lng: data.lng },
        insideArea: false,
        at: remoteClockInAt,
        timezone: this.resolveEntryTimezone(data.lat, data.lng, orgTz) ?? orgTz,
        recordedOffline: remoteFlags.includes('RECORDED_OFFLINE'),
      });
      const entry = await this.createEntryOnce(data.id, data.userId, {
          ...(data.id ? { id: data.id } : {}),
          userId: data.userId,
          locationId: bucket.id,
          status: TimeEntryStatus.CLOCKED_IN,
          clockInAt: remoteClockInAt,
          clockInLat: data.lat,
          clockInLng: data.lng,
          clockInAccuracy: data.accuracy,
          clockInWithinGeofence: true,
          isRemote: true,
          clockInPlace: place,
          timezone: this.resolveEntryTimezone(data.lat, data.lng, orgTz),
          flagReasons: remoteFlags,
          approvalStatus: approvalFor(remoteFlags),
          organizationId: data.organizationId,
          ...remoteStamp,
          ...remotePresence,
          breakPlan: remoteRests.breakPlan as never,
          nextBreakRemindAt: remoteRests.nextBreakRemindAt,
      });
      this.logger.log(`Remote clock in: entry=${entry.id}, user=${data.userId}, place=${place ?? 'unknown'}`);
      this.notificationClient.emit('attendance_clock_in', {
        userId: data.userId,
        organizationId: data.organizationId,
        timeEntry: clockEventEntry(entry, 'in'),
      });
      return success(entry, place ? `Clocked in remotely · ${place}` : 'Clocked in remotely');
    }

    // ---- On-site clock-in requires a target location ----
    if (!data.locationId) {
      throw new BadRequestException('A location is required to clock in on site.');
    }

    // Verify user has an assignment to this location that is active RIGHT NOW —
    // started (effectiveFrom <= now) and not expired (effectiveTo null or future).
    // Without the effectiveFrom bound a future-dated assignment could clock in early (L3).
    // The window rule is shared with `listClockInLocations`, which decides what
    // the member is OFFERED. Two copies would eventually offer a workspace this
    // then refuses — which reads as the product being broken, not as a rule.
    // Asked of the moment of the tap: an assignment that ended at noon still
    // covers a clock-in made offline at 08:00 and sent at 14:00.
    const assignment = await this.prisma.spaceAssignment.findFirst({
      where: { ...activeAssignmentWhere(data.userId, occurrence.at), spaceId: data.locationId },
    });

    if (!assignment) {
      throw new BadRequestException(
        'You are not assigned to this location. Contact your administrator.',
      );
    }

    // Check if already clocked in
    const existingEntry = await this.prisma.timeEntry.findFirst({
      where: {
        userId: data.userId,
        status: TimeEntryStatus.CLOCKED_IN,
      },
      include: {
        location: true,
      },
    });

    if (existingEntry) throw alreadyClockedIn(existingEntry, occurrence.fromEvidence);

    // Get location details
    const location = await this.prisma.companyLocation.findFirst({
      where: {
        id: data.locationId,
        organizationId: data.organizationId,
        isActive: true,
      },
    });

    if (!location) {
      throw new NotFoundException('Location not found or inactive');
    }

    // Check GPS accuracy
    if (
      data.accuracy &&
      data.accuracy > ATTENDANCE_CONSTANTS.GPS_ACCURACY_THRESHOLD
    ) {
      throw new BadRequestException(
        `GPS accuracy too low (${formatDistance(data.accuracy)}). Please wait for better signal. Required: ${formatDistance(ATTENDANCE_CONSTANTS.GPS_ACCURACY_THRESHOLD)} or better.`,
      );
    }

    // Is this position at the site? One helper answers it for a radius and for
    // a drawn boundary alike, so clock-in, clock-out, the excursion sweep and
    // the phone's badge cannot disagree — they did, when each compared a
    // distance to a radius inline.
    const spaceHasPin = location.lat != null && location.lng != null;
    const zone = {
      lat: location.lat,
      lng: location.lng,
      geofenceRadius: location.geofenceRadius,
      geofencePolygon: parseGeofencePolygon(location.geofencePolygon),
    };
    const at = isAtSite({ lat: data.lat, lng: data.lng, accuracy: data.accuracy }, zone);
    const distance = at.distanceToCentre ?? 0;
    const withinGeofence = at.inside;

    /*
      Outside the ring — which is a question for the workspace and the person,
      not a global constant.

      `REQUIRE_GEOFENCE_FOR_CLOCK_IN` was one switch for the entire product, so a
      yard and a client-facing sales team had to want the same answer. The
      workspace now carries a CEILING (may anybody be away from here at all?) and
      the member carries a GRANT (may THIS person?), resolved by one shared rule.

      The refusal names which of the two failed. "You are not allowed" and "this
      site never allows it" send somebody to different people to get it fixed,
      and they are standing outside a client's office while they read it.
    */
    const away = !withinGeofence
      ? resolveAwayAccess({
          spaceHasPin,
          policy: location.geofencePolicy,
          userAllowRemote: user.allowRemote,
          assignmentAllowRemote: assignment.allowRemote,
          isAdmin: user.role === 'ADMIN',
        })
      : { allowed: true, reason: 'GRANTED' as const };

    if (!withinGeofence && !away.allowed) {
      // Coded, with the figures, so the phone writes it in the member's
      // language; `message` is the English fallback, distance as a person says it.
      const metres = Math.round(distance);
      const params = { distanceMetres: metres, radiusMetres: location.geofenceRadius, location: location.name };
      throw new BadRequestException(
        away.reason === 'SITE_STRICT'
          ? {
              message: `${location.name} can only be clocked in at on site. You are ${formatDistance(metres)} away.`,
              code: 'OUTSIDE_GEOFENCE',
              params,
            }
          : {
              message: `You are ${formatDistance(metres)} from ${location.name}, and you are not set up to work away from it. Ask your administrator to allow it.`,
              code: 'AWAY_NOT_ALLOWED',
              params,
            },
      );
    }

    const clockInTime = occurrence.at;
    const flagReasons: string[] = [...occurrence.flags];

    /*
      Judged against today's boundary, which may not be the one that stood when
      the member tapped. Rather than keep a history of boundaries, say so: a
      person looks at an entry whose site moved while it was on its way.
    */
    if (occurrence.flags.includes('RECORDED_OFFLINE') && location.updatedAt > clockInTime) {
      flagReasons.push('BOUNDARY_CHANGED');
    }

    /*
      An away day is recorded as away, and reviewed.

      Not from suspicion: there is no geofence evidence behind it, and the honest
      handling of unverifiable evidence is that a person looks at it. It is one
      row in a queue that already exists — and it keeps its workspace, its shift
      and its rests, which is the entire point of admitting it here rather than
      filing it in a bucket of its own.
    */
    const clockedInAway = !withinGeofence;
    if (clockedInAway) {
      flagReasons.push('OUTSIDE_GEOFENCE_IN');
    }

    // No-GPS fallback: a PHYSICAL space falls back to its own (site) timezone; a
    // LOGICAL space has none, so fall back to the org timezone. When GPS is
    // present the worker's actual location wins regardless.
    const spaceIsPhysical = location.lat != null && location.lng != null;
    const fallbackTz = spaceIsPhysical ? location.timezone : orgTz;
    const workerTz = this.resolveEntryTimezone(data.lat, data.lng, fallbackTz);

    // Resolve the shift ONCE (rota-aware + timezone-correct) and reuse it for both
    // the flags and the stamp — no separate legacy technicianSchedule query.
    // `scheduled` and `flagToleranceMin` are derived and are not columns;
    // `expectedClockInAt` IS one now and stays in `stampCols`.
    const { scheduled, flagToleranceMin, ...stampCols } = await this.buildShiftStamp(
      data.userId,
      location,
      clockInTime,
      workerTz ?? undefined,
    );

    /*
      ── Clocking in with no shift ──
      The workspace decides: allow it, allow up to a number of hours a day, or
      only with a shift. A limit becomes the session's planned end, so counted
      time, reminders, overtime and the open-shift close all follow it.

      ⚠️ Recorded offline, it is KEPT, never refused: the member already worked
      it. With no hours left it counts nothing and says so, and time past the
      limit still needs an approval like any overtime.
    */
    let endIsDailyLimit = false;
    if (!scheduled) {
      const allowance = await this.noShiftAllowanceFor(data.userId, location, clockInTime, location.timezone || workerTz || orgTz);
      if (allowance.kind === 'refused' && !flagReasons.includes('RECORDED_OFFLINE')) {
        throw noShiftRefusal(allowance, location.name);
      }
      if (allowance.kind !== 'free') {
        const end = allowance.kind === 'limited' ? allowance.until : clockInTime;
        stampCols.expectedClockOutAt = end;
        stampCols.nextRemindAt = new Date(Math.max(end.getTime(), Date.now()) + SHIFT_REMINDER_DEFAULTS.GRACE_MINUTES * 60_000);
        endIsDailyLimit = true;
        if (allowance.kind === 'refused') flagReasons.push('PAST_DAILY_LIMIT');
      }
    }

    // Smart flags: matched shift/rota → LATE_ARRIVAL if past the start beyond the
    // shift's tolerance; no matched shift → UNSCHEDULED_DAY. Late detection is the
    // shared computeScheduleFlags (same logic as clock-out + edit).
    if (!scheduled) {
      flagReasons.push('UNSCHEDULED_DAY');
    } else {
      flagReasons.push(
        ...computeScheduleFlags({
          clockInAt: clockInTime,
          expectedClockInAt: stampCols.expectedClockInAt,
          toleranceMin: flagToleranceMin,
        }),
      );
    }

    const approvalStatus = approvalFor(flagReasons);

    /*
      This shift's rests, resolved once and frozen onto the entry.

      Never blocks a clock-in: a space with no rules plans nothing, and a
      resolution that fails plans nothing either. Somebody must always be able to
      start work, whatever the rest engine thinks.
    */
    const restPlan = await this.breakRules.planForClockIn({
      spaceId: data.locationId,
      shiftId: stampCols.shiftId ?? null,
      clockInAt: clockInTime,
      expectedStartAt: stampCols.expectedClockInAt ?? null,
      expectedEndAt: stampCols.expectedClockOutAt ?? null,
      timezone: workerTz ?? location.timezone ?? 'UTC',
    });

    // Where they are working from the first moment: inside an area that exists, or decided from the evidence.
    const presenceCols = await this.presence.atClockIn({
      userId: data.userId,
      organizationId: data.organizationId,
      point: { lat: data.lat, lng: data.lng },
      insideArea: siteEnforcesZone(zone) && withinGeofence,
      at: clockInTime,
      timezone: workerTz ?? location.timezone ?? orgTz,
      recordedOffline: flagReasons.includes('RECORDED_OFFLINE'),
    });

    // Create time entry
    const entry = await this.createEntryOnce(data.id, data.userId, {
        ...(data.id ? { id: data.id } : {}),
        userId: data.userId,
        locationId: data.locationId,
        status: TimeEntryStatus.CLOCKED_IN,
        clockInAt: clockInTime,
        clockInLat: data.lat,
        clockInLng: data.lng,
        clockInAccuracy: data.accuracy,
        clockInWithinGeofence: withinGeofence,
        // Away, but for THIS workspace: the rota, the rests and the expected
        // hours all hang off it and stay attached.
        isRemote: clockedInAway,
        awayReason: clockedInAway ? (data.awayReason?.trim().slice(0, 200) || null) : null,
        clockInPlace: clockedInAway ? await this.geocoder.reverseGeocode(data.lat, data.lng) : null,
        timezone: workerTz,
        flagReasons,
        approvalStatus,
        organizationId: data.organizationId,
        ...stampCols,
        ...presenceCols,
        endIsDailyLimit,
        breakPlan: restPlan.breakPlan as never,
        nextBreakRemindAt: restPlan.nextBreakRemindAt,
    });

    this.logger.log(
      `Clock in successful: entry=${entry.id}, user=${data.userId}, location=${location.name}, withinGeofence=${withinGeofence}, flags=[${flagReasons.join(',')}], approval=${approvalStatus}`,
    );

    // Fulfill the matching expected shift so it isn't flagged as a no-show. Never
    // let a fulfillment hiccup block the clock-in itself.
    if (scheduled && stampCols.shiftId) {
      await this.shiftSweeps.markShiftInstancePresent(data.userId, data.locationId, stampCols.shiftId, entry.id, clockInTime, {
        organizationId: data.organizationId,
        recordedOffline: flagReasons.includes('RECORDED_OFFLINE'),
        timezone: workerTz ?? location.timezone ?? 'UTC',
      }).catch(
        (e) => this.logger.warn(`markShiftInstancePresent failed for entry=${entry.id}: ${e}`),
      );
    }

    // Emit real-time event for dashboard/team updates
    this.notificationClient.emit('attendance_clock_in', {
      userId: data.userId,
      organizationId: data.organizationId,
      timeEntry: clockEventEntry(entry, 'in'),
    });

    return success(entry, `Clocked in at ${location.name}`);
  }

  /**
   * Create a clock-in entry — once.
   *
   * ⚠️ Two constraints can refuse the insert, and they mean different things.
   * The id (the phone sent the same clock-in twice, racing): return that entry.
   * One open shift per member (`time_entries_one_open_per_user`): they are
   * already clocked in — a conflict with the open entry, never a second shift.
   */
  private async createEntryOnce(id: string | undefined, userId: string, data: Record<string, unknown>) {
    const include = { location: true, user: { select: { firstName: true, lastName: true } } } as const;
    try {
      return await this.prisma.timeEntry.create({ data: data as never, include });
    } catch (err) {
      if ((err as { code?: string })?.code !== 'P2002') throw err;
      if (id) {
        const same = await this.prisma.timeEntry.findUnique({ where: { id }, include });
        if (same) return sameRecordOrRefuse(same, userId);
      }
      const open = await this.prisma.timeEntry.findFirst({
        where: { userId, status: TimeEntryStatus.CLOCKED_IN },
        include: { location: true },
      });
      if (open) throw alreadyClockedIn(open, true);
      throw err;
    }
  }

  /** Find or create the org's geofence-exempt "Remote" bucket location. */
  private async getOrCreateRemoteBucket(organizationId: string) {
    const existing = await this.prisma.companyLocation.findFirst({
      where: { organizationId, isRemote: true },
    });
    if (existing) return existing;
    return this.prisma.companyLocation.create({
      data: { name: 'Remote', organizationId, isRemote: true, isActive: true },
    });
  }
}

/** Why a clock-in with no shift was refused, in words and a code the phone translates. */
function noShiftRefusal(allowance: Extract<NoShiftAllowance, { kind: 'refused' }>, spaceName: string): BadRequestException {
  if (allowance.reason === 'SHIFT_ONLY') {
    return new BadRequestException({
      message: `You have no shift today. ${spaceName} only allows clocking in with a shift.`,
      code: 'NO_SHIFT_TODAY',
    });
  }
  const hours = Math.round(((allowance.dailyMinutes ?? 0) / 60) * 10) / 10;
  return new BadRequestException({
    message: `No hours left today. ${spaceName} allows ${hours} h a day without a shift, and you have worked them. Ask your leader for a shift.`,
    code: 'NO_HOURS_LEFT',
  });
}
