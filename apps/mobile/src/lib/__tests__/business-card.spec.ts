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
