import {
  parseBusinessCard,
  segmentCardLine,
  readCardPhones,
  companyNameFromDomain,
  scoreCardLines,
  type CardLine,
} from '@hbcfield/shared/client';

/**
 * ONE LINE, SEVERAL FACTS — the assumption a real card broke.
 *
 * `business-card.spec.ts` pins what the reader always did; `business-card-
 * shapes.spec.ts` pins the layouts it used to get wrong. This file is about a
 * third thing, and it is a class rather than a card: a great many European
 * cards put two, three or four facts on ONE line and mark the joins with a
 * decorative glyph. The reader took a line to be a fact, so it returned the
 * organisation glued to its department, the first number on a line rather than
 * the right one, and no job title at all.
 *
 * The fixture at the bottom is a real card, transcribed line for line. The
 * tests above it are the rules that make it read, written so they can fail for
 * a reason rather than only as a whole.
 */

type Row = [string, number, number];
const card = (rows: Row[]): CardLine[] => rows.map(([text, y, height]) => ({ text, y, height }));

// ── 1. What makes a separator decorative ────────────────────────────────────

/**
 * ONE rule: a glyph is a separator when WHITESPACE SETS IT OFF.
 *
 * ⚠️ That single condition is what keeps every one of the cases below from
 * splitting, and none of them needs a rule of its own. A hyphen inside a
 * compound word, the slashes in a URL and in a date, the dash in a number
 * range — all of them are glued to their neighbours, which is exactly what
 * makes them part of a value rather than a join between two.
 */
describe('telling a separator from a character inside a value', () => {
  it('splits a glyph that stands on its own', () => {
    expect(segmentCardLine('Stadtamt Gmunden ~ Liegenschaftsverwaltung'))
      .toEqual(['Stadtamt Gmunden', 'Liegenschaftsverwaltung']);
    expect(segmentCardLine('Anna Gruber | Geschäftsführerin'))
      .toEqual(['Anna Gruber', 'Geschäftsführerin']);
    expect(segmentCardLine('Marketing · Vertrieb · Einkauf'))
      .toEqual(['Marketing', 'Vertrieb', 'Einkauf']);
  });

  it('treats a run of spaces as a join — it is a column gap the reader flattened', () => {
    expect(segmentCardLine('Tel  +43 1 234 5601')).toEqual(['Tel', '+43 1 234 5601']);
    // One space is a space.
    expect(segmentCardLine('Tel +43 1 234 5601')).toEqual(['Tel +43 1 234 5601']);
  });

  it('never cuts a hyphenated word in half', () => {
    // The department this whole change exists to find, written the other way.
    expect(segmentCardLine('Liegenschafts-verwaltung')).toEqual(['Liegenschafts-verwaltung']);
    expect(segmentCardLine('Dvd-Personal GmbH')).toEqual(['Dvd-Personal GmbH']);
  });

  it('never cuts a URL at its slashes', () => {
    expect(segmentCardLine('https://gmunden.at/kontakt/liegenschaften'))
      .toEqual(['https://gmunden.at/kontakt/liegenschaften']);
    expect(segmentCardLine('facebook.com/stadt.gmunden')).toEqual(['facebook.com/stadt.gmunden']);
  });

  it('never cuts a date or a number range', () => {
    expect(segmentCardLine('01/02/2026')).toEqual(['01/02/2026']);
    expect(segmentCardLine('+43 7612 794 243–258')).toEqual(['+43 7612 794 243–258']);
  });

  /*
    ⚠️ The cap is a bound on WORK, not a judgement about cards. Every segment
    becomes a line the whole scoring table runs over, and a badly recognised
    block of justified text is full of double spaces.
  */
  it('gives up on a line with too many pieces rather than multiplying the work', () => {
    const many = Array.from({ length: 12 }, (_, i) => `Fach ${i}`).join(' ~ ');
    expect(segmentCardLine(many)).toEqual([many]);
  });
});

// ── 2. Splitting may never lose a value ─────────────────────────────────────

/**
 * The promise that makes the rest of it safe to do.
 *
 * A line and its pieces are RIVALS, both measured and both scored, and the
 * argument is settled from the scores rather than from the text: the line
 * stands unless at least TWO of its pieces turned out to mean something on
 * their own. So a separator inside a value cannot quietly take half of it.
 */
