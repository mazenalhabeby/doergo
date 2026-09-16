import {
  parseBusinessCard,
  cardColumns,
  detectCardKind,
  scoreCardLines,
  companyDomainFromEmail,
  type CardLine,
} from '@hbcfield/shared/client';

/**
 * A table of REAL card shapes, and what the reader must make of each.
 *
 * `business-card.spec.ts` next door pins the behaviour the reader already had.
 * This file is about the shapes it used to get WRONG, and each of them is a
 * card somebody actually handed over:
 *
 *   - a website whose dot the scan lost, offered as a person's name
 *   - a two-column card read as interleaved nonsense
 *   - a company card whose wordmark is the largest text
 *   - an address the rules could only read in one layout
 *
 * The fixtures are written as the OCR hands them over: text, a normalised y and
 * height, and — where the card has columns — a normalised x and width. They are
 * the argument. If a rule changes and a card here reads differently, that is a
 * decision somebody has to make on purpose.
 */

/** `[text, y, height]`, or `[text, y, height, x, width]` when geometry matters. */
type Row = [string, number, number] | [string, number, number, number, number];
const card = (rows: Row[]): CardLine[] =>
  rows.map(([text, y, height, x, width]) =>
    x === undefined ? { text, y, height } : { text, y, height, x, width });

/** The same card as an engine that reports no geometry would hand it over. */
const withoutGeometry = (lines: CardLine[]): CardLine[] =>
  lines
    .map(({ text, y, height }) => ({ text, y, height }))
    .sort((a, b) => a.y - b.y);

// ── 1. The lost dot ─────────────────────────────────────────────────────────

/**
 * The failure this rewrite started from.
 *
 * The scan read `Www.dvd-personalcom` — no dot before "com". The website
 * pattern demanded one, so the line did not match, so nothing marked it used,
 * so it fell through to the name rule, which excluded digits, "@", legal forms
 * and job titles but had nothing at all to say about a line beginning "www".
 *
 * ⚠️ Both halves matter, and the second is the important one. Tolerating the
 * missing dot fixes THIS card; refusing to call a web address a person fixes
 * every card whose TLD the reader has never heard of.
 */
describe('a website the reader could not quite capture', () => {
  const dvd = card([
    ['DVD PERSONAL', 0.12, 0.11],
    ['Martina Huber', 0.32, 0.08],
    ['Personalberatung', 0.42, 0.04],
    ['Www.dvd-personalcom', 0.70, 0.04],
    ['+43 662 555 1234', 0.78, 0.04],
    ['m.huber@dvd-personal.at', 0.86, 0.04],
  ]);

  it('reads it as the website despite the missing separator', () => {
    expect(parseBusinessCard(dvd).website?.value).toBe('Www.dvd-personalcom');
  });

  it('never offers it as the person', () => {
    const r = parseBusinessCard(dvd);
    expect(r.name?.value).toBe('Martina Huber');
    expect(r.name?.value).not.toContain('dvd-personal');
  });

  /*
    The half that must not depend on the other half. `.zzz` is not a TLD this
    file knows, so the capture CANNOT succeed — and the line still must not
    become a name. The old code coupled the two, and that coupling was the bug.
  */
  it('still refuses it as a name when the capture is impossible', () => {
    const unknownTld = card([
      ['DVD PERSONAL', 0.12, 0.11],
      ['Martina Huber', 0.32, 0.08],
      ['Www.dvd-personalzzz', 0.70, 0.04],
      ['m.huber@dvd-personal.at', 0.86, 0.04],
    ]);
    const r = parseBusinessCard(unknownTld);
    expect(r.website).toBeUndefined();
    expect(r.name?.value).toBe('Martina Huber');
    // And it is not smuggled in as the company either.
    expect(r.company?.value).not.toContain('Www');
  });

  /*
    The card as it actually arrived, with nothing better on it.

    ⚠️ On the real scan the web address was the LARGEST line left once the
    phone and the email were spoken for — no digits, no "@", no legal form, no
    job title — so the name rule took it, and a customer was created called
    "Www.dvd-personalcom". Both halves of the fix are exercised here at once:
    the line is captured as a website, and it could not have been a name even
    if it had not been.
  */
  it('does not become the name when it is the biggest line left', () => {
    const r = parseBusinessCard(card([
      ['Www.dvd-personalcom', 0.20, 0.10],
      ['Personalvermittlung Salzburg', 0.40, 0.05],
      ['+43 662 555 1234', 0.70, 0.04],
    ]));
    expect(r.website?.value).toBe('Www.dvd-personalcom');
    expect(r.name?.value).not.toContain('Www');
  });

  /*
    ⚠️ And the same card with a TLD nothing can capture. An EMPTY name is the
    correct answer: the screen shows the line list and somebody picks. The old
    code filled the field in, confidently, with a URL.
  */
  it('leaves the name empty rather than filling it with a web address', () => {
    const r = parseBusinessCard(card([
      ['Www.dvd-personalzzz', 0.20, 0.10],
      ['+43 662 555 1234', 0.70, 0.04],
    ]));
    expect(r.website).toBeUndefined();
    expect(r.name).toBeUndefined();
    expect(r.company).toBeUndefined();
    // Nothing is lost: every line is still there to choose from.
    expect(r.lines).toContain('Www.dvd-personalzzz');
  });

  /*
    ⚠️ The loose pattern is allowed only behind a `www` prefix, and the reason
    is this test. Plenty of ordinary German words end in a country TLD.
  */
  it('does not turn ordinary words into web addresses', () => {
    const r = parseBusinessCard(card([
      ['Privat und Gebäude', 0.20, 0.10],
      ['Versicherungsmakler', 0.40, 0.05],
      ['+43 1 234 5678', 0.70, 0.04],
    ]));
    expect(r.website).toBeUndefined();
  });
});

