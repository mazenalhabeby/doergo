/**
 * What a KIND says its records look like.
 *
 * An apartment record has a name, an address on a map, a resident (a member or
 * a client), and a handful of "more info" rows. A kind lets somebody describe
 * that same shape for whatever THEY own — so a Vehicles kind can call its holder
 * "Driver" and skip the address, and a Boats kind works the day they buy a boat.
 *
 * This is a trust boundary. The config arrives as JSON from a request and is
 * stored as JSON, so nothing downstream may assume it is well formed: every
 * reader goes through `normalizeKindShape`, which returns a complete object no
 * matter what it is handed. Bounds are enforced here rather than at the edge,
 * because a value that skipped validation would otherwise be rendered for every
 * viewer of the space.
 */

export const KIND_SHAPE_LIMITS = {
  /** Enough for a rich record; short enough that the form stays a form. */
  maxFields: 20,
  maxLabel: 60,
  maxHolderLabel: 40,
  /** Enough headings to be useful; few enough that a total stays readable. */
  maxMoneyCategories: 20,
  /** Tables per kind. More than a handful is a sign it wants its own module. */
  maxLists: 5,
  /** Columns per table — enough to be useful, few enough to read on a phone. */
  maxColumns: 8,
} as const;

/** Who may hold one of these — the apartment "resident", generalised. */
export interface KindHolder {
  enabled: boolean;
  /** What this relationship is called here: "Resident", "Driver", "Operator". */
  label: string;
  /** Staff of this organization. */
  members: boolean;
  /** Portal customers of this space. */
  clients: boolean;
}

/** One prompted field on every record of this kind — "Floor", "Plate", "Rent". */
export interface KindField {
  label: string;
}

/** Money in or money out. Rent comes in; a repair goes out. */
export type MoneyDirection = 'in' | 'out';

/**
 * A heading money is logged under: "Rent", "Repairs", "Fuel", "Service".
 *
 * The kind names these, so nothing in the code knows what rent is — an
 * Apartments kind and a Vehicles kind run the same ledger under different words.
 */
export interface KindMoneyCategory {
  label: string;
  direction: MoneyDirection;
}

/**
 * A repeating table on every record of a kind: a machine's parts, an
 * apartment's keys, a van's tyres.
 *
 * The kind names the list and its columns; a record then holds as many rows as
 * it needs. A field answers "what is this one's floor"; a list answers "what is
 * in it", which is a different question and needs rows, not a value.
 */
/**
 * What a table is FOR.
 *
 * 'parts'  a catalogue of spare parts, keyed by a code
 * 'faults' an error-code lookup: code -> what it means, why, what to do, which
 *          part. Maintenance systems keep this library against the equipment
 *          CLASS, not each machine, which is why it lives on the kind.
 * 'plain'  anything else the customer invents.
 */
export type KindListRole = 'plain' | 'parts' | 'faults';

export interface KindList {
  label: string;
  columns: KindField[];
  role: KindListRole;
  /**
   * Shared by every record of this kind, or filled in per record?
   *
   * A parts catalogue and a fault-code library are identical for every machine
   * of a model — typing them into each one would be both wasted work and a
   * guarantee that they drift apart. Anything specific to one machine (its
   * meter readings, its keys) stays per record.
   */
  shared: boolean;
}

/** The columns a fault-code table needs to be worth looking at. */
export const FAULT_COLUMNS = ['Code', 'Meaning', 'Cause', 'Fix', 'Part', 'Safety'] as const;

export interface KindMoney {
  /** Does this kind cost or earn anything worth recording? */
  enabled: boolean;
  categories: KindMoneyCategory[];
}

export interface KindShape {
  /** What the record's main identifier is called: "Name / number", "Plate". */
  nameLabel: string;
  /** An address, and with it a map, exactly as an apartment has. */
  hasAddress: boolean;
  holder: KindHolder;
  fields: KindField[];
  /**
   * May a record carry a field its kind never asked for?
   *
   * On, somebody can note a door code on one flat. Off, every record of this
   * kind holds exactly the same fields — which is the point when the data is
   * meant to be compared, exported or reported on.
   *
   * Defaults to ON: records could always do this, and a default of off would
   * silently withdraw it from every kind that already exists.
   */
  allowExtraFields: boolean;
  money: KindMoney;
  lists: KindList[];
}

const str = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';

const bool = (v: unknown, fallback = false): boolean =>
  typeof v === 'boolean' ? v : fallback;

/**
 * Read a stored or submitted shape, whatever state it is in.
 *
 * Always returns a usable object: a kind saved before this existed, a null, a
 * string, or a hand-edited row all resolve to the same defaults rather than
 * throwing somewhere far from the cause.
 */
