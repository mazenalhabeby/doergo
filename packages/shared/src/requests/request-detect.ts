import type { LeaveType } from './request-kinds';

/**
 * WHAT IS BEING ASKED, from the member's own words — on the phone, offline, no
 * AI service. Words in the five app languages decide the kind; dates, times,
 * minutes and an amount are read where they are written. The member ALWAYS
 * confirms: this only fills a form, it never sends anything.
 *
 *   "Need 2 days off next Thursday and Friday for my daughter's wedding"
 *        → LEAVE · FAMILY · Thu–Fri
 *   "can I stay 2 more hours tonight"   → EXTRA_TIME · today · 120 min
 *   "fuel 84 euro for the van"          → EXPENSE · €84
 *   "working from home tomorrow"        → REMOTE · tomorrow
 *   "start at 10 on Monday, doctor"     → HOURS · Mon · 10:00
 *
 * Built to be WRONG CHEAPLY: a miss leaves the form as it was ("Other"); a
 * suggestion is shown, never applied, so a false one costs one glance.
 */
export type DetectedKind = 'LEAVE' | 'REMOTE' | 'HOURS' | 'OVERTIME' | 'EXTRA_TIME' | 'EXPENSE';

export interface DetectedRequest {
  kind: DetectedKind;
  leaveType?: LeaveType;
  /** YYYY-MM-DD, the member's own day. */
  startDate?: string;
  endDate?: string;
  /** HH:MM */
  startTime?: string;
  endTime?: string;
  minutes?: number;
  amountCents?: number;
  /** The words that decided it — shown, so the member sees why. */
  because: string[];
}

const W = (s: string) => s.split('|');

/** Kind words. Longer phrases first; matched on word boundaries over the lower-cased text. */
const KIND_WORDS: Array<[DetectedKind, string[]]> = [
  ['EXPENSE', W('fuel|petrol|diesel|receipt|parking|toll|tank|tanken|benzin|quittung|beleg|parken|maut|gasolina|recibo|aparcamiento|peaje|carburant|essence|reçu|péage|stationnement|carburante|benzina|scontrino|ricevuta|pedaggio|parcheggio|expense|ausgabe|gasto|dépense|spesa')],
  ['REMOTE', W('work from home|working from home|home office|homeoffice|remote|wfh|von zuhause|von zu hause|im homeoffice|desde casa|teletrabajo|en remoto|télétravail|depuis la maison|à distance|da casa|smart working|lavoro da remoto')],
  ['OVERTIME', W('overtime|extra hours|more hours|stay longer|stay late|work late|überstunden|mehrstunden|länger bleiben|länger arbeiten|horas extra|quedarme más|trabajar más|heures supplémentaires|heures sup|rester plus tard|rester plus|straordinari|ore extra|restare di più|fermarmi di più')],
  ['HOURS', W('start later|come in later|come in late|leave early|leave earlier|finish early|go home early|später anfangen|später kommen|früher gehen|früher aufhören|llegar tarde|empezar más tarde|salir antes|irme antes|arriver plus tard|commencer plus tard|partir plus tôt|finir plus tôt|entrare più tardi|iniziare più tardi|uscire prima|andare via prima')],
  ['LEAVE', W('day off|days off|time off|leave|holiday|holidays|vacation|sick|ill|frei|freien tag|freie tage|urlaub|krank|krankenstand|día libre|días libres|vacaciones|enfermo|enferma|baja|permiso|congé|congés|vacances|jour de repos|malade|giorno libero|giorni liberi|ferie|malato|malata|permesso')],
];

const LEAVE_TYPE_WORDS: Array<[LeaveType, string[]]> = [
  ['SICK', W('sick|ill|doctor|fever|krank|arzt|fieber|enfermo|enferma|médico|fiebre|malade|médecin|fièvre|malato|malata|medico|febbre')],
  ['FAMILY', W('wedding|funeral|child|children|kid|kids|daughter|son|family|baby|birth|hochzeit|beerdigung|kind|kinder|tochter|sohn|familie|geburt|boda|funeral|hijo|hija|hijos|familia|nacimiento|mariage|enterrement|enfant|enfants|fille|fils|famille|naissance|matrimonio|funerale|figlio|figlia|figli|famiglia|nascita')],
  ['VACATION', W('vacation|holiday|holidays|urlaub|vacaciones|vacances|ferie')],
];