describe('a line whose pieces mean nothing keeps its separator', () => {
  const kept = (line: string) => parseBusinessCard(card([
    [line, 0.20, 0.10],
    ['+43 1 555 0000', 0.70, 0.04],
    ['office@example.at', 0.80, 0.04],
  ]));

  it('keeps the whole line when neither half parses as anything', () => {
    // Neither "Bau" nor "Tec" can argue for itself, so the separator was part
    // of the value and the line is what the company field gets.
    expect(kept('Bau ~ Tec').company?.value).toBe('Bau ~ Tec');
  });

  /*
    ⚠️ ONE meaningful half is not a split either, and this is the case the rule
    had to be tightened for. "TEC" is a wordmark and "Anlagenbau GmbH" is a
    legal name; taken apart, the company becomes "Anlagenbau GmbH" and the
    firm's own initials are lost. Type size is what used to make "TEC" look
    like a candidate — see SEGMENT_SIZE_SHARE.
  */
  it('keeps a wordmark joined to the legal name it belongs to', () => {
    const r = parseBusinessCard(card([
      ['TEC | Anlagenbau GmbH', 0.14, 0.10],
      ['Klaus Weber', 0.34, 0.06],
      ['office@tec-anlagenbau.at', 0.80, 0.04],
    ]));
    expect(r.company?.value).toBe('TEC | Anlagenbau GmbH');
  });

  it('offers the whole line back whatever the resolver decided', () => {
    /*
      ⚠️ `lines` is the review screen's "pick a different line", and it is the
      only way back from a wrong answer. Both the glued line and its pieces stay
      in it: dropping the pieces hides a department the card printed, and
      dropping the line hides the firm's real name from the one person who
      knows it.
    */
    const r = parseBusinessCard(card([
      ['TEC | Anlagenbau GmbH', 0.14, 0.10],
      ['Klaus Weber', 0.34, 0.06],
      ['office@tec-anlagenbau.at', 0.80, 0.04],
    ]));
    expect(r.lines).toContain('TEC | Anlagenbau GmbH');
    expect(r.lines).toContain('Anlagenbau GmbH');
  });

  it('never hands one line and one of its own pieces to two fields', () => {
    const r = parseBusinessCard(card([
      ['Stadtamt Gmunden ~ Liegenschaftsverwaltung', 0.30, 0.05],
      ['Rathausplatz 1 ~ 4810 Gmunden', 0.42, 0.04],
      ['jasmin.walther@gmunden.ooe.gv.at', 0.68, 0.035],
    ]));
    const used = [r.name, r.company, r.title, r.email, r.phone, r.website, r.vat, r.address]
      .filter(Boolean)
      .map((f) => f!.value);
    // The glued line would be a second copy of everything under it.
    expect(used).not.toContain('Stadtamt Gmunden ~ Liegenschaftsverwaltung');
    expect(used).not.toContain('Rathausplatz 1 ~ 4810 Gmunden');
  });

  it('agrees with itself — the inspector shows what the parse actually chose from', () => {
    const rows = card([
      ['Stadtamt Gmunden ~ Liegenschaftsverwaltung', 0.30, 0.05],
      ['jasmin.walther@gmunden.ooe.gv.at', 0.68, 0.035],
    ]);
    const offered = scoreCardLines(rows).company.map((c) => c.value);
    expect(offered).toContain('Stadtamt Gmunden');
    expect(offered).not.toContain('Stadtamt Gmunden ~ Liegenschaftsverwaltung');
  });
});

// ── 3. Every number, typed by its own label ─────────────────────────────────

/**
 * ⚠️ "A labelled mobile is what a person wants dialled" was already the rule,
 * and it worked only ACROSS lines. A card that prints all three numbers on one
 * line asked the line whether it mentioned a mobile anywhere, which is the same
 * answer for every number on it — so the first number won, and on a municipal
 * card the first number is the switchboard with the FAX right behind it.
 */
