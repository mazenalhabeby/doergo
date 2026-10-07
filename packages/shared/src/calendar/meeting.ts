/**
 * How and where an appointment happens — one definition for the server, the web and the phone.
 *
 *   IN_PERSON → at OUR OFFICE (a workspace: its address comes from it)
 *             → at the CLIENT'S SITE (a client + one of their addresses)
 *             → at another ADDRESS (typed)
 *   ONLINE    → a meeting link (Teams, Meet, Zoom… recognised, never required to be one of them)
 *   PHONE     → a number, and who calls whom
 *
 * A reminder has none of this. Fields that do not belong to the chosen mode are DROPPED on save
 * (`meetingFieldsFor`), so switching from Online to Phone cannot leave a stale link behind.
 */

export const MEETING_MODES = ['IN_PERSON', 'ONLINE', 'PHONE'] as const;
export type MeetingMode = (typeof MEETING_MODES)[number];

export const PLACE_KINDS = ['OFFICE', 'CLIENT_SITE', 'ADDRESS'] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

export const CALL_DIRECTIONS = ['OUTGOING', 'INCOMING'] as const;
export type CallDirection = (typeof CALL_DIRECTIONS)[number];

export const ROOM_MAX = 80;
export const LOCATION_MAX = 200;

export type MeetingProvider = 'TEAMS' | 'MEET' | 'ZOOM' | 'WEBEX' | 'WHEREBY' | 'JITSI';

/** Display names — product names, the same in every language. */
export const MEETING_PROVIDER_NAMES: Record<MeetingProvider, string> = {
  TEAMS: 'Microsoft Teams', MEET: 'Google Meet', ZOOM: 'Zoom', WEBEX: 'Webex', WHEREBY: 'Whereby', JITSI: 'Jitsi Meet',
};

const PROVIDER_HOSTS: [RegExp, MeetingProvider][] = [
  [/(^|\.)teams\.(microsoft|live)\.com$/, 'TEAMS'],
  [/(^|\.)meet\.google\.com$/, 'MEET'],
  [/(^|\.)zoom\.(us|com)$/, 'ZOOM'],
  [/(^|\.)webex\.com$/, 'WEBEX'],
  [/(^|\.)whereby\.com$/, 'WHEREBY'],
  [/(^|\.)meet\.jit\.si$/, 'JITSI'],
];

/** Which service a meeting link belongs to, from its host only. Null for anything else (still a valid link). */
export function meetingProvider(url: string | null | undefined): MeetingProvider | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  for (const [re, p] of PROVIDER_HOSTS) if (re.test(host)) return p;
  return null;
}

/**
 * A phone number as people type it — "+43 1 234 56-78", "(555) 010 2030" — kept as typed but
 * checked: only digits and + ( ) - / . and spaces, a leading + at most once, 6 to 15 digits.
 * Null when it is not a number.
 */
export function cleanPhone(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/\s+/g, ' ');
  if (!s || s.length > 30) return null;
  if (!/^\+?[0-9 ()\-/.]+$/.test(s)) return null;
  const digits = s.replace(/\D/g, '').length;
  return digits >= 6 && digits <= 15 ? s : null;
}

/** `tel:` link for a cleaned number (digits and the leading + only). */
export function telHref(phone: string): string {
  return `tel:${phone.trim().startsWith('+') ? '+' : ''}${phone.replace(/\D/g, '')}`;
}

export interface MeetingFields {
  mode: MeetingMode | null;
  place: PlaceKind | null;
  placeSpaceId: string | null;
  room: string | null;
  location: string | null;
  meetingUrl: string | null;
  phone: string | null;
  callDirection: CallDirection | null;
}

/**
 * What an appointment keeps for its mode — every other field set to null. The ONE place the
 * combinations are decided; the server saves exactly this, the forms show exactly these fields.
 *
 * Legacy events (no mode) keep their location and link as they were.
 */
export function meetingFieldsFor(f: MeetingFields): MeetingFields {
  const none: MeetingFields = { mode: f.mode, place: null, placeSpaceId: null, room: null, location: null, meetingUrl: null, phone: null, callDirection: null };
  switch (f.mode) {
    case 'ONLINE':
      return { ...none, meetingUrl: f.meetingUrl };
    case 'PHONE':
      return { ...none, phone: f.phone, callDirection: f.callDirection ?? 'OUTGOING' };
    case 'IN_PERSON': {
      const place = f.place ?? 'ADDRESS';
      if (place === 'OFFICE') return { ...none, place, placeSpaceId: f.placeSpaceId, room: f.room, location: f.location };
      return { ...none, place, location: f.location };
    }
    default:
      return { ...none, mode: null, location: f.location, meetingUrl: f.meetingUrl };
  }
}

/** One line for a list or a push: "Main Office · Room 1", "Microsoft Teams", "Call +43 1 234". */
export function meetingSummary(f: Pick<MeetingFields, 'mode' | 'place' | 'room' | 'location' | 'meetingUrl' | 'phone'> & { spaceName?: string | null }): string | null {
  if (f.mode === 'ONLINE') {
    const p = meetingProvider(f.meetingUrl);
    return p ? MEETING_PROVIDER_NAMES[p] : f.meetingUrl ? 'Online' : null;
  }
  if (f.mode === 'PHONE') return f.phone ?? null;
  if (f.mode === 'IN_PERSON' && f.place === 'OFFICE') return [f.spaceName, f.room].filter(Boolean).join(' · ') || f.location || null;
  return f.location ?? null;
}