// ── 2. Columns ──────────────────────────────────────────────────────────────

/**
 * A two-column card: the firm down one side, the person down the other.
 *
 * `x` and `width` were computed from the bounding box and thrown away one line
 * later, so this card arrived as lines sorted by y — the company's second line
 * between the person's name and their job title, and the two halves of the
 * address separated by a phone number.
 */
describe('a card laid out in two columns', () => {
  /*
    ⚠️ Written in the order `toCardLines` hands them over — sorted by y, and
    nothing else. Grouping the columns in the fixture would make the test pass
    with the clustering removed, which is a test that proves nothing.
  */
  const nordwerk = card([
    ['NORDWERK', 0.10, 0.09, 0.05, 0.30],            // left: the logo
    ['Thomas Berger', 0.14, 0.07, 0.45, 0.42],       // right: the person
    ['Anlagenbau GmbH', 0.21, 0.045, 0.05, 0.30],    // left: the legal name
    ['Projektleiter', 0.24, 0.035, 0.45, 0.30],      // right: their job
    ['T +43 732 555 100', 0.60, 0.03, 0.45, 0.40],   // right
    ['Industriestraße 4', 0.62, 0.03, 0.05, 0.30],   // left: the address …
    ['t.berger@nordwerk.at', 0.66, 0.03, 0.45, 0.48],// right
    ['4020 Linz', 0.68, 0.03, 0.05, 0.22],           // left: … continued
    ['www.nordwerk.at', 0.72, 0.03, 0.45, 0.38],     // right
  ]);

  it('finds the two columns and reads down one before the other', () => {
    expect(cardColumns(nordwerk)).toEqual([[0, 2, 5, 7], [1, 3, 4, 6, 8]]);
    const r = parseBusinessCard(nordwerk);
    expect(r.columns).toBe(2);
    expect(r.lines.slice(0, 4)).toEqual(['NORDWERK', 'Anlagenbau GmbH', 'Industriestraße 4', '4020 Linz']);
  });

  /*
    The load-bearing consequence. Sorted by y alone, a phone number and an
    email sit BETWEEN the street and the town, so the address block stops at
    the street and the customer gets half an address with nothing to say it is
    half.
  */
  it('assembles an address that is only adjacent within its column', () => {
    expect(parseBusinessCard(nordwerk).address?.value).toBe('Industriestraße 4, 4020 Linz');
  });

  it('shows what the geometry was buying — the same card without it', () => {
    const flat = withoutGeometry(nordwerk);
    // Sorted by y, the card interleaves: this is what the reader used to see,
    // with a phone number and an email sitting inside the postal address.
    expect(flat.map((l) => l.text).slice(0, 4))
      .toEqual(['NORDWERK', 'Thomas Berger', 'Anlagenbau GmbH', 'Projektleiter']);
    const r = parseBusinessCard(flat);
    expect(r.columns).toBe(1);
    expect(r.address?.value).toBe('Industriestraße 4');
  });

  /*
    ⚠️ `x`/`width` are OPTIONAL and the reader must keep working without them.
    Everything except the address survives the loss, which is the whole point
    of degrading rather than failing.
  */
  it('reads every other field identically with no geometry at all', () => {
    const withGeo = parseBusinessCard(nordwerk);
    const without = parseBusinessCard(withoutGeometry(nordwerk));
    for (const key of ['company', 'name', 'title', 'email', 'phone', 'website'] as const) {
      expect(without[key]?.value).toBe(withGeo[key]?.value);
    }
  });

  /*
    A false split is worse than a missed one: it scrambles the reading order of
    an ordinary card. A single centred column, and a right-aligned stray, must
    both come back as one column.
  */
  it('does not invent columns on a single-column card', () => {
    const centred = card([
      ['Siemens AG', 0.10, 0.07, 0.34, 0.32],
      ['Anna Gruber', 0.30, 0.13, 0.30, 0.40],
      ['Head of Facility Management', 0.42, 0.05, 0.18, 0.64],
      // Right-aligned, alone: a stray, not a column.
      ['+43 1 234 5601', 0.70, 0.04, 0.62, 0.34],
      ['a.gruber@siemens.com', 0.88, 0.04, 0.24, 0.52],
    ]);
    expect(cardColumns(centred)).toHaveLength(1);
    expect(parseBusinessCard(centred).columns).toBe(1);
  });

  it('does not split a card whose halves are stacked rather than beside', () => {
    // Two blocks that never run alongside each other are one column, however
    // far apart their left edges are.
    const stacked = card([
      ['Nordwerk GmbH', 0.08, 0.06, 0.05, 0.30],
      ['Anlagenbau', 0.16, 0.04, 0.05, 0.30],
      ['Thomas Berger', 0.70, 0.06, 0.55, 0.40],
      ['t.berger@nordwerk.at', 0.80, 0.03, 0.55, 0.42],
    ]);
    expect(cardColumns(stacked)).toHaveLength(1);
  });
});

