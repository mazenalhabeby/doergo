/**
 * Ready-made kinds.
 *
 * Building a machine kind by hand means typing four fields, three money
 * categories, a parts catalogue with its columns and a fault library with six
 * more — before you can add a single machine. A template fills all of that in
 * one click.
 *
 * COPIED, never referenced — exactly as the workflow library works. Choosing a
 * template stamps its shape into the kind and then gets out of the way: rename
 * the holder, drop a column, add a money category, and nothing anywhere else
 * changes. A template that stayed linked would turn every later edit into a
 * question about who owns the change.
 */

import type { KindShape, KindLogType, KindLogField, KindLogDue, LogColor } from './asset-kind-shape';

export interface KindTemplate {
  /** Stable id, so a template can be renamed without breaking anything. */
  id: string;
  name: string;
  /** One line: what this is for, in the words of somebody who owns one. */
  description: string;
  shape: KindShape;
}

/** The columns a parts catalogue needs to be worth keeping. */
export const PARTS_COLUMNS = ['Code', 'Name', 'Qty', 'Supplier'] as const;

/** Record fields — a label each, no column type: those belong to tables. */
const fields = (labels: readonly string[]) => labels.map((label) => ({ label }));

/** Plain table columns. */
const cols = (labels: readonly string[]) => labels.map((label) => ({ label, type: 'text' as const }));

/**
 * Columns for a catalogue: the first one identifies a row, so other tables can
 * point at it. Nothing here is special-cased in the product — a key is a column
 * type anybody can choose.
 */
const catalogue = (labels: readonly string[]) =>
  labels.map((label, i) => ({ label, type: (i === 0 ? 'key' : 'text') as 'key' | 'text' }));

/** Columns for a lookup that points at a catalogue. */
const lookup = (labels: readonly string[], linkLabel: string, linkTo: string) =>
  labels.map((label, i) => {
    if (i === 0) return { label, type: 'key' as const };
    if (label === linkLabel) return { label, type: 'link' as const, linkTo };
    return { label, type: 'text' as const };
  });

/** Log fields, spelled the way a template reads best. Keys are given, so they never drift. */
const field = {
  text: (key: string, label: string, required = false): KindLogField => ({ key, label, type: 'text', required }),
  number: (key: string, label: string, unit?: string, required = false): KindLogField =>
    ({ key, label, type: 'number', required, ...(unit ? { unit } : {}) }),
  /** A counter the asset keeps — what a next-due rule counts in. */
  meter: (key: string, label: string, unit: string, required = false): KindLogField =>
    ({ key, label, type: 'number', required, unit, meter: true }),
  choice: (key: string, label: string, options: string[], required = false): KindLogField =>
    ({ key, label, type: 'choice', required, options }),
  money: (key: string, label: string, required = false): KindLogField =>
    ({ key, label, type: 'money', required, direction: 'out' }),
  photo: (key: string, label: string): KindLogField => ({ key, label, type: 'photo', required: false }),
};

const logType = (
  key: string,
  label: string,
  color: LogColor,
  fields: KindLogField[],
  opts: { needsApproval?: boolean; holderOnly?: boolean; due?: KindLogDue } = {},
): KindLogType => ({
  key,
  label,
  color,
  fields,
  needsApproval: opts.needsApproval ?? false,
  holderOnly: opts.holderOnly ?? false,
  due: opts.due ?? null,
});

