import { parseBusinessCard, type CardLine } from '@hbcfield/shared/client';
import {
  CARD_FIELDS, cardAlternatives, cardClientExtras, cardContested, cardDetails,
  cardExtrasKept, cardHolding, readCard, reRankGuesses,
  type CardFieldKey, type CardValues,
} from '../card-review';

/**
 * WHAT THE CARD SAID THAT NO FIELD WANTED — and what happens when the member
 * disagrees with where a line went.
 *
 * ⚠️ Every card here is run through the REAL reader rather than hand-written as
 * a `ParsedCard`. The three things under test — which line a field is standing
 * on, which lines it nearly chose instead, and whether it was guessing between
 * two — are produced by `parseBusinessCard` and by nothing else, so a mocked
 * card would be a test of the mock. The two below are the cards that prompted
 * the feature.
 */

const L = (text: string, y: number, height = 0.06): CardLine => ({ text, y, height, x: 0.05, width: 0.9 });

/**
 * A municipal card: a firm, a person, a department, both numbers, the town's
 * website AND its Facebook page two lines apart.
 */
const gmunden = () => parseBusinessCard([
  L('Stadtamt Gmunden', 0.10, 0.11),
  L('Jasmin Walther', 0.26, 0.09),
  L('Liegenschaftsverwaltung', 0.36, 0.05),
  L('Rathausplatz 1, 4810 Gmunden', 0.48),
  L('T +43 7612 794 0', 0.58),
  L('M +43 664 123 4567', 0.66),
  L('jasmin.walther@gmunden.ooe.gv.at', 0.74),
  L('www.gmunden.at', 0.82),
  L('facebook.com/stadt.gmunden', 0.88),
  L('Mo-Fr 08:00-12:00', 0.94),
]);

/** A guesthouse whose ONLY web address is its Facebook page. */
const seeblick = () => parseBusinessCard([
  L('Gasthaus Seeblick', 0.12, 0.12),
  L('Anna Gruber', 0.32, 0.08),
  L('Seepromenade 4, 4810 Gmunden', 0.5),
  L('+43 7612 123 45', 0.62),
  L('office@seeblick.at', 0.72),
  L('facebook.com/seeblick', 0.84),
]);

/** The screen's `t`, as far as these rules are concerned. */
const t = (key: string) => ({
  'customers.social.facebook': 'Facebook',
  'customers.extra.hours': 'Opening hours',
  'customers.extra.iban': 'IBAN',
}[key] ?? key);

describe('a line the reader understood is never discarded', () => {
  it('keeps the Facebook page and the opening hours, each named', () => {
    // Both were read, both are real, and neither has a column on a client.
    // Before this they were dropped in silence.
    const { extras } = readCard(gmunden());
    expect(extras.map((x) => [x.labelKey, x.value])).toEqual(
      expect.arrayContaining([
        ['customers.social.facebook', 'facebook.com/stadt.gmunden'],
        ['customers.extra.hours', 'Mo-Fr 08:00-12:00'],
      ]),
    );
  });

  it('does not offer back a line a field is standing on', () => {
    const { values, extras } = readCard(gmunden());
    const kept = extras.map((x) => x.value);
    for (const key of CARD_FIELDS) {
      const value = values[key].trim();
      if (value) expect(kept).not.toContain(value);
    }
  });

  it('does not offer back half an address the winner swallowed', () => {
    /*
      The address block is three lines on many cards and the parse records only
      the first of them, so a check on the source index alone hands "4810
      Gmunden" back as a custom field. The TEXT check is what stops it.
    */
    const card = parseBusinessCard([
      L('Tischlerei Mayr', 0.10, 0.12),
      L('Hauptstraße 12', 0.42),
      L('4810 Gmunden', 0.5),
      L('office@mayr.at', 0.7),
    ]);
    const { values, extras } = readCard(card);
    expect(values.address).toContain('4810 Gmunden');
    expect(extras.map((x) => x.value)).not.toContain('4810 Gmunden');
  });
});