// ── 3. Which way round is the card? ─────────────────────────────────────────

/**
 * "The biggest text is the person" is true on a personal card and false on
 * every card a company had designed.
 *
 * So the kind is DECIDED first, from signals anybody can argue with, and the
 * decision flips the ranking instead of being bolted on as an exception.
 */
describe('telling a company card from a personal one', () => {
  const billa = card([
    ['BILLA AG', 0.10, 0.14],
    ['Thomas Huber', 0.34, 0.06],
    ['Filialleiter', 0.42, 0.035],
    ['Wienerbergstraße 11', 0.60, 0.03],
    ['1100 Wien', 0.66, 0.03],
    ['+43 2236 600 0', 0.74, 0.03],
    ['t.huber@billa.at', 0.82, 0.03],
  ]);

  it('reads the wordmark as the company, not as the person', () => {
    const r = parseBusinessCard(billa);
    expect(r.kind.kind).toBe('COMPANY');
    expect(r.company?.value).toBe('BILLA AG');
    // The person is set less than HALF the size of the wordmark, and is still
    // the person. Under the old rule this field held "BILLA AG".
    expect(r.name?.value).toBe('Thomas Huber');
  });

  /*
    The card the old rule could not read at all, and the reason the KIND has to
    be decided rather than assumed.

    There is no legal form here, and the domain (`steinergroup.at`) is not the
    word printed on the card, so the two easy signals are both absent. All that
    is left is the shape of the layout: a short shouted line set twice the size
    of everything else, with a person's name beneath it.

    ⚠️ Under "the largest text is the person", this card produced name =
    "STEINER" and NO company at all — a customer record named after a logo.
  */
  it('flips the ranking on a wordmark alone, with no legal form and no matching domain', () => {
    const steiner = card([
      ['STEINER', 0.10, 0.14],
      ['Julia Wimmer', 0.34, 0.06],
      ['Head of Sales', 0.42, 0.035],
      ['+43 1 555 2000', 0.74, 0.03],
      ['office@steinergroup.at', 0.82, 0.03],
    ]);
    const v = detectCardKind(steiner);
    expect(v.kind).toBe('COMPANY');
    expect(v.reasons).toContain('largest-is-a-wordmark');
    expect(v.reasons).not.toContain('legal-form-is-largest');
    expect(v.reasons).not.toContain('largest-matches-email-domain');

    const r = parseBusinessCard(steiner);
    expect(r.company?.value).toBe('STEINER');
    expect(r.name?.value).toBe('Julia Wimmer');
  });

  it('says WHY, in words a screen or a test can read', () => {
    const v = detectCardKind(billa);
    expect(v.kind).toBe('COMPANY');
    expect(v.reasons).toContain('legal-form-is-largest');
    expect(v.reasons).toContain('largest-matches-email-domain');
    expect(v.confidence).toBeGreaterThan(0.5);
  });

  /*
    A wordmark with nobody beneath it is NOT evidence of a company card — that
    one name is as likely to be a person's, set in capitals.
  */
  it('needs somebody else on the card before it calls the biggest line a wordmark', () => {
    expect(detectCardKind(billa).reasons).toContain('largest-is-a-wordmark');
    const alone = card([
      ['ANNA GRUBER', 0.30, 0.13],
      ['+43 664 123 4567', 0.70, 0.04],
      ['a.gruber@siemens.com', 0.88, 0.04],
    ]);
    expect(detectCardKind(alone).reasons).not.toContain('largest-is-a-wordmark');
    expect(detectCardKind(alone).kind).toBe('PERSON');
    expect(parseBusinessCard(alone).name?.value).toBe('ANNA GRUBER');
  });

  /*
    A personal card with a job title. Every signal points the other way: a
    person-shaped largest line, letters in front of the name, a job title on
    the card, and a mailbox that names a human being.
  */
  it('reads a personal card as a personal card', () => {
    const moser = card([
      ['Moser Technik GmbH', 0.12, 0.06],
      ['Mag. Katharina Moser', 0.30, 0.11],
      ['Geschäftsführerin', 0.40, 0.04],
      ['Herrengasse 12, 1010 Wien, Austria', 0.62, 0.03],
      ['+43 1 533 0000', 0.74, 0.03],
      ['k.moser@mosertechnik.at', 0.82, 0.03],
    ]);
    const v = detectCardKind(moser);
    expect(v.kind).toBe('PERSON');
    expect(v.reasons).toContain('largest-carries-an-honorific');
    expect(v.reasons).toContain('role-line-present');

    const r = parseBusinessCard(moser);
    expect(r.name?.value).toBe('Mag. Katharina Moser');
    // ⚠️ The kind decides the RANKING, not whether a company is found at all:
    // the legal form still names the firm on a personal card.
    expect(r.company?.value).toBe('Moser Technik GmbH');
    expect(r.title?.value).toBe('Geschäftsführerin');
  });

  /*
    ⚠️ German writes a job title as one word, and `\b` cannot see inside one.
    "Geschäftsführerin", "Projektleiter" and "Filialleiter" all failed the
    original pattern, in the language this product ships most.
  */
  it('recognises a German compound job title', () => {
    for (const title of ['Geschäftsführerin', 'Projektleiter', 'Filialleiter', 'Rechtsanwalt', 'Abteilungsleitung']) {
      const r = parseBusinessCard(card([
        ['Maria Berger', 0.20, 0.10],
        [title, 0.32, 0.04],
        ['m.berger@example.at', 0.80, 0.03],
      ]));
      expect(r.title?.value).toBe(title);
    }
  });

  /*
    A card that gives nothing away keeps the assumption the file made for
    years — but says so, with no confidence, rather than presenting it as read.
  */
  it('falls back to the person, and admits it is a fallback', () => {
    const v = detectCardKind(card([['Hauptplatz 3', 0.4, 0.05], ['4663', 0.5, 0.04]]));
    expect(v.kind).toBe('PERSON');
    expect(v.confidence).toBe(0);
  });
});

