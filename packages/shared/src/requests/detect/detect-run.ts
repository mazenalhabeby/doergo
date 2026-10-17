/** Moved here unchanged from request-detect.ts. */
import {
  AFTER_TOMORROW,
  AMBIGUOUS_SHORT,
  HOUR_UNITS,
  KIND_WORDS,
  LEAVE_TYPE_WORDS,
  MINUTE_UNITS,
  MONTHS,
  NEXT,
  NEXT_WEEK,
  NUMBER_WORDS,
  TODAY,
  TOMORROW,
  WEEKDAYS,
  escape,
  find,
  firstOf,
  type DetectedKind,
  type DetectedRequest,
} from './detect-words';

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
  x.setDate(x.getDate() + n);
  return x;
}

const mondayIndex = (d: Date) => (d.getDay() + 6) % 7;

/** Every weekday named, in the order written, with whether "next" stands before it. */
function weekdaysIn(text: string): Array<{ dow: number; next: boolean; at: number }> {
  const out: Array<{ dow: number; next: boolean; at: number }> = [];
  WEEKDAYS.forEach((names, dow) => {
    for (const name of names) {
      const re = new RegExp(`(?<![\\p{L}])${escape(name)}(?![\\p{L}])`, 'gu');
      for (const m of text.matchAll(re)) {
        if (
          AMBIGUOUS_SHORT.has(name) &&
          !/\d|next|nächste|am |on /u.test(
            text.slice(Math.max(0, (m.index ?? 0) - 6), (m.index ?? 0) + name.length + 6),
          )
        )
          continue;
        const before = text.slice(Math.max(0, (m.index ?? 0) - 16), m.index);
        out.push({ dow, next: NEXT.some((w) => find(before, w)), at: m.index ?? 0 });
      }
    }
  });
  // One mention per position (a long and a short name can both match the same word).
  return out.sort((a, b) => a.at - b.at).filter((x, i, a) => i === 0 || a[i - 1]!.at !== x.at);
}

/**
 * The day a weekday names: the coming one (today counts) — or, with "next",
 * that day in NEXT week, the same way "next week" is read. The member sees the
 * dates on the form before anything is sent.
 */
function resolveWeekday(today: Date, dow: number, next: boolean): Date {
  if (next) return addDays(today, 7 - mondayIndex(today) + dow);
  return addDays(today, (dow - mondayIndex(today) + 7) % 7);
}

/** "20.10", "20/10", "20.10.2026", "Oct 20", "20 Oct", "20. Oktober" — the coming one when no year. */
function explicitDates(text: string, today: Date): Date[] {
  const out: Array<{ at: number; d: Date }> = [];
  const coming = (day: number, month: number, year?: number) => {
    const y = year ?? today.getFullYear();
    let d = new Date(y < 100 ? 2000 + y : y, month, day, 12);
    if (!year && d < addDays(today, 0)) d = new Date(d.getFullYear() + 1, month, day, 12);
    return d.getMonth() === month && d.getDate() === day ? d : null;
  };
  for (const m of text.matchAll(/(?<!\d)(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?!\d)/g)) {
    const d = coming(+m[1]!, +m[2]! - 1, m[3] ? +m[3] : undefined);
    if (d) out.push({ at: m.index ?? 0, d });
  }
  MONTHS.forEach((names, month) => {
    for (const name of names) {
      const n = escape(name);
      for (const m of text.matchAll(
        new RegExp(`(?<!\\d)(\\d{1,2})\\.?\\s+${n}(?![\\p{L}])|(?<![\\p{L}])${n}\\.?\\s+(\\d{1,2})(?!\\d)`, 'gu'),
      )) {
        const d = coming(+(m[1] ?? m[2])!, month);
        if (d) out.push({ at: m.index ?? 0, d });
      }
    }
  });
  return out.sort((a, b) => a.at - b.at).map((x) => x.d);
}