describe('a social link is not the website', () => {
  it('takes it OUT of the website field and keeps it under its own name', () => {
    // The reader is not wrong — `facebook.com/seeblick` is the only web-shaped
    // line on the card. It is just not the guesthouse's website, and a client
    // record pointing at a Facebook page is the wrong record.
    const { values, extras } = readCard(seeblick());
    expect(values.website).toBe('');
    expect(extras).toContainEqual(
      expect.objectContaining({ labelKey: 'customers.social.facebook', value: 'facebook.com/seeblick' }),
    );
    /*
      ONCE, not twice. It is taken out of `website` by name and it is also an
      unclaimed line, so both halves of `readCard` reach for it — and a record
      with two Facebook rows reads as a bug in the reader rather than as a
      faithful copy of the card. `cardExtras` dedupes by value; this is the
      caller that makes that matter.
    */
    expect(extras.filter((x) => x.value === 'facebook.com/seeblick')).toHaveLength(1);
  });

  it('REACHES `details` AND NEVER `website`, end to end', () => {
    const card = seeblick();
    const { values, extras } = readCard(card);

    // What the client record itself would carry…
    expect(cardClientExtras('COMPANY', values).website).toBeUndefined();
    // …and where the page actually went.
    expect(cardDetails(extras, t)).toContainEqual({ label: 'Facebook', value: 'facebook.com/seeblick' });
  });

  it('refuses one even when the member puts it there by hand', () => {
    /*
      `readCard` keeps it out of the field, but the field is editable and its
      line list offers every line on the card — including, on the Gmunden card,
      a Facebook page the reader ranked as an equally good website. This is the
      last door, and it is shut in the builder rather than on the screen.
    */
    const typed: CardValues = {
      company: 'Gasthaus Seeblick', name: '', title: '', email: '', phone: '',
      website: 'https://www.facebook.com/seeblick', address: '', vat: '',
    };
    expect(cardClientExtras('COMPANY', typed).website).toBeUndefined();
    // An ordinary website is untouched — the rule is about the HOST, not URLs.
    expect(cardClientExtras('COMPANY', { ...typed, website: 'gmunden.at' }).website).toBe('gmunden.at');
  });
});

describe('the reader says when it was guessing between two lines', () => {
  it('marks the website contested on a card carrying both a site and a page', () => {
    // `www.gmunden.at` and `facebook.com/stadt.gmunden` scored identically.
    // Saying so is worth more than picking.
    const card = gmunden();
    expect(cardContested(card).website).toBe(true);
    expect(cardAlternatives(card, 'website').map((a) => a.value)).toContain('facebook.com/stadt.gmunden');
  });

  it('offers the runner-up the reader nearly chose, not the whole card', () => {
    // One tap to fix a wrong guess, rather than a scroll through ten lines.
    expect(cardAlternatives(gmunden(), 'name').map((a) => a.value)).toEqual(['Stadtamt Gmunden']);
  });
});