// ── 4. No rule owns a line just for running first ───────────────────────────

/**
 * The structural defect behind problem 1, stated on its own.
 *
 * Every rule used to call `take()`, which marked the line used, so whichever
 * ran first won — and, worse, whichever FAILED first handed its line to
 * something with no claim on it. Lines are scored independently now, and the
 * strongest claim is settled first.
 */
describe('the strongest claim wins, not the earliest rule', () => {
  const nordwerk = card([
    ['NORDWERK', 0.10, 0.09, 0.05, 0.30],
    ['Thomas Berger', 0.14, 0.07, 0.45, 0.42],
    ['Anlagenbau GmbH', 0.21, 0.045, 0.05, 0.30],
    ['Projektleiter', 0.24, 0.035, 0.45, 0.30],
    ['T +43 732 555 100', 0.60, 0.03, 0.45, 0.40],
    ['Industriestraße 4', 0.62, 0.03, 0.05, 0.30],
    ['t.berger@nordwerk.at', 0.66, 0.03, 0.45, 0.48],
    ['4020 Linz', 0.68, 0.03, 0.05, 0.22],
    ['www.nordwerk.at', 0.72, 0.03, 0.45, 0.38],
  ]);

  it('scores every line for every role, whether or not anything claims it', () => {
    const scores = scoreCardLines(nordwerk);
    // "NORDWERK" is a plausible name and a far better company. Both facts
    // exist at once; the assignment is what resolves them.
    const name = scores.name.map((c) => c.value);
    expect(name[0]).toBe('Thomas Berger');
    expect(name).toContain('NORDWERK');
    expect(scores.company[0]!.value).toBe('NORDWERK');
    expect(scores.company[0]!.score).toBeGreaterThan(scores.name.find((c) => c.value === 'NORDWERK')!.score);
  });

  it('never gives one line to two fields', () => {
    const r = parseBusinessCard(nordwerk);
    const used = [r.name, r.company, r.title, r.email, r.phone, r.website, r.vat, r.address]
      .filter(Boolean)
      .map((f) => f!.sourceIndex);
    expect(new Set(used).size).toBe(used.length);
  });

  it('is deterministic — the same card reads the same way every time', () => {
    const once = JSON.stringify(parseBusinessCard(nordwerk));
    for (let i = 0; i < 20; i++) expect(JSON.stringify(parseBusinessCard(nordwerk))).toBe(once);
  });
});

