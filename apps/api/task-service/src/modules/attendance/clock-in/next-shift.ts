/**
 * The member's next planned shift today, for the clock card BEFORE they clock in.
 *
 * ⚠️ The card's "Your shift starts in N minutes" read the RUNNING entry's
 * expected start — which does not exist before clock-in, the only moment the
 * line is shown. So it never appeared. This is the planned shift itself, from
 * the same rota + schedule reader as the automatic clock's plan.
 */
export interface NextShift {
  startAt: string;
  endAt: string;
  spaceId: string;
  spaceName: string | null;
}

type Window = { dateStr: string; expectedClockInAt: Date; expectedClockOutAt: Date };

/** The earliest planned window still to finish (started or not), across the member's workspaces. */
export function pickNextShift(
  windows: ReadonlyMap<string, readonly Window[]>,
  names: ReadonlyMap<string, string | null>,
  now: Date,
): NextShift | null {
  let best: { w: Window; spaceId: string } | null = null;
  for (const [spaceId, list] of windows) {
    for (const w of list) {
      if (w.expectedClockOutAt.getTime() <= now.getTime()) continue;
      if (!best || w.expectedClockInAt.getTime() < best.w.expectedClockInAt.getTime()) best = { w, spaceId };
    }
  }
  if (!best) return null;
  return {
    startAt: best.w.expectedClockInAt.toISOString(),
    endAt: best.w.expectedClockOutAt.toISOString(),
    spaceId: best.spaceId,
    spaceName: names.get(best.spaceId) ?? null,
  };
}
