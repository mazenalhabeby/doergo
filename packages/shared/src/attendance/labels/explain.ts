import { formatDuration } from '../../utils/date';
import { formatDistance } from '../../utils/distance';
import type { LabelFacts, PositionFact } from './contract';
import { labelWordsFor } from './words';
import type { ExplainWords } from './words';

/**
 * Why an entry carries a label, in one sentence with the numbers — the
 * tooltip on a chip. Built ONLY from what the entry saved when it was judged
 * (`labelFacts`), so it explains the judgement that was made, not a new one.
 *
 * ⚠️ An entry from before the label rules has no facts: the answer is null and
 * the chip shows with no explanation. The past is not touched.
 * ⚠️ Durations are always hours and minutes (`formatDuration`: "4h 48m"), never
 * a pile of minutes. A position is a distance, never a coordinate.
 *
 * The sentences live in `words/` (five languages, one copy); `labelExplanation`
 * returns which sentence and its values, `explainLabel` the finished sentence.
 */
export interface LabelExplanation {
  key: string;
  params: Record<string, string>;
}

export interface ExplainContext {
  /** The entry's own clock times — the moments the shift is compared with. */
  clockInAt?: string | Date | null;
  clockOutAt?: string | Date | null;
  /** The zone the entry was clocked in (its workspace's), so "18:00" means the site's 18:00. */
  timeZone?: string | null;
  /** The reader's language, for numbers and distances. */
  locale?: string | null;
  hour12?: boolean;
}

const minutesBetween = (a: string | Date, b: string | Date) =>
  Math.round((new Date(a).getTime() - new Date(b).getTime()) / 60000);

function clock(at: string, ctx: ExplainContext): string {
  try {
    return new Intl.DateTimeFormat(ctx.locale || 'en', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: ctx.hour12 ?? false,
      timeZone: ctx.timeZone || undefined,
    }).format(new Date(at));
  } catch {
    return new Date(at).toISOString().slice(11, 16);
  }
}

function position(fact: PositionFact | undefined, ctx: ExplainContext): LabelExplanation | null {
  if (!fact) return null;
  if (!fact.judged) return { key: `notJudged.${fact.notJudgedBecause ?? 'NO_FIX'}`, params: {} };
  const params: Record<string, string> = { distance: formatDistance(fact.metresOutside ?? 0, { locale: ctx.locale }) };
  if (fact.accuracyM == null) return { key: 'outside', params };
  return {
    key: 'outsideWithAccuracy',
    params: { ...params, accuracy: formatDistance(fact.accuracyM, { locale: ctx.locale }) },
  };
}

/** The explanation for one label on one entry, or null when there is nothing saved to explain it with. */
export function labelExplanation(
  code: string,
  facts: LabelFacts | null | undefined,
  ctx: ExplainContext = {},
): LabelExplanation | null {
  if (!facts) return null;
  const shift = facts.shift;
  const grace = shift ? formatDuration(shift.toleranceMin) : '';
  switch (code) {
    case 'LATE_ARRIVAL': {
      if (!shift || !ctx.clockInAt) return null;
      const params = {
        late: formatDuration(minutesBetween(ctx.clockInAt, shift.expectedStartAt)),
        start: clock(shift.expectedStartAt, ctx),
        grace,
        shift: shift.name ?? '',
      };
      return { key: shift.name ? 'late' : 'lateNoName', params };
    }
    case 'LATE_FROM_REST': {
      if (!facts.rest || !shift) return null;
      const { plannedMin, takenMin, overMin } = facts.rest;
      const params = {
        taken: formatDuration(takenMin),
        planned: formatDuration(plannedMin),
        over: formatDuration(overMin),
      };
      return { key: 'lateFromRest', params: { ...params, grace } };
    }
    case 'EARLY_DEPARTURE':
    case 'OVERTIME':
    case 'PAST_DAILY_LIMIT': {
      if (!shift?.expectedEndAt || !ctx.clockOutAt) return null;
      const diff = Math.abs(minutesBetween(ctx.clockOutAt, shift.expectedEndAt));
      const key = code === 'EARLY_DEPARTURE' ? 'earlyDeparture' : code === 'OVERTIME' ? 'overtime' : 'pastDailyLimit';
      return { key, params: { minutes: formatDuration(diff), end: clock(shift.expectedEndAt, ctx), grace } };
    }
    case 'UNSCHEDULED_DAY':
      return shift ? null : { key: 'unscheduled', params: {} };
    case 'MISSED_CLOCK_OUT':
    case 'CLOCK_OUT_PROVISIONAL': {
      if (!facts.closedHow) return null;
      const at = ctx.clockOutAt ? clock(new Date(ctx.clockOutAt).toISOString(), ctx) : '';
      return { key: `closed.${facts.closedHow}`, params: { time: at } };
    }
    case 'OUTSIDE_GEOFENCE_IN':
      return position(facts.clockIn, ctx);
    case 'OUTSIDE_GEOFENCE_OUT':
      return position(facts.clockOut, ctx);
    case 'BOUNDARY_CHANGED':
      return facts.boundaryChangedSinceTap ? { key: 'boundaryChanged', params: {} } : null;
    default:
      return null;
  }
}

/** Look a dotted key (`closed.LEFT_SITE`) up in one language's sentences. */
function sentence(words: ExplainWords, key: string): string | null {
  const found = key
    .split('.')
    .reduce<unknown>((at, part) => (at as Record<string, unknown> | undefined)?.[part], words);
  return typeof found === 'string' ? found : null;
}

/**
 * The finished sentence in the reader's language (`ctx.locale`), or null when
 * the entry saved nothing to explain this label with — show the chip alone.
 */
export function explainLabel(
  code: string,
  facts: LabelFacts | null | undefined,
  ctx: ExplainContext = {},
): string | null {
  const found = labelExplanation(code, facts, ctx);
  if (!found) return null;
  const template = sentence(labelWordsFor(ctx.locale).explain, found.key);
  if (!template) return null;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => found.params[name] ?? '');
}
