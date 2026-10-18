

/**
 * May this person clock in from anywhere, without a geofence?
 *
 * ONE rule, because it had already drifted. The server has always read
 * `allowRemote || role === ADMIN` — an admin needs nothing configured, since
 * there is no one above them to grant it and the Access screen deliberately
 * offers no such switch. Every client, though, checked `allowRemote` alone.
 *
 * The result was an admin who could clock in remotely as far as the API was
 * concerned and had no button anywhere to do it with: three UIs each enforcing
 * three quarters of a rule they had copied rather than shared.
 *
 * Remote is geofence-EXEMPT, not location-free — a coarse fix is still taken and
 * reverse-geocoded to a place, because "worked from Vienna" is a record and
 * "worked from somewhere" is not. Asking for GPS on a remote clock-in is
 * correct, and is not what this decides.
 */
export function mayClockInRemotely(
  user: { allowRemote?: boolean | null; role?: string | null } | null | undefined,
): boolean {
  if (!user) return false;
  return user.allowRemote === true || user.role === 'ADMIN';
}

/**
 * The hours a shift is actually worth — clock time minus breaks.
 *
 * `TimeEntry.totalMinutes` is GROSS: clock-in to clock-out, breaks included. The
 * services store it that way on purpose, with a comment saying breaks are
 * "netted out downstream" — and nothing downstream did. Every screen showed the
 * gross figure under a heading that reads as hours worked, and the reports metric
 * labelled "Hours worked" summed it directly, so a shift of 13h05m with an hour's
 * break was reported as 13.1 hours worked rather than 12.1.
 *
 * Gross is the right thing to STORE: it is the measured fact, and breaks change
 * afterwards — one gets added, corrected, or removed, and a pre-subtracted total
 * would have to be recomputed every time or quietly drift. Netting belongs at the
 * point of reading, which is here.
 *
 * Floored at zero: a break longer than the shift is a data error, and a negative
 * number of hours worked helps nobody diagnose it.
 */
export function workedMinutes(
  entry:
    | { paidMinutes?: number | null; totalMinutes?: number | null; breakMinutes?: number | null }
    | null
    | undefined,
): number {
  /*
    The counted figure wins when there is one.

    `paidMinutes` is decided once, at clock-out, by the shared counted-time rule:
    an early arrival clamped off, approved overtime included because approving it
    moved the expected end, unpaid rests subtracted. Nothing on a screen may
    re-derive that from raw times — a second opinion about somebody's hours is
    exactly the bug this whole column exists to remove.

    The fallback is not legacy debt, it is the same arithmetic this function has
    always done: entries closed before the column existed keep reporting the
    number they always reported, on every screen, with no migration of history.
  */
  if (entry?.paidMinutes != null) return Math.max(0, entry.paidMinutes);

  const gross = entry?.totalMinutes ?? 0;
  const breaks = entry?.breakMinutes ?? 0;
  return Math.max(0, gross - breaks);
}
