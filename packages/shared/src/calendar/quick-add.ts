/**
 * "Remind me to call Müller at 2 for 30 min" → a reminder today 14:00–14:30.
 * "Client review with BILLA on Saturday 3pm for 30 min on Zoom" → an online appointment.
 *
 * A small, predictable reader for English and German, run on the device as the person types so
 * the form shows exactly what was understood BEFORE anything is saved. It never guesses silently:
 * every part it took is reported back in `parts`, and anything it did not understand stays in the
 * title for the person to fix.
 */
import { addDaysStr } from '../attendance/zoned-time';

export interface QuickAddResult {
  title: string;
  kind: 'REMINDER' | 'APPOINTMENT';
  /** Local date (YYYY-MM-DD), when the text named a day. */
  date: string | null;
  /** Local time "HH:MM", when the text named one. */
  time: string | null;
  durationMin: number | null;
  /** The text said zoom / teams / meet / online / video. */
  online: boolean;
  /** "with BILLA" — a name to look up among clients and colleagues. */
  withName: string | null;
  /** The pieces that were read, in order, for the form to highlight. */
  parts: { text: string; as: 'when' | 'time' | 'duration' | 'online' | 'with' | 'reminder' }[];
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0, sonntag: 0, so: 0,
  monday: 1, mon: 1, montag: 1, mo: 1,
  tuesday: 2, tue: 2, tues: 2, dienstag: 2, di: 2,
  wednesday: 3, wed: 3, mittwoch: 3, mi: 3,
  thursday: 4, thu: 4, thurs: 4, donnerstag: 4, do: 4,
  friday: 5, fri: 5, freitag: 5, fr: 5,
  saturday: 6, sat: 6, samstag: 6, sa: 6, sonnabend: 6,
};

function dowOfKey(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
}

/**
 * @param today the person's local date (YYYY-MM-DD) — the reader has no clock of its own.
 * @param nowMinutes minutes since local midnight, so "at 2" after 2 o'clock means 14:00, not 02:00.
 */
export function parseQuickAdd(input: string, today: string, nowMinutes = 0): QuickAddResult {
  let text = ` ${input.replace(/\s+/g, ' ').trim()} `;
  const parts: QuickAddResult['parts'] = [];
  const take = (re: RegExp, as: QuickAddResult['parts'][number]['as']): RegExpExecArray | null => {
    const m = re.exec(text);
    if (!m) return null;
    parts.push({ text: m[0].trim(), as });
    text = text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length);
    return m;
  };

  let kind: QuickAddResult['kind'] = 'APPOINTMENT';
  if (take(/^\s*(remind me( to)?|reminder:?|erinnere mich( daran,?)?( an)?|erinnerung:?)\s+/i, 'reminder')) kind = 'REMINDER';

  // Duration first, so "for 30 min" is not read as a time.
  let durationMin: number | null = null;
  const dur = take(/\s(?:for|für|fuer)\s+(\d{1,3}(?:[.,]\d)?)\s*(m|min|mins|minutes?|minuten|h|hrs?|hours?|std|stunden?)\b/i, 'duration')
    ?? take(/\s(\d{1,3})\s*(min|mins|minutes|minuten)\b/i, 'duration');
  if (dur) {
    const n = Number(dur[1]!.replace(',', '.'));
    durationMin = /^(h|hr|hrs|hour|hours|std|stunde|stunden)$/i.test(dur[2]!) ? Math.round(n * 60) : Math.round(n);
    if (!(durationMin > 0 && durationMin <= 24 * 60)) durationMin = null;
  }

  // Day.
  let date: string | null = null;
  const rel = take(/\s(today|heute|tomorrow|morgen|übermorgen|uebermorgen|day after tomorrow)\b/i, 'when');
  if (rel) {
    const w = rel[1]!.toLowerCase();
    date = w === 'today' || w === 'heute' ? today : w === 'tomorrow' || w === 'morgen' ? addDaysStr(today, 1) : addDaysStr(today, 2);
  } else {
    const wd = take(/\s(?:on |am |next |nächsten |naechsten )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sonntag|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonnabend|sun|mon|tues?|wed|thurs?|fri|sat)\b\.?/i, 'when');
    if (wd) {
      const target = WEEKDAYS[wd[1]!.toLowerCase()]!;
      let delta = (target - dowOfKey(today) + 7) % 7;
      // "next Friday" said on a Friday is a week away, not today.
      if (delta === 0 && /\b(next|nächsten|naechsten)\b/i.test(wd[0])) delta = 7;
      date = addDaysStr(today, delta);
    } else {
      const dm = take(/\s(?:on |am )?(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\.?(?=\s)/i, 'when');
      if (dm) {
        const d = Number(dm[1]), m = Number(dm[2]);
        let y = dm[3] ? Number(dm[3]) : Number(today.slice(0, 4));
        if (y < 100) y += 2000;
        // A real date only: "31.02" is refused, not rolled into March.
        const real = new Date(Date.UTC(y, m - 1, d));
        if (m >= 1 && m <= 12 && d >= 1 && real.getUTCMonth() === m - 1 && real.getUTCDate() === d) {
          const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          // "31.10" said in November means next year.
          date = !dm[3] && key < today ? `${y + 1}${key.slice(4)}` : key;
        }
      }
    }
  }

  // Time.
  let time: string | null = null;
  const t = take(/\s(?:at |um |@ ?)?(\d{1,2})(?::|\.|h)?(\d{2})?\s*(am|pm|a\.m\.|p\.m\.|uhr)(?=\s|$)/i, 'time')
    ?? take(/\s(?:at |um |@ ?)(\d{1,2})(?::(\d{2}))?(?=\s|$)/i, 'time')
    ?? take(/\s(\d{1,2}):(\d{2})(?=\s|$)/, 'time');
  if (t) {
    let h = Number(t[1]);
    const min = t[2] ? Number(t[2]) : 0;
    const mer = (t[3] ?? '').toLowerCase().replace(/\./g, '');
    if (mer === 'pm' && h < 12) h += 12;
    else if (mer === 'am' && h === 12) h = 0;
    else if (!mer || mer === 'uhr') {
      // "at 2" in a working day is two in the afternoon; "at 9" is the morning.
      if (!t[2] && mer !== 'uhr' && h >= 1 && h <= 7) h += 12;
      // "at 10" said at 11:00 today with no day named → still 10, the form shows the past time.
    }
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) time = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }
  if (time && !date) {
    const [h, m] = time.split(':').map(Number);
    date = h! * 60 + m! < nowMinutes ? addDaysStr(today, 1) : today;
  }

  // Online.
  const on = take(/\s(?:on |via |per |über |ueber )?(zoom|teams|ms teams|google meet|meet|skype|webex|online|video ?call|videocall)\b/i, 'online');

  // With somebody — left in the title, also reported.
  let withName: string | null = null;
  const w = /\s(?:with|mit)\s+([A-ZÄÖÜ0-9][\wÄÖÜäöüß&.\-]*(?:\s+(?:AG|GmbH|Inc|Ltd|LLC|KG|SE|[A-ZÄÖÜ][\wäöüß&.\-]*))?)/.exec(text);
  if (w) {
    withName = w[1]!.trim();
    parts.push({ text: w[0].trim(), as: 'with' });
  }

  let title = text
    .replace(/\s(?:on|at|am|um|for|für)\s*$/i, ' ')
    .replace(/\s+(?:on|at|am|um)\s+(?=\s|$)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[,;:\-–]+$/, '')
    .trim();
  if (title) title = title[0]!.toUpperCase() + title.slice(1);

  return { title, kind, date, time, durationMin, online: !!on, withName, parts };
}
