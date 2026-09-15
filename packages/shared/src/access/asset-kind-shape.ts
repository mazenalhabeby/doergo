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
  /**
   * Log types per kind. A van needs Fuel, Oil change, Service, Damage, Tyres —
   * a picker on a phone with more than a dozen rows is a list nobody reads.
   */
  maxLogTypes: 12,
  /** Fields per log type: a form somebody fills in at a pump, not a report. */
  maxLogFields: 10,
  /** Options on one choice field. */
  maxChoiceOptions: 20,
  maxOptionLabel: 40,
  maxUnit: 12,
  /** A stable key: what an entry's values are stored under. */
  maxLogKey: 40,
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

// ─────────────────────────────────────────────────────────────────────────────
// The logbook: what gets DONE to a thing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What one prompt on a log entry is.
 *
 *   'text'   a sentence — "front left wing, scratch"
 *   'number' a quantity with a unit — "42 l", or a METER — "86,412 km"
 *   'date'   a day that is not the entry's own ("next inspection")
 *   'choice' one of a fixed list — so "Diesel" and "diesel" cannot split a report
 *   'photo'  the photograph — the slip, the dent
 *   'money'  what it cost, and whether that came in or went out
 */
export type LogFieldType = 'text' | 'number' | 'date' | 'choice' | 'photo' | 'money';

export const LOG_FIELD_TYPES: readonly LogFieldType[] = ['text', 'number', 'date', 'choice', 'photo', 'money'];

/**
 * The colours a log type may wear. Names, not hex: the web and the phone each
 * map a name onto their own palette, so a kind saved today still reads right
 * after either app is re-themed — and a hand-edited `#ff00ff` cannot reach
 * every viewer of the space.
 */
export const LOG_COLORS = ['slate', 'blue', 'green', 'amber', 'red', 'violet', 'teal', 'orange'] as const;
export type LogColor = (typeof LOG_COLORS)[number];

export interface KindLogField {
  /**
   * What an entry's value is stored under. Made from the label the first time
   * and then KEPT, so renaming "Mileage" to "Odometer" leaves every entry
   * already written still reading — the same reason list rows are keyed by
   * column label, done one better because a log is history nobody can re-type.
   */
  key: string;
  label: string;
  type: LogFieldType;
  required: boolean;
  /** number: "km", "h", "l". */
  unit?: string;
  /**
   * number: a COUNTER the asset carries — mileage, operating hours.
   *
   * The asset remembers the latest one, and a next-due rule may count in it.
   * A quantity (litres, pieces) is not a meter: "latest litres" means nothing.
   * Keyed across the kind, so an odometer typed at the pump and one typed at
   * the garage are the same reading.
   */
  meter?: boolean;
  /** choice: the list. */
  options?: string[];
  /** money: in (a refund, rent) or out (fuel, a repair). */
  direction?: MoneyDirection;
}

/**
 * When a type of work is due again: after M months and/or N units of a meter,
 * whichever comes first — "oil every 15,000 km or 12 months".
 */
export interface KindLogDue {
  months: number | null;
  units: number | null;
  /** The meter `units` counts in. Must be a meter field of the SAME log type. */
  meterKey: string | null;
  /** Say so this many days before the date… */
  leadDays: number | null;
  /** …or this many units before the reading. */
  leadUnits: number | null;
}

export interface KindLogType {
  /** Stable, like a field key. `cost` is reserved for the built-in money log. */
  key: string;
  label: string;
  color: LogColor;
  fields: KindLogField[];
  /**
   * An entry from somebody who does not manage assets waits for somebody who
   * does, and counts for nothing until then — the rule every expense already
   * lives by. Off for a meter reading: nobody approves an odometer.
   */
  needsApproval: boolean;
  /**
   * Only whoever HELD it on the entry's date may log it (managers always may).
   * On for fuel — a receipt for a van you never drove is refused. Off for
   * damage — a colleague who notices the dent should be able to say so.
   */
  holderOnly: boolean;
  due: KindLogDue | null;
}

/** The key of the log every kind with money already has: the ledger. */
export const COST_LOG_KEY = 'cost';

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
  /**
   * What gets done to one of these, and what each entry asks for.
   *
   * Does NOT include the built-in Cost log — that one is derived from `money`
   * by `logTypesForKind`, so the categories a kind already has stay the one
   * place its money headings are named.
   */
  logTypes: KindLogType[];
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
    logTypes: normalizeLogTypes(src.logTypes),
  };
}

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

