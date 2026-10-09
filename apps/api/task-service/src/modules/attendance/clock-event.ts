/**
 * What a clock-in / clock-out tells the ORGANIZATION's socket room.
 *
 * The event used to carry the whole TimeEntry row. That room is every open
 * screen in the organization — including members who may not read attendance
 * at all — and the row holds the exact GPS fix of the tap, the away reason,
 * the member's note, the reverse-geocoded place of a remote clock-in and the
 * schedule flags. A broadcast is not a read: it skips every permission a
 * `GET /attendance/...` asks.
 *
 * So the event says only THAT something happened, and to whom. Screens that
 * need the detail already refetch through their own gated queries
 * (`use-realtime-sync` invalidates on these events). The two display labels
 * kept — the workspace's name and the member's name — are what the bell
 * renders, and both are already visible on every roster in the org.
 *
 * ⚠️ Never spread the entry in here. Add a field by name, and only one with
 * no location, reason or free text in it.
 */
export interface ClockEventEntry {
  id: string;
  entryId: string;
  userId: string;
  status: string;
  locationId: string | null;
  isRemote: boolean;
  /** The moment of the tap this event announces (clock-in or clock-out). */
  at: string | null;
  location: { name: string } | null;
  user: { firstName: string; lastName: string } | null;
}

type EntryLike = {
  id: string;
  userId: string;
  status: string;
  locationId?: string | null;
  isRemote?: boolean | null;
  clockInAt?: Date | string | null;
  clockOutAt?: Date | string | null;
  location?: { name?: string | null } | null;
  user?: { firstName?: string | null; lastName?: string | null } | null;
};

const iso = (d: Date | string | null | undefined): string | null =>
  d == null ? null : d instanceof Date ? d.toISOString() : new Date(d).toISOString();

export function clockEventEntry(entry: EntryLike, kind: 'in' | 'out'): ClockEventEntry {
  return {
    id: entry.id,
    entryId: entry.id,
    userId: entry.userId,
    status: entry.status,
    locationId: entry.locationId ?? null,
    isRemote: !!entry.isRemote,
    at: iso(kind === 'out' ? entry.clockOutAt : entry.clockInAt),
    location: entry.location?.name ? { name: entry.location.name } : null,
    user: entry.user
      ? { firstName: entry.user.firstName ?? '', lastName: entry.user.lastName ?? '' }
      : null,
  };
}
