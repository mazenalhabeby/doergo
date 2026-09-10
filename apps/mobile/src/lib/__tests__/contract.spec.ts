import {
  parseContract, proposeFromContract, canApply, nameFromContract, fieldsForKind,
  normalizeKindShape,
} from '@hbcfield/shared/client';

/**
 * A rental agreement → a proposal to create a car, hand it over, and retire the
 * one it replaces.
 *
 * ⚠️ Everything here PROPOSES. The tests that matter most are the ones proving
 * it refuses: a reader that quietly creates records will eventually invent a
 * van from a receipt, and the first anybody hears of it is a bill for an asset
 * nobody owns.
 */

const NOW = new Date('2026-09-10T12:00:00Z');

const VEHICLES = normalizeKindShape({
  nameLabel: 'Plate',
  holder: { enabled: true, members: true, clients: false, multiple: false, label: 'Driver' },
  fields: [{ label: 'Kennzeichen' }, { label: 'Fahrgestellnummer' }, { label: 'Mileage' }],
});

const CONTRACT = [
  'Autovermietung Gmunden GmbH',
  'Mietvertrag Nr. 2026-8841',
  'Mieter: Ahmed Dessouky',
  'Hersteller: Ford',
  'Modell: Transit Custom',
  'Amtliches Kennzeichen: GM-472 DK',
  'Fahrgestellnummer: WF0YXXTTGYKA12345',
  'Mietbeginn: 15.09.2026',
  'Mietende: 15.03.2027',
  'Monatliche Rate 489,00',
];

describe('reading the agreement', () => {
  const read = parseContract(CONTRACT, NOW);

  it('takes the labelled registration', () => {
    expect(read.registration?.value).toBe('GM-472 DK');
    expect(read.registration?.confidence).toBe('certain');
  });

  /*
    ⚠️ A VIN is the ONE identifier on any of these documents that proves itself:
    17 characters, and I/O/Q excluded by the standard precisely so they cannot
    be confused with 1 and 0. That shape is the evidence — not the word beside
    it — which is why it comes back certain even unlabelled.
  */
  it('takes the VIN, and knows it is proved by its own shape', () => {
    expect(read.vin?.value).toBe('WF0YXXTTGYKA12345');
    expect(read.vin?.confidence).toBe('certain');
    const bare = parseContract(['WF0YXXTTGYKA12345'], NOW);
    expect(bare.vin?.confidence).toBe('certain');
  });

  it('takes the make and model', () => {
    expect(read.manufacturer?.value).toBe('Ford');
    expect(read.model?.value).toBe('Transit Custom');
  });

  it('takes both ends of the term from their labels', () => {
    expect(read.startsOn?.value).toBe('2026-09-15');
    expect(read.endsOn?.value).toBe('2027-03-15');
    expect(read.startsOn?.confidence).toBe('certain');
  });

  /*
    An unlabelled registration is the reading most likely to be wrong: contract
    numbers, customer numbers and postcodes all match the same loose shape. So
    it comes back `likely` — amber on screen, beside a box somebody can fix.
  */
  it('marks an unlabelled registration as a guess', () => {
    const loose = parseContract(['Fahrzeug', 'W 55512 AB', 'Danke'], NOW);
    expect(loose.registration?.confidence).toBe('likely');
  });

  it('does not read a date or a price as a registration', () => {
    const noisy = parseContract(['15.09.2026', 'Rate 489,00 EUR'], NOW);
    expect(noisy.registration).toBeUndefined();
  });

  it('returns nothing rather than something for an unreadable page', () => {
    expect(parseContract([], NOW).lines).toEqual([]);
    expect(parseContract(['   ', ''], NOW).registration).toBeUndefined();
  });

  it('keeps every line, so a wrong guess is one tap to fix', () => {
    expect(read.lines).toContain('Mieter: Ahmed Dessouky');
  });
});

describe('naming the record', () => {
  it('prefers the registration — what everybody calls a vehicle', () => {
    expect(nameFromContract(parseContract(CONTRACT, NOW))).toBe('GM-472 DK');
  });

  it('falls back to make and model, which is what a laptop form gives you', () => {
    const laptop = parseContract(['Hersteller: Dell', 'Modell: Latitude 5450'], NOW);
    expect(nameFromContract(laptop)).toBe('Dell Latitude 5450');
  });

  it('is empty when nothing identified it', () => {
    // Which becomes a PROBLEM below, never a record called "Untitled".
    expect(nameFromContract(parseContract(['Vielen Dank'], NOW))).toBe('');
  });
});

