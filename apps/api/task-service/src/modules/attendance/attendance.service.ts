import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationRoutingService } from '../../common/notification-routing.service';
import { ShiftResolverService, ResolverSpace } from './shift-resolver.service';

// tz-lookup: offline coords → IANA timezone (single in-memory lookup, no types pkg).
const tzlookup: (lat: number, lon: number) => string = require('tz-lookup');
import {
  success,
  paginated,
  TimeEntryStatus,
  haversineDistance,
  isAtSite,
  siteEnforcesZone,
  parseGeofencePolygon,
  activeAssignmentWhere,
  ATTENDANCE_CONSTANTS,
  GEOFENCE_EXCURSION,
  computeScheduleFlags,
  SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN,
  SHIFT_REMINDER_DEFAULTS,
  computeCountedTime,
  shortfallMinutes,
  resolveAwayAccess,
  UNSCHEDULED_SESSION_DEFAULTS,
  SERVICE_NAMES,
  QUEUE_NAMES,
  buildSingleDayFilter,
  buildDateRangeFilter,
  mayClockInRemotely as canClockInRemotely,
} from '@hbcfield/shared';
import { scopeWhere, scopeWhereOn, scopeAllows, type AttendanceScope } from '@hbcfield/shared';
import { CountedTimeService } from './counted-time.service';
import type { OccurrenceEvidence } from '@hbcfield/shared';
import { fixOfTap, judgeOccurrence } from '../../common/occurrence.util';
import { alreadyClockedIn, approvalFor, sameRecordOrRefuse, SAME_TAP_MS } from './attendance-occurrence';
import { BreakRulesService } from './break-rules.service';

// Trimmed CompanyLocation projection for the hot attendance polls (P12) —
// getStatus/getHistory/heartbeat previously `include`d the full ~20-column row
// (incl. customer-contact fields, config, timestamps) when the clients only read
// these. Superset of every field the mobile/web attendance UI actually renders.
// Who edited an entry — surfaced on the "Edited" badge in the attendance table.
const EDITOR_SELECT = { firstName: true, lastName: true } as const;

