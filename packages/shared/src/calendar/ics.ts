/**
 * An iCalendar (RFC 5545) document — the one-way feed Google, Outlook and the iPhone subscribe to.
 * Everything written into it is escaped; titles and places are typed by people.
 */
export interface IcsEvent {
  uid: string;
  title: string;
  /** Timed: instants. All-day: local dates (YYYY-MM-DD), end exclusive. */
  start: Date | string;
  end: Date | string;
  allDay: boolean;
  description?: string | null;
  location?: string | null;
  url?: string | null;
  rrule?: string | null;
  updatedAt?: Date | null;
  /** TRANSPARENT = shows as free (holidays, other people's leave). */
  transparent?: boolean;
  /**
   * A repeating timed event is written in its own zone (`DTSTART;TZID=…`) so Google/Outlook repeat it
   * at the same WALL time — in UTC a 09:00 Vienna meeting moves an hour at every clock change.
   */
  tzid?: string | null;
}

/** "20261027T090000" — the wall clock of an instant in a zone. */
function localStamp(d: Date, tz: string): string {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  const hh = p.hour === '24' ? '00' : p.hour;
  return `${p.year}${p.month}${p.day}T${hh}${p.minute}${p.second}`;
}

export function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n').replace(/[\u0000-\u0008\u000b-\u001f]/g, '');
}

function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Lines longer than 75 octets are folded, without splitting a multi-byte character. */
function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (enc.encode(cur + ch).length > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = ch;
    } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export function buildIcs(calName: string, events: readonly IcsEvent[], now = new Date()): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HBCField//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(calName)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${icsEscape(e.uid)}`, `DTSTAMP:${stamp(e.updatedAt ?? now)}`);
    if (e.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${String(e.start).replace(/-/g, '')}`, `DTEND;VALUE=DATE:${String(e.end).replace(/-/g, '')}`);
    } else if (e.tzid && /^[A-Za-z_]+(\/[A-Za-z0-9_+\-]+){0,2}$/.test(e.tzid)) {
      lines.push(`DTSTART;TZID=${e.tzid}:${localStamp(e.start as Date, e.tzid)}`, `DTEND;TZID=${e.tzid}:${localStamp(e.end as Date, e.tzid)}`);
    } else {
      lines.push(`DTSTART:${stamp(e.start as Date)}`, `DTEND:${stamp(e.end as Date)}`);
    }
    lines.push(`SUMMARY:${icsEscape(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${icsEscape(e.description)}`);
    if (e.location) lines.push(`LOCATION:${icsEscape(e.location)}`);
    if (e.url && /^https?:\/\//i.test(e.url)) lines.push(`URL:${icsEscape(e.url)}`);
    if (e.rrule && /^[A-Z0-9=;,]+$/.test(e.rrule)) lines.push(`RRULE:${e.rrule}`);
    if (e.transparent) lines.push('TRANSP:TRANSPARENT');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