/** Hours or minutes asked for: "2 hours", "90 min", "1.5h", "zwei Stunden", "half an hour". */
function durationIn(text: string): number | undefined {
  const num = `(\\d+(?:[.,]\\d+)?|${Object.keys(NUMBER_WORDS).join('|')})`;
  const unit = (units: string[]) => units.map(escape).join('|');
  const read = (s: string) => NUMBER_WORDS[s] ?? Number(s.replace(',', '.'));
  const h = text.match(
    new RegExp(`(?<![\\p{L}\\d])${num}\\s*(?:more\\s+|extra\\s+|mehr\\s+)?(?:${unit(HOUR_UNITS)})(?![\\p{L}])`, 'u'),
  );
  const m = text.match(
    new RegExp(`(?<![\\p{L}\\d])${num}\\s*(?:more\\s+|extra\\s+)?(?:${unit(MINUTE_UNITS)})(?![\\p{L}])`, 'u'),
  );
  let minutes = 0;
  if (h) minutes += Math.round(read(h[1]!) * 60);
  if (m) minutes += Math.round(read(m[1]!));
  if (!minutes && /half an hour|halbe stunde|media hora|demi-heure|mezz'ora|mezzora/u.test(text)) minutes = 30;
  return minutes > 0 ? minutes : undefined;
}

/** A clock time: "at 10", "10:30", "um 9", "a las 10", "à 10h", "alle 10", "10am". */
function timeIn(text: string): string | undefined {
  const m =
    text.match(/(?<!\d)(\d{1,2})[:h.](\d{2})(?!\d)/u) ??
    text.match(/(?:at|um|ab|a las|à|alle|from|bis)\s+(\d{1,2})(?:\s*(am|pm|uhr|h))?(?!\d)/u) ??
    text.match(/(?<!\d)(\d{1,2})\s*(am|pm|uhr)(?![\p{L}])/u);
  if (!m) return undefined;
  let hour = +m[1]!;
  const minute = m[2] && /^\d{2}$/.test(m[2]) ? +m[2] : 0;
  const suffix = m[2] && !/^\d{2}$/.test(m[2]) ? m[2] : m[3];
  if (suffix === 'pm' && hour < 12) hour += 12;
  if (hour > 23 || minute > 59) return undefined;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** An amount of money: "84 euro", "€84", "84,50 €", "$12", "12 dollars". */
function amountIn(text: string): number | undefined {
  const m =
    text.match(/(?:€|\$|£|eur|usd)\s*(\d+(?:[.,]\d{1,2})?)/u) ??
    text.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:€|\$|£|euro|euros|eur|dollar|dollars|usd|pounds|franken|chf)(?![\p{L}])/u);
  if (!m) return undefined;
  const value = Number(m[1]!.replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : undefined;
}

/** Number of days asked: "2 days", "3 Tage", "dos días". */
function dayCountIn(text: string): number | undefined {
  const num = `(\\d+|${Object.keys(NUMBER_WORDS).join('|')})`;
  const m = text.match(
    new RegExp(`(?<![\\p{L}\\d])${num}\\s+(?:days?|tage?n?|días|dias|jours?|giorni|giorno)(?![\\p{L}])`, 'u'),
  );
  if (!m) return undefined;
  const n = NUMBER_WORDS[m[1]!] ?? Number(m[1]);
  return n >= 1 && n <= 60 ? Math.round(n) : undefined;
}

/**
 * Read a request. `now` is the member's own clock (their day). Null when the
 * words name no kind — the form stays as it was.
 */
export function detectRequest(input: string, now: Date = new Date()): DetectedRequest | null {
  const text = (input ?? '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 500);
  if (text.length < 3) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);

  const because: string[] = [];
  let kind: DetectedKind | null = null;
  const amount = amountIn(text);
  for (const [k, words] of KIND_WORDS) {
    const hit = firstOf(text, words);
    // An amount of money with no other kind word is an expense on its own.
    if (hit) {
      kind = k;
      because.push(hit);
      break;
    }
  }
  if (!kind && amount != null) kind = 'EXPENSE';
  if (!kind) return null;

  const out: DetectedRequest = { kind, because };

  // ── When ──
  const explicit = explicitDates(text, today);
  const weekdays = weekdaysIn(text);
  let start: Date | undefined;
  let end: Date | undefined;
  if (firstOf(text, AFTER_TOMORROW)) {
    start = addDays(today, 2);
    because.push(firstOf(text, AFTER_TOMORROW)!);
  } else if (firstOf(text, TOMORROW)) {
    start = addDays(today, 1);
    because.push(firstOf(text, TOMORROW)!);
  } else if (firstOf(text, TODAY)) {
    start = today;
    because.push(firstOf(text, TODAY)!);
  }
  if (explicit.length) {
    start = explicit[0];
    end = explicit.length > 1 ? explicit[explicit.length - 1] : undefined;
  } else if (weekdays.length) {
    const anyNext = weekdays.some((w) => w.next);
    const days = weekdays.map((w) => resolveWeekday(today, w.dow, w.next || anyNext));
    // "Thursday and Friday" read as one stretch, never backwards.
    const first = days[0]!;
    const fixed = days.map((d) => (d < first ? addDays(d, 7) : d));
    start = fixed[0];
    end = fixed.length > 1 ? fixed[fixed.length - 1] : undefined;
  } else if (firstOf(text, NEXT_WEEK)) {
    start = addDays(today, 7 - mondayIndex(today));
    end = addDays(start, 4);
  }
  const count = dayCountIn(text);
  if (start && !end && count && count > 1 && kind === 'LEAVE') end = addDays(start, count - 1);
  if (start) out.startDate = dayKey(start);
  if (end && end > start!) out.endDate = dayKey(end);

  // ── What exactly ──
  if (kind === 'LEAVE') {
    for (const [type, words] of LEAVE_TYPE_WORDS) {
      const hit = firstOf(text, words);
      if (hit) {
        out.leaveType = type;
        because.push(hit);
        break;
      }
    }
  }
  if (kind === 'OVERTIME') {
    out.minutes = durationIn(text);
    // Today, more time: that is extra time on the shift, not a day agreed in advance.
    if (
      out.startDate === dayKey(today) ||
      (!out.startDate && /tonight|heute abend|esta noche|ce soir|stasera/u.test(text))
    ) {
      out.kind = 'EXTRA_TIME';
      out.startDate = dayKey(today);
    }
  }
  if (kind === 'HOURS') {
    const time = timeIn(text);
    const leaving = /leave|finish|go home|gehen|aufhören|salir|irme|partir|finir|uscire|andare/u.test(text);
    if (time) {
      if (leaving) out.endTime = time;
      else out.startTime = time;
    }
  }
  if (kind === 'EXPENSE' && amount != null) out.amountCents = amount;
  return out;
}