/**
 * Read the log types of a stored or submitted shape.
 *
 * Same trust boundary as the rest of the shape. The rules that are not merely
 * bounds, and why:
 *   · at most ONE money field and ONE photo field per type — an entry has one
 *     amount and one slip, stored in the columns the ledger already reads; a
 *     second of either would be accepted on screen and silently dropped on save.
 *   · a due rule counting units must name a METER of its own type, so the entry
 *     that resets the count records where the count started.
 *   · `cost` is reserved: that log is the ledger, derived from the money headings.
 */
export function normalizeLogTypes(raw: unknown): KindLogType[] {
  const out: KindLogType[] = [];
  const labelSeen = new Set<string>();
  const keysTaken = new Set<string>([COST_LOG_KEY]);

  for (const entry of Array.isArray(raw) ? raw : []) {
    if (out.length >= KIND_SHAPE_LIMITS.maxLogTypes) break;
    const e = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    const label = str(e.label, KIND_SHAPE_LIMITS.maxLabel);
    if (!label) continue;
    // Two types with one name would be one button that files under two keys.
    if (labelSeen.has(label.toLowerCase())) continue;
    labelSeen.add(label.toLowerCase());

    const rawKey = typeof e.key === 'string' && KEY_SHAPE.test(e.key) ? e.key : logKeyFrom(label);
    const key = uniqueKey(rawKey, keysTaken);

    const fields: KindLogField[] = [];
    const fieldLabels = new Set<string>();
    const fieldKeys = new Set<string>();
    let money = false;
    let photo = false;
    for (const f of Array.isArray(e.fields) ? e.fields : []) {
      if (fields.length >= KIND_SHAPE_LIMITS.maxLogFields) break;
      const fs = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>;
      const fLabel = str(fs.label, KIND_SHAPE_LIMITS.maxLabel);
      if (!fLabel || fieldLabels.has(fLabel.toLowerCase())) continue;
      const type = (LOG_FIELD_TYPES as readonly unknown[]).includes(fs.type) ? (fs.type as LogFieldType) : 'text';
      if (type === 'money') {
        if (money) continue;
        money = true;
      }
      if (type === 'photo') {
        if (photo) continue;
        photo = true;
      }
      fieldLabels.add(fLabel.toLowerCase());
      const fKey = uniqueKey(
        typeof fs.key === 'string' && KEY_SHAPE.test(fs.key) ? fs.key : logKeyFrom(fLabel),
        fieldKeys,
      );

      const field: KindLogField = { key: fKey, label: fLabel, type, required: bool(fs.required) };
      if (type === 'number') {
        const unit = str(fs.unit, KIND_SHAPE_LIMITS.maxUnit);
        if (unit) field.unit = unit;
        if (bool(fs.meter)) field.meter = true;
      }
      if (type === 'choice') {
        const seen = new Set<string>();
        const options: string[] = [];
        for (const o of Array.isArray(fs.options) ? fs.options : []) {
          if (options.length >= KIND_SHAPE_LIMITS.maxChoiceOptions) break;
          const opt = str(o, KIND_SHAPE_LIMITS.maxOptionLabel);
          if (!opt || seen.has(opt.toLowerCase())) continue;
          seen.add(opt.toLowerCase());
          options.push(opt);
        }
        // A choice with nothing to choose is a text box that refuses every answer.
        if (options.length === 0) {
          field.type = 'text';
        } else {
          field.options = options;
        }
      }
      if (type === 'money') field.direction = fs.direction === 'in' ? 'in' : 'out';
      fields.push(field);
    }

    const color = (LOG_COLORS as readonly unknown[]).includes(e.color) ? (e.color as LogColor) : 'slate';

    let due: KindLogDue | null = null;
    const d = (e.due && typeof e.due === 'object' ? e.due : null) as Record<string, unknown> | null;
    if (d) {
      const months = intIn(d.months, 1, 120);
      const meterKey = typeof d.meterKey === 'string' ? d.meterKey : null;
      const meterOk = !!meterKey && fields.some((f) => f.key === meterKey && f.type === 'number' && f.meter);
      const units = meterOk ? intIn(d.units, 1, 10_000_000) : null;
      if (months !== null || units !== null) {
        const leadUnits = units !== null ? intIn(d.leadUnits, 0, units) : null;
        due = {
          months,
          units,
          meterKey: units !== null ? meterKey : null,
          leadDays: months !== null ? intIn(d.leadDays, 0, 365) : null,
          leadUnits,
        };
      }
    }

    out.push({
      key,
      label,
      color,
      fields,
      needsApproval: bool(e.needsApproval),
      holderOnly: bool(e.holderOnly),
      due,
    });
  }
  return out;
}

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
