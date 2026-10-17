/** A kind's shape and its logbook types, normalized from whatever was saved. */
import { KEY_SHAPE, bool, intIn, logKeyFrom, str, uniqueKey } from './primitives';
import {
  COST_LOG_KEY,
  KIND_SHAPE_LIMITS,
  LOG_COLORS,
  LOG_FIELD_TYPES,
  type KindColumn,
  type KindColumnType,
  type KindField,
  type KindHolder,
  type KindList,
  type KindLogDue,
  type KindLogField,
  type KindLogType,
  type KindMoneyCategory,
  type KindShape,
  type LogColor,
  type LogFieldType,
} from './types';

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

      let type: KindColumnType = c.type === 'key' || c.type === 'link' ? c.type : 'text';
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
