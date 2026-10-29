import { BadRequestException } from '@nestjs/common';
import { zoneOf } from '@hbcfield/shared';

// tz-lookup: offline coords → IANA timezone (single in-memory lookup, no types pkg).
const tzlookup: (lat: number, lon: number) => string = require('tz-lookup');

/**
 * A clock-in with no shift where the workspace only works with shifts — the ONE no-shift refusal left: past
 * the daily hours a clock-in is kept and flagged, never refused (time counting model; clock review B3).
 */
function noShiftRefusal(spaceName: string): BadRequestException {
  return new BadRequestException({
    message: `You have no shift today. ${spaceName} only allows clocking in with a shift.`,
    code: 'NO_SHIFT_TODAY',
  });
}

/** The IANA zone at a GPS position, or null (no fix, Null Island, or a lookup miss). */
function gpsZone(lat: number | null | undefined, lng: number | null | undefined): string | null {
  // (0,0) is Null Island — a missing/failed GPS fix, not a real location.
  if (lat == null || lng == null || (lat === 0 && lng === 0)) return null;
  try {
    return tzlookup(lat, lng);
  } catch {
    return null; // out of range / lookup miss
  }
}

export interface ClockInZones {
  /** EVERY planning step reads this: shift match, rests, day requests, the no-shift day, the shift marked present. */
  planningTz: string;
  /** Stored on the entry for display only: where the person physically was (falls back as before). */
  entryTz: string | null;
}

/**
 * ONE planning zone per clock-in.
 *
 * ⚠️ The steps used to mix two: the GPS zone for the rests and the shift marked present, the workspace's for
 * the day requests — so a phone across a border (or a fix near one) matched the shift in one day and planned
 * its rests in another. A workspace WITH coordinates plans in its own zone (its day is where the work is);
 * one WITHOUT has no place of its own, so the person's GPS zone plans, else the organization's.
 */
function clockInZones(
  fix: { lat?: number | null; lng?: number | null },
  space: { lat: number | null; lng: number | null; timezone: string | null },
  orgTz: string,
): ClockInZones {
  const physical = space.lat != null && space.lng != null;
  const gps = gpsZone(fix.lat, fix.lng);
  return {
    planningTz: physical ? zoneOf(space.timezone, gps, orgTz) : zoneOf(gps, orgTz),
    entryTz: gps ?? (physical ? space.timezone : orgTz),
  };
}

export { tzlookup, noShiftRefusal, gpsZone, clockInZones };
