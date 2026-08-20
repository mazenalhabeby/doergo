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
