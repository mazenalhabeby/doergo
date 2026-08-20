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

  return {
    nameLabel: str(src.nameLabel, KIND_SHAPE_LIMITS.maxLabel),
    hasAddress: bool(src.hasAddress),
    holder,
    fields,
    allowExtraFields: bool(src.allowExtraFields, true),
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
