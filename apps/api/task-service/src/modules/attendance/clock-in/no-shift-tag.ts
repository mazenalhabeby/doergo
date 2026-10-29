import { effectiveNoShiftPolicy, endOfDayIn, startOfDayIn, type NoShiftTag } from '@hbcfield/shared';
import type { PlannedWindow } from '../core/shift-resolver.service';

/** Does a no-shift rule apply here at all — a limit, or "only with a shift"? (SHIFT_ONLY where nothing is scheduled is none.) */
export function limitsNoShift(space: { noShiftPolicy?: string | null; workModel?: string | null }): boolean {
  const policy = effectiveNoShiftPolicy(space.noShiftPolicy, space.workModel);
  return policy === 'LIMIT' || policy === 'SHIFT_ONLY';
}

/**
 * The planned shifts on a clock-in tag, so the phone judges "is there a shift now" at the TAP (`tagShiftAt`).
 * `hasShiftNow` alone was the answer when the list was read: read before the day's shift existed (yesterday,
 * or before the rota was set), the phone refused a SHIFT_ONLY clock-in offline that the server accepts.
 *
 * Each window runs from local midnight of the day it STARTS (the clock-in binds a shift from its start day on,
 * `shiftFromRota`) to its end + tolerance; the tag says nothing past the end of tomorrow.
 */
export function shiftWindowsTag(
  windows: readonly PlannedWindow[],
  tz: string,
  now: Date,
): Pick<NoShiftTag, 'shiftWindows' | 'shiftWindowsUntil'> {
  const endOfToday = endOfDayIn(now, tz);
  return {
    shiftWindows: windows.map((w) => ({
      dayFrom: startOfDayIn(w.expectedClockInAt, tz).toISOString(),
      end: w.expectedClockOutAt.toISOString(),
      toleranceMin: w.toleranceMin,
    })),
    shiftWindowsUntil: endOfDayIn(new Date(endOfToday.getTime() + 60_000), tz).toISOString(),
  };
}
