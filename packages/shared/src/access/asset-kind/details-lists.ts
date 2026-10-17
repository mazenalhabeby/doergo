/** A record's detail rows, money categories, lists and links — and what survives a move to another kind. */
import { normalizeKindShape } from './normalize';
import { str } from './primitives';
import {
  KIND_SHAPE_LIMITS,
  type KindColumn,
  type KindList,
  type KindMoneyCategory,
  type KindShape,
  type MoneyDirection,
} from './types';

/** One filled-in row on a record: the field's label and what was entered. */
export interface DetailRow {
  label: string;
  value: string;
}

/**
 * Clean the label/value rows saved against a record.
 *
 * Same trust boundary as the shape: this is JSON off a request. A row with no
 * label is dropped (it would render as a nameless box holding a value nobody
 * can interpret), values are kept even when empty so a prompted-but-unanswered
 * field still shows, and the whole thing is bounded.
 */
export function normalizeDetailRows(raw: unknown): DetailRow[] {
  const rows: DetailRow[] = [];
  const seen = new Set<string>();

  for (const entry of Array.isArray(raw) ? raw : []) {
    if (rows.length >= KIND_SHAPE_LIMITS.maxFields) break;
    const src = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    const label = str(src.label, KIND_SHAPE_LIMITS.maxLabel);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ label, value: str(src.value, 500) });
  }

  return rows;
}

/**
 * The rows to show on a record: every field its kind asks for, in the kind's
 * order, carrying whatever was saved — followed by anything added ad hoc.
 *
 * Built this way so renaming or adding a field on the kind changes every record
 * immediately, without a migration and without losing what was already entered
 * under a field that has since been removed.
 */
export function detailRowsForKind(shape: KindShape, saved: unknown): DetailRow[] {
  const rows = normalizeDetailRows(saved);
  const byLabel = new Map(rows.map((r) => [r.label.toLowerCase(), r]));
  const out: DetailRow[] = [];
  const used = new Set<string>();

  for (const field of shape.fields) {
    const key = field.label.toLowerCase();
    used.add(key);
    out.push({ label: field.label, value: byLabel.get(key)?.value ?? '' });
  }
  for (const row of rows) {
    if (!used.has(row.label.toLowerCase())) out.push(row);
  }
  return out;
}

/** Find a category the kind declares, by name. Case-insensitive. */
export function findMoneyCategory(shape: KindShape, label: string): KindMoneyCategory | null {
  const key = label.trim().toLowerCase();
  return shape.money.categories.find((c) => c.label.toLowerCase() === key) ?? null;
}

/**
 * What an entry is worth to the total: money in counts up, money out counts down.
 *
 * Amounts are stored positive with a direction beside them rather than signed,
 * so a row reads the way somebody would say it out loud — and a total is a
 * deliberate calculation rather than a sum that quietly depends on every sign
 * having been written correctly.
 */
export function signedCents(direction: MoneyDirection, amountCents: number): number {
  const magnitude = Math.abs(Math.round(amountCents));
  return direction === 'in' ? magnitude : -magnitude;
}

/** Find a list the kind declares, by name. Case-insensitive. */
export function findKindList(shape: KindShape, label: string): KindList | null {
  const key = label.trim().toLowerCase();
  return shape.lists.find((l) => l.label.toLowerCase() === key) ?? null;
}

/**
 * Clean one row against the columns its list declares.
 *
 * Values are keyed by COLUMN LABEL, so renaming a column on the kind leaves the
 * old key behind rather than corrupting the row — the renamed column simply
 * reads empty, and the old value is still there if the name is put back. Keys
 * the list no longer declares are dropped from what is shown, not from what is
 * stored, for the same reason detailRowsForKind keeps retired fields.
 */
export function normalizeListRow(list: KindList, raw: unknown): Record<string, string> {
  const src = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const col of list.columns) {
    out[col.label] = str(src[col.label], 500);
  }
  return out;
}

/** True when every column of a row is blank — nothing worth storing. */
export function listRowIsEmpty(values: Record<string, string>): boolean {
  return Object.values(values).every((v) => !v.trim());
}

/** The column that identifies a row of this table, if it has one. */
export function keyColumn(list: KindList): KindColumn | null {
  return list.columns.find((c) => c.type === 'key') ?? null;
}

/** Every column of this table that points at another table. */
export function linkColumns(list: KindList): KindColumn[] {
  return list.columns.filter((c) => c.type === 'link' && c.linkTo);
}

/** A table by name. Case-insensitive, because a link stores the label. */
export function listByLabel(shape: KindShape, label: string): KindList | null {
  const key = (label ?? '').trim().toLowerCase();
  if (!key) return null;
  return shape.lists.find((l) => l.label.toLowerCase() === key) ?? null;
}

/**
 * Tables a link column may point at: any OTHER table that has a key.
 *
 * Self-links are excluded — a row pointing into its own table is a foot-gun
 * with no use case here — and a table with no key cannot be pointed at, because
 * there would be nothing to pick.
 */
export function linkTargets(shape: KindShape, from: KindList): KindList[] {
  return shape.lists.filter((l) => l.label !== from.label && keyColumn(l));
}

/**
 * The rows a record keeps when it moves to a different kind.
 *
 * A kind's fields are its own: "Vehicles" in one workspace asks for Plate,
 * Mileage and Next service; "Fleet" in another asks for Plate and Insurer. Move
 * a van between them and Mileage belongs to nothing — it would go on being
 * displayed as an ad-hoc row, carried from a kind the record has left, and
 * nobody who edits it afterwards would know why it is there.
 *
 * So a move drops what the destination does not ask for. That is a real loss and
 * it is the reason the screen offering the move names the fields first: this
 * function is the consequence, not the decision.
 *
 * Matched on the lowercased label, the same key `normalizeDetailRows` dedupes on
 * — so "Plate" survives a destination that calls it "plate".
 */
export function keepFieldsForKind(details: unknown, kindConfig: unknown): DetailRow[] {
  const wanted = new Set(normalizeKindShape(kindConfig).fields.map((f) => f.label.toLowerCase()));
  return normalizeDetailRows(details).filter((r) => wanted.has(r.label.toLowerCase()));
}

/**
 * What a move would throw away — for the warning, before anybody agrees to it.
 *
 * The same rule read the other way round, so the sentence on screen and the rows
 * actually deleted can never disagree.
 */
export function fieldsDroppedByMove(details: unknown, kindConfig: unknown): string[] {
  const wanted = new Set(normalizeKindShape(kindConfig).fields.map((f) => f.label.toLowerCase()));
  return normalizeDetailRows(details)
    .filter((r) => !wanted.has(r.label.toLowerCase()))
    .map((r) => r.label);
}