const TODAY = W("today|tonight|this evening|heute|heute abend|hoy|esta noche|aujourd'hui|aujourd’hui|ce soir|oggi|stasera");
const TOMORROW = W('tomorrow|morgen|mañana|demain|domani');
const AFTER_TOMORROW = W('day after tomorrow|übermorgen|pasado mañana|après-demain|dopodomani');
const NEXT = W('next|nächsten|nächste|kommenden|kommende|próximo|próxima|que viene|prochain|prochaine|prossimo|prossima');
const NEXT_WEEK = W('next week|nächste woche|kommende woche|la semana que viene|próxima semana|semaine prochaine|la semaine prochaine|settimana prossima|la prossima settimana');

/** Monday = 0 … Sunday = 6, in the five languages (full names and common short forms). */
const WEEKDAYS: string[][] = [
  W('monday|mon|montag|mo|lunes|lundi|lunedì|lunedi'),
  W('tuesday|tue|tues|dienstag|di|martes|mardi|martedì|martedi'),
  W('wednesday|wed|mittwoch|mi|miércoles|miercoles|mercredi|mercoledì|mercoledi'),
  W('thursday|thu|thurs|donnerstag|do|jueves|jeudi|giovedì|giovedi'),
  W('friday|fri|freitag|fr|viernes|vendredi|venerdì|venerdi'),
  W('saturday|sat|samstag|sa|sábado|sabado|samedi|sabato'),
  W('sunday|sun|sonntag|so|domingo|dimanche|domenica'),
];
/** Two-letter German short forms collide with words ("so", "do", "mi", "di"): only counted next to a date word. */
const AMBIGUOUS_SHORT = new Set(['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so', 'mon', 'sun', 'sat']);

const MONTHS: string[][] = [
  W('january|jan|januar|jänner|enero|ene|janvier|janv|gennaio|gen'),
  W('february|feb|februar|feber|febrero|février|fevrier|févr|febbraio'),
  W('march|mar|märz|marz|marzo|mars'),
  W('april|apr|abril|avril|aprile'),
  W('may|mai|mayo|maggio|mag'),
  W('june|jun|juni|junio|juin|giugno|giu'),
  W('july|jul|juli|julio|juillet|luglio|lug'),
  W('august|aug|agosto|ago|août|aout'),
  W('september|sep|sept|septiembre|septembre|settembre|set'),
  W('october|oct|oktober|okt|octubre|octobre|ottobre|ott'),
  W('november|nov|noviembre|novembre'),
  W('december|dec|dezember|dez|diciembre|dic|décembre|decembre|dicembre'),
];