describe('a correction re-ranks the rest', () => {
  const pick = (
    card: ReturnType<typeof gmunden>,
    values: CardValues,
    holding: Partial<Record<CardFieldKey, number>>,
    answered: CardFieldKey[],
    key: CardFieldKey,
    index: number,
    line: string,
  ) => reRankGuesses(
    card,
    { ...values, [key]: line },
    new Set([...answered, key]),
    { ...holding, [key]: index },
  );

  it('takes the line away from the field that was holding it', () => {
    /*
      The member says the person is called "Stadtamt Gmunden" — wrong, but it is
      their card and their call. What matters is that `company`, which was
      standing on that very line, does not go on showing it: one fact in two
      boxes is what somebody then saves.
    */
    const card = gmunden();
    const { values, extras: _ } = readCard(card);
    expect(values.company).toBe('Stadtamt Gmunden');

    const after = pick(card, values, cardHolding(card), [], 'name', 0, 'Stadtamt Gmunden');
    expect(after.values.name).toBe('Stadtamt Gmunden');
    expect(after.values.company).toBe('');
  });

  it('leaves every field the member did not touch exactly where it was', () => {
    const card = gmunden();
    const { values } = readCard(card);
    const after = pick(card, values, cardHolding(card), [], 'name', 0, 'Stadtamt Gmunden');
    expect(after.values.email).toBe(values.email);
    expect(after.values.phone).toBe(values.phone);
    expect(after.values.address).toBe(values.address);
  });

  it('NEVER changes a field the member answered themselves', () => {
    /*
      The contract the whole feature rests on. A correction that quietly
      rewrites what somebody typed a moment ago turns corrections into a thing
      people undo rather than make.
    */
    const card = gmunden();
    const { values } = readCard(card);
    const mine = { ...values, phone: '+43 664 000 0000' };
    const after = pick(card, mine, cardHolding(card), ['phone'], 'name', 0, 'Stadtamt Gmunden');
    expect(after.values.phone).toBe('+43 664 000 0000');
  });

  it('gives a field its runner-up rather than emptying it when there is one', () => {
    // `phone` held the mobile and nearly chose the landline. Take the mobile
    // for something else and the landline is the answer, not a blank row.
    const card = gmunden();
    const { values } = readCard(card);
    const holding = cardHolding(card);
    expect(holding.phone).toBe(5);

    const after = pick(card, values, holding, [], 'name', 5, 'M +43 664 123 4567');
    expect(after.values.phone).toBe('T +43 7612 794 0');
  });

  it('is stable: re-ranking with nothing answered changes nothing', () => {
    // The auction below is the parser's own, so running it again on the
    // parser's own answer must be a no-op. A drift here would move fields
    // around on a screen nobody touched.
    const card = gmunden();
    const { values } = readCard(card);
    const again = reRankGuesses(card, values, new Set(), cardHolding(card));
    // `website` aside — `readCard` deliberately emptied it (a Facebook page is
    // not a website) and the re-rank knows nothing of that rule.
    for (const key of CARD_FIELDS) {
      if (key === 'website') continue;
      expect({ key, value: again.values[key] }).toEqual({ key, value: values[key] });
    }
  });
});

describe('what the extras become when they are saved', () => {
  it('renders a translation key, and the CARD\'s own word verbatim', () => {
    // Translating a company's own word for something invents a fact; writing
    // our English word onto a German record is the mirror of the same bug.
    const rows = [
      { id: 'a', labelKey: 'customers.social.facebook', value: 'facebook.com/x' },
      { id: 'b', label: 'Notruf', value: '+43 664 000 111' },
    ];
    expect(cardDetails(rows, t)).toEqual([
      { label: 'Facebook', value: 'facebook.com/x' },
      { label: 'Notruf', value: '+43 664 000 111' },
    ]);
  });

  it('lets the member win over both', () => {
    const rows = [{ id: 'a', labelKey: 'customers.extra.iban', value: 'AT61 1904 3002 3457 3201', rename: 'Spendenkonto' }];
    expect(cardDetails(rows, t)).toEqual([{ label: 'Spendenkonto', value: 'AT61 1904 3002 3457 3201' }]);
  });

  it('drops a row the member emptied instead of saving a blank', () => {
    // The server's own sanitiser would drop it; dropping it here means the
    // member is not left wondering why a nameless row appeared on the record.
    const rows = [
      { id: 'a', labelKey: 'customers.extra.iban', value: '  ' },
      { id: 'b', label: '', value: 'orphan' },
    ];
    expect(cardDetails(rows, t)).toEqual([]);
  });

  it('admits that a contact person has nowhere to keep them', () => {
    // `POST /customers/:id/contacts` carries a name, an email and a direct
    // line. Asking somebody to check something and then binning it is the
    // habit this whole screen was rebuilt to break, so it says so instead.
    expect(cardExtrasKept('client')).toBe(true);
    expect(cardExtrasKept('newCompany')).toBe(true);
    expect(cardExtrasKept('contact')).toBe(false);
  });
});
