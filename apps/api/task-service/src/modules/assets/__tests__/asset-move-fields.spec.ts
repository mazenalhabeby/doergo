import { keepFieldsForKind, fieldsDroppedByMove } from '@hbcfield/shared';

/*
  Moving an asset to another workspace means moving it to a KIND that lives
  there — an asset has no workspace of its own, it inherits its kind's.

  The kinds ask for different fields. "Vehicles" wants Plate, Mileage and Next
  service; "Fleet" wants Plate and Insurer. What happens to Mileage was a real
  decision, and the answer chosen was: drop it. These pin the two halves of that
  — what survives, and what the screen promises will not.
*/

const vehicles = { fields: [{ label: 'Plate' }, { label: 'Mileage' }, { label: 'Next service' }] };
const fleet = { fields: [{ label: 'Plate' }, { label: 'Insurer' }] };

const van = [
  { label: 'Plate', value: 'W-12345X' },
  { label: 'Mileage', value: '84,000' },
  { label: 'Next service', value: '2026-11-01' },
];

describe('what a move keeps', () => {
  it('keeps only what the destination asks for', () => {
    expect(keepFieldsForKind(van, fleet)).toEqual([{ label: 'Plate', value: 'W-12345X' }]);
  });

  it('names exactly what it drops', () => {
    // The warning and the deletion come from one rule read two ways, so the
    // sentence on screen cannot promise something different from what happens.
    expect(fieldsDroppedByMove(van, fleet)).toEqual(['Mileage', 'Next service']);
    expect(keepFieldsForKind(van, fleet).map((r) => r.label)).not.toContain('Mileage');
  });

  it('drops nothing when the destination asks for everything', () => {
    expect(fieldsDroppedByMove(van, vehicles)).toEqual([]);
    expect(keepFieldsForKind(van, vehicles)).toHaveLength(3);
  });

  it('matches a label however it is capitalised', () => {
    // "Plate" must survive a destination that calls it "plate" — the same key
    // `normalizeDetailRows` already dedupes on.
    const shouty = { fields: [{ label: 'PLATE' }] };
    expect(keepFieldsForKind(van, shouty)).toEqual([{ label: 'Plate', value: 'W-12345X' }]);
  });

  it('survives a kind with no fields, and a record with none', () => {
    // A kind that asks for nothing keeps nothing — and says so rather than
    // throwing, because a record can be moved into one.
    expect(keepFieldsForKind(van, { fields: [] })).toEqual([]);
    expect(fieldsDroppedByMove(van, {})).toEqual(['Plate', 'Mileage', 'Next service']);
    expect(keepFieldsForKind(null, fleet)).toEqual([]);
    expect(fieldsDroppedByMove(undefined, fleet)).toEqual([]);
  });
});
