import { parseBusinessCard, toCardLines, type CardLine } from '@hbcfield/shared/client';

/**
 * Reading a business card with rules instead of a model.
 *
 * These are real card layouts, written as the OCR would hand them over: lines
 * in reading order, each with a normalised y and height. Type size is the
 * designer telling you what matters, and the tests lean on it exactly as the
 * parser does.
 *
 * The contract is not "always right" — no free parser is. It is: never
 * silently wrong. Anything inferred comes back as `likely`, and the screen
 * shows that so a guess cannot be saved unseen.
 */
const card = (rows: [string, number, number][]): CardLine[] =>
  rows.map(([text, y, height]) => ({ text, y, height }));

describe('reading a business card', () => {
  // A conventional corporate card.
  const siemens = card([
    ['Siemens AG', 0.10, 0.07],
    ['Anna Gruber', 0.30, 0.13],
    ['Head of Facility Management', 0.42, 0.05],
    ['Siemensstraße 90, 1210 Wien', 0.62, 0.04],
    ['T +43 1 234 5601', 0.70, 0.04],
    ['M +43 664 123 4567', 0.76, 0.04],
    ['Fax +43 1 234 5699', 0.82, 0.04],
    ['a.gruber@siemens.com', 0.88, 0.04],
    ['www.siemens.at', 0.94, 0.04],
  ]);

  it('proves the fields that have a shape', () => {
    const r = parseBusinessCard(siemens);
    expect(r.email?.value).toBe('a.gruber@siemens.com');
    expect(r.email?.confidence).toBe('certain');
    expect(r.website?.value).toBe('www.siemens.at');
  });

  /*
    The trick that makes a free parser workable: the email domain names the
    employer. No vocabulary, no model, and it works in any language.
  */
  it('finds the company from the email domain', () => {
    const r = parseBusinessCard(siemens);
    expect(r.company?.value).toBe('Siemens AG');
  });

  it('takes the largest line that is not the company as the name', () => {
    const r = parseBusinessCard(siemens);
    expect(r.name?.value).toBe('Anna Gruber');
    // Inferred, and says so — the screen marks it CHECK.
    expect(r.name?.confidence).toBe('likely');
  });

  it('reads the job title beside the name', () => {
    expect(parseBusinessCard(siemens).title?.value).toBe('Head of Facility Management');
  });

  /*
    ⚠️ A card carries several numbers. The label decides, not the order: a fax
    is the one number nobody wants dialled, and a mobile is usually the one
    they do.
  */
  it('prefers a labelled number and never picks the fax', () => {
    const r = parseBusinessCard(siemens);
    expect(r.phone?.value).not.toContain('5699');
    expect(r.phone?.value).toContain('+43');
  });

  it('joins the street to the postcode line', () => {
    expect(parseBusinessCard(siemens).address?.value).toContain('1210 Wien');
  });

  // A one-person business: no legal form, a free mail host, no title.
  const sole = card([
    ['Tomasz Nowak', 0.22, 0.12],
    ['Elektroinstallationen', 0.36, 0.05],
    ['+43 660 555 1234', 0.60, 0.04],
    ['t.nowak@gmail.com', 0.68, 0.04],
  ]);

  it('does not mistake a mail provider for the company', () => {
    /*
      gmail is where the mail lives, not who they work for. With no usable
      domain and no legal form, the honest answer is NO company — an empty
      field the person fills in, rather than "Gmail" presented as their
      employer. Leaving it blank is the correct behaviour, not a gap.
    */
    const r = parseBusinessCard(sole);
    expect(r.company).toBeUndefined();
    expect(r.name?.value).toBe('Tomasz Nowak');
    // The trade it must never make: silence about the company does not cost
    // the fields it CAN prove.
    expect(r.email?.value).toBe('t.nowak@gmail.com');
    expect(r.phone?.value).toContain('660');
  });

  it('falls back to a legal form when there is no usable domain', () => {
    const r = parseBusinessCard(card([
      ['Bauunternehmen Weber GmbH', 0.14, 0.06],
      ['Klaus Weber', 0.32, 0.12],
      ['+43 1 555 0000', 0.70, 0.04],
      ['office@bw-bau.at', 0.78, 0.04],
    ]));
    // The domain "bw-bau" does not appear on the card, so the suffix decides.
    expect(r.company?.value).toBe('Bauunternehmen Weber GmbH');
    expect(r.name?.value).toBe('Klaus Weber');
  });

  it('never returns the same line as two different fields', () => {
    const r = parseBusinessCard(siemens);
    const used = [r.name, r.company, r.title, r.email, r.phone, r.website, r.address]
      .filter(Boolean).map((f) => f!.sourceIndex);
    expect(new Set(used).size).toBe(used.length);
  });

  it('keeps every line so a wrong guess is one tap to fix', () => {
    // The screen offers these as alternatives for any field.
    expect(parseBusinessCard(siemens).lines).toHaveLength(9);
  });

  it('survives a card it cannot read rather than inventing fields', () => {
    const r = parseBusinessCard(card([['░▒▓', 0.5, 0.05], ['??', 0.6, 0.04]]));
    expect(r.email).toBeUndefined();
    expect(r.phone).toBeUndefined();
    expect(r.lines.length).toBeGreaterThanOrEqual(1);
  });

  it('handles an empty scan without throwing', () => {
    expect(parseBusinessCard([]).lines).toEqual([]);
  });
});


