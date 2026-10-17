import { lastReadingIsFresh, replayRing, type RingReading } from './heartbeat-replay';
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

/** A phone's buffered heartbeats, flushed in one go (the offline path). */
@Injectable()
export class HeartbeatBatchService extends HeartbeatBase {
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
        .filter(
          ({ at, lat, lng }) =>
            Number.isFinite(lat) &&
            Number.isFinite(lng) &&
            !Number.isNaN(at.getTime()) &&
            at >= entry.clockInAt &&
            at.getTime() <= now.getTime() + 2 * 60_000,
        )
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
      .filter(
        ({ at }) => !Number.isNaN(at.getTime()) && at >= entry.clockInAt && at.getTime() <= now.getTime() + 2 * 60_000,
      )
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
            await this.emitExcursionEvent('geofence_excursion_returned', entry, active, {
              distanceM: period.maxDistanceM,
            });
          }
        } else if (period.maxDistanceM && active.lastDistanceM !== period.maxDistanceM) {
          await this.prisma.geofenceExcursion.update({
            where: { id: active.id },
            data: { lastDistanceM: period.maxDistanceM },
          });
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
}