describe('filling the KIND’s own fields', () => {
  /*
    ⚠️ The only place the reader's vocabulary meets a customer's. The reader
    knows "registration"; this organization's kind calls it "Kennzeichen", and
    another's calls it "Plate". Matched on the label, loosely, so neither has
    our words forced onto it.
  */
  it('matches the customer’s own words', () => {
    const rows = fieldsForKind(VEHICLES, parseContract(CONTRACT, NOW));
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    expect(byLabel.Kennzeichen).toBe('GM-472 DK');
    expect(byLabel.Fahrgestellnummer).toBe('WF0YXXTTGYKA12345');
  });

  it('leaves a field the contract says nothing about', () => {
    const rows = fieldsForKind(VEHICLES, parseContract(CONTRACT, NOW));
    expect(rows.map((r) => r.label)).not.toContain('Mileage');
  });

  it('fills nothing on a kind that asks for none of it', () => {
    const plain = normalizeKindShape({ fields: [{ label: 'Colour' }] });
    expect(fieldsForKind(plain, parseContract(CONTRACT, NOW))).toEqual([]);
  });
});

describe('what accepting it would do', () => {
  const parsed = parseContract(CONTRACT, NOW);
  const ford = {
    assetId: 'a-ford', assetName: 'GM-101 AA',
    userId: 'u-ahmed', customerId: null,
    startedAt: new Date('2026-03-15'), endedAt: null,
  };

  it('creates, hands over, and closes what it replaces', () => {
    const p = proposeFromContract({ parsed, shape: VEHICLES, holderUserId: 'u-ahmed', holding: [ford] });
    expect(canApply(p)).toBe(true);
    expect(p.steps.map((s) => s.kind)).toEqual(['create', 'hand-over', 'close']);
  });

  /*
    ⚠️ Closing the old custody is the step people forget, and the reason this is
    a system rather than a shortcut: leave it open and every fuel receipt after
    today lands against the car Ahmed stopped driving this morning.
  */
  it('names the vehicle it is closing, so the person sees it', () => {
    const p = proposeFromContract({ parsed, shape: VEHICLES, holderUserId: 'u-ahmed', holding: [ford] });
    expect(p.steps).toContainEqual({ kind: 'close', assetId: 'a-ford', assetName: 'GM-101 AA' });
  });

  it('retires it too, when that is asked for', () => {
    const p = proposeFromContract({
      parsed, shape: VEHICLES, holderUserId: 'u-ahmed', holding: [ford], retireReplaced: true,
    });
    // RETIRED is what BILLABLE_ASSET_WHERE excludes, so this also stops the
    // old car being billed — which is the whole reason it is offered.
    expect(p.steps.map((s) => s.kind)).toEqual(['create', 'hand-over', 'close', 'retire']);
  });

  it('leaves it on the books when it is not', () => {
    const p = proposeFromContract({ parsed, shape: VEHICLES, holderUserId: 'u-ahmed', holding: [ford] });
    expect(p.steps.some((s) => s.kind === 'retire')).toBe(false);
  });

  it('proposes only a create when they held nothing', () => {
    const p = proposeFromContract({ parsed, shape: VEHICLES, holderUserId: 'u-ahmed', holding: [] });
    expect(p.steps.map((s) => s.kind)).toEqual(['create', 'hand-over']);
  });

  /*
    ⚠️ Refusing is the important half.

    A contract nothing could be identified from must not become a record called
    "Untitled" that somebody finds on the bill three months later.
  */
  it('refuses when it could not name the thing', () => {
    const blank = parseContract(['Vielen Dank für Ihren Auftrag'], NOW);
    const p = proposeFromContract({ parsed: blank, shape: VEHICLES, holderUserId: 'u-ahmed' });
    expect(canApply(p)).toBe(false);
    expect(p.problems).toContainEqual({ kind: 'no-name' });
  });

  it('refuses when nobody is named to receive it', () => {
    const p = proposeFromContract({ parsed, shape: VEHICLES, holderUserId: null });
    expect(canApply(p)).toBe(false);
    expect(p.problems).toContainEqual({ kind: 'no-holder' });
  });

  it('carries the reading onto the record it proposes', () => {
    const p = proposeFromContract({ parsed, shape: VEHICLES, holderUserId: 'u-ahmed' });
    expect(p.asset).toMatchObject({
      name: 'GM-472 DK',
      manufacturer: 'Ford',
      model: 'Transit Custom',
      serialNumber: 'WF0YXXTTGYKA12345',
    });
  });
});