describe('several numbers on one line', () => {
  it('reads each number by the label in front of it', () => {
    expect(readCardPhones('T: +43 7612 794 243 ~ F: +43 7612 794 258 ~ M: +43 676 88 794 243'))
      .toEqual([
        { value: '+43 7612 794 243', kind: 'landline' },
        { value: '+43 7612 794 258', kind: 'fax' },
        { value: '+43 676 88 794 243', kind: 'mobile' },
      ]);
  });

  /*
    ⚠️ The label was `/\bfax\b/` — the literal word — so `F:` beside `T:` and
    `M:` was invisible, and the fax was one regex away from being offered as
    the number to ring.
  */
  it('recognises the single-letter labels a card actually prints', () => {
    expect(readCardPhones('F +43 1 234 5699')[0]!.kind).toBe('fax');
    expect(readCardPhones('Fax. +43 1 234 5699')[0]!.kind).toBe('fax');
    expect(readCardPhones('Handy +43 664 1234567')[0]!.kind).toBe('mobile');
    expect(readCardPhones('Mobil: +43 664 1234567')[0]!.kind).toBe('mobile');
    expect(readCardPhones('Festnetz +43 1 2345678')[0]!.kind).toBe('landline');
  });

  it('says nothing about a number nobody labelled', () => {
    expect(readCardPhones('+43 1 234 5601')[0]!.kind).toBe('unknown');
  });

  it('takes the label NEAREST the number, not the first on the line', () => {
    const read = readCardPhones('Tel/Fax +43 1 234 5601 · Mobil +43 664 123 4567');
    expect(read[1]!.kind).toBe('mobile');
  });

  it('picks the mobile and returns all three typed', () => {
    const r = parseBusinessCard(card([
      ['Anna Gruber', 0.20, 0.10],
      ['T: +43 1 234 5601 ~ F: +43 1 234 5699 ~ M: +43 664 123 4567', 0.60, 0.04],
      ['a.gruber@siemens.com', 0.80, 0.04],
    ]));
    expect(r.phone?.value).toBe('+43 664 123 4567');
    expect(r.phones?.map((p) => p.kind)).toEqual(['landline', 'fax', 'mobile']);
  });

  /*
    ⚠️ A fax alone answers NOTHING for the phone field while still ruling its
    line out of being read as somebody's name. Those are two different
    questions and they used to share one answer.
  */
  it('never offers a fax, and never lets one become a name either', () => {
    const r = parseBusinessCard(card([
      ['Huber Bau GmbH', 0.12, 0.09],
      ['F: +43 1 234 5699', 0.50, 0.04],
      ['office@huberbau.at', 0.80, 0.04],
    ]));
    expect(r.phone).toBeUndefined();
    expect(r.name).toBeUndefined();
    expect(r.phones?.[0]).toMatchObject({ kind: 'fax' });
  });
});

// ── 4. The organisation, and the part of it this person works in ────────────

describe('a company name glued to a department', () => {
  /*
    ⚠️ THE DISCRIMINATOR. "Stadtamt Gmunden" and "Liegenschaftsverwaltung" are
    the same shape to a computer, and "Stadtamt" itself ends in the `-amt` that
    looks like a department suffix. What tells them apart is that one of them
    ECHOES THE DOMAIN the email and the website both point at.
  */
  it('gives the organisation to company and the department to title', () => {
    const r = parseBusinessCard(card([
      ['Jasmin Walther', 0.16, 0.10],
      ['Stadtamt Gmunden ~ Liegenschaftsverwaltung', 0.30, 0.05],
      ['jasmin.walther@gmunden.ooe.gv.at', 0.68, 0.035],
    ]));
    expect(r.company?.value).toBe('Stadtamt Gmunden');
    expect(r.title?.value).toBe('Liegenschaftsverwaltung');
  });

  it('works the other way round on the card, because position decides nothing', () => {
    const r = parseBusinessCard(card([
      ['Peter Ecker', 0.16, 0.10],
      ['Personalabteilung · Siemens AG', 0.30, 0.05],
      ['p.ecker@siemens.com', 0.68, 0.035],
    ]));
    expect(r.company?.value).toBe('Siemens AG');
    expect(r.title?.value).toBe('Personalabteilung');
  });

  /*
    ⚠️ A legal form says "organisation" as loudly as the domain does — and it
    has to, or a property manager becomes a department of itself.
  */
  it('does not make a department of a firm whose trade is in its name', () => {
    const r = parseBusinessCard(card([
      ['Hausverwaltung Meier GmbH', 0.14, 0.08],
      ['Klaus Meier', 0.32, 0.10],
      ['k.meier@hv-meier.at', 0.80, 0.04],
    ]));
    expect(r.company?.value).toBe('Hausverwaltung Meier GmbH');
    expect(r.title).toBeUndefined();
  });

  it('reads a department on a line of its own', () => {
    const r = parseBusinessCard(card([
      ['Maria Berger', 0.20, 0.10],
      ['Fachbereich Tiefbau', 0.32, 0.04],
      ['m.berger@linz.at', 0.80, 0.03],
    ]));
    expect(r.title?.value).toBe('Fachbereich Tiefbau');
  });
});

