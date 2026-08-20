import { normalizeKindShape, kindHolderLabel, KIND_SHAPE_LIMITS } from '@hbcfield/shared';

/**
 * The config is JSON off a request and JSON out of a column, so these tests are
 * about what happens when it is NOT the object we hoped for.
 */
describe('normalizeKindShape', () => {
  it('gives a complete shape for a kind saved before shapes existed', () => {
    const s = normalizeKindShape(null);
    expect(s.hasAddress).toBe(false);
    expect(s.holder.enabled).toBe(false);
    expect(s.fields).toEqual([]);
    expect(s.nameLabel).toBe('');
  });

  it('survives a string, a number and an array where an object belongs', () => {
    for (const junk of ['{}', 42, [], undefined]) {
      expect(normalizeKindShape(junk).fields).toEqual([]);
    }
  });

  it('keeps the labels somebody actually typed', () => {
    const s = normalizeKindShape({
      nameLabel: 'Plate',
      hasAddress: false,
      holder: { enabled: true, label: 'Driver', members: true, clients: false },
      fields: [{ label: 'VIN' }, { label: 'Year' }],
    });
    expect(s.nameLabel).toBe('Plate');
    expect(kindHolderLabel(s, 'Holder')).toBe('Driver');
    expect(s.fields.map((f) => f.label)).toEqual(['VIN', 'Year']);
  });

  it('drops blank field labels rather than prompting for a nameless box', () => {
    const s = normalizeKindShape({ fields: [{ label: '  ' }, { label: 'Floor' }, {}] });
    expect(s.fields.map((f) => f.label)).toEqual(['Floor']);
  });

  it('drops a duplicate label — two identical prompts, one silently wins on save', () => {
    const s = normalizeKindShape({ fields: [{ label: 'Floor' }, { label: 'floor' }, { label: 'Rent' }] });
    expect(s.fields.map((f) => f.label)).toEqual(['Floor', 'Rent']);
  });

  it('stops at the field cap instead of rendering a form of any length', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ label: `f${i}` }));
    expect(normalizeKindShape({ fields: many })).toHaveProperty(
      'fields.length', KIND_SHAPE_LIMITS.maxFields,
    );
  });

  it('truncates a label long enough to break the layout', () => {
    const s = normalizeKindShape({ fields: [{ label: 'x'.repeat(500) }] });
    expect(s.fields[0]!.label).toHaveLength(KIND_SHAPE_LIMITS.maxLabel);
  });

  it('ticks members when a holder is on but nobody may hold it', () => {
    // Otherwise the record shows a picker that can never select anything.
    const s = normalizeKindShape({ holder: { enabled: true, label: 'Resident', members: false, clients: false } });
    expect(s.holder.members).toBe(true);
  });

  it('leaves a disabled holder alone', () => {
    const s = normalizeKindShape({ holder: { enabled: false, members: false, clients: false } });
    expect(s.holder).toMatchObject({ enabled: false, members: false, clients: false });
  });
});

import { detailRowsForKind, normalizeDetailRows, normalizeKindShape as shapeOf } from '@hbcfield/shared';

/**
 * A record shows the fields its KIND asks for, plus anything added on that one
 * record. These are the rules that make renaming a field safe.
 */
describe('detailRowsForKind', () => {
  const kind = shapeOf({ fields: [{ label: 'Floor' }, { label: 'Rent' }] });

  it('prompts for every field the kind asks for, even on an empty record', () => {
    expect(detailRowsForKind(kind, null)).toEqual([
      { label: 'Floor', value: '' },
      { label: 'Rent', value: '' },
    ]);
  });

  it('carries the answers already given', () => {
    const rows = detailRowsForKind(kind, [{ label: 'Rent', value: '900' }]);
    expect(rows).toEqual([
      { label: 'Floor', value: '' },
      { label: 'Rent', value: '900' },
    ]);
  });

  it('keeps a value recorded under a field the kind has since dropped', () => {
    // Deleting a field on the kind must not quietly delete what people typed.
    const rows = detailRowsForKind(kind, [{ label: 'Balcony', value: 'yes' }]);
    expect(rows).toContainEqual({ label: 'Balcony', value: 'yes' });
  });

  it('keeps one-off fields added on a single record, after the kind\'s own', () => {
    const rows = detailRowsForKind(kind, [
      { label: 'Floor', value: '3' },
      { label: 'Door code', value: '1234' },
    ]);
    expect(rows.map((r) => r.label)).toEqual(['Floor', 'Rent', 'Door code']);
  });

  it('matches the kind\'s field regardless of case, so no row appears twice', () => {
    const rows = detailRowsForKind(kind, [{ label: 'floor', value: '3' }]);
    expect(rows.filter((r) => r.label.toLowerCase() === 'floor')).toHaveLength(1);
    expect(rows[0]).toEqual({ label: 'Floor', value: '3' });
  });

  it('drops a nameless row rather than showing a box nobody can interpret', () => {
    expect(normalizeDetailRows([{ label: '', value: 'orphan' }])).toEqual([]);
  });
});

