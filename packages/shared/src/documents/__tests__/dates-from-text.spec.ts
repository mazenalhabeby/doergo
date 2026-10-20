import { findDates, suggestExpiry } from '@hbcfield/shared';

/**
 * Reading a date off a document that cannot prove anything about itself.
 *
 * A passport's expiry comes with a check digit; a driving licence's does not,
 * because a European licence has no machine-readable zone at all. So everything
 * here produces a SUGGESTION — good enough to save somebody typing, offered for
 * confirmation, never filed as fact. The tests are about not suggesting
 * nonsense.
 */

const NOW = new Date('2026-06-01T00:00:00Z');

describe('findDates', () => {
  it('reads the European order, in the separators these documents use', () => {
    expect(findDates('31.12.2030', NOW)[0]?.iso).toBe('2030-12-31');
    expect(findDates('31-12-2030', NOW)[0]?.iso).toBe('2030-12-31');
    expect(findDates('31/12/2030', NOW)[0]?.iso).toBe('2030-12-31');
  });

  it('reads ISO, which some certificates print', () => {
    expect(findDates('2030-12-31', NOW)[0]?.iso).toBe('2030-12-31');
  });

  it('reads a two-digit year without inventing a century', () => {
    expect(findDates('31.12.30', NOW)[0]?.iso).toBe('2030-12-31');
  });

  it('refuses a date that does not exist', () => {
    // 31 February passes a range check and is still not a date.
    expect(findDates('31.02.2030', NOW)).toEqual([]);
    expect(findDates('45.13.2030', NOW)).toEqual([]);
  });

  it('refuses numbers that are not dates at all', () => {
    /*
      The reason the formats are narrow. An OCR pass over a licence returns
      serial numbers, holograms read as digits, and the odd fragment — and every
      false date is a wrong suggestion somebody has to notice and undo.
    */
    expect(findDates('licence 12345678 class B', NOW)).toEqual([]);
    expect(findDates('1.1.1200', NOW)).toEqual([]);
    expect(findDates('01.01.2200', NOW)).toEqual([]);
  });

  it('returns each date once, in order', () => {
    const found = findDates('4a 01.03.2020 3 15.08.1985 4b 01.03.2030 01.03.2030', NOW);
    expect(found.map((d) => d.iso)).toEqual(['1985-08-15', '2020-03-01', '2030-03-01']);
  });

  it('keeps what was printed, for showing back to a person', () => {
    // "31.12.2030" is what they will look for on the card; the ISO form is not.
    expect(findDates('expires 31.12.2030', NOW)[0]?.raw).toBe('31.12.2030');
  });
});

describe('suggestExpiry', () => {
  it('picks the expiry off a European driving licence', () => {
    /*
      The layout is a directive, not a convention: field 3 is the date of birth,
      4a the issue date, 4b the expiry. The expiry is always the latest, which
      is what makes "furthest in the future" a good guess rather than a hopeful
      one.
    */
    const licence = '3. 15.08.1985  4a. 01.03.2020  4b. 01.03.2035  5. 12345678';
    expect(suggestExpiry(licence, NOW)?.iso).toBe('2035-03-01');
  });

  it('picks the expiry off a certificate with two dates', () => {
    expect(suggestExpiry('Issued 01.06.2024 — valid until 01.06.2029', NOW)?.iso).toBe('2029-06-01');
  });

  it('suggests nothing when every date has already passed', () => {
    /*
      A document whose dates have all gone is either expired — which the member
      should state deliberately rather than have guessed for them — or misread,
      and a confident suggestion is then worse than none at all.
    */
    expect(suggestExpiry('3. 15.08.1985  4a. 01.03.2010  4b. 01.03.2015', NOW)).toBeNull();
  });

  it('suggests nothing from text with no dates in it', () => {
    expect(suggestExpiry('GAS SAFE REGISTER', NOW)).toBeNull();
  });

  it('ignores the birth date even when it is the only other date', () => {
    // Suggesting somebody's date of birth as an expiry is the one wrong answer
    // that looks deliberate.
    expect(suggestExpiry('born 15.08.1985, expires 01.03.2035', NOW)?.iso).toBe('2035-03-01');
  });
});
