import { parseBusinessCard } from '@hbcfield/shared/client';

const card = (lines: string[]) =>
  lines.map((text, i) => ({ text, y: i / lines.length, height: i === 0 ? 0.09 : 0.06, x: 0.05, width: 0.9 }));

/**
 * The Gmunden card AS A REAL PHONE READ IT.
 *
 * The fixtures beside this one use the tilde the card is printed with. On the
 * device, ML Kit returned an UNDERSCORE for every one of them — and dropped the
 * space in front of one. That single substitution put the landline back in
 * `phone` and glued the department to the company, which is the whole fault the
 * segmentation work exists to prevent.
 *
 * A fixture written from the card rather than from the recogniser would have
 * gone on passing while the feature was broken in the field.
 */
describe('the card as the device actually read it', () => {
  const parsed: any = parseBusinessCard(
    card([
      'Jasmin Walther',
      'Stadtamt Gmunden _ Liegenschaftsverwaltung',
      'Rathausplatz 1_ 4810 Gmunden',
      'T: +43 7612 794 243 _ F: +43 7612 794 258 _ M: +43 676 88 794 243',
      'jasmin.walther@gmunden.ooe.gv.at',
      'gmunden.at _ facebook.com/stadt.gmunden',
    ]),
  );

  it('separates the authority from its department', () => {
    expect(parsed.company?.value).toBe('Stadtamt Gmunden');
    expect(parsed.title?.value).toBe('Liegenschaftsverwaltung');
  });

  it('dials the mobile, never the landline and never the fax', () => {
    expect(parsed.phone?.value).toBe('+43 676 88 794 243');
    expect(parsed.phones?.find((p: any) => p.kind === 'fax')?.value).toBe('+43 7612 794 258');
  });

  it('tidies a separator the recogniser glued to the word before it', () => {
    // `1_ 4810` has no space in FRONT, so it is rightly not a split — but the
    // glyph must not be left in the value a member reads back outside a door.
    expect(parsed.address?.value).toBe('Rathausplatz 1, 4810 Gmunden');
  });

  it('keeps the real website, not the Facebook page beside it', () => {
    expect(parsed.website?.value).toBe('gmunden.at');
  });
});

describe('an underscore that is part of a value survives', () => {
  it('is untouched with no space around it', () => {
    expect(parseBusinessCard(card(['datei_name.pdf'])).lines).toContain('datei_name.pdf');
  });

  it('leaves a house number alone when no space follows', () => {
    const parsed: any = parseBusinessCard(card(['Hauptstrasse 1_4810 Gmunden']));
    expect(parsed.address?.value ?? parsed.lines[0]).toContain('1_4810');
  });
});