/**
 * The seam between the reader and the rules.
 *
 * ML Kit reports boxes in image pixels; the rules think in fractions of the
 * card. Getting this wrong does not throw — it quietly makes every line the
 * same "size", which removes the strongest signal the parser has and turns
 * name detection into a coin flip.
 */
describe('normalising what the reader returns', () => {
  const blocks = [
    { lines: [{ text: 'Anna Gruber', boundingBox: { x: 100, y: 300, width: 400, height: 130 } }] },
    { lines: [{ text: 'Siemens AG', boundingBox: { x: 100, y: 100, width: 300, height: 70 } }] },
  ];

  it('converts pixels to fractions of the image', () => {
    const [first] = toCardLines(blocks as never, 1000);
    // Sorted top-first: Siemens AG is higher up the card.
    expect(first!.text).toBe('Siemens AG');
    expect(first!.y).toBeCloseTo(0.1, 3);
    expect(first!.height).toBeCloseTo(0.07, 3);
  });

  it('puts lines in reading order, whatever order the blocks arrive in', () => {
    // ML Kit groups by block, which is not always top to bottom.
    expect(toCardLines(blocks as never, 1000).map((l) => l.text)).toEqual(['Siemens AG', 'Anna Gruber']);
  });

  it('keeps relative sizes intact, at any resolution', () => {
    const small = toCardLines(blocks as never, 1000);
    const large = toCardLines(
      [{ lines: [{ text: 'Anna Gruber', boundingBox: { x: 400, y: 1200, width: 1600, height: 520 } }] },
       { lines: [{ text: 'Siemens AG', boundingBox: { x: 400, y: 400, width: 1200, height: 280 } }] }] as never,
      4000,
    );
    // A 4x photo of the same card must produce the same numbers.
    expect(large[0]!.y).toBeCloseTo(small[0]!.y, 3);
    expect(large[1]!.height).toBeCloseTo(small[1]!.height, 3);
  });

  it('does not divide by zero when the height is unknown', () => {
    expect(() => toCardLines(blocks as never, 0)).not.toThrow();
  });
});


/**
 * Only what was inside the frame the person aimed.
 *
 * The photograph is the whole scene — a desk, a poster, another card — and all
 * of it reaches the reader. Two things go wrong if that is kept: background
 * text competes to be the company, and heights are measured against the PHOTO
 * rather than the card, so "the largest line" stops meaning what the rules
 * assume it means.
 */