// ── 5. A company name recovered from the domain ─────────────────────────────

/**
 * ⚠️ This exists for the card whose company name CANNOT BE READ. The one below
 * prints its organisation as a hand-drawn script logo that no text recogniser
 * will ever make a word of — so the domain is the only surviving trace of who
 * this person works for, and an editable "Gmunden" beats an empty field and a
 * re-scan that will fail in exactly the same way.
 */
describe('a usable company name from the domain', () => {
  it('strips a multi-level public suffix, not just the last label', () => {
    // `ooe` is a federal state, `gv` is the public sector, `at` is the country.
    expect(companyNameFromDomain('gmunden.ooe.gv.at')).toBe('Gmunden');
    expect(companyNameFromDomain('gmunden.at')).toBe('Gmunden');
    expect(companyNameFromDomain('www.gmunden.at')).toBe('Gmunden');
    expect(companyNameFromDomain('uni.ac.at')).toBe('Uni');
    expect(companyNameFromDomain('cambridgetools.co.uk')).toBe('Cambridgetools');
  });

  it('writes it the way the card does, not the way the registrar does', () => {
    // `dvd-personal.at` is printed "DVD Personal"; the punctuation is the
    // domain's and never the company's.
    expect(companyNameFromDomain('dvd-personal.at')).toBe('Dvd Personal');
  });

  it('answers nothing for a mailbox provider', () => {
    for (const host of [
      'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.de', 'gmx.at',
      'web.de', 'yahoo.com', 'icloud.com', 'proton.me', 'aol.com', 't-online.de',
    ]) {
      expect(companyNameFromDomain(host)).toBeUndefined();
    }
  });

  it('answers nothing for a page somebody publishes ON rather than owns', () => {
    expect(companyNameFromDomain('facebook.com')).toBeUndefined();
    expect(companyNameFromDomain('linkedin.com')).toBeUndefined();
  });

  it('answers nothing for something that is not a domain', () => {
    expect(companyNameFromDomain('gmunden')).toBeUndefined();
    expect(companyNameFromDomain('')).toBeUndefined();
    expect(companyNameFromDomain(undefined)).toBeUndefined();
  });

  it('falls back to the website when the card carries no email', () => {
    const r = parseBusinessCard(card([
      ['Jasmin Walther', 0.16, 0.10],
      ['Rathausplatz 1, 4810 Gmunden', 0.42, 0.04],
      ['www.gmunden.at', 0.78, 0.035],
    ]));
    expect(r.companySuggestion).toBe('Gmunden');
  });

  /*
    ⚠️ The counter-case, and it is a real card. A sole practitioner's domain is
    her own SURNAME, so a suggestion built from it offers somebody as their own
    employer — the same mistake `company` already refuses to make, made again in
    a field that exists to be accepted with one tap.
  */
  it('does not offer a person as their own employer', () => {
    const r = parseBusinessCard(card([
      ['Dr. Dilyana Nikiforova', 0.20, 0.12],
      ['Ärztin für Allgemeinmedizin', 0.32, 0.05],
      ['arzt@nikiforova.at', 0.80, 0.04],
    ]));
    expect(r.company).toBeUndefined();
    expect(r.companySuggestion).toBeUndefined();
  });
});

// ── 6. The card itself ──────────────────────────────────────────────────────

/**
 * THE GMUNDEN CARD, transcribed line for line from the real one.
 *
 * Before this change it returned:
 *
 *   company  "Stadtamt Gmunden ~ Liegenschaftsverwaltung"  — two facts in one field
 *   phone    "+43 7612 794 243"                            — the switchboard, not the mobile
 *   title    undefined                                     — with the department sitting in `company`
 *
 * and the fax was one regex away from being the number offered.
 */
