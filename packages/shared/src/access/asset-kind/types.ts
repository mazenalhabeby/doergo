/** An asset kind's shape: limits, holders, fields, columns, money, lists, logbook types. */

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