describe('keeping only the card', () => {
  // A card occupying the middle band of a portrait photo.
  const CROP = { left: 0.07, top: 0.35, width: 0.86, height: 0.30 };
  const scene = [{ lines: [
    { text: 'CONFERENCE 2026', boundingBox: { x: 100, y: 200, width: 800, height: 120 } },   // a banner, above
    // The card spans y 1050–1950 (0.35–0.65 of a 3000px photo).
    { text: 'Siemens AG',      boundingBox: { x: 150, y: 1150, width: 500, height: 90 } },   // on the card
    { text: 'Anna Gruber',     boundingBox: { x: 150, y: 1350, width: 600, height: 150 } },  // on the card
    { text: 'table clutter',   boundingBox: { x: 150, y: 2200, width: 400, height: 60 } },   // below
  ] }];
  const IMG_W = 1000, IMG_H = 3000;

  it('drops everything outside the frame', () => {
    const kept = toCardLines(scene as never, IMG_H, CROP, IMG_W).map((l) => l.text);
    expect(kept).toEqual(['Siemens AG', 'Anna Gruber']);
  });

  it('keeps the whole photo when no frame is given', () => {
    // The fallback must not silently discard anything.
    expect(toCardLines(scene as never, IMG_H).map((l) => l.text)).toHaveLength(4);
  });

  /*
    The subtle half. Heights re-measured against the CARD, not the photo — a
    line that is 5% of a tall photo can be 50% of the card, and the name rule
    reads "largest" as a fraction of what it is looking at.
  */
  it('re-measures heights against the card, not the photo', () => {
    const kept = toCardLines(scene as never, IMG_H, CROP, IMG_W);
    const name = kept.find((l) => l.text === 'Anna Gruber')!;
    // 150px of a 900px-tall card ≈ 0.167, not 150/3000 = 0.05.
    expect(name.height).toBeCloseTo(0.167, 2);
    expect(name.height).toBeGreaterThan(kept.find((l) => l.text === 'Siemens AG')!.height);
  });

  it('judges by the centre, so a line the frame clips is still the card\'s', () => {
    // A card held to fill the frame has lines touching its edges.
    const edge = [{ lines: [
      { text: 'Anna Gruber', boundingBox: { x: 40, y: 1400, width: 940, height: 120 } },
    ] }];
    expect(toCardLines(edge as never, IMG_H, CROP, IMG_W).map((l) => l.text)).toEqual(['Anna Gruber']);
  });

  it('reads the right person when a banner is bigger than the card', () => {
    // End to end: without the frame, "CONFERENCE 2026" is the largest line in
    // the photo and would be taken for the name.
    const parsed = parseBusinessCard(toCardLines(scene as never, IMG_H, CROP, IMG_W));
    expect(parsed.name?.value).toBe('Anna Gruber');
  });
});

/**
 * A card that is lying on its side.
 *
 * Portrait-format cards are a whole style, not an edge case — the design reads
 * with the card stood up, so fitting it into a landscape guide leaves the text
 * running bottom-to-top. A bounding box stays axis-aligned whatever the writing
 * does, so every line comes back tall and narrow, and the two signals the
 * parser rests on invert: "height" becomes the LENGTH of the line rather than
 * the size of its type, and reading order runs across x instead of down y.
 *
 * Taken from a real scan that returned one line — a logo — and no phone, email
 * or address at all.
 */
