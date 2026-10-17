import { Injectable } from '@nestjs/common';
import {
  success,
  TimeEntryStatus,
  isAtSite,
  siteEnforcesZone,
  parseGeofencePolygon,
  GEOFENCE_EXCURSION,
} from '@hbcfield/shared';
import { ATTENDANCE_LOCATION_SELECT } from './attendance-selects';
import { HeartbeatBase } from './heartbeat.base';

/**
 * Where a clocked-in member is: the heartbeat (live and replayed from the
 * phone's buffer) and the geofence excursions it opens — reported, approved,
 * rejected, listed and expired.
 */
@Injectable()
export class HeartbeatService extends HeartbeatBase {
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
}