describe('allowExtraFields', () => {
  it('defaults to on, so kinds saved before this keep what they could already do', () => {
    // A default of off would silently withdraw one-off fields from every
    // existing kind the first time its config was read.
    expect(shapeOf(null).allowExtraFields).toBe(true);
    expect(shapeOf({ fields: [{ label: 'Floor' }] }).allowExtraFields).toBe(true);
  });

  it('is off only when somebody turned it off', () => {
    expect(shapeOf({ allowExtraFields: false }).allowExtraFields).toBe(false);
  });

  it('does not change what a record already holds', () => {
    // Turning it off stops NEW one-off fields; it must not hide or drop the
    // ones already recorded, or the data would be stranded.
    const strict = shapeOf({ fields: [{ label: 'Floor' }], allowExtraFields: false });
    const rows = detailRowsForKind(strict, [{ label: 'Door code', value: '1234' }]);
    expect(rows).toContainEqual({ label: 'Door code', value: '1234' });
  });
});

import { findMoneyCategory, signedCents } from '@hbcfield/shared';

describe('money on a kind', () => {
  it('is off until somebody turns it on, and starts with no categories', () => {
    expect(shapeOf(null).money).toEqual({ enabled: false, categories: [] });
  });

  it('keeps the headings the kind named, with their direction', () => {
    const s = shapeOf({ money: { enabled: true, categories: [
      { label: 'Rent', direction: 'in' },
      { label: 'Repairs', direction: 'out' },
    ] } });
    expect(s.money.categories).toEqual([
      { label: 'Rent', direction: 'in' },
      { label: 'Repairs', direction: 'out' },
    ]);
  });

  it('treats anything that is not "in" as money going out', () => {
    // A junk direction must not become a third state nobody handles.
    const s = shapeOf({ money: { categories: [{ label: 'X', direction: 'sideways' }] } });
    expect(s.money.categories[0]!.direction).toBe('out');
  });

  it('drops a duplicate heading — a total split in half looks wrong nowhere', () => {
    const s = shapeOf({ money: { categories: [
      { label: 'Rent', direction: 'in' },
      { label: 'rent', direction: 'out' },
    ] } });
    expect(s.money.categories).toHaveLength(1);
  });

  it('finds a category however it was capitalised', () => {
    const s = shapeOf({ money: { enabled: true, categories: [{ label: 'Rent', direction: 'in' }] } });
    expect(findMoneyCategory(s, 'RENT')?.label).toBe('Rent');
    expect(findMoneyCategory(s, 'Fuel')).toBeNull();
  });

  it('counts money in up and money out down, whatever sign was passed', () => {
    expect(signedCents('in', 90000)).toBe(90000);
    expect(signedCents('out', 8500)).toBe(-8500);
    // A negative amount must not invert an entry.
    expect(signedCents('out', -8500)).toBe(-8500);
    expect(signedCents('in', -90000)).toBe(90000);
  });
});

import { findKindList, normalizeListRow, listRowIsEmpty } from '@hbcfield/shared';

describe('tables on a kind', () => {
  it('keeps a list with its columns', () => {
    const s = shapeOf({ lists: [{ label: 'Parts', columns: [{ label: 'Code' }, { label: 'Qty' }] }] });
    expect(s.lists).toEqual([{ label: 'Parts', columns: [{ label: 'Code' }, { label: 'Qty' }] }]);
  });

  it('drops a table with no columns — there is nothing to put in it', () => {
    expect(shapeOf({ lists: [{ label: 'Parts', columns: [] }] }).lists).toEqual([]);
    expect(shapeOf({ lists: [{ label: 'Parts' }] }).lists).toEqual([]);
  });

  it('drops a duplicate table name — rows are stored under the name and would merge', () => {
    const s = shapeOf({ lists: [
      { label: 'Parts', columns: [{ label: 'Code' }] },
      { label: 'parts', columns: [{ label: 'Other' }] },
    ] });
    expect(s.lists).toHaveLength(1);
    expect(s.lists[0]!.columns[0]!.label).toBe('Code');
  });

  it('drops a duplicate column — two identical headers, one silently wins', () => {
    const s = shapeOf({ lists: [{ label: 'Parts', columns: [{ label: 'Code' }, { label: 'code' }] }] });
    expect(s.lists[0]!.columns).toHaveLength(1);
  });

  it('finds a list however it was capitalised', () => {
    const s = shapeOf({ lists: [{ label: 'Parts', columns: [{ label: 'Code' }] }] });
    expect(findKindList(s, 'PARTS')?.label).toBe('Parts');
    expect(findKindList(s, 'Keys')).toBeNull();
  });

  it('keeps only the columns the list declares, and always all of them', () => {
    const list = { label: 'Parts', columns: [{ label: 'Code' }, { label: 'Qty' }] };
    const row = normalizeListRow(list, { Code: 'HYD-8842', Qty: '2', Sneaky: 'x' });
    expect(row).toEqual({ Code: 'HYD-8842', Qty: '2' });
  });

  it('gives a missing column an empty value rather than leaving it absent', () => {
    // A column the row has never had must still render as an empty cell.
    const list = { label: 'Parts', columns: [{ label: 'Code' }, { label: 'Qty' }] };
    expect(normalizeListRow(list, { Code: 'X' })).toEqual({ Code: 'X', Qty: '' });
  });

  it('knows a row where every cell is blank is not worth storing', () => {
    expect(listRowIsEmpty({ Code: '', Qty: '  ' })).toBe(true);
    expect(listRowIsEmpty({ Code: 'X', Qty: '' })).toBe(false);
  });
});
