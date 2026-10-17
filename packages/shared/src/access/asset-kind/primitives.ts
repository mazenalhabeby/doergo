/** Small readers the normalizers share: text, booleans, keys, whole numbers in a range. */
import { KIND_SHAPE_LIMITS } from './types';

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const bool = (v: unknown, fallback = false): boolean => (typeof v === 'boolean' ? v : fallback);

/**
 * A stable key from a label: "Öl-Wechsel" → "ol_wechsel".
 *
 * Only ever used when a field or type arrives WITHOUT a key — i.e. the first
 * time it is saved. After that the stored key wins, which is what lets a label
 * change without orphaning the history written under it.
 */
export function logKeyFrom(label: string): string {
  const slug = label
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, KIND_SHAPE_LIMITS.maxLogKey);
  return slug || 'field';
}

const KEY_SHAPE = /^[a-z0-9_]{1,40}$/;

/** A key not already taken: `odometer`, then `odometer_2`. */
function uniqueKey(wanted: string, taken: Set<string>): string {
  let key = wanted;
  for (let n = 2; taken.has(key); n++) key = `${wanted.slice(0, KIND_SHAPE_LIMITS.maxLogKey - 4)}_${n}`;
  taken.add(key);
  return key;
}

/** A whole number within bounds, or null. Never a NaN that compares false to everything. */
const intIn = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r < min || r > max ? null : r;
};

export { str, bool, KEY_SHAPE, uniqueKey, intIn };
