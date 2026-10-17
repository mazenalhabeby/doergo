/** What a logbook entry may hold, judged once for every screen and the server. */
import {
  COST_LOG_KEY,
  findMoneyCategory,
  type KindLogField,
  type KindLogType,
  type KindShape,
} from '../../access/asset-kind-shape';

// ─────────────────────────────────────────────────────────────────────────────
// Values
// ─────────────────────────────────────────────────────────────────────────────

/** What one entry's answers are stored as: keyed by FIELD KEY, never by label. */
export type LogValues = Record<string, string | number>;

export type LogValueProblem =
  | { key: string; code: 'required' }
  | { key: string; code: 'not-a-number' }
  | { key: string; code: 'out-of-range' }
  | { key: string; code: 'not-a-date' }
  | { key: string; code: 'not-an-option' }
  | { key: string; code: 'too-long' };

export interface ValidatedLogEntry {
  ok: boolean;
  problems: LogValueProblem[];
  /** Cleaned values — only fields the type declares, photos and money excluded. */
  values: LogValues;
  /** Meter readings in this entry, by meter key — what the asset's "latest" is made of. */
  readings: Record<string, number>;
  /** From the money field. 0 when the type has none or it was left blank. */
  amountCents: number;
  direction: 'IN' | 'OUT';
  /** The ledger heading: the Cost category chosen, else the type's own label. */
  category: string;
}

const MAX_TEXT = 500;

/** No real meter or quantity is this large, and a bigger number is a typo that would poison a due date. */
const MAX_NUMBER = 1_000_000_000;

/** €10M. Anything more is not something typed at a pump. */
const MAX_CENTS = 1_000_000_000;

/**
 * A number from what a person typed: "86 412", "12,5", "1.234,50".
 *
 * The same forgiveness a receipt reader needs, because the same people type
 * both. A comma followed by exactly 1–2 digits at the end is a decimal comma;
 * any other comma or space is a thousands separator.
 */
export function readLogNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  let s = raw.trim().replace(/[\s\u00a0\u202f']/g, '');
  if (!s) return null;
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  // "86.412" on a German odometer is eighty-six thousand, not eighty-six.
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  else s = s.replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const blank = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/**
 * Check an entry's answers against its type.
 *
 * @param raw       what arrived, keyed by field key
 * @param hasPhoto  whether a photograph came with it — photos travel as an
 *                  uploaded object key beside the values, never inside them
 * @param shape     the kind, for the Cost log's categories
 *
 * Unknown keys are DROPPED, not refused: a phone built against yesterday's
 * version of the kind should still file what the kind still asks for.
 */
export function validateLogValues(
  type: KindLogType,
  raw: unknown,
  opts: { hasPhoto?: boolean; shape?: KindShape } = {},
): ValidatedLogEntry {
  const src = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const problems: LogValueProblem[] = [];
  const values: LogValues = {};
  const readings: Record<string, number> = {};
  let amountCents = 0;
  let direction: 'IN' | 'OUT' = 'OUT';
  let category = type.label;

  for (const field of type.fields) {
    const v = src[field.key];

    if (field.type === 'photo') {
      if (field.required && !opts.hasPhoto) problems.push({ key: field.key, code: 'required' });
      continue;
    }

    if (blank(v)) {
      if (field.required) problems.push({ key: field.key, code: 'required' });
      continue;
    }

    switch (field.type) {
      case 'text': {
        const s = String(v).trim();
        if (s.length > MAX_TEXT) problems.push({ key: field.key, code: 'too-long' });
        else values[field.key] = s;
        break;
      }
      case 'number': {
        const n = readLogNumber(v);
        if (n === null) problems.push({ key: field.key, code: 'not-a-number' });
        // A meter never runs backwards past zero, and a negative litre is a typo.
        else if (n < 0 || n > MAX_NUMBER) problems.push({ key: field.key, code: 'out-of-range' });
        else {
          values[field.key] = n;
          if (field.meter) readings[field.key] = n;
        }
        break;
      }
      case 'date': {
        const s = String(v).trim();
        // A calendar day, not an instant: the day on a sticker has no time zone.
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
        const d = m ? new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!)) : null;
        if (!d || d.getUTCMonth() !== +m![2]! - 1) problems.push({ key: field.key, code: 'not-a-date' });
        else values[field.key] = s;
        break;
      }
      case 'choice': {
        const want = String(v).trim().toLowerCase();
        // Stored as the option's own spelling, so "diesel" typed and "Diesel" offered are one answer.
        const hit = (field.options ?? []).find((o) => o.toLowerCase() === want);
        if (!hit) problems.push({ key: field.key, code: 'not-an-option' });
        else values[field.key] = hit;
        break;
      }
      case 'money': {
        const n = typeof v === 'number' ? v : readLogNumber(v);
        // Cents, positive: the direction beside it decides the sign, exactly as the ledger stores it.
        const cents = n === null ? null : Math.abs(Math.round(n));
        if (cents === null) problems.push({ key: field.key, code: 'not-a-number' });
        else if (cents > MAX_CENTS) problems.push({ key: field.key, code: 'out-of-range' });
        else if (cents === 0 && field.required) problems.push({ key: field.key, code: 'required' });
        else {
          amountCents = cents;
          direction = field.direction === 'in' ? 'IN' : 'OUT';
        }
        break;
      }
    }
  }

  /*
    The Cost log's heading decides its direction — Rent comes IN on the same
    form that files a repair going OUT. Every other type files under its own
    label, so a report by heading reads "Fuel", "Oil change" without a mapping.
  */
  if (type.key === COST_LOG_KEY && typeof values.category === 'string') {
    const cat = opts.shape ? findMoneyCategory(opts.shape, values.category) : null;
    category = cat?.label ?? values.category;
    if (cat) direction = cat.direction === 'in' ? 'IN' : 'OUT';
  }

  return { ok: problems.length === 0, problems, values, readings, amountCents, direction, category };
}

/** The meter fields a type records — what its entries can move. */
export function meterFields(type: KindLogType): KindLogField[] {
  return type.fields.filter((f) => f.type === 'number' && f.meter);
}

/**
 * Every meter the kind knows, once each: `odometer` in Fuel and in Service is
 * one reading. The first type to declare it names its label and unit.
 */
export function kindMeters(types: KindLogType[]): Array<{ key: string; label: string; unit?: string }> {
  const seen = new Map<string, { key: string; label: string; unit?: string }>();
  for (const t of types) for (const f of meterFields(t)) if (!seen.has(f.key)) seen.set(f.key, { key: f.key, label: f.label, unit: f.unit });
  return [...seen.values()];
}
