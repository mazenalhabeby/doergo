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