// ── 5. Alternatives, and saying when it is guessing ─────────────────────────

describe('offering the runners-up instead of the whole card', () => {
  const nordwerk = card([
    ['NORDWERK', 0.10, 0.09, 0.05, 0.30],
    ['Anlagenbau GmbH', 0.21, 0.045, 0.05, 0.30],
    ['Thomas Berger', 0.14, 0.07, 0.45, 0.42],
    ['t.berger@nordwerk.at', 0.66, 0.03, 0.45, 0.48],
  ]);

  it('carries the runner-up, so a correction is one tap rather than a list', () => {
    const company = parseBusinessCard(nordwerk).company!;
    expect(company.value).toBe('NORDWERK');
    expect(company.alternatives.map((a) => a.value)).toEqual(['Anlagenbau GmbH']);
    // Every alternative points at a line, so the screen can select it.
    expect(company.alternatives[0]!.sourceIndex).toBe(1);
    expect(company.alternatives[0]!.score).toBeLessThan(company.score);
  });

  /*
    ⚠️ Two unlabelled numbers have no right answer, and saying "I am choosing"
    is the point of the flag. A card that labels one of them does have one.
  */
  it('flags two bare phone numbers as a guess, and a labelled pair as read', () => {
    const bare = parseBusinessCard(card([
      ['Anna Gruber', 0.20, 0.10],
      ['+43 1 234 5601', 0.60, 0.04],
      ['+43 664 123 4567', 0.68, 0.04],
      ['a.gruber@siemens.com', 0.80, 0.04],
    ]));
    expect(bare.phone?.contested).toBe(true);
    expect(bare.phone?.alternatives).toHaveLength(1);

    const labelled = parseBusinessCard(card([
      ['Anna Gruber', 0.20, 0.10],
      ['T +43 1 234 5601', 0.60, 0.04],
      ['M +43 664 123 4567', 0.68, 0.04],
      ['a.gruber@siemens.com', 0.80, 0.04],
    ]));
    expect(labelled.phone?.contested).toBe(false);
    expect(labelled.phone?.value).toContain('664');
  });

  it('never offers a line the winner already swallowed', () => {
    // The address takes two lines; "4020 Linz" is part of the answer, not an
    // alternative to it.
    const r = parseBusinessCard(card([
      ['Nordwerk GmbH', 0.10, 0.06],
      ['Industriestraße 4', 0.60, 0.03],
      ['4020 Linz', 0.66, 0.03],
      ['office@nordwerk.at', 0.80, 0.03],
    ]));
    expect(r.address?.value).toBe('Industriestraße 4, 4020 Linz');
    expect(r.address?.alternatives).toEqual([]);
  });
});