const HOUR_UNITS = W('hours|hour|hrs|hr|h|stunden|stunde|std|horas|hora|heures|heure|ore|ora');
const MINUTE_UNITS = W('minutes|minute|mins|min|minuten|minutos|minuti');
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, half: 0.5,
  ein: 1, eine: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, halbe: 0.5,
  uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, media: 0.5,
  un: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, demi: 0.5,
  due: 2, tre: 3, quattro: 4, cinque: 5, mezza: 0.5,
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A word or phrase, on letter boundaries (Unicode letters, so "ü" and "é" count). */
const find = (text: string, word: string) => new RegExp(`(?<![\\p{L}])${escape(word)}(?![\\p{L}])`, 'u').test(text);
const firstOf = (text: string, words: string[]) => words.find((w) => find(text, w));

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
        if (AMBIGUOUS_SHORT.has(name) && !/\d|next|nächste|am |on /u.test(text.slice(Math.max(0, (m.index ?? 0) - 6), (m.index ?? 0) + name.length + 6))) continue;
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
      for (const m of text.matchAll(new RegExp(`(?<!\\d)(\\d{1,2})\\.?\\s+${n}(?![\\p{L}])|(?<![\\p{L}])${n}\\.?\\s+(\\d{1,2})(?!\\d)`, 'gu'))) {
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
  const h = text.match(new RegExp(`(?<![\\p{L}\\d])${num}\\s*(?:more\\s+|extra\\s+|mehr\\s+)?(?:${unit(HOUR_UNITS)})(?![\\p{L}])`, 'u'));
  const m = text.match(new RegExp(`(?<![\\p{L}\\d])${num}\\s*(?:more\\s+|extra\\s+)?(?:${unit(MINUTE_UNITS)})(?![\\p{L}])`, 'u'));
  let minutes = 0;
  if (h) minutes += Math.round(read(h[1]!) * 60);
  if (m) minutes += Math.round(read(m[1]!));
  if (!minutes && /half an hour|halbe stunde|media hora|demi-heure|mezz'ora|mezzora/u.test(text)) minutes = 30;
  return minutes > 0 ? minutes : undefined;
}

/** A clock time: "at 10", "10:30", "um 9", "a las 10", "à 10h", "alle 10", "10am". */
function timeIn(text: string): string | undefined {
  const m = text.match(/(?<!\d)(\d{1,2})[:h.](\d{2})(?!\d)/u)
    ?? text.match(/(?:at|um|ab|a las|à|alle|from|bis)\s+(\d{1,2})(?:\s*(am|pm|uhr|h))?(?!\d)/u)
    ?? text.match(/(?<!\d)(\d{1,2})\s*(am|pm|uhr)(?![\p{L}])/u);
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
  const m = text.match(/(?:€|\$|£|eur|usd)\s*(\d+(?:[.,]\d{1,2})?)/u)
    ?? text.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:€|\$|£|euro|euros|eur|dollar|dollars|usd|pounds|franken|chf)(?![\p{L}])/u);
  if (!m) return undefined;
  const value = Number(m[1]!.replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : undefined;
}

/** Number of days asked: "2 days", "3 Tage", "dos días". */
function dayCountIn(text: string): number | undefined {
  const num = `(\\d+|${Object.keys(NUMBER_WORDS).join('|')})`;
  const m = text.match(new RegExp(`(?<![\\p{L}\\d])${num}\\s+(?:days?|tage?n?|días|dias|jours?|giorni|giorno)(?![\\p{L}])`, 'u'));
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
    if (hit) { kind = k; because.push(hit); break; }
  }
  if (!kind && amount != null) kind = 'EXPENSE';
  if (!kind) return null;

  const out: DetectedRequest = { kind, because };

  // ── When ──
  const explicit = explicitDates(text, today);
  const weekdays = weekdaysIn(text);
  let start: Date | undefined;
  let end: Date | undefined;
  if (firstOf(text, AFTER_TOMORROW)) { start = addDays(today, 2); because.push(firstOf(text, AFTER_TOMORROW)!); }
  else if (firstOf(text, TOMORROW)) { start = addDays(today, 1); because.push(firstOf(text, TOMORROW)!); }
  else if (firstOf(text, TODAY)) { start = today; because.push(firstOf(text, TODAY)!); }
  if (explicit.length) { start = explicit[0]; end = explicit.length > 1 ? explicit[explicit.length - 1] : undefined; }
  else if (weekdays.length) {
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
      if (hit) { out.leaveType = type; because.push(hit); break; }
    }
  }
  if (kind === 'OVERTIME') {
    out.minutes = durationIn(text);
    // Today, more time: that is extra time on the shift, not a day agreed in advance.
    if (out.startDate === dayKey(today) || (!out.startDate && /tonight|heute abend|esta noche|ce soir|stasera/u.test(text))) {
      out.kind = 'EXTRA_TIME';
      out.startDate = dayKey(today);
    }
  }
  if (kind === 'HOURS') {
    const time = timeIn(text);
    const leaving = /leave|finish|go home|gehen|aufhören|salir|irme|partir|finir|uscire|andare/u.test(text);
    if (time) { if (leaving) out.endTime = time; else out.startTime = time; }
  }
  if (kind === 'EXPENSE' && amount != null) out.amountCents = amount;
  return out;
}
