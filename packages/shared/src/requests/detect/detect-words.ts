/** Moved here unchanged from request-detect.ts. */
import type { LeaveType } from '../request-kinds';

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
  [
    'EXPENSE',
    W(
      'fuel|petrol|diesel|receipt|parking|toll|tank|tanken|benzin|quittung' +
        '|beleg|parken|maut|gasolina|recibo|aparcamiento|peaje|carburant' +
        '|essence|reçu|péage|stationnement|carburante|benzina|scontrino' +
        '|ricevuta|pedaggio|parcheggio|expense|ausgabe|gasto|dépense|spesa',
    ),
  ],
  [
    'REMOTE',
    W(
      'work from home|working from home|home office|homeoffice|remote|wfh|von ' +
        'zuhause|von zu hause|im homeoffice|desde casa|teletrabajo|en ' +
        'remoto|télétravail|depuis la maison|à distance|da casa|smart ' +
        'working|lavoro da remoto',
    ),
  ],
  [
    'OVERTIME',
    W(
      'overtime|extra hours|more hours|stay longer|stay late|work ' +
        'late|überstunden|mehrstunden|länger bleiben|länger arbeiten|horas ' +
        'extra|quedarme más|trabajar más|heures supplémentaires|heures sup|rester ' +
        'plus tard|rester plus|straordinari|ore extra|restare di più|fermarmi di ' +
        'più',
    ),
  ],
  [
    'HOURS',
    W(
      'start later|come in later|come in late|leave early|leave earlier|finish ' +
        'early|go home early|später anfangen|später kommen|früher gehen|früher ' +
        'aufhören|llegar tarde|empezar más tarde|salir antes|irme antes|arriver ' +
        'plus tard|commencer plus tard|partir plus tôt|finir plus tôt|entrare più ' +
        'tardi|iniziare più tardi|uscire prima|andare via prima',
    ),
  ],
  [
    'LEAVE',
    W(
      'day off|days off|time ' +
        'off|leave|holiday|holidays|vacation|sick|ill|frei|freien tag|freie ' +
        'tage|urlaub|krank|krankenstand|día libre|días ' +
        'libres|vacaciones|enfermo|enferma|baja|permiso|congé|congés|vacances|jour ' +
        'de repos|malade|giorno libero|giorni liberi|ferie|malato|malata|permesso',
    ),
  ],
];

const LEAVE_TYPE_WORDS: Array<[LeaveType, string[]]> = [
  [
    'SICK',
    W(
      'sick|ill|doctor|fever|krank|arzt|fieber|enfermo|enferma|médico|fiebre|malade|médecin|fièvre|malato|malata|medico|febbre',
    ),
  ],
  [
    'FAMILY',
    W(
      'wedding|funeral|child|children|kid|kids|daughter|son|family|baby|birth' +
        '|hochzeit|beerdigung|kind|kinder|tochter|sohn|familie|geburt|boda' +
        '|funeral|hijo|hija|hijos|familia|nacimiento|mariage|enterrement|enfant' +
        '|enfants|fille|fils|famille|naissance|matrimonio|funerale|figlio' +
        '|figlia|figli|famiglia|nascita',
    ),
  ],
  ['VACATION', W('vacation|holiday|holidays|urlaub|vacaciones|vacances|ferie')],
];

const TODAY = W(
  "today|tonight|this evening|heute|heute abend|hoy|esta noche|aujourd'hui|aujourd’hui|ce soir|oggi|stasera",
);

const TOMORROW = W('tomorrow|morgen|mañana|demain|domani');

const AFTER_TOMORROW = W('day after tomorrow|übermorgen|pasado mañana|après-demain|dopodomani');

const NEXT = W(
  'next|nächsten|nächste|kommenden|kommende|próximo|próxima|que viene|prochain|prochaine|prossimo|prossima',
);

const NEXT_WEEK = W(
  'next week|nächste woche|kommende woche|la semana que viene|próxima ' +
    'semana|semaine prochaine|la semaine prochaine|settimana prossima|la ' +
    'prossima settimana',
);

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
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  half: 0.5,
  ein: 1,
  eine: 1,
  zwei: 2,
  drei: 3,
  vier: 4,
  fünf: 5,
  halbe: 0.5,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  media: 0.5,
  un: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  demi: 0.5,
  due: 2,
  tre: 3,
  quattro: 4,
  cinque: 5,
  mezza: 0.5,
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A word or phrase, on letter boundaries (Unicode letters, so "ü" and "é" count). */
const find = (text: string, word: string) => new RegExp(`(?<![\\p{L}])${escape(word)}(?![\\p{L}])`, 'u').test(text);

const firstOf = (text: string, words: string[]) => words.find((w) => find(text, w));

export {
  KIND_WORDS,
  LEAVE_TYPE_WORDS,
  TODAY,
  TOMORROW,
  AFTER_TOMORROW,
  NEXT,
  NEXT_WEEK,
  WEEKDAYS,
  AMBIGUOUS_SHORT,
  MONTHS,
  HOUR_UNITS,
  MINUTE_UNITS,
  NUMBER_WORDS,
  escape,
  find,
  firstOf,
};