const ATTENDANCE_LOCATION_SELECT = {
  id: true,
  name: true,
  address: true,
  lat: true,
  lng: true,
  geofenceRadius: true,
  geofencePolygon: true,
  timezone: true,
  workModel: true,
  kind: true,
  isActive: true,
  organizationId: true,
  // The ceiling on working away from here. Read wherever a workspace is handed
  // to a client that then decides whether to offer "away".
  geofencePolicy: true,
} as const;

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION)
    private readonly notificationClient: ClientProxy,
    @InjectQueue(QUEUE_NAMES.OVERTIME)
    private readonly overtimeQueue: Queue,
    private readonly notificationRouting: NotificationRoutingService,
    private readonly shiftResolver: ShiftResolverService,
    private readonly countedTime: CountedTimeService,
    private readonly breakRules: BreakRulesService,
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
   * The per-shift flag tolerance (minutes) for LATE/EARLY/OVERTIME, or the
   * default when the entry has no bound shift. Used at clock-out (clock-in gets
   * it straight from the resolver).
   */
  private getShiftFlagTolerance(shiftId?: string | null): Promise<number> {
    return this.countedTime.toleranceFor(shiftId ?? null);
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
  private async tagAwayAllowed<T extends { id: string; lat?: number | null; lng?: number | null; geofencePolicy?: string | null }>(
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
      select: { spaceId: true, allowRemote: true },
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
        },
      orderBy: { name: 'asc' },
    });

    // The overrides are already on the assignment rows read above, so tagging
    // costs one lookup for the member and no second query for them.
    const overrideBySpace = new Map(assignments.map((a) => [a.spaceId, a.allowRemote]));
    return success(
      await this.tagAwayAllowed(locations, data.userId, data.organizationId, overrideBySpace),
    );
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
          where: { userId: data.userId, clockOutAt: { not: null } },
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
      const place = await this.reverseGeocode(data.lat, data.lng);
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
          breakPlan: remoteRests.breakPlan as never,
          nextBreakRemindAt: remoteRests.nextBreakRemindAt,
      });
      this.logger.log(`Remote clock in: entry=${entry.id}, user=${data.userId}, place=${place ?? 'unknown'}`);
      this.notificationClient.emit('attendance_clock_in', {
        userId: data.userId,
        organizationId: data.organizationId,
        timeEntry: entry,
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
        `GPS accuracy too low (${Math.round(data.accuracy)}m). Please wait for better signal. Required: ${ATTENDANCE_CONSTANTS.GPS_ACCURACY_THRESHOLD}m or better.`,
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
      throw new BadRequestException(
        away.reason === 'SITE_STRICT'
          ? `${location.name} can only be clocked in at on site. You are ${Math.round(distance)}m away.`
          : `You are ${Math.round(distance)}m from ${location.name}, and you are not set up to work away from it. Ask your administrator to allow it.`,
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
        clockInPlace: clockedInAway ? await this.reverseGeocode(data.lat, data.lng) : null,
        timezone: workerTz,
        flagReasons,
        approvalStatus,
        organizationId: data.organizationId,
        ...stampCols,
        breakPlan: restPlan.breakPlan as never,
        nextBreakRemindAt: restPlan.nextBreakRemindAt,
    });

    this.logger.log(
      `Clock in successful: entry=${entry.id}, user=${data.userId}, location=${location.name}, withinGeofence=${withinGeofence}, flags=[${flagReasons.join(',')}], approval=${approvalStatus}`,
    );

    // Fulfill the matching expected shift so it isn't flagged as a no-show. Never
    // let a fulfillment hiccup block the clock-in itself.
    if (scheduled && stampCols.shiftId) {
      await this.markShiftInstancePresent(data.userId, data.locationId, stampCols.shiftId, entry.id, clockInTime, {
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
      timeEntry: entry,
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

  /**
   * Coarse reverse-geocode (city-level) via OpenStreetMap Nominatim. Returns
   * e.g. "Vienna, AT", or null on failure. zoom=10 keeps it to city/area
   * granularity (never a precise street) for privacy.
   */
  // ~1km-rounded coord → resolved place. Place names are stable, so caching
  // spares the geocoder entirely for repeated clock-ins at the same site. Only
  // successful lookups are cached (a transient failure retries next time).
  private readonly geocodeCache = new Map<string, string>();

  /**
   * Turn a coordinate into "City, CC".
   *
   * Through the gateway's own /geo/reverse rather than any geocoder directly,
   * so the provider chain lives in ONE place: this service does not need the
   * Google key, does not need to know whether Photon exists, and follows
   * whatever that endpoint is configured to use. It is a @Public() route on the
   * internal network — no credentials cross the wire.
   *
   * Previously this called nominatim.openstreetmap.org itself: a public service
   * under a policy permitting neither heavy nor commercial use, on a path that
   * grows with every remote clock-in.
   *
   * No fallback on purpose. If the chain has nothing, the entry records no
   * place name — which is exactly what a geocoder timeout always did.
   */
  private async reverseGeocode(lat: number, lng: number): Promise<string | null> {
    const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    const cached = this.geocodeCache.get(key);
    if (cached !== undefined) return cached;

    let place: string | null = null;
    try {
      const base = process.env.INTERNAL_API_URL?.trim() || 'http://api-gateway:4000/api/v1';
      // Hard 1.5s timeout so a slow geocoder cannot stall the (shared)
      // attendance queue slot, including the reminder/no-show sweep.
      const res = await fetch(`${base}/geo/reverse?lat=${lat}&lon=${lng}`, {
        signal: AbortSignal.timeout(1500),
      });
      if (res.ok) {
        const j: any = await res.json();
        // City granularity, never a street — this is a privacy boundary, not a
        // formatting choice.
        const city = j?.result?.city;
        const country = j?.result?.country;
        if (city) place = country ? `${city}, ${country}` : city;
      }
    } catch {
      place = null; // timeout / network — don't cache, let it retry later
    }

    if (place !== null) {
      if (this.geocodeCache.size > 2000) this.geocodeCache.clear();
      this.geocodeCache.set(key, place);
    }
    return place;
  }

  /**
   * Clock out from current shift
   */
  async clockOut(data: {
    userId: string;
    lat?: number;
    lng?: number;
    accuracy?: number;
    notes?: string;
    organizationId: string;
    /**
     * Why they are leaving before the shift ends, when they are.
     *
     * Asked by the client, which knows the expected end, and recorded here. NOT
     * required: a person may always stop working, and a time system that refuses
     * a clock-out is a time system people work around.
     */
    earlyReason?: string;
    /**
     * Which shift this closes. A phone that clocked in offline names the entry
     * it made, so a clock-out can never close a different shift than the one
     * the member was looking at.
     */
    entryId?: string;
    /** When and where the tap happened, for a clock-out recorded offline. */
    evidence?: OccurrenceEvidence;
  }) {
    this.logger.log(`Clock out attempt: user=${data.userId}${data.entryId ? `, entry=${data.entryId}` : ''}`);

    const entry = data.entryId
      ? await this.prisma.timeEntry.findFirst({
          where: { id: data.entryId, userId: data.userId, organizationId: data.organizationId },
          include: { location: true, breaks: { select: { endedAt: true } } },
        })
      : await this.prisma.timeEntry.findFirst({
          where: { userId: data.userId, organizationId: data.organizationId, status: TimeEntryStatus.CLOCKED_IN },
          include: { location: true, breaks: { select: { endedAt: true } } },
        });

    if (!entry) {
      throw new BadRequestException('You are not currently clocked in');
    }

    /*
      Already closed. The same tap sent twice gets the same answer; a shift
      closed some other way meanwhile (a manager, "I forgot to clock out") is a
      conflict the member sees, never silently overwritten.
    */
    if (entry.status !== TimeEntryStatus.CLOCKED_IN) {
      const tapAt = data.evidence ? new Date(data.evidence.occurredAt).getTime() : NaN;
      if (entry.clockOutAt && Math.abs(entry.clockOutAt.getTime() - tapAt) <= SAME_TAP_MS) {
        return success(entry, 'Already clocked out');
      }
      throw new ConflictException({
        message: 'This shift was already closed before your clock-out arrived',
        code: 'ENTRY_ALREADY_CLOSED',
        params: { current: { id: entry.id, status: entry.status, clockOutAt: entry.clockOutAt } },
      });
    }

    // Not before the shift began, nor before a rest in it ended.
    const lastRestEnd = (entry.breaks ?? []).reduce<Date | null>(
      (latest, b) => (b.endedAt && (!latest || b.endedAt > latest) ? b.endedAt : latest),
      null,
    );
    const occurrence = judgeOccurrence(data.evidence, lastRestEnd ?? entry.clockInAt);
    const tapFix = fixOfTap(data.evidence, occurrence.at, occurrence.flags);
    if (tapFix) {
      data.lat = tapFix.lat;
      data.lng = tapFix.lng;
      data.accuracy = tapFix.accuracy;
    }

    // Geofence is only evaluable when BOTH the device and the location have
    // coords. A clock-out with no GPS fix (indoors / permission revoked) skips
    // the check entirely instead of feeding (0,0) into Haversine and faking a
    // huge distance → bogus OUTSIDE_GEOFENCE_OUT flag. (Sec audit H13.)
    const hasDeviceCoords = data.lat != null && data.lng != null;
    const hasLocationCoords = entry.location.lat != null && entry.location.lng != null;
    const geofenceEvaluable = hasDeviceCoords && hasLocationCoords;

    // Same helper as clock-in, so a boundary drawn for the site is honoured at
    // both ends of the shift. Non-evaluable → treated as within (no flag).
    const outZone = {
      lat: entry.location.lat,
      lng: entry.location.lng,
      geofenceRadius: entry.location.geofenceRadius,
      geofencePolygon: parseGeofencePolygon(entry.location.geofencePolygon),
    };
    const atOut = geofenceEvaluable
      ? isAtSite(
          { lat: data.lat as number, lng: data.lng as number, accuracy: data.accuracy },
          outZone,
        )
      : null;
    const distance = atOut?.distanceToCentre ?? 0;
    const withinGeofence = atOut ? atOut.inside : true;

    // Calculate total minutes worked
    const clockOutTime = occurrence.at;
    const totalMinutes = Math.round(
      (clockOutTime.getTime() - entry.clockInAt.getTime()) / (1000 * 60),
    );

    // Smart auto-approval: evaluate clock-out against schedule
    const flagReasons: string[] = [...(entry.flagReasons || []), ...occurrence.flags];

    /*
      Clocking out from outside the ring is a violation — unless the whole day
      was worked away from the site, where it is the expected place to be.

      Flagging it there would put a second amber badge on an entry that already
      carries OUTSIDE_GEOFENCE_IN and is already waiting for review, and it would
      read as a rule broken rather than a day worked as agreed.
    */
    if (!withinGeofence && !entry.isRemote) {
      flagReasons.push('OUTSIDE_GEOFENCE_OUT');
    }

    // Overtime / early-departure flagging is ONLY meaningful against a concrete
    // expected end. `expectedClockOutAt` is stamped at clock-in by the shift
    // resolver (rota OR the legacy weekly schedule) as an absolute UTC instant —
    // timezone-correct and cross-midnight-safe. When it's null the session is
    // genuinely UNSCHEDULED (no shift/rota/schedule matched), so it can't be
    // "early" or "overtime" against anything — leave those flags off. (The old
    // else-branch re-derived the weekday from the CLOCK-OUT time in server-local
    // time, which for a cross-midnight or cross-timezone session matched the
    // wrong day's schedule and produced a false "Early Departure" alongside the
    // "Unscheduled" tag.)
    const toleranceMin = await this.getShiftFlagTolerance(entry.shiftId);
    if (entry.expectedClockOutAt) {
      flagReasons.push(
        ...computeScheduleFlags({
          clockOutAt: clockOutTime,
          expectedClockOutAt: entry.expectedClockOutAt,
          toleranceMin,
        }),
      );
    }

    // What the timesheet will read. The real times above are untouched.
    const counted = await this.countedTime.columnsFor(entry, clockOutTime, toleranceMin);


    /*
      How far short of the shift this falls.

      Computed from the same tolerance as the flags, by the same shared rule the
      phone used to ask the question — so the number the member was shown and the
      number their manager sees are the same number.
    */
    const shortBy = shortfallMinutes({
      clockOutAt: clockOutTime,
      expectedEndAt: entry.expectedClockOutAt,
      toleranceMin,
    });
    const earlyReason = shortBy > 0 ? (data.earlyReason ?? '').trim().slice(0, 500) : '';

    // Deduplicate flags
    const uniqueFlags = [...new Set(flagReasons)];
    const approvalStatus = approvalFor(uniqueFlags);

    // Remote shifts capture a coarse place on clock-out too — only when we have
    // a fix to reverse-geocode.
    const clockOutPlace =
      entry.isRemote && hasDeviceCoords
        ? await this.reverseGeocode(data.lat as number, data.lng as number)
        : undefined;

    /*
      Claimed, not overwritten: two clock-outs racing (the queue and a manager's
      edit) must not both close the shift with different times.
    */
    const claimed = await this.prisma.timeEntry.updateMany({
      where: { id: entry.id, status: TimeEntryStatus.CLOCKED_IN },
      data: { status: TimeEntryStatus.CLOCKED_OUT, clockOutAt: clockOutTime },
    });
    if (claimed.count === 0) {
      throw new ConflictException({ message: 'This shift was closed at the same moment', code: 'ENTRY_ALREADY_CLOSED' });
    }
    const updatedEntry = await this.prisma.timeEntry.update({
      where: { id: entry.id },
      data: {
        status: TimeEntryStatus.CLOCKED_OUT,
        clockOutAt: clockOutTime,
        clockOutLat: data.lat ?? null,
        clockOutLng: data.lng ?? null,
        clockOutAccuracy: data.accuracy,
        // null (not false) when the geofence couldn't be evaluated — records
        // "unknown", not "outside".
        clockOutWithinGeofence: geofenceEvaluable ? withinGeofence : null,
        totalMinutes,
        ...counted,
        // The reason rides with the entry, where the approvals queue reads it.
        // Prefixed rather than put in a column of its own: it IS a note about
        // the shift, and a manager reading the row wants it in the same place as
        // every other thing somebody wrote about that day.
        notes: earlyReason
          ? [data.notes, `Left early: ${earlyReason}`].filter(Boolean).join(' · ')
          : data.notes,
        flagReasons: uniqueFlags,
        approvalStatus,
        clockOutPlace,
        // Close out any shift-reminder lifecycle so a completed entry never
        // lingers in a reminder state and its nextRemindAt index key is cleared.
        reminderState: 'RESOLVED',
        nextRemindAt: null,
      },
      include: {
        location: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });

    if (shortBy > 0) {
      /*
        Somebody has to know.

        The entry was already FLAGGED for this and landed in an approval queue —
        which nobody watches in the moment. A shift ending ninety minutes early
        is operational news: the site is a person short right now, and finding
        out at the end of the month is finding out too late.
      */
      const leaderIds = await this.notifyTargetsFor(entry, 'canReconcileAttendance');
      this.notificationClient.emit('attendance_left_early', {
        entryId: entry.id,
        userId: entry.userId,
        userName: `${updatedEntry.user?.firstName ?? ''} ${updatedEntry.user?.lastName ?? ''}`.trim(),
        locationId: entry.locationId,
        locationName: updatedEntry.location?.name ?? 'a shift',
        shortfallMinutes: shortBy,
        expectedClockOutAt: entry.expectedClockOutAt?.toISOString() ?? null,
        reason: earlyReason || null,
        leaderIds,
        organizationId: entry.organizationId,
      });
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    this.logger.log(
      `Clock out successful: entry=${entry.id}, user=${data.userId}, duration=${hours}h ${minutes}m, flags=[${uniqueFlags.join(',')}], approval=${approvalStatus}`,
    );

    // Send geofence alert if clock-out is outside geofence
    if (!withinGeofence && ATTENDANCE_CONSTANTS.ALERT_ON_GEOFENCE_VIOLATION) {
      await this.sendGeofenceAlert({
        userId: data.userId,
        organizationId: data.organizationId,
        locationName: entry.location.name,
        distance: Math.round(distance),
        allowedRadius: entry.location.geofenceRadius,
        action: 'clock_out',
      });
    }

    // Emit real-time event for dashboard/team updates
    this.notificationClient.emit('attendance_clock_out', {
      userId: data.userId,
      organizationId: data.organizationId,
      timeEntry: updatedEntry,
    });

    // Entry landed in the approvals queue → nudge managers (bell + push).
    if (approvalStatus === 'PENDING') {
      await this.sendPendingApprovalAlert({
        entryId: updatedEntry.id,
        userId: data.userId,
        organizationId: data.organizationId,
        locationName: entry.location.name,
        flagReasons: uniqueFlags,
        totalMinutes,
      });
    }

    /*
      The message says PAID time, not time present.

      "Total time: 12h 10m" on a shift that pays 11h 30m is the sentence that
      starts the argument at the end of the month. The counted figure is the one
      that matters to the person reading it, so it is the one on the screen.
    */
    const paid = counted.paidMinutes ?? Math.max(0, totalMinutes - (entry.breakMinutes ?? 0));
    const ph = Math.floor(paid / 60);
    const pm = paid % 60;

    return success(
      { ...updatedEntry, shortfallMinutes: shortBy },
      shortBy > 0
        ? `Clocked out from ${entry.location.name}. ${ph}h ${pm}m counted — ${Math.floor(shortBy / 60)}h ${shortBy % 60}m short of your shift.`
        : `Clocked out from ${entry.location.name}. ${ph}h ${pm}m counted.`,
    );
  }

  // ==========================================================================
  // SHIFT REMINDER RESPONSES — worker actions + leader approval (Phase 3)
  // These are how an open shift gets resolved. Nothing here is auto-closed by
  // the machine; every path is driven by a human tapping a reminder action.
  // ==========================================================================

  /**
   * Worker responds "I forgot to clock out" with their real leave time
   * (trusted self-report). Closes the entry at that time. If the reported time
   * is beyond the expected shift end, the entry is flagged OVERTIME and lands in
   * the approvals queue for a leader to review — overtime is never paid silently.
   */
  async resolveForgotClockOut(data: {
    userId: string;
    entryId: string;
    clockOutAt: string;
    organizationId: string;
  }) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        id: data.entryId,
        userId: data.userId,
        organizationId: data.organizationId,
        status: TimeEntryStatus.CLOCKED_IN,
      },
      include: { location: true },
    });
    if (!entry) throw new BadRequestException('No matching open shift found');

    const clockOutTime = new Date(data.clockOutAt);
    const now = new Date();
    if (isNaN(clockOutTime.getTime())) throw new BadRequestException('Invalid clock-out time');
    if (clockOutTime.getTime() <= entry.clockInAt.getTime()) {
      throw new BadRequestException('Clock-out time must be after clock-in');
    }
    if (clockOutTime.getTime() > now.getTime() + 60_000) {
      throw new BadRequestException('Clock-out time cannot be in the future');
    }

    // Store GROSS minutes (clock-in → clock-out), consistent with the normal
    // clockOut path — break time lives separately on breakMinutes and is netted
    // out downstream, so we must not pre-subtract it here (that double-counted).
    const totalMinutes = Math.round((clockOutTime.getTime() - entry.clockInAt.getTime()) / 60_000);

    const flags = new Set<string>([...(entry.flagReasons || []), 'MISSED_CLOCK_OUT']);
    const isOvertime =
      !!entry.expectedClockOutAt && clockOutTime.getTime() > entry.expectedClockOutAt.getTime();
    if (isOvertime) flags.add('OVERTIME');
    const uniqueFlags = [...flags];

    // Counted the same way as any other close — a forgotten clock-out is a late
    // clock-out, not a different kind of day.
    const counted = await this.countedTime.columnsFor(entry, clockOutTime);

    const updated = await this.prisma.timeEntry.update({
      where: { id: entry.id },
      data: {
        status: TimeEntryStatus.CLOCKED_OUT,
        clockOutAt: clockOutTime,
        totalMinutes,
        ...counted,
        notes: 'Self-reported clock-out (forgot to clock out)',
        flagReasons: uniqueFlags,
        approvalStatus: 'PENDING', // a forgotten clock-out is always worth a glance
        reminderState: 'RESOLVED',
        nextRemindAt: null,
      },
      include: { location: true, user: { select: { firstName: true, lastName: true } } },
    });

    this.notificationClient.emit('attendance_clock_out', {
      userId: data.userId,
      organizationId: data.organizationId,
      timeEntry: updated,
    });
    await this.sendPendingApprovalAlert({
      entryId: updated.id,
      userId: data.userId,
      organizationId: data.organizationId,
      locationName: entry.location?.name || 'Unknown',
      flagReasons: uniqueFlags,
      totalMinutes,
    });

    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return success(
      updated,
      `Clocked out. Total time: ${h}h ${m}m${isOvertime ? ' (overtime pending approval)' : ''}`,
    );
  }

  /**
   * Worker responds "I'm working extra time". Pauses reminders and routes the
   * request to the space's overtime approvers. The entry stays open.
   */
  async requestExtraTime(data: { userId: string; entryId: string; organizationId: string }) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        id: data.entryId,
        userId: data.userId,
        organizationId: data.organizationId,
        status: TimeEntryStatus.CLOCKED_IN,
      },
      include: {
        location: { select: { id: true, name: true, timezone: true } },
        user: { select: { firstName: true, lastName: true } },
      },
    });
    if (!entry) throw new BadRequestException('No matching open shift found');

    /*
      One record per ROUND.

      The state machine on the entry is what drives the reminder engine, but it
      holds only "where are we now" — it cannot say that this is the second time
      today, who approved the first ninety minutes, or that they signed for them.
      A row per cycle is what makes the loop auditable, and it is why the unique
      index on `timeEntryId` had to go.
    */
    const previous = await this.prisma.overtimeRequest.findFirst({
      where: { timeEntryId: entry.id },
      orderBy: { cycle: 'desc' },
      select: { cycle: true },
    });
    const cycle = (previous?.cycle ?? 0) + 1;

    await this.prisma.$transaction([
      this.prisma.timeEntry.update({
        where: { id: entry.id },
        data: { reminderState: 'OVERTIME_PENDING', nextRemindAt: null },
      }),
      this.prisma.overtimeRequest.create({
        data: {
          timeEntryId: entry.id,
          cycle,
          technicianId: entry.userId,
          locationId: entry.locationId,
          organizationId: data.organizationId,
          status: 'PENDING_APPROVAL',
          technicianRespondedAt: new Date(),
          overtimeStartAt: entry.expectedClockOutAt ?? new Date(),
        },
      }),
    ]);

    const leaderIds = await this.notifyTargetsFor(
      { ...entry, organizationId: data.organizationId },
      'canApproveOvertime',
    );
    this.notificationClient.emit('attendance_overtime_request', {
      entryId: entry.id,
      userId: entry.userId,
      userName: `${entry.user.firstName} ${entry.user.lastName}`,
      locationId: entry.locationId,
      locationName: entry.location?.name || 'a shift',
      leaderIds,
      cycle,
      organizationId: data.organizationId,
    });

    return success({ entryId: entry.id, status: 'OVERTIME_PENDING', cycle }, 'Extra-time request sent for approval');
  }

  /** Leader approves N more minutes of work → extends the expected end + re-arms reminders. */
  async approveExtraTime(data: {
    /** Spaces the caller may act in; null = org-wide, [] = none. */
    scopeSpaceIds?: AttendanceScope;
    approverId: string;
    entryId: string;
    minutes: number;
    organizationId: string;
    /** base64 PNG, when the leader signed rather than tapping approve. */
    signature?: string | null;
    notes?: string | null;
  }) {
    const minutes = Math.round(data.minutes);
    if (!minutes || minutes < 1 || minutes > 1440) {
      throw new BadRequestException('Approved minutes must be between 1 and 1440');
    }

    const entry = await this.prisma.timeEntry.findFirst({
      // Scoped as well as checked below: `userCanApproveOvertime` already tests
      // this entry's own space, and the two agreeing is the point — the guard
      // now admits a space-scoped caller, so nothing here may assume org-wide.
      where: { id: data.entryId, organizationId: data.organizationId, status: TimeEntryStatus.CLOCKED_IN, ...scopeWhere(data.scopeSpaceIds) },
      include: { shift: { select: { graceMin: true } } },
    });
    if (!entry) throw new BadRequestException('No matching open shift found');

    const allowed = await this.userCanApproveOvertime(data.approverId, entry.locationId, data.organizationId);
    if (!allowed) throw new ForbiddenException('You are not allowed to approve overtime for this space');
    await this.assertNotSelfOvertimeDecision(data.approverId, entry.userId, data.organizationId);

    const now = new Date();
    // Grant the extra minutes from the later of the expected end or now, so a
    // shift that already ended extends from now (not into the past).
    const base =
      entry.expectedClockOutAt && entry.expectedClockOutAt.getTime() > now.getTime()
        ? entry.expectedClockOutAt
        : now;
    const newExpected = new Date(base.getTime() + minutes * 60_000);
    const graceMin = entry.shift?.graceMin ?? SHIFT_REMINDER_DEFAULTS.GRACE_MINUTES;

    /*
      The decision, written where it can be produced later.

      A signature is optional but recorded exactly as given: it is bound to the
      round and to the approver's own user id, server-side. A name arriving in a
      request body is decoration — the authority is the token the call was made
      with, which is what `userCanApproveOvertime` above just checked.
    */
    const round = await this.prisma.overtimeRequest.findFirst({
      where: { timeEntryId: entry.id, status: 'PENDING_APPROVAL' },
      orderBy: { cycle: 'desc' },
      select: { id: true },
    });

    await this.prisma.$transaction([
      this.prisma.timeEntry.update({
        where: { id: entry.id },
        data: {
          expectedClockOutAt: newExpected,
          reminderState: 'OVERTIME_APPROVED',
          reminderCount: 0,
          nextRemindAt: new Date(newExpected.getTime() + graceMin * 60_000),
        },
      }),
      ...(round
        ? [
            this.prisma.overtimeRequest.update({
              where: { id: round.id },
              data: {
                status: 'APPROVED',
                approvedById: data.approverId,
                approvedAt: now,
                maxDurationMinutes: minutes,
                overtimeEndAt: newExpected,
                approvalMethod: data.signature ? 'SIGNATURE' : 'REMOTE',
                leaderSignature: data.signature ?? null,
                approverNotes: data.notes ?? null,
              },
            }),
          ]
        : []),
    ]);

    this.notificationClient.emit('attendance_overtime_decision', {
      entryId: entry.id,
      userId: entry.userId,
      decision: 'approved',
      minutes,
      newExpectedClockOutAt: newExpected.toISOString(),
      organizationId: data.organizationId,
    });

    return success(
      { entryId: entry.id, minutes, expectedClockOutAt: newExpected.toISOString() },
      `Approved ${minutes} min of overtime`,
    );
  }

  /** Leader rejects the extra-time request → nudge the worker to clock out now. */
  async rejectExtraTime(data: {
    approverId: string;
    entryId: string;
    organizationId: string;
    reason?: string | null;
  }) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: { id: data.entryId, organizationId: data.organizationId, status: TimeEntryStatus.CLOCKED_IN },
      select: { id: true, locationId: true, userId: true },
    });
    if (!entry) throw new BadRequestException('No matching open shift found');

    const allowed = await this.userCanApproveOvertime(data.approverId, entry.locationId, data.organizationId);
    if (!allowed) throw new ForbiddenException('You are not allowed to approve overtime for this space');
    await this.assertNotSelfOvertimeDecision(data.approverId, entry.userId, data.organizationId);

    const round = await this.prisma.overtimeRequest.findFirst({
      where: { timeEntryId: entry.id, status: 'PENDING_APPROVAL' },
      orderBy: { cycle: 'desc' },
      select: { id: true },
    });

    // Give the worker a fresh reminder cycle to clock out now — reset the count
    // so a previously-exhausted worker gets a clean nudge, not instant escalation.
    // The refusal is recorded too: "asked twice, refused once" is a fact about
    // the day, and a request that vanishes when the answer is no is not a record.
    await this.prisma.$transaction([
      this.prisma.timeEntry.update({
        where: { id: entry.id },
        data: { reminderState: 'REMINDED', reminderCount: 0, nextRemindAt: new Date() },
      }),
      ...(round
        ? [
            this.prisma.overtimeRequest.update({
              where: { id: round.id },
              data: {
                status: 'REJECTED',
                approvedById: data.approverId,
                rejectedAt: new Date(),
                rejectionReason: data.reason ?? null,
              },
            }),
          ]
        : []),
    ]);

    this.notificationClient.emit('attendance_overtime_decision', {
      entryId: entry.id,
      userId: entry.userId,
      decision: 'rejected',
      organizationId: data.organizationId,
    });

    return success({ entryId: entry.id, decision: 'rejected' }, 'Extra-time request rejected');
  }

  /** Open extra-time requests awaiting approval, scoped to spaces the caller can approve for. */
  async listPendingExtraTime(data: { userId: string; organizationId: string; isAdmin?: boolean }) {
    let spaceFilter: { locationId?: { in: string[] } } = {};
    if (!data.isAdmin) {
      const assignments = await this.prisma.spaceAssignment.findMany({
        where: { userId: data.userId, organizationId: data.organizationId, role: { isActive: true } },
        include: { role: { select: { permissions: true } } },
      });
      const spaceIds = assignments
        .filter((a) => (a.role?.permissions as any)?.canApproveOvertime === true)
        .map((a) => a.spaceId);
      if (spaceIds.length === 0) return success([], 'No pending extra-time requests');
      spaceFilter = { locationId: { in: spaceIds } };
    }

    const entries = await this.prisma.timeEntry.findMany({
      where: {
        organizationId: data.organizationId,
        status: TimeEntryStatus.CLOCKED_IN,
        reminderState: 'OVERTIME_PENDING',
        // Never offer a leader their OWN request (audit AT-B1). Without this the
        // approve button appeared on your own row and one click granted yourself
        // paid time. An org ADMIN is exempt in the guard below — they have nobody
        // above them, and a solo owner has to be able to extend their own shift —
        // but they should not be nudged into it by a list either.
        userId: { not: data.userId },
        ...spaceFilter,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        location: { select: { id: true, name: true, timezone: true } },
      },
      orderBy: { expectedClockOutAt: 'asc' },
    });
    return success(entries, `${entries.length} pending extra-time request(s)`);
  }

  /**
   * Overtime is paid time, and the whole request/approve flow exists so a SECOND
   * party sanctions it. `userCanApproveOvertime` answers "may you approve here?"
   * and said nothing about whose shift it is, so a shift leader holding
   * `canApproveOvertime` could approve their own extra time — and the pending list
   * offered it to them (audit AT-B1).
   *
   * A true org ADMIN is exempt: they are the owner, there is nobody above them to
   * approve it, and in a one-person organization blocking this would leave the
   * shift impossible to extend at all. Everyone with DELEGATED authority — a space
   * role grant, or `canManageUsers` — needs someone else.
   */
  private async assertNotSelfOvertimeDecision(
    approverId: string,
    subjectId: string,
    organizationId: string,
  ): Promise<void> {
    if (approverId !== subjectId) return;
    const owner = await this.prisma.user.findFirst({
      where: { id: approverId, organizationId, isActive: true, role: 'ADMIN' },
      select: { id: true },
    });
    if (owner) return;
    throw new ForbiddenException(
      'You cannot approve your own overtime. Ask a manager or an administrator.',
    );
  }

  /** True if the user may approve overtime for a space (space sub-role grant, or org admin). */
  private async userCanApproveOvertime(
    userId: string,
    spaceId: string,
    organizationId: string,
  ): Promise<boolean> {
    // Unified space assignment grant — spaceId is the resource's own, never
    // client-supplied, so this only grants where the user is truly assigned.
    const assignment = await this.prisma.spaceAssignment.findFirst({
      where: { userId, spaceId, organizationId, role: { isActive: true } },
      include: { role: { select: { permissions: true } } },
    });
    if ((assignment?.role?.permissions as any)?.canApproveOvertime === true) return true;
    // Org admins / user managers can always approve.
    const admin = await this.prisma.user.findFirst({
      where: {
        id: userId,
        organizationId,
        isActive: true,
        OR: [{ role: 'ADMIN' }, { canManageUsers: true }],
      },
      select: { id: true },
    });
    return !!admin;
  }

  /**
   * Process location heartbeat while clocked in (mobile → server ~every 5 min).
   *
   * Drives the geofence-excursion state machine. It NEVER auto-clocks-out (the
   * old silent 150m auto clock-out is gone). When a clocked-in worker leaves
   * their space's ring, an OUT_UNREPORTED excursion is opened and the worker is
   * warned; they then submit a reason + duration (→ PENDING) which a responsible
   * person approves/rejects. Only a REJECT clocks the worker out. Returning
   * inside the ring resolves the active excursion (RETURNED). An APPROVED grace
   * timer that lapses while still outside closes EXPIRED and re-opens a fresh
   * OUT_UNREPORTED cycle.
   *
   * Response keeps `withinGeofence`/`distance` for backward compat with
   * pre-OTA mobile clients (`autoClockedOut` is now always false) and adds
   * `inRing` + `activeExcursion` for the new UI.
   */
  async heartbeat(data: {
    userId: string;
    lat: number;
    lng: number;
    accuracy?: number;
    organizationId: string;
  }) {
    this.logger.debug(`Heartbeat from user ${data.userId} at ${data.lat},${data.lng}`);

    // Find active clock-in entry
    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        userId: data.userId,
        status: TimeEntryStatus.CLOCKED_IN,
      },
      include: { location: { select: ATTENDANCE_LOCATION_SELECT } },
    });

    if (!entry || !entry.location) {
      return success(
        { withinGeofence: true, inRing: true, distance: 0, autoClockedOut: false, activeExcursion: null },
        'No active entry',
      );
    }

    /*
      A space with no coordinates has no ring → never triggers an excursion.

      ⚠️ …and neither does a shift being worked AWAY from the site. Somebody who
      clocked in away is outside the ring for the whole day by definition: the
      excursion machinery would open an OUT_UNREPORTED the moment their phone
      first reported in, escalate it to whoever reconciles attendance, and then
      do it again every few minutes until they clocked out. The permission to be
      away is exactly the permission not to be asked about it.

      The day is already recorded as away and already flagged for review, which
      is the signal a manager acts on. This suppresses the SECOND, noisier one
      that says the same thing about every heartbeat.
    */
    const sweepZone = {
      lat: entry.location.lat,
      lng: entry.location.lng,
      geofenceRadius: entry.location.geofenceRadius,
      geofencePolygon: parseGeofencePolygon(entry.location.geofencePolygon),
    };
    const hasRing = !entry.isRemote && siteEnforcesZone(sweepZone);

    /*
      Deliberately WITHOUT the accuracy tolerance, unlike clock-in.

      Clock-in widens the zone by the reported GPS error so a fuzzy fix is not
      refused outright — the cost of being wrong there is somebody unable to
      start their day. This sweep runs every minute on an already-open shift,
      and its own hysteresis buffer is what absorbs scatter. Feeding accuracy in
      as well would make the fence breathe with the signal, and an excursion
      would open or close depending on how many satellites were visible.
    */
    const raw = hasRing ? isAtSite({ lat: data.lat, lng: data.lng, accuracy: 0 }, sweepZone) : null;
    const distance = raw?.distanceToCentre ?? 0;
    const distanceM = Math.round(distance);

    // Hysteresis so GPS scatter at the edge doesn't flap OUT/RETURNED: only count
    // as "left" once past the buffer; count as "back" the moment we are inside.
    // `metresOutside` measures to the BOUNDARY, so this reads the same for a
    // circle and for a drawn shape.
    const isBackInRing = !hasRing || (raw?.inside ?? true);
    const isOutPastBuffer = hasRing && (raw?.metresOutside ?? 0) > GEOFENCE_EXCURSION.RING_HYSTERESIS_M;
    const inRing = isBackInRing;

    // Latest active excursion for this session (OUT_UNREPORTED / PENDING / APPROVED)
    const active = await this.getActiveExcursion(entry.id);

    if (active) {
      if (isBackInRing) {
        // Came back inside the ring → resolve the excursion, keep clocked in.
        await this.prisma.geofenceExcursion.updateMany({
          where: { id: active.id, status: active.status },
          data: { status: 'RETURNED', resolvedAt: new Date() },
        });
        await this.emitExcursionEvent('geofence_excursion_returned', entry, active, { distanceM });
        return success(
          { withinGeofence: true, inRing: true, distance: distanceM, autoClockedOut: false, activeExcursion: null },
          'Back inside ring',
        );
      }

      // Still outside. If an APPROVED grace timer lapsed → close EXPIRED and spawn
      // a fresh OUT_UNREPORTED cycle (the phone is the only source of truth on
      // whether they're still out).
      if (active.status === 'APPROVED' && active.expiresAt && active.expiresAt.getTime() <= Date.now()) {
        await this.prisma.geofenceExcursion.updateMany({
          where: { id: active.id, status: 'APPROVED' },
          data: { status: 'EXPIRED', resolvedAt: new Date() },
        });
        const fresh = await this.prisma.geofenceExcursion.create({
          data: {
            organizationId: entry.organizationId,
            timeEntryId: entry.id,
            userId: entry.userId,
            spaceId: entry.locationId,
            status: 'OUT_UNREPORTED',
            lastDistanceM: distanceM,
          },
        });
        await this.emitExcursionEvent('geofence_excursion_expired', entry, active, { distanceM });
        return success(
          { withinGeofence: false, inRing: false, distance: distanceM, autoClockedOut: false, activeExcursion: fresh },
          'Grace period expired, still outside ring',
        );
      }

      // No state change — keep the approver's context distance fresh.
      if (active.lastDistanceM !== distanceM) {
        await this.prisma.geofenceExcursion.update({
          where: { id: active.id },
          data: { lastDistanceM: distanceM },
        });
      }
      return success(
        { withinGeofence: false, inRing: false, distance: distanceM, autoClockedOut: false, activeExcursion: { ...active, lastDistanceM: distanceM } },
        `Outside ring (${active.status})`,
      );
    }

    // No active excursion. Open one only once clearly past the buffer.
    if (isOutPastBuffer) {
      const created = await this.prisma.geofenceExcursion.create({
        data: {
          organizationId: entry.organizationId,
          timeEntryId: entry.id,
          userId: entry.userId,
          spaceId: entry.locationId,
          status: 'OUT_UNREPORTED',
          lastDistanceM: distanceM,
        },
      });
      await this.emitExcursionEvent('geofence_excursion_out', entry, created, { distanceM });
      return success(
        { withinGeofence: false, inRing: false, distance: distanceM, autoClockedOut: false, activeExcursion: created },
        'Left the ring',
      );
    }

    return success(
      { withinGeofence: true, inRing: true, distance: distanceM, autoClockedOut: false, activeExcursion: null },
      'Within ring',
    );
  }

  /** Latest active excursion for a session (OUT_UNREPORTED / PENDING / APPROVED). */
  private async getActiveExcursion(timeEntryId: string) {
    return this.prisma.geofenceExcursion.findFirst({
      where: { timeEntryId, status: { in: ['OUT_UNREPORTED', 'PENDING', 'APPROVED'] } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Employee submits a reason + how long they'll be out → OUT_UNREPORTED → PENDING.
   * Notifies the responsible person(s) to approve/reject.
   */
  async reportExcursion(data: {
    userId: string;
    organizationId: string;
    /** Spaces the caller may read; null/undefined = unnarrowed (own history). */
    scopeSpaceIds?: AttendanceScope;
    reason: string;
    requestedMinutes: number;
  }) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: { userId: data.userId, organizationId: data.organizationId, status: TimeEntryStatus.CLOCKED_IN },
      include: { location: { select: ATTENDANCE_LOCATION_SELECT } },
    });
    if (!entry) throw new BadRequestException('You are not currently clocked in');

    const active = await this.getActiveExcursion(entry.id);
    if (!active || active.status !== 'OUT_UNREPORTED') {
      throw new BadRequestException('No pending out-of-ring warning to report');
    }

    const minutes = this.clampExcursionMinutes(data.requestedMinutes);
    // Atomic guard: only flip if it's still OUT_UNREPORTED.
    const res = await this.prisma.geofenceExcursion.updateMany({
      where: { id: active.id, status: 'OUT_UNREPORTED' },
      data: {
        status: 'PENDING',
        reason: data.reason?.trim() || null,
        requestedMinutes: minutes,
        reportedAt: new Date(),
      },
    });
    if (res.count === 0) throw new BadRequestException('This warning was already handled');

    const updated = await this.prisma.geofenceExcursion.findUnique({ where: { id: active.id } });
    await this.emitExcursionEvent('geofence_excursion_requested', entry, updated!, {
      distanceM: updated?.lastDistanceM ?? undefined,
    });
    return success(updated, 'Out-of-ring reason submitted');
  }

  /**
   * Approver approves an out-of-ring request (optionally adjusting the granted
   * time) → PENDING → APPROVED with a countdown to expiresAt.
   */
  async approveExcursion(data: {
    /** Spaces the caller may act in; null = org-wide, [] = none. */
    scopeSpaceIds?: AttendanceScope;
    excursionId: string;
    approverId: string;
    organizationId: string;
    grantedMinutes?: number;
  }) {
    const excursion = await this.loadOrgExcursion(data.excursionId, data.organizationId, data.scopeSpaceIds);
    if (excursion.status !== 'PENDING') {
      throw new BadRequestException('This request is no longer pending');
    }
    const minutes = this.clampExcursionMinutes(data.grantedMinutes ?? excursion.requestedMinutes ?? 0);
    const expiresAt = new Date(Date.now() + minutes * 60_000);

    const res = await this.prisma.geofenceExcursion.updateMany({
      where: { id: excursion.id, status: 'PENDING' },
      data: {
        status: 'APPROVED',
        grantedMinutes: minutes,
        expiresAt,
        decidedAt: new Date(),
        approvedById: data.approverId,
        timerExpired: false,
      },
    });
    if (res.count === 0) throw new BadRequestException('This request was already handled');

    const entry = await this.prisma.timeEntry.findUnique({
      where: { id: excursion.timeEntryId },
      include: { location: { select: ATTENDANCE_LOCATION_SELECT } },
    });
    const updated = await this.prisma.geofenceExcursion.findUnique({ where: { id: excursion.id } });
    if (entry) await this.emitExcursionEvent('geofence_excursion_approved', entry, updated!, {});
    return success(updated, 'Out-of-ring request approved');
  }

  /**
   * Approver rejects an out-of-ring request → PENDING → REJECTED, then clocks the
   * worker out (the ONLY automatic clock-out in this workflow).
   */
  async rejectExcursion(data: {
    /** Spaces the caller may act in; null = org-wide, [] = none. */
    scopeSpaceIds?: AttendanceScope;
    excursionId: string;
    approverId: string;
    organizationId: string;
  }) {
    const excursion = await this.loadOrgExcursion(data.excursionId, data.organizationId, data.scopeSpaceIds);
    if (excursion.status !== 'PENDING') {
      throw new BadRequestException('This request is no longer pending');
    }
    const res = await this.prisma.geofenceExcursion.updateMany({
      where: { id: excursion.id, status: 'PENDING' },
      data: { status: 'REJECTED', decidedAt: new Date(), resolvedAt: new Date(), approvedById: data.approverId },
    });
    if (res.count === 0) throw new BadRequestException('This request was already handled');

    const entry = await this.prisma.timeEntry.findUnique({
      where: { id: excursion.timeEntryId },
      include: { location: { select: ATTENDANCE_LOCATION_SELECT } },
    });
    const updated = await this.prisma.geofenceExcursion.findUnique({ where: { id: excursion.id } });
    if (entry) await this.emitExcursionEvent('geofence_excursion_rejected', entry, updated!, {});

    // Clock the worker out (geofence-exempt; no GPS available server-side).
    try {
      await this.clockOut({
        userId: excursion.userId,
        organizationId: data.organizationId,
        notes: 'Out-of-ring request rejected',
      });
    } catch (err) {
      // Already clocked out (returned / session ended) — the rejection stands.
      this.logger.warn(`rejectExcursion: clock-out skipped for ${excursion.userId}: ${(err as Error).message}`);
    }
    return success(updated, 'Out-of-ring request rejected');
  }

  /** Approver surface: active (PENDING/APPROVED) excursions for the org. */
  async listActiveExcursions(data: { organizationId: string; status?: 'active' | 'pending' | 'approved'; scopeSpaceIds?: AttendanceScope }) {
    const statusFilter =
      data.status === 'pending'
        ? (['PENDING'] as const)
        : data.status === 'approved'
          ? (['APPROVED'] as const)
          : (['PENDING', 'APPROVED'] as const);

    const rows = await this.prisma.geofenceExcursion.findMany({
      where: {
        organizationId: data.organizationId,
        status: { in: statusFilter as any },
        // GeofenceExcursion names its own space, so it narrows on `spaceId`
        // rather than the `locationId` a time entry uses.
        ...scopeWhereOn('spaceId', data.scopeSpaceIds),
      },
      orderBy: [{ status: 'asc' }, { reportedAt: 'desc' }, { leftRingAt: 'desc' }],
      take: 200,
    });

    // Hydrate user + space (kept off the model to avoid extra FKs; small N).
    const userIds = [...new Set(rows.map((r) => r.userId))];
    const spaceIds = [...new Set(rows.map((r) => r.spaceId))];
    const [users, spaces] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true, email: true },
      }),
      this.prisma.companyLocation.findMany({ where: { id: { in: spaceIds } }, select: { id: true, name: true } }),
    ]);
    const userById = new Map(users.map((u) => [u.id, u]));
    const spaceById = new Map(spaces.map((s) => [s.id, s]));

    return success(
      rows.map((r) => ({ ...r, user: userById.get(r.userId) ?? null, space: spaceById.get(r.spaceId) ?? null })),
    );
  }

  private clampExcursionMinutes(minutes: number): number {
    const n = Math.round(Number(minutes));
    if (!Number.isFinite(n) || n <= 0) return GEOFENCE_EXCURSION.DURATION_PRESETS[0];
    return Math.min(n, GEOFENCE_EXCURSION.CUSTOM_MAX_MINUTES);
  }

  private async loadOrgExcursion(excursionId: string, organizationId: string, scope?: AttendanceScope) {
    const excursion = await this.prisma.geofenceExcursion.findUnique({ where: { id: excursionId } });
    // An excursion names the space whose ring was left, so the check is direct.
    if (!excursion || excursion.organizationId !== organizationId || !scopeAllows(scope, excursion.spaceId)) {
      throw new NotFoundException('Out-of-ring request not found');
    }
    return excursion;
  }

  /**
   * Resolve recipients and emit an excursion event. "responsible" events route
   * through resolveWatchers (same set as geofence/pending-approval alerts);
   * employee-facing events go to the employee. Also fires a push.
   */
  private async emitExcursionEvent(
    event:
      | 'geofence_excursion_out'
      | 'geofence_excursion_requested'
      | 'geofence_excursion_approved'
      | 'geofence_excursion_rejected'
      | 'geofence_excursion_returned'
      | 'geofence_excursion_expired',
    entry: { userId: string; organizationId: string; locationId: string; location?: { name?: string } | null },
    excursion: { id: string; status: string; reason?: string | null; requestedMinutes?: number | null; grantedMinutes?: number | null; expiresAt?: Date | null },
    ctx: { distanceM?: number },
  ) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: entry.userId },
        select: { firstName: true, lastName: true, email: true },
      });
      const userName = user ? `${user.firstName} ${user.lastName}` : 'A worker';
      const spaceName = entry.location?.name ?? 'the work area';

      // Responsible-facing events fan out to the employee's watchers.
      const toResponsible =
        event === 'geofence_excursion_requested' ||
        event === 'geofence_excursion_returned' ||
        event === 'geofence_excursion_expired';
      let watcherIds: string[] = [];
      let watcherEmails: string[] = [];
      if (toResponsible) {
        const w = await this.notificationRouting.resolveWatchers(entry.userId, entry.organizationId, 'attendance');
        watcherIds = w.ids;
        watcherEmails = w.emails;
      }

      this.notificationClient.emit(event, {
        excursionId: excursion.id,
        status: excursion.status,
        userId: entry.userId,
        userName,
        userEmail: user?.email,
        spaceId: entry.locationId,
        spaceName,
        reason: excursion.reason ?? null,
        requestedMinutes: excursion.requestedMinutes ?? null,
        grantedMinutes: excursion.grantedMinutes ?? null,
        expiresAt: excursion.expiresAt ?? null,
        distanceM: ctx.distanceM ?? null,
        watcherIds,
        watcherEmails,
        organizationId: entry.organizationId,
      });
    } catch (error) {
      this.logger.error(`Failed to emit ${event}`, error as Error);
    }
  }

  /**
   * Sweep safety-net: flag APPROVED excursions whose grace timer lapsed so the
   * approver sees it even if the phone stopped heart-beating. Does NOT clock
   * anyone out and does NOT decide "still out" (no GPS server-side) — the
   * authoritative EXPIRED→new-cycle happens on the next heartbeat.
   */
  async sweepExpiredExcursions() {
    const now = new Date();
    const due = await this.prisma.geofenceExcursion.findMany({
      where: { status: 'APPROVED', timerExpired: false, expiresAt: { lt: now } },
      take: 200,
    });
    if (due.length === 0) return { flagged: 0 };

    for (const ex of due) {
      const res = await this.prisma.geofenceExcursion.updateMany({
        where: { id: ex.id, status: 'APPROVED', timerExpired: false },
        data: { timerExpired: true },
      });
      if (res.count === 0) continue;
      const entry = await this.prisma.timeEntry.findUnique({
        where: { id: ex.timeEntryId },
        include: { location: { select: ATTENDANCE_LOCATION_SELECT } },
      });
      if (entry) await this.emitExcursionEvent('geofence_excursion_expired', entry, ex, {});
    }
    this.logger.log(`Geofence excursion sweep: flagged ${due.length} lapsed timer(s)`);
    return { flagged: due.length };
  }

  /**
   * Get current attendance status for a technician
   */
  async getStatus(data: { userId: string; organizationId: string }) {
    // Get current clock-in entry if any
    const currentEntry = await this.prisma.timeEntry.findFirst({
      where: {
        userId: data.userId,
        organizationId: data.organizationId,
        status: TimeEntryStatus.CLOCKED_IN,
      },
      include: {
        location: { select: ATTENDANCE_LOCATION_SELECT },
        /*
          The rest in progress, if there is one.

          Only the OPEN one: a closed break is history and the status endpoint
          answers "what is happening right now". Both clients read this to decide
          between "start your rest" and "back to work", which is the whole of the
          rest UI — without it each would need a second request on every poll.
        */
        breaks: {
          where: { endedAt: null },
          select: { id: true, startedAt: true, ruleId: true, isPaid: true, type: true },
          take: 1,
        },
      },
    });

    // Get assigned locations
    const assignments = await this.prisma.spaceAssignment.findMany({
      where: {
        userId: data.userId,
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: new Date() } },
        ],
      },
      // `allowRemote` rides along on rows this endpoint already reads. Without
      // it, tagging the workspaces below re-queries this very table — a second
      // trip for a column that was one word away, on the endpoint a phone polls
      // all day.
      include: {
        space: { select: ATTENDANCE_LOCATION_SELECT },
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });

    /*
      …and whether each would take a clock-in from off site.

      The phone reads this list to decide whether to offer "away" at all, and it
      must answer the same as the clock-in list and the clock-in itself. Without
      it the phone had only the account grant to go on, and offered the option at
      workspaces that require presence.
    */
    const assignedLocations = await this.tagAwayAllowed(
      assignments.map((a) => a.space),
      data.userId,
      data.organizationId,
      // The per-workspace overrides, from the rows just read.
      new Map(assignments.map((a) => [a.spaceId, a.allowRemote])),
    );

    // Active out-of-ring excursion for the current session (drives mobile UI).
    const activeExcursion = currentEntry ? await this.getActiveExcursion(currentEntry.id) : null;

    return success({
      isClockedIn: !!currentEntry,
      currentEntry,
      assignedLocations,
      activeExcursion,
    });
  }

  /**
   * Get attendance history for a technician
   */
  async getHistory(data: {
    userId: string;
    organizationId: string;
    /** Spaces the caller may read; null/undefined = unnarrowed (own history). */
    scopeSpaceIds?: AttendanceScope;
    startDate?: Date | string;
    endDate?: Date | string;
    page?: number;
    limit?: number;
  }) {
    const page = data.page ?? 1;
    const limit = data.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {
      userId: data.userId,
      organizationId: data.organizationId,
      /*
        Narrowed only when a scope is passed.

        This method serves two callers: a member reading their OWN history,
        which passes none and must stay complete, and an admin or supervisor
        reading somebody else's through /employees/:id/attendance, which passes
        the spaces they hold. `undefined` meaning "do not narrow" is what lets
        one method do both without a second copy.
      */
      ...scopeWhere(data.scopeSpaceIds),
    };

    // Date range filter. Uses the shared builder so a date-only `endDate`
    // ("2026-08-18") becomes end-of-day rather than midnight — parsing it raw
    // dropped every entry of the last day of the window, i.e. today's session
    // (including the still-open one) never showed up in the history.
    const range = buildDateRangeFilter(data.startDate, data.endDate);
    if (range) {
      where.clockInAt = range;
    }

    const [entries, total] = await Promise.all([
      this.prisma.timeEntry.findMany({
        where,
        skip,
        take: limit,
        include: {
          location: { select: ATTENDANCE_LOCATION_SELECT },
        },
        orderBy: { clockInAt: 'desc' },
      }),
      this.prisma.timeEntry.count({ where }),
    ]);

    return paginated(entries, { page, limit, total });
  }

  /**
   * Get time entries for a location (admin view)
   */
  async getLocationEntries(data: {
    locationId: string;
    organizationId: string;
    date?: Date | string;
    startDate?: Date | string;
    endDate?: Date | string;
    search?: string;
    page?: number;
    limit?: number;
    requesterId?: string;
    requesterCanViewAll?: boolean;
    sortBy?: string;
    sortOrder?: string;
    sharedSpaceIds?: string[]; // shared spaces (with showAttendance) the caller may view
  }) {
    // A guest may read the attendance of a space shared with them (showAttendance
    // gated at the gateway → only such spaces reach here). Otherwise strict org.
    const isShared = Array.isArray(data.sharedSpaceIds) && data.sharedSpaceIds.includes(data.locationId);
    const location = await this.prisma.companyLocation.findFirst({
      where: isShared ? { id: data.locationId } : { id: data.locationId, organizationId: data.organizationId },
    });

    if (!location) {
      throw new NotFoundException('Location not found');
    }

    // Authorization: full-access roles see any location; a cross-org shared grant
    // confers view-all for that space; otherwise the requester must be a roster
    // member of this location (employees viewing their own space).
    if (!data.requesterCanViewAll && !isShared) {
      const member = await this.prisma.spaceAssignment.findFirst({
        where: { spaceId: data.locationId, userId: data.requesterId },
        select: { id: true },
      });
      if (!member) {
        throw new ForbiddenException('Not a member of this space');
      }
    }

    const page = data.page ?? 1;
    const limit = data.limit ?? 50;
    const skip = (page - 1) * limit;

    // A startDate/endDate range takes precedence; otherwise a single day
    // (defaulting to today when nothing is provided).
    const range = buildDateRangeFilter(data.startDate, data.endDate);
    const where: any = {
      locationId: data.locationId,
      clockInAt: range ?? buildSingleDayFilter(data.date || new Date().toISOString()),
    };

    // Name / email search
    if (data.search?.trim()) {
      const q = data.search.trim();
      where.user = {
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      };
    }

    const [entries, total] = await Promise.all([
      this.prisma.timeEntry.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          editedBy: { select: EDITOR_SELECT },
        },
        orderBy: this.buildEntriesOrderBy(data.sortBy, data.sortOrder),
      }),
      this.prisma.timeEntry.count({ where }),
    ]);

    return paginated(entries, { page, limit, total });
  }

  /**
   * Who is clocked in RIGHT NOW, org-wide — answers the dashboard "on duty"
   * question independently of clock-in date. A shift that started before
   * midnight and is still open (overnight / long / forgot-to-clock-out) must
   * still count, so this filters on the open state (`status = CLOCKED_IN`),
   * NOT on a date window. Backed by the `[organizationId, status]` index and a
   * narrow select (only what the dashboard reads) → O(open entries), tiny
   * payload. No pagination: the open set is always small.
   */
  async getActiveEntries(data: { organizationId: string; scopeSpaceIds?: AttendanceScope }) {
    const entries = await this.prisma.timeEntry.findMany({
      where: {
        organizationId: data.organizationId,
        status: 'CLOCKED_IN',
        // Only the spaces this caller was granted — see attendance-scope.ts.
        ...scopeWhere(data.scopeSpaceIds),
      },
      select: {
        id: true,
        userId: true,
        locationId: true,
        clockInAt: true,
        clockOutAt: true,
        status: true,
        isRemote: true,
      },
      orderBy: { clockInAt: 'desc' },
    });
    return success(entries);
  }

  /**
   * Today's entries for MANY locations in 2 queries (vs 4-per-location) — backs
   * the dashboard. Full-access roles get all requested org spaces; otherwise the
   * set is narrowed to the spaces the requester is a roster member of.
   */
  async getLocationEntriesBatch(data: {
    locationIds: string[];
    organizationId: string;
    date?: Date | string;
    requesterId?: string;
    requesterCanViewAll?: boolean;
  }) {
    const ids = (data.locationIds || []).filter(Boolean);
    if (!ids.length) return success([]);

    const locs = await this.prisma.companyLocation.findMany({
      where: { id: { in: ids }, organizationId: data.organizationId },
      select: { id: true },
    });
    let validIds = locs.map((l) => l.id);

    if (!data.requesterCanViewAll && validIds.length) {
      const memberships = await this.prisma.spaceAssignment.findMany({
        where: { userId: data.requesterId, spaceId: { in: validIds } },
        select: { spaceId: true },
      });
      const allowed = new Set(memberships.map((m) => m.spaceId));
      validIds = validIds.filter((id) => allowed.has(id));
    }
    if (!validIds.length) return success([]);

    const entries = await this.prisma.timeEntry.findMany({
      where: {
        locationId: { in: validIds },
        // Today's entries PLUS any still-open shift (even one that started before
        // midnight) so overnight clock-ins stay "on duty" after the date rolls.
        OR: [
          { clockInAt: buildSingleDayFilter(data.date || new Date().toISOString()) },
          { status: 'CLOCKED_IN' },
        ],
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        editedBy: { select: EDITOR_SELECT },
      },
      orderBy: { clockInAt: 'desc' },
      take: 500,
    });
    return success(entries);
  }

  /**
   * Shift reminder engine — replaces the old force-close auto-clock-out.
   *
   * It NEVER clocks anyone out. On a short interval it scans only the open
   * shifts whose reminder is actually due (`nextRemindAt <= now`, served by the
   * `[status, nextRemindAt]` index — not every open shift) and either:
   *   • nudges the worker ("forgot to clock out, or working extra?") and re-arms
   *     the next reminder, or
   *   • after `maxReminders` with no response, escalates to a space leader
   *     (a member whose sub-role grants `canReconcileAttendance`) and stops.
   *
   * Entries with no expected end (`nextRemindAt` null — TASK/NONE spaces or an
   * unresolved shift) are never touched: no reminders and no auto-close.
   */
  async runShiftReminders(_data?: { manual?: boolean }) {
    const now = new Date();

    const dueEntries = await this.prisma.timeEntry.findMany({
      where: {
        status: TimeEntryStatus.CLOCKED_IN,
        nextRemindAt: { not: null, lte: now },
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        location: { select: { id: true, name: true, timezone: true } },
        shift: { select: { reminderIntervalMin: true, maxReminders: true } },
      },
      orderBy: { nextRemindAt: 'asc' }, // drain oldest-due first
      take: 500, // cap per tick; any backlog drains over subsequent ticks
    });

    if (dueEntries.length === 0) {
      return success({ remindedCount: 0, escalatedCount: 0, entryIds: [] });
    }

    // Partition into reminders vs escalations up front.
    type Due = (typeof dueEntries)[number];
    const toRemind: { entry: Due; nextCount: number; intervalMin: number; maxReminders: number }[] = [];
    const toEscalate: Due[] = [];
    for (const entry of dueEntries) {
      // No expected end → this was an unscheduled clock-in armed by the safety net;
      // use the slower unscheduled cadence, not the tight shift cadence.
      const isUnscheduled = !entry.expectedClockOutAt;
      const intervalMin = isUnscheduled
        ? UNSCHEDULED_SESSION_DEFAULTS.REMINDER_INTERVAL_MINUTES
        : (entry.shift?.reminderIntervalMin ?? SHIFT_REMINDER_DEFAULTS.REMINDER_INTERVAL_MINUTES);
      const maxReminders = isUnscheduled
        ? UNSCHEDULED_SESSION_DEFAULTS.MAX_REMINDERS
        : (entry.shift?.maxReminders ?? SHIFT_REMINDER_DEFAULTS.MAX_REMINDERS);
      const nextCount = entry.reminderCount + 1;
      if (nextCount <= maxReminders) toRemind.push({ entry, nextCount, intervalMin, maxReminders });
      else toEscalate.push(entry);
    }

    // The workspace half is resolved ONCE per distinct escalating space — it is
    // the same answer for everybody there. The member half, when a space has
    // nobody, is resolved per entry inside `notifyTargetsFor`.
    const leadersBySpace = new Map<string, string[]>();
    const targetsByEntry = new Map<string, string[]>();
    for (const e of toEscalate) {
      targetsByEntry.set(e.id, await this.notifyTargetsFor(e, 'canReconcileAttendance', leadersBySpace));
    }

    // Deferred writes (thunks) so we can cap DB concurrency.
    const tasks: Array<() => Promise<void>> = [];

    for (const { entry, nextCount, intervalMin, maxReminders } of toRemind) {
      const userName = `${entry.user.firstName} ${entry.user.lastName}`;
      const nextRemindAt = new Date(now.getTime() + intervalMin * 60_000);
      tasks.push(async () => {
        await this.prisma.timeEntry.update({
          where: { id: entry.id },
          data: { reminderState: 'REMINDED', reminderCount: nextCount, nextRemindAt },
        });
        this.notificationClient.emit('attendance_shift_reminder', {
          entryId: entry.id,
          userId: entry.user.id,
          userName,
          locationId: entry.location?.id ?? entry.locationId,
          locationName: entry.location?.name || 'your shift',
          expectedClockOutAt: entry.expectedClockOutAt?.toISOString() ?? null,
          reminderCount: nextCount,
          unscheduled: !entry.expectedClockOutAt,
          hoursOpen: Math.round((now.getTime() - entry.clockInAt.getTime()) / 3_600_000),
          organizationId: entry.organizationId,
        });
        this.logger.log(`Shift reminder ${nextCount}/${maxReminders}: entry=${entry.id}, user=${userName}`);
      });
    }

    for (const entry of toEscalate) {
      const userName = `${entry.user.firstName} ${entry.user.lastName}`;
      const leaderIds = targetsByEntry.get(entry.id) ?? [];
      tasks.push(async () => {
        await this.prisma.timeEntry.update({
          where: { id: entry.id },
          data: { reminderState: 'ESCALATED', nextRemindAt: null },
        });
        this.notificationClient.emit('attendance_shift_escalation', {
          entryId: entry.id,
          userId: entry.user.id,
          userName,
          locationId: entry.locationId,
          locationName: entry.location?.name || 'a shift',
          expectedClockOutAt: entry.expectedClockOutAt?.toISOString() ?? null,
          unscheduled: !entry.expectedClockOutAt,
          hoursOpen: Math.round((now.getTime() - entry.clockInAt.getTime()) / 3_600_000),
          leaderIds,
          organizationId: entry.organizationId,
        });
        this.logger.warn(`Shift escalation: entry=${entry.id}, user=${userName}, leaders=[${leaderIds.join(',')}]`);
      });
    }

    // Flush with bounded concurrency so a big burst can't monopolize the pooled
    // DB connections and starve live clock-in/out requests.
    const CONCURRENCY = 20;
    for (let i = 0; i < tasks.length; i += CONCURRENCY) {
      await Promise.all(tasks.slice(i, i + CONCURRENCY).map((fn) => fn()));
    }

    return success({
      remindedCount: toRemind.length,
      escalatedCount: toEscalate.length,
      entryIds: [...toRemind.map((r) => r.entry.id), ...toEscalate.map((e) => e.id)],
      message: `Reminded ${toRemind.length}, escalated ${toEscalate.length}`,
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // NO-SHOW ENGINE (clock-in parity): materialize expected shifts → fulfill on
  // clock-in → sweep the unfulfilled ones (remind worker, escalate to a leader).
  // ──────────────────────────────────────────────────────────────────────────

  /** Local YYYY-MM-DD days (in tz) spanning [from, to] — a 2–3 element set. */
  private localDaysInWindow(from: Date, to: Date, tz: string): string[] {
    let fmt: Intl.DateTimeFormat;
    try {
      fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    } catch {
      fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' });
    }
    const days = new Set<string>();
    for (let t = from.getTime(); t <= to.getTime(); t += 6 * 3_600_000) days.add(fmt.format(new Date(t)));
    days.add(fmt.format(to));
    return [...days];
  }

  /**
   * Rolling materialization: ensure a ShiftInstance exists for every rota shift
   * in the next `windowHours`. Idempotent (upsert; never overwrites lifecycle
   * state). Physical spaces anchor to the site tz; logical to the member's tz
   * (falling back to org). Bounded scan over active assignments — no per-minute
   * cost (runs on a slow cron).
   */
  async materializeShiftInstances(windowHours = 36) {
    const now = new Date();
    const horizon = new Date(now.getTime() + windowHours * 3_600_000);

    // Collect every expected ShiftInstance, then bulk-insert. `skipDuplicates`
    // reproduces the old per-row upsert's `update: {}` semantics (insert new,
    // never clobber an existing instance's lifecycle/reminders) — but as chunked
    // createMany instead of up to ~15k serial upserts occupying the queue slot. (P5)
    const pending: Array<{
      organizationId: string;
      spaceId: string;
      userId: string;
      shiftId: string;
      localDate: string;
      expectedClockInAt: Date;
      expectedClockOutAt: Date;
      nextRemindAt: Date;
    }> = [];

    // Keyset-paginate ALL active assignments (cursor by id) instead of a silent
    // `take: 5000` cap that stopped materializing — and therefore stopped
    // detecting no-shows — for the tail beyond 5000 active rotas. (P4)
    const BATCH = 1000;
    let cursor: string | undefined;
    let processed = 0;
    for (;;) {
      const assignments = await this.prisma.shiftAssignment.findMany({
        where: {
          isActive: true,
          effectiveFrom: { lte: horizon },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
        },
        include: {
          shift: true,
          space: { select: { id: true, organizationId: true, timezone: true, lat: true, lng: true } },
          user: { select: { id: true, timezone: true, organization: { select: { timezone: true } } } },
        },
        orderBy: { id: 'asc' },
        take: BATCH,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (assignments.length === 0) break;
      cursor = assignments[assignments.length - 1].id;
      processed += assignments.length;

      for (const a of assignments) {
        if (!a.shift?.isActive) continue;
        const physical = a.space.lat != null && a.space.lng != null;
        const tz = physical
          ? a.space.timezone || 'UTC'
          : a.user.timezone || a.user.organization?.timezone || 'UTC';
        for (const dateStr of this.localDaysInWindow(now, horizon, tz)) {
          const win = this.shiftResolver.matchAndWindowForDate(a as any, tz, dateStr);
          if (!win) continue;
          if (win.expectedClockOutAt.getTime() < now.getTime()) continue; // already over
          const graceMin = a.shift.graceMin ?? SHIFT_REMINDER_DEFAULTS.GRACE_MINUTES;
          pending.push({
            organizationId: a.space.organizationId,
            spaceId: a.spaceId,
            userId: a.userId,
            shiftId: a.shiftId,
            localDate: dateStr,
            expectedClockInAt: win.expectedClockInAt,
            expectedClockOutAt: win.expectedClockOutAt,
            nextRemindAt: new Date(win.expectedClockInAt.getTime() + graceMin * 60_000),
          });
        }
      }

      if (assignments.length < BATCH) break;
    }

    let created = 0;
    const CHUNK = 1000;
    for (let i = 0; i < pending.length; i += CHUNK) {
      const res = await this.prisma.shiftInstance.createMany({
        data: pending.slice(i, i + CHUNK),
        skipDuplicates: true,
      });
      created += res.count;
    }
    return success({ processed, created });
  }

  /**
   * Clock-in fulfillment: mark the member's matching expected shift PRESENT.
   *
   * ⚠️ A clock-in can arrive AFTER the no-show sweep escalated it — a phone with
   * no signal at 07:58 sends it at 11:14, and by then a supervisor has been told
   * "hasn't clocked in and isn't responding". Marking the shift PRESENT fixes the
   * record and says nothing to the person who may already be phoning round. So
   * an escalated shift that is resolved this way tells the same people it
   * alerted, with the time of the tap.
   */
  private async markShiftInstancePresent(
    userId: string,
    spaceId: string,
    shiftId: string,
    timeEntryId: string,
    clockInAt: Date,
    context?: { organizationId: string; recordedOffline: boolean; timezone: string },
  ) {
    const w = 12 * 3_600_000; // the instance whose start is within ±12h of this clock-in
    const window = {
      userId,
      spaceId,
      shiftId,
      expectedClockInAt: { gte: new Date(clockInAt.getTime() - w), lte: new Date(clockInAt.getTime() + w) },
    };
    const escalated = context
      ? await this.prisma.shiftInstance.findMany({ where: { ...window, state: 'ESCALATED' }, select: { id: true } })
      : [];
    await this.prisma.shiftInstance.updateMany({
      where: { ...window, state: { in: ['PENDING', 'REMINDED', 'ESCALATED'] } },
      data: { state: 'PRESENT', nextRemindAt: null, timeEntryId },
    });
    if (!context || escalated.length === 0) return;

    const member = await this.prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
    const leaderIds = await this.notifyTargetsFor({ spaceId, organizationId: context.organizationId, userId }, 'canReconcileAttendance');
    for (const inst of escalated) {
      this.notificationClient.emit('attendance_noshow_resolved', {
        instanceId: inst.id,
        userId,
        userName: member ? `${member.firstName} ${member.lastName}`.trim() : 'A worker',
        spaceId,
        clockInAt: clockInAt.toISOString(),
        timezone: context.timezone,
        recordedOffline: context.recordedOffline,
        leaderIds,
        organizationId: context.organizationId,
      });
    }
  }

  /**
   * No-show sweep (runs in the same 1-min tick as the clock-out reminder sweep):
   * drain expected shifts past their grace with no clock-in — nudge the worker,
   * then after MAX_REMINDERS escalate to a space leader. Members on approved
   * time-off are marked EXCUSED, not chased.
   */
  async runNoShowSweep() {
    const now = new Date();
    const due = await this.prisma.shiftInstance.findMany({
      where: { state: { in: ['PENDING', 'REMINDED'] }, nextRemindAt: { not: null, lte: now } },
      orderBy: { nextRemindAt: 'asc' },
      take: 500,
    });
    if (due.length === 0) return success({ remindedCount: 0, escalatedCount: 0, excusedCount: 0 });

    const interval = SHIFT_REMINDER_DEFAULTS.REMINDER_INTERVAL_MINUTES;
    const maxReminders = SHIFT_REMINDER_DEFAULTS.MAX_REMINDERS;

    // Batch-load names + approved time-off (ShiftInstance is fk-less by design).
    const userIds = [...new Set(due.map((d) => d.userId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const nameById = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
    const leaves = await this.prisma.timeOff.findMany({
      where: { technicianId: { in: userIds }, status: 'APPROVED' },
      select: { technicianId: true, startDate: true, endDate: true },
    });
    const onLeave = (userId: string, at: Date) =>
      leaves.some((l) => l.technicianId === userId && l.startDate <= at && l.endDate >= at);

    const toRemind: { inst: (typeof due)[number]; nextCount: number }[] = [];
    const toEscalate: (typeof due)[number][] = [];
    const toExcuse: string[] = [];
    for (const inst of due) {
      if (onLeave(inst.userId, inst.expectedClockInAt)) {
        toExcuse.push(inst.id);
        continue;
      }
      const nextCount = inst.reminderCount + 1;
      if (nextCount <= maxReminders) toRemind.push({ inst, nextCount });
      else toEscalate.push(inst);
    }

    if (toExcuse.length) {
      await this.prisma.shiftInstance.updateMany({
        where: { id: { in: toExcuse } },
        data: { state: 'EXCUSED', nextRemindAt: null },
      });
    }

    const leadersBySpace = new Map<string, string[]>();
    const targetsByEntry = new Map<string, string[]>();
    for (const e of toEscalate) {
      targetsByEntry.set(e.id, await this.notifyTargetsFor(e, 'canReconcileAttendance', leadersBySpace));
    }

    const tasks: Array<() => Promise<void>> = [];
    for (const { inst, nextCount } of toRemind) {
      const userName = nameById.get(inst.userId) ?? 'A worker';
      const nextRemindAt = new Date(now.getTime() + interval * 60_000);
      tasks.push(async () => {
        await this.prisma.shiftInstance.update({
          where: { id: inst.id },
          data: { state: 'REMINDED', reminderCount: nextCount, nextRemindAt },
        });
        this.notificationClient.emit('attendance_noshow_reminder', {
          instanceId: inst.id,
          userId: inst.userId,
          userName,
          spaceId: inst.spaceId,
          expectedClockInAt: inst.expectedClockInAt.toISOString(),
          reminderCount: nextCount,
          organizationId: inst.organizationId,
        });
      });
    }
    for (const inst of toEscalate) {
      const userName = nameById.get(inst.userId) ?? 'A worker';
      const leaderIds = targetsByEntry.get(inst.id) ?? [];
      tasks.push(async () => {
        await this.prisma.shiftInstance.update({
          where: { id: inst.id },
          data: { state: 'ESCALATED', nextRemindAt: null },
        });
        this.notificationClient.emit('attendance_noshow_escalation', {
          instanceId: inst.id,
          userId: inst.userId,
          userName,
          spaceId: inst.spaceId,
          expectedClockInAt: inst.expectedClockInAt.toISOString(),
          leaderIds,
          organizationId: inst.organizationId,
        });
      });
    }
    const CONCURRENCY = 20;
    for (let i = 0; i < tasks.length; i += CONCURRENCY) {
      await Promise.all(tasks.slice(i, i + CONCURRENCY).map((fn) => fn()));
    }
    return success({ remindedCount: toRemind.length, escalatedCount: toEscalate.length, excusedCount: toExcuse.length });
  }

  /** Admin list: recent no-shows (reminded / escalated / excused) for review. */
  async listNoShows(data: { organizationId: string; days?: number; spaceId?: string; scopeSpaceIds?: AttendanceScope }) {
    const now = new Date();
    const since = new Date(now.getTime() - (data.days ?? 7) * 86_400_000);
    const rows = await this.prisma.shiftInstance.findMany({
      where: {
        organizationId: data.organizationId,
        ...(data.spaceId ? { spaceId: data.spaceId } : {}),
        // ShiftInstance is keyed on the space too. Applied after the explicit
        // filter above so a caller asking for one space still cannot reach a
        // space they were never granted.
        ...scopeWhereOn('spaceId', data.scopeSpaceIds),
        state: { in: ['REMINDED', 'ESCALATED', 'EXCUSED'] },
        expectedClockInAt: { gte: since, lte: now },
      },
      orderBy: { expectedClockInAt: 'desc' },
      take: 200,
    });
    if (rows.length === 0) return success([]);

    const userIds = [...new Set(rows.map((r) => r.userId))];
    const spaceIds = [...new Set(rows.map((r) => r.spaceId))];
    const [users, spaces] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true, avatarUrl: true } }),
      this.prisma.companyLocation.findMany({ where: { id: { in: spaceIds } }, select: { id: true, name: true } }),
    ]);
    const uMap = new Map(users.map((u) => [u.id, u]));
    const sMap = new Map(spaces.map((s) => [s.id, s.name]));
    return success(
      rows.map((r) => {
        const u = uMap.get(r.userId);
        return {
          id: r.id,
          userId: r.userId,
          userName: u ? `${u.firstName} ${u.lastName}` : 'Unknown',
          avatarUrl: u?.avatarUrl ?? null,
          spaceId: r.spaceId,
          spaceName: sMap.get(r.spaceId) ?? 'Space',
          expectedClockInAt: r.expectedClockInAt,
          expectedClockOutAt: r.expectedClockOutAt,
          state: r.state,
          reminderCount: r.reminderCount,
          localDate: r.localDate,
          excuseReason: r.excuseReason ?? null,
        };
      }),
    );
  }

  /** Excuse a no-show (mark EXCUSED + record the reason) or reopen it (back to PENDING). */
  async resolveNoShow(data: { id: string; organizationId: string; action: 'excuse' | 'reopen'; reason?: string; excusedById?: string; scopeSpaceIds?: AttendanceScope }) {
    const inst = await this.prisma.shiftInstance.findFirst({
      // ShiftInstance names its own space, so it narrows on `spaceId`. A
      // no-show in a space the caller was not granted reads as 'not found'.
      where: {
        id: data.id,
        organizationId: data.organizationId,
        ...scopeWhereOn('spaceId', data.scopeSpaceIds),
      },
      select: { id: true },
    });
    if (!inst) throw new NotFoundException('No-show not found');
    const updated = await this.prisma.shiftInstance.update({
      where: { id: inst.id },
      data: data.action === 'reopen'
        ? { state: 'PENDING', nextRemindAt: new Date(), excuseReason: null, excusedById: null }
        : { state: 'EXCUSED', nextRemindAt: null, excuseReason: data.reason?.trim().slice(0, 500) || null, excusedById: data.excusedById ?? null },
    });
    return success(updated);
  }

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
  private async resolveSpaceLeaders(
    spaceId: string,
    organizationId: string,
    permission: 'canApproveOvertime' | 'canReconcileAttendance',
  ): Promise<string[]> {
    const assignments = await this.prisma.spaceAssignment.findMany({
      where: { spaceId, organizationId, role: { isActive: true } },
      include: { role: { select: { permissions: true } } },
    });
    const leaderIds = assignments
      .filter((a) => (a.role?.permissions as any)?.[permission] === true)
      .map((a) => a.userId);
    if (leaderIds.length > 0) return [...new Set(leaderIds)];

    return [];
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
  private async notifyTargetsFor(
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

  /**
   * Get all time entries for an organization (admin view)
   */
  /**
   * Map a UI sort key → Prisma orderBy for the entries list. Defaults to newest
   * clock-in first. `totalMinutes`/`clockOutAt` are nullable → nulls sort last.
   */
  private buildEntriesOrderBy(sortBy?: string, sortOrder?: string): any {
    const dir: 'asc' | 'desc' = sortOrder === 'asc' ? 'asc' : 'desc';
    // Smart "sort by day": every non-chronological sort gets clock-in (newest day
    // first) as a secondary tie-breaker, so a worker's / status's rows always fall
    // into day order instead of an arbitrary within-group order. Invisible in the
    // UI — same columns, same rows — but the list is always day-coherent.
    const byDay = { clockInAt: 'desc' as const };
    switch (sortBy) {
      case 'worker':
        return [{ user: { firstName: dir } }, { user: { lastName: dir } }, byDay];
      case 'status':
        return [{ status: dir }, byDay];
      case 'clockIn':
        return { clockInAt: dir };
      case 'clockOut':
        return [{ clockOutAt: { sort: dir, nulls: 'last' } }, byDay];
      case 'duration':
        return [{ totalMinutes: { sort: dir, nulls: 'last' } }, byDay];
      case 'approval':
        return [{ approvalStatus: dir }, byDay];
      default:
        return byDay;
    }
  }

  async getAllEntries(data: {
    organizationId: string;
    /** Spaces the caller may read; null/undefined = org-wide, [] = none. */
    scopeSpaceIds?: AttendanceScope;
    date?: Date | string;
    startDate?: Date | string;
    endDate?: Date | string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: string;
  }) {
    const page = data.page ?? 1;
    const limit = data.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: any = {
      organizationId: data.organizationId,
      // Only the spaces this caller was granted — see attendance-scope.ts. The
      // gateway guard widens on any space grant; this is what narrows again.
      ...scopeWhere(data.scopeSpaceIds),
    };

    // Date filter — a startDate/endDate range takes precedence over a single day.
    const range = buildDateRangeFilter(data.startDate, data.endDate);
    if (range) {
      where.clockInAt = range;
    } else if (data.date) {
      where.clockInAt = buildSingleDayFilter(data.date);
    }

    // Status filter
    if (data.status) {
      where.status = data.status;
    }

    // Name / email search
    if (data.search?.trim()) {
      const q = data.search.trim();
      where.user = {
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      };
    }

    const [entries, total] = await Promise.all([
      this.prisma.timeEntry.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          location: {
            select: {
              id: true,
              name: true,
              address: true,
              timezone: true,
            },
          },
          editedBy: { select: EDITOR_SELECT },
        },
        orderBy: this.buildEntriesOrderBy(data.sortBy, data.sortOrder),
      }),
      this.prisma.timeEntry.count({ where }),
    ]);

    return paginated(entries, { page, limit, total });
  }

  // midnightClockOut removed — replaced by timezone-aware autoClockOut that runs every 15 min

  // =========================================================================
  // Report methods → AttendanceReportService
  // Break methods → BreakService
  // Approval methods → ApprovalService
  // =========================================================================

  /**
   * Send geofence violation alert to dispatchers and admins
   */
  private async sendGeofenceAlert(data: {
    userId: string;
    organizationId: string;
    locationName: string;
    distance: number;
    allowedRadius: number;
    action: 'clock_in' | 'clock_out';
  }) {
    try {
      // Get user info
      const user = await this.prisma.user.findUnique({
        where: { id: data.userId },
        select: { firstName: true, lastName: true, email: true },
      });

      if (!user) return;

      // Route to the employee's watchers (per-employee override) or the admins +
      // managers of their space — not the whole org. See NotificationRoutingService.
      const { ids: dispatcherIds, emails: dispatcherEmails } =
        await this.notificationRouting.resolveWatchers(
          data.userId,
          data.organizationId,
          'attendance',
        );

      // Emit notification event
      this.notificationClient.emit('attendance_geofence_alert', {
        userId: data.userId,
        userName: `${user.firstName} ${user.lastName}`,
        userEmail: user.email,
        locationName: data.locationName,
        distance: data.distance,
        allowedRadius: data.allowedRadius,
        action: data.action,
        dispatcherEmails,
        dispatcherIds,
        organizationId: data.organizationId,
      });

      this.logger.warn(
        `Geofence alert sent: user=${user.firstName} ${user.lastName}, action=${data.action}, distance=${data.distance}m, allowed=${data.allowedRadius}m`,
      );
    } catch (error) {
      this.logger.error('Failed to send geofence alert', error);
    }
  }

  /**
   * Notify managers/admins that a time entry now needs approval (push + bell).
   * Fired when an entry transitions to approvalStatus = PENDING.
   */
  private async sendPendingApprovalAlert(data: {
    entryId: string;
    userId: string;
    organizationId: string;
    locationName: string;
    flagReasons: string[];
    totalMinutes: number;
  }) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: data.userId },
        select: { firstName: true, lastName: true },
      });
      if (!user) return;

      const { ids: managerIds } = await this.notificationRouting.resolveWatchers(
        data.userId,
        data.organizationId,
        'attendance',
      );

      this.notificationClient.emit('attendance_pending_approval', {
        entryId: data.entryId,
        userId: data.userId,
        userName: `${user.firstName} ${user.lastName}`,
        locationName: data.locationName,
        flagReasons: data.flagReasons,
        totalMinutes: data.totalMinutes,
        managerIds,
        organizationId: data.organizationId,
      });

      this.logger.log(
        `Pending-approval alert sent: entry=${data.entryId}, user=${user.firstName} ${user.lastName}, flags=[${data.flagReasons.join(',')}]`,
      );
    } catch (error) {
      this.logger.error('Failed to send pending-approval alert', error);
    }
  }
}
