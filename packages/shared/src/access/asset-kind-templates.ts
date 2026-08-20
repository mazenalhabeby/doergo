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

import type { KindShape } from './asset-kind-shape';

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

const cols = (labels: readonly string[]) => labels.map((label) => ({ label }));

export const KIND_TEMPLATES: KindTemplate[] = [
  {
    id: 'machine',
    name: 'Machine',
    description: 'Production or site machinery, with a parts catalogue and fault codes',
    shape: {
      nameLabel: 'Machine name',
      hasAddress: false,
      holder: { enabled: true, label: 'Operator', members: true, clients: false },
      fields: cols(['Maker', 'Model', 'Installed', 'Serial']),
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
        { label: 'Parts', role: 'parts', shared: true, columns: cols(PARTS_COLUMNS) },
        {
          label: 'Fault codes', role: 'faults', shared: true,
          columns: cols(['Code', 'Meaning', 'Cause', 'Fix', 'Part', 'Safety']),
        },
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
      holder: { enabled: true, label: 'Resident', members: true, clients: true },
      fields: cols(['Floor', 'Rooms', 'Size', 'Door code']),
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
        { label: 'Keys', role: 'plain', shared: false, columns: cols(['Key', 'Held by']) },
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
      holder: { enabled: true, label: 'Driver', members: true, clients: false },
      fields: cols(['Make', 'Model', 'Year', 'Next test']),
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
        { label: 'Parts', role: 'parts', shared: true, columns: cols(PARTS_COLUMNS) },
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
      holder: { enabled: true, label: 'Held by', members: true, clients: false },
      fields: cols(['Make', 'Model', 'Serial']),
      allowExtraFields: true,
      money: { enabled: true, categories: [{ label: 'Repairs', direction: 'out' }] },
      lists: [],
    },
  },
  {
    id: 'property',
    name: 'Building or site',
    description: 'Somewhere you look after — address, the systems in it, running costs',
    shape: {
      nameLabel: 'Name',
      hasAddress: true,
      holder: { enabled: true, label: 'Manager', members: true, clients: false },
      fields: cols(['Type', 'Floors', 'Built']),
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
        { label: 'Fault codes', role: 'faults', shared: true, columns: cols(['Code', 'Meaning', 'Cause', 'Fix', 'Part', 'Safety']) },
      ],
    },
  },
];

/** A template by id, or null — an unknown id is a stale link, not a crash. */
export function kindTemplate(id: string): KindTemplate | null {
  return KIND_TEMPLATES.find((tpl) => tpl.id === id) ?? null;
}
