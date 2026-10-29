/**
 * Which days are days off — for a workspace, and for one person.
 *
 * Three layers, the most specific one wins:
 *
 *   organization weekend  →  workspace weekend (when it sets one)  →  the person's own schedule
 *
 * plus public holidays from the workspace's country/region (or the organization's), and the
 * organization's own company days. Every surface that counts leave or shades a calendar asks
 * THIS file, so a vacation request, the manager's drawer, the wallchart and the phone cannot
 * disagree about whether Friday is a working day in Riyadh.
 *
 * Everything here is pure: the caller fetches the settings and the holiday list, this decides.
 */
import {
  type DateKey,
  type Dow,
  dowOf,
  eachDay,
  isRosteredOn,
  hasRota,
  rotaDecidesDay,
  type CoverPerson,
} from '../attendance/cover';

/** Saturday and Sunday — what an organization has until it says otherwise. 0 = Sunday … 6 = Saturday. */
export const DEFAULT_WEEKEND: readonly Dow[] = [6, 0];

/**
 * Read a weekend from user input. Days are 0 (Sunday) … 6 (Saturday), unique.
 * At least one working day must remain — a seven-day weekend would make every leave request cost
 * nothing. `[]` is allowed and means "no weekend set here" (inherit) where the caller permits it.
 * Anything else is refused (null), never silently repaired.
 */
export function parseWeekendDays(input: unknown): number[] | null {
  if (!Array.isArray(input)) return null;
  const out = new Set<number>();
  for (const v of input) {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 6) return null;
    out.add(v);
  }
  if (out.size > 6) return null;
  return [...out].sort((a, b) => a - b);
}

/** The weekend in force: the workspace's own when it set one, else the organization's, else Sat+Sun. */
export function resolveWeekend(orgWeekend: readonly number[] | null | undefined, spaceWeekend?: readonly number[] | null): Dow[] {
  if (spaceWeekend && spaceWeekend.length) return [...spaceWeekend] as Dow[];
  if (orgWeekend && orgWeekend.length) return [...orgWeekend] as Dow[];
  return [...DEFAULT_WEEKEND];
}

/** One holiday on one day, after multi-day holidays have been expanded. */
export interface HolidayDay {
  day: DateKey;
  key: string;
  name: string;
  /** PUBLIC from the country's list; COMPANY added by the organization. */
  kind: 'PUBLIC' | 'COMPANY';
  /** Half a day off — costs half a leave day when it falls on a working day. */
  halfDay: boolean;
  /** A moon-sighted date nobody has confirmed yet. */
  estimated: boolean;
}

/** Everything that decides a day in one place (a workspace, or the organization). */
export interface DayRules {
  /** Rest days of the week. For several places: only the days that rest in ALL of them. */
  weekend: ReadonlySet<number>;
  /** Holidays. For several places: only the days that are a holiday in ALL of them. */
  holidays: ReadonlyMap<DateKey, HolidayDay>;
  /**
   * Several places (intersectDayRules): each one's own rules, so a day is decided PER DAY —
   * `weekend` and `holidays` above alone cannot say that Fri 25 Dec is off in Vienna (holiday)
   * AND in Riyadh (weekend).
   */
  places?: readonly DayRules[];
}

export function makeDayRules(weekend: readonly number[], holidays: Iterable<HolidayDay>): DayRules {
  const map = new Map<DateKey, HolidayDay>();
  for (const h of holidays) {
    const prev = map.get(h.day);
    // Two holidays on one day: a full day beats a half day.
    if (!prev || (prev.halfDay && !h.halfDay)) map.set(h.day, h);
  }
  return { weekend: new Set(weekend), holidays: map };
}

/**
 * Somebody who works in several workspaces: a day is OFF for them only when it is off in every
 * one of them. The opposite (off anywhere = off) would let a person in Vienna and Riyadh count
 * Friday, Saturday AND Sunday as weekend and take a week of leave for three days.
 */
export function intersectDayRules(list: readonly DayRules[]): DayRules {
  if (list.length === 0) return makeDayRules(DEFAULT_WEEKEND, []);
  if (list.length === 1) return list[0]!;
  const weekend = new Set<number>([...list[0]!.weekend].filter((d) => list.every((r) => r.weekend.has(d))));
  const holidays = new Map<DateKey, HolidayDay>();
  for (const [day, h] of list[0]!.holidays) {
    const all = list.map((r) => r.holidays.get(day));
    if (all.every(Boolean)) holidays.set(day, all.some((x) => x!.halfDay) ? { ...h, halfDay: true } : h);
  }
  return { weekend, holidays, places: list.flatMap((r) => r.places ?? [r]) };
}

