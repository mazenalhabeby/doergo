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
  /**
   * Holders on one record. High enough for a shift or a shared flat, low enough
   * that a request cannot ask the server to validate an unbounded list.
   */
  maxHolders: 50,
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
  /**
   * May a record have SEVERAL of them?
   *
   * A flat has one resident; a shared flat has four. A van has one driver; a
   * machine has a whole shift of operators. The kind decides, because only the
   * customer knows which of those they are running.
   *
   * Defaults to OFF: every kind that exists today holds exactly one, and a
   * default of on would quietly widen them all.
   */
  multiple: boolean;
}

/** One prompted field on every record of this kind — "Floor", "Plate", "Rent". */
export interface KindField {
  label: string;
}

/**
 * What a column of a table is.
 *
 *   'text' plain
 *   'key'  the code that identifies a row — "HYD-8842". A table with a key can
 *          be pointed at by other tables.
 *   'link' points at a row of another table, chosen from its keys rather than
 *          typed. This is what ties a fault code to the part it needs.
 *
 * These replace the two hard-coded table types this once had. "Parts catalogue"
 * and "Fault codes" were names in OUR code, so a customer who owned something
 * else was stuck. A table with a key IS a catalogue; a table with a link to it
 * IS a fault library — and a table linking suppliers to consumables works the
 * same day somebody thinks of it, without us shipping anything.
 */
export type KindColumnType = 'text' | 'key' | 'link';

export interface KindColumn {
  label: string;
  type: KindColumnType;
  /** For 'link': the label of the table this points at. */
  linkTo?: string;
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
export interface KindList {
  label: string;
  columns: KindColumn[];
  /** How the rows read: a grid, or a card each. A display choice, not a type. */
  display: 'table' | 'cards';
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
    multiple: bool(holderSrc.multiple),
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

    // A kind saved before column types existed carries `role` instead. Upgrade
    // it here rather than migrating the column: the shape is JSON that gets
    // rewritten on every save anyway, and a reader that cannot cope with the
    // older form would break every kind made before today.
    const legacyRole = e.role === 'parts' || e.role === 'faults' ? e.role : null;

    const colSeen = new Set<string>();
    const columns: KindColumn[] = [];
    for (const col of Array.isArray(e.columns) ? e.columns : []) {
      if (columns.length >= KIND_SHAPE_LIMITS.maxColumns) break;
      const c = (col && typeof col === 'object' ? col : {}) as Record<string, unknown>;
      const colLabel = str(c.label, KIND_SHAPE_LIMITS.maxLabel);
      if (!colLabel) continue;
      const colKey = colLabel.toLowerCase();
      if (colSeen.has(colKey)) continue;
      colSeen.add(colKey);

      let type: KindColumnType =
        c.type === 'key' || c.type === 'link' ? c.type : 'text';
      let linkTo = str(c.linkTo, KIND_SHAPE_LIMITS.maxLabel) || undefined;

      // Upgrade: a parts/faults table's "Code" was its key, and a faults
      // table's "Part" pointed at the parts catalogue.
      if (legacyRole && c.type === undefined) {
        if (colKey === 'code') type = 'key';
        if (legacyRole === 'faults' && colKey === 'part') type = 'link';
      }
      if (type !== 'link') linkTo = undefined;

      columns.push({ label: colLabel, type, ...(linkTo ? { linkTo } : {}) });
    }

    // A table with no columns has nothing to put in it.
    if (columns.length === 0) continue;

    // At most one key: two rows identified two ways is no identity at all.
    let keySeen = false;
    for (const c of columns) {
      if (c.type !== 'key') continue;
      if (keySeen) c.type = 'text';
      keySeen = true;
    }

    lists.push({
      label,
      columns,
      display: e.display === 'cards' ? 'cards' : legacyRole === 'faults' ? 'cards' : 'table',
      // Reference data is shared by nature; a table nobody points at defaults to
      // per record. A key is the signal that other tables may point at it.
      shared: typeof e.shared === 'boolean' ? e.shared : keySeen,
    });
  }

  // A link needs somewhere to point. One left without a target — upgraded from
  // the old hard-coded types, or hand-edited — is aimed at the first other
  // table that has a key, and demoted to text when there is none. A link that
  // points nowhere would render an empty picker with no way to tell why.
  const keyed = lists.filter((l) => l.columns.some((c) => c.type === 'key'));
  for (const list of lists) {
    for (const col of list.columns) {
      if (col.type !== 'link') continue;
      const named = col.linkTo && lists.some((l) => l.label.toLowerCase() === col.linkTo!.toLowerCase());
      if (named) continue;
      const fallback = keyed.find((l) => l.label !== list.label);
      if (fallback) col.linkTo = fallback.label;
      else {
        col.type = 'text';
        delete col.linkTo;
      }
    }
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
