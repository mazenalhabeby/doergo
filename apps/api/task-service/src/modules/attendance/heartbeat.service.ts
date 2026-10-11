import { lastReadingIsFresh, replayRing, type RingReading } from './heartbeat-replay';
import { OPEN_EXCURSION_STATUSES } from './open-shift-close';
import { Injectable, Inject, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationRoutingService } from '../../common/notification-routing.service';
import {
  success,
  TimeEntryStatus,
  isAtSite,
  siteEnforcesZone,
  parseGeofencePolygon,
  GEOFENCE_EXCURSION,
  SERVICE_NAMES,
} from '@hbcfield/shared';
import { scopeWhereOn, scopeAllows, type AttendanceScope } from '@hbcfield/shared';
import { assertNotSelfDecision } from './self-decision';
import { PresenceService } from './presence/presence.service';
import { ATTENDANCE_LOCATION_SELECT, MEMBER_SELECT } from './attendance-selects';
import { ClockOutService } from './clock-out.service';

/**
 * Where a clocked-in member is: the heartbeat (live and replayed from the
 * phone's buffer) and the geofence excursions it opens — reported, approved,
 * rejected, listed and expired.
 */
@Injectable()
export class HeartbeatService {
  private readonly logger = new Logger(HeartbeatService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION)
    private readonly notificationClient: ClientProxy,
    private readonly notificationRouting: NotificationRoutingService,
    // Where they are working now — display only, and never in the way of a clock-in.
    private readonly presence: PresenceService,
    private readonly clockOuts: ClockOutService,
  ) {}

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
      // Closed by the open-shift sweep: tell the phone, so it stops tracking a shift that is over.
      const closedFor = entry
        ? false
        : !!(await this.prisma.timeEntry.findFirst({
            where: { userId: data.userId, clockOutProvisional: true, clockOutAt: { gte: new Date(Date.now() - 86_400_000) } },
            select: { id: true },
          }));
      return success(
        { withinGeofence: true, inRing: true, distance: 0, autoClockedOut: closedFor, activeExcursion: null },
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
      Where they are working now. Asked of the area whether or not the day is
      away: somebody who clocked in from the café and walked in is on site.
      Not awaited — it swallows its own failures and never holds a heartbeat.
    */
    void this.presence.onPosition(
      entry,
      { lat: data.lat, lng: data.lng },
      siteEnforcesZone(sweepZone) && isAtSite({ lat: data.lat, lng: data.lng, accuracy: 0 }, sweepZone).inside,
    );

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

  /**
   * Check-ins a phone kept while it had no signal, sent together.
   *
   * ⚠️ Never fed through heartbeat() one by one — see heartbeat-replay.ts. Points
   * become periods outside the ring: finished ones are recorded as RETURNED
   * with their real times and told to nobody; an excursion that was already
   * open is closed at the moment the member actually came back; and a period
   * still open is opened like a live one only if the newest point is recent.
   * An older one says nothing about where the member is now.
   */
  async heartbeatBatch(data: {
    userId: string;
    organizationId: string;
    points: { lat: number; lng: number; accuracy?: number; recordedAt: string }[];
  }) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: { userId: data.userId, organizationId: data.organizationId, status: TimeEntryStatus.CLOCKED_IN },
      include: { location: { select: ATTENDANCE_LOCATION_SELECT } },
    });
    if (!entry || !entry.location) return success({ recorded: 0, opened: false, returned: false });

    const zone = {
      lat: entry.location.lat,
      lng: entry.location.lng,
      geofenceRadius: entry.location.geofenceRadius,
      geofencePolygon: parseGeofencePolygon(entry.location.geofencePolygon),
    };
    /*
      The day's groups, replayed in the order the points were taken — for a day
      worked away too, which the excursion replay below does not look at.
    */
    {
      const now = new Date();
      const hasArea = siteEnforcesZone(zone);
      const points = data.points
        .map((p) => ({ lat: p.lat, lng: p.lng, at: new Date(p.recordedAt) }))
        .filter(({ at, lat, lng }) => Number.isFinite(lat) && Number.isFinite(lng) && !Number.isNaN(at.getTime()) && at >= entry.clockInAt && at.getTime() <= now.getTime() + 2 * 60_000)
        .sort((a, b) => a.at.getTime() - b.at.getTime())
        .slice(-500)
        .map((p) => ({ ...p, insideArea: hasArea && isAtSite({ lat: p.lat, lng: p.lng, accuracy: 0 }, zone).inside }));
      await this.presence.onBatch(entry, points);
    }
    if (entry.isRemote) return success({ recorded: 0, opened: false, returned: false });

    if (!siteEnforcesZone(zone)) return success({ recorded: 0, opened: false, returned: false });

    const now = new Date();
    // Only this shift's points, none from the future, in the order they were taken.
    const readings: RingReading[] = data.points
      .map((p) => ({ p, at: new Date(p.recordedAt) }))
      .filter(({ at }) => !Number.isNaN(at.getTime()) && at >= entry.clockInAt && at.getTime() <= now.getTime() + 2 * 60_000)
      .slice(0, 500)
      .map(({ p, at }) => {
        const raw = isAtSite({ lat: p.lat, lng: p.lng, accuracy: 0 }, zone);
        return {
          at,
          inside: raw.inside,
          outPastBuffer: (raw.metresOutside ?? 0) > GEOFENCE_EXCURSION.RING_HYSTERESIS_M,
          distanceM: Math.round(raw.distanceToCentre ?? 0),
        };
      });
    if (readings.length === 0) return success({ recorded: 0, opened: false, returned: false });

    const active = await this.getActiveExcursion(entry.id);
    // An excursion already open was judged live; points from before it began cannot change it.
    const relevant = active ? readings.filter((r) => r.at >= active.leftRingAt) : readings;
    const periods = replayRing(relevant, active ? active.leftRingAt : null);
    const fresh = lastReadingIsFresh(relevant, now);
    let recorded = 0;
    let opened = false;
    let returned = false;

    for (const period of periods) {
      if (period.continuesOpen && active) {
        if (period.backAt) {
          // Back inside at a real moment, not "when the phone reconnected".
          const closed = await this.prisma.geofenceExcursion.updateMany({
            where: { id: active.id, status: active.status },
            data: { status: 'RETURNED', resolvedAt: period.backAt },
          });
          if (closed.count > 0) {
            returned = true;
            await this.emitExcursionEvent('geofence_excursion_returned', entry, active, { distanceM: period.maxDistanceM });
          }
        } else if (period.maxDistanceM && active.lastDistanceM !== period.maxDistanceM) {
          await this.prisma.geofenceExcursion.update({ where: { id: active.id }, data: { lastDistanceM: period.maxDistanceM } });
        }
        continue;
      }
      if (period.backAt) {
        // Finished before anybody could have acted on it: history, told to nobody.
        await this.prisma.geofenceExcursion.create({
          data: {
            organizationId: entry.organizationId,
            timeEntryId: entry.id,
            userId: entry.userId,
            spaceId: entry.locationId,
            status: 'RETURNED',
            leftRingAt: period.leftAt,
            resolvedAt: period.backAt,
            lastDistanceM: period.maxDistanceM,
          },
        });
        recorded++;
        continue;
      }
      if (fresh) {
        const created = await this.prisma.geofenceExcursion.create({
          data: {
            organizationId: entry.organizationId,
            timeEntryId: entry.id,
            userId: entry.userId,
            spaceId: entry.locationId,
            status: 'OUT_UNREPORTED',
            leftRingAt: period.leftAt,
            lastDistanceM: period.maxDistanceM,
          },
        });
        opened = true;
        await this.emitExcursionEvent('geofence_excursion_out', entry, created, { distanceM: period.maxDistanceM });
      }
    }

    return success({ recorded, opened, returned });
  }

  /** Latest active excursion for a session (OUT_UNREPORTED / PENDING / APPROVED). */
  async getActiveExcursion(timeEntryId: string) {
    return this.prisma.geofenceExcursion.findFirst({
      where: { timeEntryId, status: { in: [...OPEN_EXCURSION_STATUSES] } },
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
    // Nobody sanctions their own time away from the site — the rule every other approval follows.
    await assertNotSelfDecision(this.prisma as never, {
      deciderId: data.approverId,
      subjectId: excursion.userId,
      organizationId: data.organizationId,
      message: 'You cannot approve your own request to leave the site. Ask a manager or an administrator.',
    });
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
    await assertNotSelfDecision(this.prisma as never, {
      deciderId: data.approverId,
      subjectId: excursion.userId,
      organizationId: data.organizationId,
      message: 'You cannot decide your own request to leave the site. Ask a manager or an administrator.',
    });
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
      await this.clockOuts.clockOut({
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
        select: MEMBER_SELECT,
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
}