/**
 * The person layer. When somebody has a rota or a working week, THAT decides whether they work
 * a day (a member who works Sunday to Thursday in a Sat+Sun workspace). Without one, undefined —
 * the place's weekend decides. Same precedence as cover, by construction: it calls cover.
 * A day no rota rule reaches (and no working week) is undefined too: the places decide it, day
 * by day, rather than one weekend standing in for all of them.
 */
export type RosterFn = (day: DateKey) => boolean | undefined;

export function personRoster(p: CoverPerson | null | undefined): RosterFn | undefined {
  if (!p || !hasRota(p)) return undefined;
  return (day) => (rotaDecidesDay(p, day) ? isRosteredOn(p, day) : undefined);
}

export type DayKind = 'work' | 'weekend' | 'off-rota' | 'holiday' | 'half-holiday';

/**
 * What a day is, for this place (and this person, when given). Several places decide per day:
 * work anywhere = work; else half a holiday anywhere = half; else off (a holiday when any place
 * is closed for one, so it is named).
 */
export function dayKind(day: DateKey, rules: DayRules, roster?: RosterFn): DayKind {
  if (rules.places?.length) return combinedKind(rules.places.map((p) => dayKind(day, p, roster)));
  const r = roster?.(day);
  const working = r === undefined ? !rules.weekend.has(dowOf(day)) : r;
  if (!working) return r === false ? 'off-rota' : 'weekend';
  const h = rules.holidays.get(day);
  if (h) return h.halfDay ? 'half-holiday' : 'holiday';
  return 'work';
}

function combinedKind(kinds: DayKind[]): DayKind {
  for (const k of ['work', 'half-holiday', 'holiday', 'off-rota'] as const) if (kinds.includes(k)) return k;
  return 'weekend';
}

/** The holiday that makes this day a (half) holiday for these rules — the name a count shows. */
export function holidayOn(day: DateKey, rules: DayRules, roster?: RosterFn): HolidayDay | undefined {
  if (!rules.places?.length) return rules.holidays.get(day);
  const kind = dayKind(day, rules, roster);
  for (const p of rules.places) if (dayKind(day, p, roster) === kind) return p.holidays.get(day);
  return undefined;
}

/** What one day of leave costs: a working day 1, a half holiday ½, anything else nothing. */
export function leaveCostOf(kind: DayKind): 0 | 0.5 | 1 {
  return kind === 'work' ? 1 : kind === 'half-holiday' ? 0.5 : 0;
}

export interface LeaveDay {
  day: DateKey;
  kind: DayKind;
  cost: 0 | 0.5 | 1;
  holiday?: string;
}

export interface LeaveCount {
  calendarDays: number;
  /** What the request costs the allowance. Halves are possible. */
  counted: number;
  /** Rest days inside the range (weekend, or not on the person's rota). */
  restDays: number;
  /** Holidays that fall on what would otherwise be a working day. */
  holidays: { day: DateKey; name: string; halfDay: boolean; estimated: boolean }[];
  /** Counted days per calendar year — a request over New Year draws on two allowances. */
  byYear: Record<string, number>;
  days: LeaveDay[];
}

/** The longest range a single count will walk. A leave request is far shorter; this is a guard. */
export const LEAVE_COUNT_MAX_DAYS = 400;

/**
 * Count a leave range the way the allowance should be charged: weekends, rota rest days and
 * public holidays cost nothing, a half holiday costs half. Inclusive at both ends.
 */
export function countLeave(from: DateKey, to: DateKey, rules: DayRules, roster?: RosterFn): LeaveCount {
  const days: LeaveDay[] = [];
  const byYear: Record<string, number> = {};
  const holidays: LeaveCount['holidays'] = [];
  let counted = 0;
  let restDays = 0;
  for (const day of eachDay(from, to, LEAVE_COUNT_MAX_DAYS)) {
    const kind = dayKind(day, rules, roster);
    const cost = leaveCostOf(kind);
    const h = holidayOn(day, rules, roster);
    if (kind === 'weekend' || kind === 'off-rota') restDays++;
    if ((kind === 'holiday' || kind === 'half-holiday') && h) {
      holidays.push({ day, name: h.name, halfDay: h.halfDay, estimated: h.estimated });
    }
    counted += cost;
    if (cost) byYear[day.slice(0, 4)] = (byYear[day.slice(0, 4)] ?? 0) + cost;
    days.push({ day, kind, cost, ...(h && (kind === 'holiday' || kind === 'half-holiday') ? { holiday: h.name } : {}) });
  }
  return { calendarDays: days.length, counted, restDays, holidays, byYear, days };
}
