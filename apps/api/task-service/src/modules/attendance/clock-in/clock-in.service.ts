import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
  Optional,
} from '@nestjs/common';
import {
  zoneOf,
  success,
  TimeEntryStatus,
  isAtSite,
  parseGeofencePolygon,
  activeAssignmentWhere,
  resolveAwayAccess,
  ringSwitchedOff,
  effectiveClockRules,
  mayClockInRemotely as canClockInRemotely,
  personForClockIn,
} from '@hbcfield/shared';
import { remoteApprovedAt, approvedRequestsAround, type DayRequestRow } from '../core/approved-requests';
import { fixOfTap } from '../../../common/occurrence.util';
import { alreadyClockedIn, judgeClockStep, sameRecordOrRefuse } from '../core/attendance-occurrence';
import { PrismaService } from '@hbcfield/shared';
import { ClockInContextService } from './clock-in-context.service';
import { ClockInRemoteService } from './clock-in-remote.service';
import { ClockInSiteWriter } from './clock-in-site.writer';
import { AutoClockService } from '../auto-clock/auto-clock.service';
import { fixOf, gpsAccuracyRefusal, outsideSiteRefusal, workspaceArchivedRefusal } from './clock-in-steps';
import type { ClockInInput } from './clock-in-steps';
import { joinedIntoWhere } from '../core/clock-in-join';
import { clockInZones } from './clock-in-helpers';

/**
 * Starting a shift: where a member may clock in, the clock-in itself, and the
 * context it is stamped with (shift, no-shift allowance, away, timezone).
 *
 * The steps, in order: a resend → when it happened → who → the day's approved
 * requests → remote (ClockInRemoteService) or on site: may they, here, now →
 * shape and write the entry (ClockInSiteWriter).
 */
@Injectable()
export class ClockInService {
  private readonly logger = new Logger(ClockInService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly context: ClockInContextService,
    private readonly remote: ClockInRemoteService,
    private readonly site: ClockInSiteWriter,
    // The automatic clock's re-check. Optional so a clock-in never depends on it: absent, no step is marked automatic.
    @Optional() private readonly autoClock?: AutoClockService,
  ) {}

  /** What this workspace allows a member with no shift, at this moment (see ClockInContextService). */
  noShiftAllowanceFor(...args: Parameters<ClockInContextService['noShiftAllowanceFor']>) {
    return this.context.noShiftAllowanceFor(...args);
  }