describe('the Gmunden card', () => {
  const gmunden = card([
    ['Jasmin Walther', 0.16, 0.10],
    ['Stadtamt Gmunden ~ Liegenschaftsverwaltung', 0.30, 0.05],
    ['Rathausplatz 1 ~ 4810 Gmunden', 0.42, 0.04],
    ['T: +43 7612 794 243 ~ F: +43 7612 794 258 ~ M: +43 676 88 794 243', 0.56, 0.035],
    ['jasmin.walther@gmunden.ooe.gv.at', 0.68, 0.035],
    ['gmunden.at ~ facebook.com/stadt.gmunden', 0.78, 0.035],
  ]);

  it('reads it as a person at an organisation', () => {
    expect(parseBusinessCard(gmunden).name?.value).toBe('Jasmin Walther');
  });

  it('separates the organisation from the department', () => {
    const r = parseBusinessCard(gmunden);
    expect(r.company?.value).toBe('Stadtamt Gmunden');
    expect(r.title?.value).toBe('Liegenschaftsverwaltung');
  });

  it('offers the mobile, and never the fax', () => {
    const r = parseBusinessCard(gmunden);
    expect(r.phone?.value).toBe('+43 676 88 794 243');
    expect(r.phones?.map((p) => `${p.kind} ${p.value}`)).toEqual([
      'landline +43 7612 794 243',
      'fax +43 7612 794 258',
      'mobile +43 676 88 794 243',
    ]);
  });

  it('assembles the address out of one line', () => {
    expect(parseBusinessCard(gmunden).address?.value).toBe('Rathausplatz 1, 4810 Gmunden');
  });

  it('takes the website and leaves the social page alone', () => {
    const r = parseBusinessCard(gmunden);
    expect(r.website?.value).toBe('gmunden.at');
    expect(r.email?.value).toBe('jasmin.walther@gmunden.ooe.gv.at');
  });

  /*
    The card's own organisation name is a hand-drawn script logo the reader
    cannot touch. "Gmunden" from the domain is the only recoverable version of
    it, and the screen offers it for editing rather than saving it.
  */
  it('recovers a company name from the domain, for the logo it cannot read', () => {
    const r = parseBusinessCard(gmunden);
    expect(r.companyDomain).toBe('gmunden.ooe.gv.at');
    expect(r.companySuggestion).toBe('Gmunden');
  });

  it('keeps every line and every piece one tap away', () => {
    const { lines } = parseBusinessCard(gmunden);
    for (const text of [
      'Stadtamt Gmunden ~ Liegenschaftsverwaltung',
      'Stadtamt Gmunden',
      'Liegenschaftsverwaltung',
      'M: +43 676 88 794 243',
      'facebook.com/stadt.gmunden',
    ]) {
      expect(lines).toContain(text);
    }
  });

  it('is deterministic, and costs no more than a card without separators', () => {
    const once = JSON.stringify(parseBusinessCard(gmunden));
    const started = Date.now();
    for (let i = 0; i < 500; i++) expect(JSON.stringify(parseBusinessCard(gmunden))).toBe(once);
    // It runs on a phone with the camera warm. Segmenting must not be a cost
    // anybody can feel.
    expect(Date.now() - started).toBeLessThan(1500);
  });

  /*
    ⚠️ Segmentation makes MORE, SHORTER strings, so every pattern is asked more
    often — which is the moment to check the two that had unbounded quantifiers
    over overlapping classes. A second here is a frozen camera screen.
  */
  it('does not hang on a line built out of separators', () => {
    const started = Date.now();
    parseBusinessCard([
      { text: '~ '.repeat(3000), y: 0.1, height: 0.05 },
      { text: 'ATU' + ' ~ 1'.repeat(3000), y: 0.2, height: 0.05 },
      { text: ('+43 1 2345678 ~ '.repeat(500)), y: 0.3, height: 0.05 },
      { text: ' '.repeat(3000) + 'x', y: 0.4, height: 0.05 },
    ]);
    expect(Date.now() - started).toBeLessThan(500);
  });
});