describe('a card photographed on its side', () => {
  const IMG_W = 4000, IMG_H = 3000;
  // The card fills the frame; the writing runs up it, so lines advance in +x.
  const CROP = { left: 0.375, top: 0.133, width: 0.35, height: 0.733 };

  const sideways = [{ lines: [
    // x = position in reading order, width = type size,
    // y/height = where the line starts and how long it runs.
    { text: 'Dr. Dilyana NIKIFOROVA',          boundingBox: { x: 1560, y: 900,  width: 30,  height: 520 } },
    { text: 'Dr. Dilyana Nikiforova',          boundingBox: { x: 1750, y: 700,  width: 110, height: 1100 } },
    { text: 'Ärztin für Allgemeinmedizin',     boundingBox: { x: 1900, y: 760,  width: 55,  height: 980 } },
    { text: 'T +43 7613 90 80 55',             boundingBox: { x: 2150, y: 1150, width: 50,  height: 700 } },
    { text: 'F +43 7613 90 80 56',             boundingBox: { x: 2230, y: 1150, width: 50,  height: 700 } },
    { text: 'M arzt@nikiforova.at',            boundingBox: { x: 2310, y: 1150, width: 50,  height: 700 } },
    { text: '4663 Laakirchen, Traunsteinweg 1', boundingBox: { x: 2450, y: 1000, width: 50, height: 900 } },
    { text: 'WWW.NIKIFOROVA.AT',               boundingBox: { x: 2700, y: 1300, width: 45,  height: 650 } },
  ] }];

  const lines = () => toCardLines(sideways as never, IMG_H, CROP, IMG_W);

  it('keeps every line on the card', () => {
    expect(lines()).toHaveLength(8);
  });

  it('reads across the card, not down it', () => {
    // Reading order is the order the designer set, whichever way it is lying.
    expect(lines().map((l) => l.text)[1]).toBe('Dr. Dilyana Nikiforova');
    expect(lines().map((l) => l.text).at(-1)).toBe('WWW.NIKIFOROVA.AT');
  });

  /*
    The load-bearing one. Before this, "height" was the length of the line, so
    the ADDRESS — the longest string on the card — measured as the largest type
    and the name rule would have taken it.
  */
  it('takes type size from the other axis', () => {
    const l = lines();
    const name = l.find((x) => x.text === 'Dr. Dilyana Nikiforova')!;
    const address = l.find((x) => x.text.startsWith('4663'))!;
    expect(name.height).toBeGreaterThan(address.height);
  });

  it('reads the whole card end to end', () => {
    const r = parseBusinessCard(lines());
    expect(r.email?.value).toBe('arzt@nikiforova.at');
    expect(r.phone?.value).toBe('+43 7613 90 80 55');
    expect(r.website?.value).toBe('WWW.NIKIFOROVA.AT');
    expect(r.address?.value).toContain('4663 Laakirchen');
    expect(r.name?.value).toBe('Dr. Dilyana Nikiforova');
    expect(r.title?.value).toBe('Ärztin für Allgemeinmedizin');
  });

  /*
    The guard on the guard. An upright card must not be mistaken for a rotated
    one, or the fix trades one silent failure for another.
  */
  it('leaves an upright card alone', () => {
    const upright = [{ lines: [
      { text: 'Siemens AG',   boundingBox: { x: 150, y: 300, width: 500, height: 90 } },
      { text: 'Anna Gruber',  boundingBox: { x: 150, y: 500, width: 600, height: 150 } },
      { text: 'a.g@siemens.com', boundingBox: { x: 150, y: 700, width: 700, height: 60 } },
    ] }];
    const r = toCardLines(upright as never, 3000, undefined, 1000);
    expect(r.map((l) => l.text)).toEqual(['Siemens AG', 'Anna Gruber', 'a.g@siemens.com']);
    expect(r[1]!.height).toBeGreaterThan(r[0]!.height);
  });

  it('is not turned on its side by one stacked word', () => {
    // A vertical logo beside ordinary text must not flip the card.
    const mostlyUpright = [{ lines: [
      { text: 'ACME', boundingBox: { x: 60, y: 200, width: 40, height: 400 } },  // stacked
      { text: 'Anna Gruber', boundingBox: { x: 200, y: 300, width: 600, height: 150 } },
      { text: 'Head of Sales', boundingBox: { x: 200, y: 500, width: 500, height: 70 } },
    ] }];
    expect(toCardLines(mostlyUpright as never, 3000, undefined, 1000).map((l) => l.text))
      .toEqual(['ACME', 'Anna Gruber', 'Head of Sales']);
  });
});
