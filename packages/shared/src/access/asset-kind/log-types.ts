/** Reading a kind: its cost log, its log types, its name and holder labels. */
import { COST_LOG_KEY, KIND_SHAPE_LIMITS, type KindLogType, type KindShape } from './types';

/**
 * The built-in log every kind that tracks money has: Cost.
 *
 * It is the ledger that already exists — a heading from the kind's own money
 * categories, an amount, the slip — offered in the same picker as Fuel and
 * Service so a member meets one way of recording things, not two. Derived
 * rather than stored, so the categories stay the one place the headings live.
 *
 * `label` is English and a placeholder: screens translate the `cost` key.
 */
export function costLogType(shape: KindShape): KindLogType | null {
  if (!shape.money.enabled || shape.money.categories.length === 0) return null;
  return {
    key: COST_LOG_KEY,
    label: 'Cost',
    color: 'slate',
    fields: [
      { key: 'category', label: 'Category', type: 'choice', required: true, options: shape.money.categories.map((c) => c.label) },
      { key: 'amount', label: 'Amount', type: 'money', required: true, direction: 'out' },
      { key: 'receipt', label: 'Receipt', type: 'photo', required: false },
    ],
    // Exactly the expense rules: a member's cost waits; the office's counts.
    needsApproval: true,
    holderOnly: true,
    due: null,
  };
}

/** Everything that may be logged against a record of this kind, Cost first. */
export function logTypesForKind(shape: KindShape): KindLogType[] {
  const cost = costLogType(shape);
  return cost ? [cost, ...shape.logTypes] : shape.logTypes;
}

/**
 * A log type by key. `null` and `cost` both mean the ledger — an entry written
 * before the logbook existed carries no key, and it is a cost.
 */
export function findLogType(shape: KindShape, key: string | null | undefined): KindLogType | null {
  if (!key || key === COST_LOG_KEY) return costLogType(shape);
  return shape.logTypes.find((t) => t.key === key) ?? null;
}

/** The label to show for the name box — the kind's own word, else a plain one. */
export function kindNameLabel(shape: KindShape, fallback: string): string {
  return shape.nameLabel || fallback;
}

/**
 * How many holders a record of this kind may have.
 *
 * One number rather than a boolean the callers each interpret: the DTO clamps
 * with it, the service enforces it, and the picker switches on it, so a kind
 * that says "one" cannot be given two by a request that skips the screen.
 */
export function maxHolders(shape: KindShape): number {
  if (!shape.holder.enabled) return 0;
  return shape.holder.multiple ? KIND_SHAPE_LIMITS.maxHolders : 1;
}

/** The label to show for the holder — the kind's own word, else a plain one. */
export function kindHolderLabel(shape: KindShape, fallback: string): string {
  return shape.holder.label || fallback;
}
