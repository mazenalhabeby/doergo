import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  formatDistance,
  ATTENDANCE_CONSTANTS,
  computeScheduleFlags,
  workspaceSchedulesShifts,
  AUTO_CLOCK_IN_FLAG,
  autoClockInWithinWindow,
  presenceClockInAllowed,
  presenceSessionEnd,
  type ClockTrigger,
  type MemberAutoClockSettings,
  type OccurrenceEvidence,
} from '@hbcfield/shared';
import type { judgeOccurrence } from '../../../common/occurrence.util';

/** The steps of `ClockInService.clockIn` that need nothing but their inputs. */

export interface ClockInInput {
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
  /**
   * AUTO = the phone's automatic clock made it (attendance/auto-clock.ts).
   * Re-checked here; when it does not hold, it is recorded as an ordinary
   * clock-in — never refused for it (the person really arrived).
   */
  trigger?: ClockTrigger;
}

export type ClockInOccurrence = ReturnType<typeof judgeOccurrence>;

/** What a clock-in needs about the member — auth-service's columns, published in shared data/people. */
export { CLOCK_IN_USER_SELECT } from '@hbcfield/shared';
import { CLOCK_IN_USER_SELECT } from '@hbcfield/shared';

export type ClockInUser = Prisma.UserGetPayload<{ select: typeof CLOCK_IN_USER_SELECT }>;

/** Null when the fix is good enough to judge; otherwise the refusal. */
export function gpsAccuracyRefusal(accuracy: number | undefined): BadRequestException | null {
  if (accuracy && accuracy > ATTENDANCE_CONSTANTS.GPS_ACCURACY_THRESHOLD) {
    return new BadRequestException(
      `GPS accuracy too low (${formatDistance(accuracy)}). Please wait for better signal. ` +
        `Required: ${formatDistance(ATTENDANCE_CONSTANTS.GPS_ACCURACY_THRESHOLD)} or better.`,
    );
  }
  return null;
}

/**
 * Outside the ring and not allowed away. Coded, with the figures, so the phone
 * writes it in the member's language; `message` is the English fallback,
 * distance as a person says it.
 */
export function outsideSiteRefusal(
  reason: string,
  distance: number,
  location: { name: string; geofenceRadius: number },
): BadRequestException {
  const metres = Math.round(distance);
  const params = { distanceMetres: metres, radiusMetres: location.geofenceRadius, location: location.name };
  return new BadRequestException(
    reason === 'SITE_STRICT'
      ? {
          message: `${location.name} can only be clocked in at on site. You are ${formatDistance(metres)} away.`,
          code: 'OUTSIDE_GEOFENCE',
          params,
        }
      : {
          message:
            `You are ${formatDistance(metres)} from ${location.name}, and you are not set up to work away from it. ` +
            'Ask your administrator to allow it.',
          code: 'AWAY_NOT_ALLOWED',
          params,
        },
  );
}

/**
 * Smart flags: matched shift/rota → LATE_ARRIVAL if past the start beyond the
 * shift's tolerance; no matched shift → UNSCHEDULED_DAY. Late detection is the
 * shared computeScheduleFlags (same logic as clock-out + edit).
 *
 * ⚠️ UNSCHEDULED_DAY means "this workspace schedules shifts and you had none
 * today". At a workspace that schedules nothing (workModel NONE, the default)
 * every clock-in was flagged, sent to review and pushed as pending approval.
 */
export function scheduleFlagsAtClockIn(input: {
  planned: boolean;
  workModel: string | null | undefined;
  byPresence: boolean;
  clockInAt: Date;
  expectedClockInAt: Date | null | undefined;
  toleranceMin: number | undefined;
}): string[] {
  if (!input.planned) {
    // Clocked by arriving and leaving: no shift is the arrangement, not something to review.
    return workspaceSchedulesShifts(input.workModel) && !input.byPresence ? ['UNSCHEDULED_DAY'] : [];
  }
  return computeScheduleFlags({
    clockInAt: input.clockInAt,
    expectedClockInAt: input.expectedClockInAt,
    toleranceMin: input.toleranceMin,
  });
}

type AutoSettings = MemberAutoClockSettings;

interface AutoStamp {
  expectedClockInAt?: Date | null;
  expectedClockOutAt?: Date | null;
  nextRemindAt?: Date | null;
}

/**
 * The leader is told at the planned end + `leaderAfterMinutes` when they are
 * still clocked in — the reminder is armed for that moment (never later than
 * the ordinary one), whatever pressed the button. Writes `nextRemindAt`.
 */
export function armAutoClockReminder(
  stamp: AutoStamp,
  autoSettings: AutoSettings | null,
  byPresence: boolean,
  clockInAt: Date,
): void {
  const autoPlannedEnd =
    stamp.expectedClockOutAt ?? (byPresence && autoSettings ? presenceSessionEnd(clockInAt, autoSettings) : null);
  if (autoSettings && autoPlannedEnd) {
    const leaderAt = autoPlannedEnd.getTime() + autoSettings.leaderAfterMinutes * 60_000;
    stamp.nextRemindAt = new Date(
      byPresence && !stamp.expectedClockOutAt
        ? leaderAt
        : Math.min(stamp.nextRemindAt?.getTime() ?? leaderAt, leaderAt),
    );
  }
}

/**
 * A step the phone sent as AUTO is MARKED only when it holds: on site, inside
 * the window the phone was allowed (`autoClockInWithinWindow`). Otherwise it
 * stays an ordinary clock-in with the ordinary rules — never refused: the
 * person really is here.
 */
export function autoClockInFlag(input: {
  trigger: ClockTrigger | undefined;
  autoSettings: AutoSettings | null;
  withinGeofence: boolean;
  byPresence: boolean;
  clockInAt: Date;
  timezone: string;
  stamp: AutoStamp;
}): string[] {
  const { autoSettings, clockInAt, stamp } = input;
  const holds =
    input.trigger === 'AUTO' &&
    autoSettings &&
    input.withinGeofence &&
    (input.byPresence
      ? presenceClockInAllowed(autoSettings, clockInAt, input.timezone)
      : autoClockInWithinWindow(
          autoSettings,
          clockInAt,
          stamp.expectedClockInAt ?? null,
          stamp.expectedClockOutAt ?? null,
        ));
  return holds ? [AUTO_CLOCK_IN_FLAG] : [];
}