export function normalizeKindShape(raw: unknown): KindShape {
  const src = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const holderSrc = (src.holder && typeof src.holder === 'object' ? src.holder : {}) as Record<string, unknown>;

  const holderEnabled = bool(holderSrc.enabled);
  const holder: KindHolder = {
    enabled: holderEnabled,
    label: str(holderSrc.label, KIND_SHAPE_LIMITS.maxHolderLabel),
    members: bool(holderSrc.members, holderEnabled),
    clients: bool(holderSrc.clients),
  };

  // A holder nobody can be assigned to is a control that does nothing, so an
  // enabled holder with neither side ticked falls back to members.
  if (holder.enabled && !holder.members && !holder.clients) holder.members = true;

  const seen = new Set<string>();
  const fields: KindField[] = [];
  for (const entry of Array.isArray(src.fields) ? src.fields : []) {
    if (fields.length >= KIND_SHAPE_LIMITS.maxFields) break;
    const label = str((entry as Record<string, unknown>)?.label, KIND_SHAPE_LIMITS.maxLabel);
    if (!label) continue;
    // Two fields with the same name would render as two identical prompts and
    // one would silently win on save.
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    fields.push({ label });
  }

  const moneySrc = (src.money && typeof src.money === 'object' ? src.money : {}) as Record<string, unknown>;
  const moneySeen = new Set<string>();
  const categories: KindMoneyCategory[] = [];
  for (const entry of Array.isArray(moneySrc.categories) ? moneySrc.categories : []) {
    if (categories.length >= KIND_SHAPE_LIMITS.maxMoneyCategories) break;
    const e = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    const label = str(e.label, KIND_SHAPE_LIMITS.maxLabel);
    if (!label) continue;
    const key = label.toLowerCase();
    // Two categories with one name would split a total in half and neither
    // half would look wrong.
    if (moneySeen.has(key)) continue;
    moneySeen.add(key);
    categories.push({ label, direction: e.direction === 'in' ? 'in' : 'out' });
  }

  const listSeen = new Set<string>();
  const lists: KindList[] = [];
  for (const entry of Array.isArray(src.lists) ? src.lists : []) {
    if (lists.length >= KIND_SHAPE_LIMITS.maxLists) break;
    const e = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    const label = str(e.label, KIND_SHAPE_LIMITS.maxLabel);
    if (!label) continue;
    const key = label.toLowerCase();
    // Two tables with one name: rows are stored under the name, so the second
    // would silently share the first's rows.
    if (listSeen.has(key)) continue;
    listSeen.add(key);

    const colSeen = new Set<string>();
    const columns: KindField[] = [];
    for (const col of Array.isArray(e.columns) ? e.columns : []) {
      if (columns.length >= KIND_SHAPE_LIMITS.maxColumns) break;
      const colLabel = str((col as Record<string, unknown>)?.label, KIND_SHAPE_LIMITS.maxLabel);
      if (!colLabel) continue;
      const colKey = colLabel.toLowerCase();
      if (colSeen.has(colKey)) continue;
      colSeen.add(colKey);
      columns.push({ label: colLabel });
    }

    // A table with no columns has nothing to put in it.
    if (columns.length === 0) continue;

    const role: KindListRole =
      e.role === 'parts' || e.role === 'faults' ? e.role : 'plain';

    lists.push({
      label,
      columns,
      role,
      // A fault library is reference data by nature: default it to shared so the
      // common case needs no thought, while a plain table stays per record.
      shared: typeof e.shared === 'boolean' ? e.shared : role !== 'plain',
    });
  }

  return {
    nameLabel: str(src.nameLabel, KIND_SHAPE_LIMITS.maxLabel),
    hasAddress: bool(src.hasAddress),
    holder,
    fields,
    allowExtraFields: bool(src.allowExtraFields, true),
    money: { enabled: bool(moneySrc.enabled), categories },
    lists,
  };
}

/** The label to show for the name box — the kind's own word, else a plain one. */
export function kindNameLabel(shape: KindShape, fallback: string): string {
  return shape.nameLabel || fallback;
}

/** The label to show for the holder — the kind's own word, else a plain one. */
export function kindHolderLabel(shape: KindShape, fallback: string): string {
  return shape.holder.label || fallback;
}

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

/** The kind's parts catalogue, if it declares one. */
export function partsList(shape: KindShape): KindList | null {
  return shape.lists.find((l) => l.role === 'parts') ?? null;
}

/** The kind's fault-code library, if it declares one. */
export function faultsList(shape: KindShape): KindList | null {
  return shape.lists.find((l) => l.role === 'faults') ?? null;
}

/**
 * Which column of a table holds the part code that ties a fault to a part.
 *
 * Matched by name rather than position so a customer may reorder or rename
 * around it; absent simply means the two are not linked, which is a valid
 * kind rather than an error.
 */
export function partLinkColumn(list: KindList): string | null {
  const hit = list.columns.find((c) => c.label.trim().toLowerCase() === 'part');
  return hit?.label ?? null;
}

/** Which column of the parts catalogue is its code. */
export function partCodeColumn(list: KindList): string | null {
  const hit = list.columns.find((c) => c.label.trim().toLowerCase() === 'code');
  return hit?.label ?? list.columns[0]?.label ?? null;
}