export const KIND_TEMPLATES: KindTemplate[] = [
  {
    id: 'machine',
    name: 'Machine',
    description: 'Production or site machinery, with a parts catalogue and fault codes',
    shape: {
      nameLabel: 'Machine name',
      hasAddress: false,
      // A machine is run by a shift, not by one person.
      holder: { enabled: true, label: 'Operator', members: true, clients: false, multiple: true },
      fields: fields(['Maker', 'Model', 'Installed', 'Serial']),
      allowExtraFields: true,
      money: {
        enabled: true,
        categories: [
          { label: 'Repairs', direction: 'out' },
          { label: 'Service', direction: 'out' },
          { label: 'Spare parts', direction: 'out' },
        ],
      },
      lists: [
        { label: 'Parts', display: 'table', shared: true, columns: catalogue(PARTS_COLUMNS) },
        {
          label: 'Fault codes', display: 'cards', shared: true,
          columns: lookup(['Code', 'Meaning', 'Cause', 'Fix', 'Part', 'Safety'], 'Part', 'Parts'),
        },
      ],
      logTypes: [
        logType('service', 'Service', 'blue', [
          field.meter('hours', 'Operating hours', 'h', true),
          field.text('work', 'Work done'),
          field.money('cost', 'Cost'),
          field.photo('photo', 'Photo'),
        ], { needsApproval: true, due: { months: 12, units: 500, meterKey: 'hours', leadDays: 21, leadUnits: 50 } }),
        logType('repair', 'Repair', 'red', [
          field.text('fault', 'Fault', true),
          field.text('work', 'Work done'),
          field.meter('hours', 'Operating hours', 'h'),
          field.money('cost', 'Cost'),
          field.photo('photo', 'Photo'),
        ], { needsApproval: true }),
        // A reading and nothing else: the counter a service rule counts in.
        logType('hours', 'Operating hours', 'teal', [field.meter('hours', 'Operating hours', 'h', true)], { holderOnly: true }),
      ],
    },
  },
  {
    id: 'apartment',
    name: 'Apartment',
    description: 'Flats you rent out or house staff in — address, resident, rent',
    shape: {
      nameLabel: 'Flat',
      hasAddress: true,
      // Flats get shared, and a lease with two names on it is not unusual.
      holder: { enabled: true, label: 'Resident', members: true, clients: true, multiple: true },
      fields: fields(['Floor', 'Rooms', 'Size', 'Door code']),
      allowExtraFields: true,
      money: {
        enabled: true,
        categories: [
          { label: 'Rent', direction: 'in' },
          { label: 'Repairs', direction: 'out' },
          { label: 'Utilities', direction: 'out' },
        ],
      },
      lists: [
        { label: 'Keys', display: 'table', shared: false, columns: cols(['Key', 'Held by']) },
      ],
      logTypes: [
        logType('meter', 'Meter reading', 'teal', [
          field.choice('meter', 'Meter', ['Electricity', 'Gas', 'Water'], true),
          field.number('reading', 'Reading', undefined, true),
          field.photo('photo', 'Photo'),
        ]),
        logType('damage', 'Damage', 'red', [
          field.text('what', 'What happened', true),
          field.photo('photo', 'Photo'),
        ]),
        logType('inspection', 'Inspection', 'blue', [
          field.choice('result', 'Result', ['Fine', 'Needs work'], true),
          field.text('notes', 'Notes'),
        ], { due: { months: 12, units: null, meterKey: null, leadDays: 30, leadUnits: null } }),
      ],
    },
  },
  {
    id: 'vehicle',
    name: 'Vehicle',
    description: 'Vans and cars — driver, running costs, a shared parts list',
    shape: {
      nameLabel: 'Plate',
      hasAddress: false,
      // One van, one driver at a time — the whole point of asking.
      holder: { enabled: true, label: 'Driver', members: true, clients: false, multiple: false },
      fields: fields(['Make', 'Model', 'Year', 'Next test']),
      allowExtraFields: true,
      money: {
        enabled: true,
        categories: [
          { label: 'Fuel', direction: 'out' },
          { label: 'Service', direction: 'out' },
          { label: 'Insurance', direction: 'out' },
        ],
      },
      lists: [
        { label: 'Parts', display: 'table', shared: true, columns: catalogue(PARTS_COLUMNS) },
      ],
      logTypes: [
        logType('fuel', 'Fuel', 'amber', [
          field.meter('odometer', 'Odometer', 'km'),
          field.number('litres', 'Litres', 'l'),
          field.money('amount', 'Amount', true),
          field.photo('receipt', 'Receipt'),
        ], { needsApproval: true, holderOnly: true }),
        logType('oil_change', 'Oil change', 'violet', [
          field.meter('odometer', 'Odometer', 'km', true),
          field.money('amount', 'Amount'),
          field.photo('receipt', 'Receipt'),
        ], { needsApproval: true, due: { months: 12, units: 15000, meterKey: 'odometer', leadDays: 30, leadUnits: 1000 } }),
        logType('service', 'Service', 'blue', [
          field.meter('odometer', 'Odometer', 'km', true),
          field.text('work', 'Work done'),
          field.money('amount', 'Amount'),
          field.photo('receipt', 'Invoice'),
        ], { needsApproval: true, due: { months: 24, units: 30000, meterKey: 'odometer', leadDays: 30, leadUnits: 2000 } }),
        // Anyone who sees the dent may say so — not only whoever drove it that day.
        logType('damage', 'Damage', 'red', [
          field.text('what', 'What happened', true),
          field.meter('odometer', 'Odometer', 'km'),
          field.photo('photo', 'Photo'),
        ]),
      ],
    },
  },
  {
    id: 'tool',
    name: 'Tool',
    description: 'Things that get lent out and come back — who has it, what it cost',
    shape: {
      nameLabel: 'Tool',
      hasAddress: false,
      // A tool is with whoever took it, and only one person can have it.
      holder: { enabled: true, label: 'Held by', members: true, clients: false, multiple: false },
      fields: fields(['Make', 'Model', 'Serial']),
      allowExtraFields: true,
      money: { enabled: true, categories: [{ label: 'Repairs', direction: 'out' }] },
      lists: [],
      logTypes: [
        logType('inspection', 'Safety check', 'green', [
          field.choice('result', 'Result', ['Passed', 'Failed'], true),
          field.text('notes', 'Notes'),
        ], { due: { months: 12, units: null, meterKey: null, leadDays: 30, leadUnits: null } }),
        logType('damage', 'Damage', 'red', [
          field.text('what', 'What happened', true),
          field.photo('photo', 'Photo'),
        ]),
      ],
    },
  },
  {
    id: 'property',
    name: 'Building or site',
    description: 'Somewhere you look after — address, the systems in it, running costs',
    shape: {
      nameLabel: 'Name',
      hasAddress: true,
      holder: { enabled: true, label: 'Manager', members: true, clients: false, multiple: false },
      fields: fields(['Type', 'Floors', 'Built']),
      allowExtraFields: true,
      money: {
        enabled: true,
        categories: [
          { label: 'Repairs', direction: 'out' },
          { label: 'Utilities', direction: 'out' },
          { label: 'Cleaning', direction: 'out' },
        ],
      },
      lists: [
        { label: 'Fault codes', display: 'cards', shared: true, columns: catalogue(['Code', 'Meaning', 'Cause', 'Fix', 'Safety']) },
      ],
      logTypes: [
        logType('inspection', 'Inspection', 'blue', [
          field.text('system', 'System', true),
          field.choice('result', 'Result', ['Fine', 'Needs work'], true),
          field.photo('photo', 'Photo'),
        ], { due: { months: 12, units: null, meterKey: null, leadDays: 30, leadUnits: null } }),
        logType('repair', 'Repair', 'red', [
          field.text('work', 'Work done', true),
          field.money('amount', 'Amount'),
          field.photo('photo', 'Invoice'),
        ], { needsApproval: true }),
      ],
    },
  },
];

/** A template by id, or null — an unknown id is a stale link, not a crash. */
export function kindTemplate(id: string): KindTemplate | null {
  return KIND_TEMPLATES.find((tpl) => tpl.id === id) ?? null;
}
