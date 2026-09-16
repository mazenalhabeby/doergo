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

describe('the same card on the next read, where the tilde became a hyphen', () => {
  /*
    The recogniser is not consistent between scans of ONE card. The raised
    tilde came back as `_` on one read and as a spaced `-` on the next, and the
    same read lost the `@` out of the email — so the parser must reach the same
    answer down three different roads.
  */
  const parsed: any = parseBusinessCard(
    card([
      'Jasmin Walther',
      'Stadtamt Gmunden - Liegenschaftsverwaltung',
      'Rathausplatz 1_ 4810 Gmunden',
      'T: +43 7612 794 243 - F: +43 7612 794 258 - M: +43 676 88 794 243',
      'jasmin.waltheragmunden.ooe.gv.at',
      'gmunden.at - facebook.com/stadt.gmunden',
    ]),
  );

  it('still separates the authority from its department', () => {
    expect(parsed.company?.value).toBe('Stadtamt Gmunden');
    expect(parsed.title?.value).toBe('Liegenschaftsverwaltung');
  });

  it('refuses an email with a lost @ as the web address', () => {
    // `jasmin.walther@gmunden…` came back as `jasmin.waltheragmunden…`. With no
    // `@` it is shaped exactly like a domain, and it won the website field on a
    // real scan — the member saw their correspondent filed as the company site.
    expect(parsed.website?.value).toBe('gmunden.at');
  });

  it('still finds the company with no email to take a domain from', () => {
    // The domain is what tells an authority from its department. With the email
    // ruined it falls back to the web address — the SHORTEST on the card, or
    // the ruined email wins that too.
    expect(parsed.companySuggestion).toBe('Gmunden');
  });

  it('still dials the mobile', () => {
    expect(parsed.phone?.value).toBe('+43 676 88 794 243');
  });
});

describe('an underscore that is part of a value survives', () => {
  it('is untouched with no space around it', () => {
    expect(parseBusinessCard(card(['datei_name.pdf'])).lines).toContain('datei_name.pdf');
  });

  it('leaves a compound word and a postcode alone', () => {
    // The hyphen is a separator only when whitespace sets it off — which is
    // why it is safe in the set at all.
    expect(parseBusinessCard(card(['Liegenschafts-verwaltung'])).lines).toContain('Liegenschafts-verwaltung');
    expect(parseBusinessCard(card(['A-1010 Wien'])).lines).toContain('A-1010 Wien');
  });

  it('leaves a house number alone when no space follows', () => {
    const parsed: any = parseBusinessCard(card(['Hauptstrasse 1_4810 Gmunden']));
    expect(parsed.address?.value ?? parsed.lines[0]).toContain('1_4810');
  });
});
