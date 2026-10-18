import type { ClockAction } from "./use-clock-in-data"

/**
 * Is this action a clock-OUT — plain, or confirmed early with a reason?
 *
 * ⚠️ The success handler used to test `action === "out"` only, so an early
 * clock-out (`{ out: true, earlyReason }`) fell through to the clock-in branch
 * and the member read "Clocked in" the moment they had left.
 */
export function isClockOutAction(action: ClockAction): action is Extract<ClockAction, "out" | { out: true }> {
  return action === "out" || (typeof action === "object" && "out" in action)
}

/**
 * The position for a clock-out, or null when the browser will not give one.
 *
 * A clock-out never needs the position: the server skips the geofence check
 * and stores no coordinates, exactly as for a phone with no fix. Throwing here
 * (location denied, timeout) used to make it impossible to END a shift from the
 * web — the one action that must always work.
 */
export async function clockOutPosition<P>(read: () => Promise<P>): Promise<P | null> {
  try {
    return await read()
  } catch {
    return null
  }
}