// ── 6. Addresses in whatever shape the card prints them ─────────────────────

/**
 * The old rule demanded a postcode line and joined only the street line
 * IMMEDIATELY ABOVE. That reads exactly one layout, and a card is not obliged
 * to use it.
 */
describe('assembling an address block', () => {
  const addressOf = (rows: Row[]) => parseBusinessCard(card(rows)).address?.value;

  it('reads an address written on one line', () => {
    expect(addressOf([
      ['Moser Technik GmbH', 0.12, 0.06],
      ['Katharina Moser', 0.30, 0.11],
      ['Herrengasse 12, 1010 Wien', 0.62, 0.03],
      ['k.moser@mosertechnik.at', 0.82, 0.03],
    ])).toBe('Herrengasse 12, 1010 Wien');
  });

  /*
    ⚠️ The UK and the Netherlands print the postcode before the street, and the
    old rule looked only UPWARDS from the postcode — so this card produced the
    postcode alone, with the street dropped silently.
  */
  it('reads a postcode printed before the street', () => {
    expect(addressOf([
      ['Cambridge Tools Ltd', 0.12, 0.05],
      ['James Whitfield', 0.28, 0.11],
      ['CB2 1TN Cambridge', 0.60, 0.03],
      ['14 Mill Lane', 0.66, 0.03],
      ['j.whitfield@cambridgetools.co.uk', 0.84, 0.03],
    ])).toBe('CB2 1TN Cambridge, 14 Mill Lane');
  });

  it('keeps the street, the town and the country together', () => {
    expect(addressOf([
      ['Katharina Moser', 0.30, 0.11],
      ['Herrengasse 12', 0.56, 0.03],
      ['1010 Wien', 0.62, 0.03],
      ['Austria', 0.68, 0.03],
      ['k.moser@example.at', 0.82, 0.03],
    ])).toBe('Herrengasse 12, 1010 Wien, Austria');
  });

  /*
    ⚠️ A phone number is four digits and a space away from looking like a
    postcode, and an address block that swallowed the phone line would take
    the phone field's line with it.
  */
  it('does not mistake a phone number for part of the address', () => {
    const r = parseBusinessCard(card([
      ['Anna Gruber', 0.20, 0.10],
      ['Siemensstraße 90', 0.50, 0.03],
      ['1210 Wien', 0.56, 0.03],
      ['T +43 1 234 5601', 0.62, 0.03],
      ['a.gruber@siemens.com', 0.80, 0.03],
    ]));
    expect(r.address?.value).toBe('Siemensstraße 90, 1210 Wien');
    expect(r.phone?.value).toBe('+43 1 234 5601');
  });

  /*
    ⚠️ No leading `\b` on the German street suffixes, and this is why:
    "Siemensstraße" is ONE word, so there is no boundary before "straße" and
    the original pattern matched no German street at all.
  */
  it('recognises a street glued to its town name, as German writes it', () => {
    expect(addressOf([
      ['Anna Gruber', 0.20, 0.10],
      ['Siemensstraße 90', 0.60, 0.03],
      ['a.gruber@siemens.com', 0.80, 0.03],
    ])).toBe('Siemensstraße 90');
  });
});