  /**
   * Clock in at a company location
   */
  async clockIn(data: ClockInInput) {
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
      // …or the clock-in JOINED an earlier fragment of its shift (clock-in-join.ts): answer with that entry.
      const joinedInto = await this.prisma.timeEntry.findFirst({
        where: {
          userId: data.userId,
          ...joinedIntoWhere(data.id),
        },
        include: { location: true },
      });
      if (joinedInto) return success(joinedInto, 'Already clocked in');
      /*
        ⚠️ An automatic clock-in its owner UNDID is gone — a resend of it (the
        answer was lost, the outbox tries again) must not make the shift again.
      */
      if (data.trigger === 'AUTO' && (await this.autoClock?.wasUndone(data.id, data.userId))) {
        throw new ConflictException({
          message: 'This automatic clock-in was undone',
          code: 'AUTO_CLOCK_UNDONE',
          params: { id: data.id },
        });
      }
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
    const occurrence = judgeClockStep(data.evidence, lastClosed?.clockOutAt);
    const tapFix = fixOfTap(data.evidence, occurrence.at, occurrence.flags);
    if (tapFix) {
      data.lat = tapFix.lat;
      data.lng = tapFix.lng;
      data.accuracy = tapFix.accuracy;
    }

    // Any STAFF member may clock in (EMPLOYEE and ADMIN — admins clock in too);
    // only external portal CUSTOMER accounts are excluded. Previously this was
    // hardcoded role:'EMPLOYEE', so admins hit "Employee not found".
    const user = await personForClockIn(this.prisma, data.userId, data.organizationId);

    if (!user) {
      throw new NotFoundException('Employee not found');
    }

    // No-GPS fallback timezone: for a logical space (or remote bucket) with no
    // resolvable worker location, fall back to the ORG's timezone (not a space's
    // stored value, which may be stale/wrong). UTC only if the org has none.
    const orgTz = zoneOf(user.organization?.timezone);

    // Admins have full org access — they may always clock in remotely, without
    // needing the per-user allowRemote flag toggled on (nothing to configure for
    // an admin). Everyone else still requires an explicit remote-clock-in grant.
    //
    // Shared with all three clock surfaces (web attendance page, web widget,
    // mobile) so the button appears exactly where the API would allow it. They
    // each used to restate this and each left out the admin half.
    const mayClockInRemotely = canClockInRemotely(user);

    /*
      ── The day's approved requests ──
      A remote day, changed hours, overtime agreed in advance (requests/request-kinds.ts). One
      indexed read; the rows answer "today" in whichever zone the workspace is in.
    */
    const dayRequests: DayRequestRow[] = await approvedRequestsAround(this.prisma, data.userId, occurrence.at);

    await this.remote.moveApprovedRemoteToWorkspace(data, dayRequests, occurrence, orgTz);

    if (data.isRemote) {
      return this.remote.clockInRemote(data, { mayClockInRemotely, occurrence, dayRequests, orgTz });
    }

    // ---- On-site clock-in requires a target location ----
    if (!data.locationId) {
      throw new BadRequestException({
        code: 'LOCATION_REQUIRED',
        message: 'A location is required to clock in on site.',
      });
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
      throw new BadRequestException({
        code: 'NOT_ASSIGNED_HERE',
        message: 'You are not assigned to this location. Contact your administrator.',
      });
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

    // Get location details. Never the Remote bucket: it has no site to judge and no rota — it is reached
    // only through `isRemote`, by somebody with no workspace (ClockInRemoteService).
    const workspace = await this.prisma.companyLocation.findFirst({
      // Archived workspaces are FOUND (an offline tap made before archiving gets a coded refusal below), never the bucket.
      where: { id: data.locationId, organizationId: data.organizationId, isRemote: false },
    });

    if (!workspace) {
      throw new NotFoundException('Location not found or inactive');
    }
    // Archived meanwhile (an offline tap made before it was): a CODED refusal the phone can put into words.
    if (!workspace.isActive) throw workspaceArchivedRefusal();
    // The rules THIS member clocks by here (clock review D1): the workspace's, unless their assignment says
    // they work here another way, with their own daily hours. Everything below reads the result.
    const location = { ...workspace, ...effectiveClockRules(workspace, assignment) } as typeof workspace;

    // ONE planning zone for every step of this clock-in (clock-in-helpers `clockInZones`).
    const zones = clockInZones(data, location, orgTz);
    // The approver said yes to working away from HERE today: that is the authorisation, above the
    // grant and the ceiling. It covers only where — lateness is still judged below. Asked FIRST: on
    // such a day there is no site to be precise about, so neither a fix nor its accuracy is required.
    const remoteApproved = remoteApprovedAt(dayRequests, location.id, occurrence.at, zones.planningTz);

    // Check GPS accuracy
    const accuracyRefusal = remoteApproved ? null : gpsAccuracyRefusal(data.accuracy, !!fixOf(data));
    if (accuracyRefusal) throw accuracyRefusal;

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
    // A position is needed only where the place checks one (C2): a pinned site refuses a clock-in without it.
    const fix = fixOf(data);
    if (spaceHasPin && !fix && !remoteApproved) {
      throw new BadRequestException({
        code: 'FIX_MISSING',
        message: `Your location is needed to clock in at ${location.name}.`,
        params: { location: location.name },
      });
    }
    // No position on an approved remote day: away, as approved — never "on site" for want of a fix.
    const at = fix ? isAtSite(fix, zone) : { inside: !(spaceHasPin && remoteApproved), distanceToCentre: null };
    const distance = at.distanceToCentre ?? 0;
    // A workspace with its ring switched off has nobody "outside" it — never an away day, never review (B6).
    const withinGeofence = at.inside || ringSwitchedOff(location.geofencePolicy);

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
    const away =
      !withinGeofence && !remoteApproved
        ? resolveAwayAccess({
            spaceHasPin,
            policy: location.geofencePolicy,
            userAllowRemote: user.allowRemote,
            assignmentAllowRemote: assignment.allowRemote,
            isAdmin: user.role === 'ADMIN',
          })
        : { allowed: true, reason: 'GRANTED' as const };

    if (!withinGeofence && !away.allowed) throw outsideSiteRefusal(away.reason, distance, location);

    return this.site.recordOnSite(
      { ...data, locationId: data.locationId },
      {
        user,
        location,
        assignment,
        occurrence,
        dayRequests,
        orgTz,
        zones,
        withinGeofence,
        insideSite: at.inside,
        remoteApproved,
        zone,
      },
    );
  }
}