// ── 7. The email's domain, and who it may name ──────────────────────────────

/**
 * A domain names an employer; a mail provider names nobody.
 *
 * ⚠️ A suggestion is accepted with one tap and corrected with ten, so the cost
 * of a wrong one is asymmetric. Silence is the safe answer and is returned as
 * `undefined` rather than as a guess.
 */
describe('suggesting a company from the email domain', () => {
  it('answers with the domain when it belongs to a business', () => {
    expect(companyDomainFromEmail('t.huber@billa.at')).toBe('billa.at');
    expect(companyDomainFromEmail('a.gruber@siemens.com')).toBe('siemens.com');
    expect(companyDomainFromEmail('j.w@cambridgetools.co.uk')).toBe('cambridgetools.co.uk');
  });

  it('answers with nothing for a free provider', () => {
    for (const address of [
      'a@gmail.com', 'a@googlemail.com', 'a@outlook.com', 'a@hotmail.de', 'a@yahoo.com',
      'a@gmx.at', 'a@gmx.de', 'a@web.de', 'a@icloud.com', 'a@proton.me', 'a@protonmail.com',
      'a@aol.com', 'a@t-online.de',
    ]) {
      expect(companyDomainFromEmail(address)).toBeUndefined();
    }
  });

  it('is not fooled by capitals or by an address it cannot read', () => {
    expect(companyDomainFromEmail('A@GMX.AT')).toBeUndefined();
    expect(companyDomainFromEmail('not-an-address')).toBeUndefined();
    expect(companyDomainFromEmail(undefined)).toBeUndefined();
  });

  /*
    ⚠️ A `office@` card suggests nothing WHEN THE HOST IS FREE — which is the
    case worth guarding, because "GMX" as somebody's employer is wrong every
    time. A generic mailbox on the firm's OWN domain still names the firm:
    `office@huberbau.at` is Huber Bau's front desk, and dropping that would
    throw away the one free signal this reader has on a card with no legal
    form printed on it. What the generic local part changes is the KIND, not
    the domain.
  */
  it('distinguishes a generic mailbox from a generic host', () => {
    const freeHost = parseBusinessCard(card([
      ['Huber Bau GmbH', 0.12, 0.09],
      ['Klaus Huber', 0.30, 0.07],
      ['office@gmx.at', 0.80, 0.03],
    ]));
    expect(freeHost.companyDomain).toBeUndefined();
    expect(freeHost.kind.reasons).toContain('generic-mailbox');
    // The legal form still names the company; only the SUGGESTION is withheld.
    expect(freeHost.company?.value).toBe('Huber Bau GmbH');

    const ownDomain = parseBusinessCard(card([
      ['Huber Bau GmbH', 0.12, 0.09],
      ['Klaus Huber', 0.30, 0.07],
      ['office@huberbau.at', 0.80, 0.03],
    ]));
    expect(ownDomain.companyDomain).toBe('huberbau.at');
  });

  /*
    ⚠️ The card and the domain do not agree on punctuation: `dvd-personal.at`
    is printed "DVD Personal". Comparing the hyphenated label against the line
    matched nothing, and a real company went unrecognised for one dash.
  */
  it('matches a hyphenated domain to the line that prints it without the hyphen', () => {
    const r = parseBusinessCard(card([
      ['DVD PERSONAL', 0.12, 0.11],
      ['Martina Huber', 0.32, 0.08],
      ['m.huber@dvd-personal.at', 0.86, 0.04],
    ]));
    expect(r.company?.value).toBe('DVD PERSONAL');
    expect(r.companyDomain).toBe('dvd-personal.at');
  });

  /*
    ⚠️ The counter-case, and it is a real card. A sole practitioner's domain is
    her SURNAME, so the domain matches the line carrying her name — and the old
    email-domain rule silently filed "Dr. Dilyana Nikiforova" as the company.
    An empty company field is the honest answer.
  */
  it('does not offer a person as their own employer', () => {
    const r = parseBusinessCard(card([
      ['Dr. Dilyana Nikiforova', 0.20, 0.12],
      ['Ärztin für Allgemeinmedizin', 0.32, 0.05],
      ['Traunsteinweg 1, 4663 Laakirchen', 0.60, 0.04],
      ['arzt@nikiforova.at', 0.80, 0.04],
    ]));
    expect(r.kind.kind).toBe('PERSON');
    expect(r.name?.value).toBe('Dr. Dilyana Nikiforova');
    expect(r.company).toBeUndefined();
  });
});

// ── 8. What it must survive ─────────────────────────────────────────────────

/**
 * ⚠️ This is pure parsing of untrusted text off a photograph, on a screen
 * somebody is waiting on. Nothing here may throw, and nothing may take long.
 */
describe('a card it cannot read', () => {
  it('returns the lines rather than throwing, whatever it is handed', () => {
    for (const input of [
      [],
      undefined,
      null,
      'not a card',
      [null, undefined, { text: 5 }, { text: 'Anna Gruber', y: NaN, height: undefined }],
    ] as never[]) {
      expect(() => parseBusinessCard(input)).not.toThrow();
      expect(Array.isArray(parseBusinessCard(input).lines)).toBe(true);
    }
  });

  it('always answers with a kind, even when it read nothing', () => {
    const r = parseBusinessCard([] as CardLine[]);
    expect(r.lines).toEqual([]);
    expect(r.kind.kind).toBe('PERSON');
    expect(r.kind.confidence).toBe(0);
    expect(r.columns).toBe(1);
  });

  it('invents no fields from noise', () => {
    const r = parseBusinessCard(card([['░▒▓', 0.5, 0.05], ['??', 0.6, 0.04]]));
    expect(r.email).toBeUndefined();
    expect(r.phone).toBeUndefined();
    expect(r.company).toBeUndefined();
    expect(r.lines).toHaveLength(2);
  });

  /*
    ⚠️ The phone and VAT patterns had unbounded quantifiers over character
    classes that overlap what follows them — the shape a regex goes exponential
    on. Every quantifier is bounded now, and a line is capped before it is
    scanned. A second here is a frozen camera screen.
  */
  it('does not hang on a line built to make it backtrack', () => {
    const started = Date.now();
    parseBusinessCard([
      { text: 'ATU' + '1 '.repeat(4000) + 'x', y: 0.1, height: 0.05 },
      { text: '('.repeat(4000) + '1'.repeat(4000), y: 0.2, height: 0.05 },
      { text: 'www.' + 'a-'.repeat(4000) + 'b', y: 0.3, height: 0.05 },
      { text: 'a'.repeat(4000) + '@' + 'b'.repeat(4000) + '.com', y: 0.4, height: 0.05 },
    ]);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('reads a card in well under a frame, repeatedly', () => {
    const nordwerk = card([
      ['NORDWERK', 0.10, 0.09, 0.05, 0.30],
      ['Thomas Berger', 0.14, 0.07, 0.45, 0.42],
      ['Anlagenbau GmbH', 0.21, 0.045, 0.05, 0.30],
      ['Projektleiter', 0.24, 0.035, 0.45, 0.30],
      ['T +43 732 555 100', 0.60, 0.03, 0.45, 0.40],
      ['Industriestraße 4', 0.62, 0.03, 0.05, 0.30],
      ['t.berger@nordwerk.at', 0.66, 0.03, 0.45, 0.48],
      ['4020 Linz', 0.68, 0.03, 0.05, 0.22],
      ['www.nordwerk.at', 0.72, 0.03, 0.45, 0.38],
    ]);
    const started = Date.now();
    for (let i = 0; i < 500; i++) parseBusinessCard(nordwerk);
    // It runs on a phone while the camera is warm; 500 cards is not a card.
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
