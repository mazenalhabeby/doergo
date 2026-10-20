import {
  repairMrzLine,
  parseMrz,
  mrzCheckDigit,
  mrzDate,
  mrzNames,
  mrzLines,
} from '@hbcfield/shared';

/**
 * The machine-readable zone.
 *
 * This is the whole of "can we tell a document is not fake without a third
 * party", so the tests are about what the check digits actually catch — not
 * that the parser returns fields.
 *
 * The specimens below are the ones in ICAO Doc 9303 itself, so the arithmetic
 * is asserted against data whose check digits are known good rather than
 * against digits this implementation computed for itself.
 */

// Doc 9303 Part 4, the TD3 (passport) specimen.
const TD3 = [
  'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<',
  'L898902C36UTO7408122F1204159ZE184226B<<<<<10',
].join('\n');

// Doc 9303 Part 5, the TD1 (ID card) specimen.
const TD1 = [
  'I<UTOD231458907<<<<<<<<<<<<<<<',
  '7408122F1204159UTO<<<<<<<<<<<6',
  'ERIKSSON<<ANNA<MARIA<<<<<<<<<<',
].join('\n');

/** Fixed, because a sliding century window is meaningless against a moving clock. */
const NOW = new Date('2026-06-01T00:00:00Z');

describe('mrzCheckDigit', () => {
  it('computes the digit ICAO prints', () => {
    // The passport number from the TD3 specimen; its printed check digit is 6.
    expect(mrzCheckDigit('L898902C3')).toBe(6);
  });

  it('weights 7-3-1 across the run', () => {
    // 1×7 + 2×3 + 3×1 = 16 → 6.
    expect(mrzCheckDigit('123')).toBe(6);
  });

  it('reads letters as A=10 through Z=35', () => {
    // A=10 ×7 = 70 → 0.
    expect(mrzCheckDigit('A')).toBe(0);
    // Z=35 ×7 = 245 → 5.
    expect(mrzCheckDigit('Z')).toBe(5);
  });

  it('counts the filler as zero, not as a missing character', () => {
    // Otherwise every short document number would fail, since the field is
    // padded with fillers to a fixed width.
    expect(mrzCheckDigit('<<<')).toBe(0);
    expect(mrzCheckDigit('1<<')).toBe(7);
  });
});

describe('mrzDate', () => {
  it('reads a date of birth into the past, never the future', () => {
    // "40" in 2026 is 1940, not 2040 — nobody is born in fourteen years.
    expect(mrzDate('400115', 'birth', NOW)).toBe('1940-01-15');
    expect(mrzDate('080115', 'birth', NOW)).toBe('2008-01-15');
  });

  it('reads an expiry without ever inventing validity', () => {
    expect(mrzDate('300630', 'expiry', NOW)).toBe('2030-06-30');

    /*
      The bug this pins. An earlier rule read "more than ten years back must be
      a century misread" and turned a passport that expired in 2012 into one
      valid until 2112 — an expired document read as valid, which is the exact
      failure the feature exists to prevent.
    */
    expect(mrzDate('120415', 'expiry', NOW)).toBe('2012-04-15');
    // Beyond any issued validity, so it is the century that is wrong.
    expect(mrzDate('990630', 'expiry', NOW)).toBe('1999-06-30');
  });

  it('refuses a date that does not exist', () => {
    // Passes a naive range check and is still not a date.
    expect(mrzDate('260231', 'expiry', NOW)).toBeNull();
    expect(mrzDate('261301', 'expiry', NOW)).toBeNull();
    expect(mrzDate('26AB01', 'expiry', NOW)).toBeNull();
  });
});

describe('mrzNames', () => {
  it('splits the surname from the given names', () => {
    expect(mrzNames('ERIKSSON<<ANNA<MARIA<<<<<<')).toEqual({
      surname: 'ERIKSSON',
      givenNames: 'ANNA MARIA',
    });
  });

  it('copes with a name that has no given part', () => {
    expect(mrzNames('MUELLER<<<<<<<<')).toEqual({ surname: 'MUELLER', givenNames: '' });
  });
});

describe('mrzLines', () => {
  it('finds the zone among whatever else was scanned', () => {
    // A camera returns the print above the zone as well.
    const scanned = ['REPUBLIC OF UTOPIA', 'PASSPORT', ...TD3.split('\n')].join('\n');
    expect(mrzLines(scanned)).toHaveLength(2);
  });

  it('repairs the filler characters OCR gets wrong', () => {
    const withGuillemets = TD3.replace(/</g, '«');
    expect(mrzLines(withGuillemets)).toHaveLength(2);
  });

  it('ignores lines of the wrong length', () => {
    expect(mrzLines('P<UTOERIKSSON')).toEqual([]);
  });
});

describe('parseMrz — a passport (TD3)', () => {
  const r = parseMrz(TD3, NOW)!;

  it('recognises the format', () => {
    expect(r.format).toBe('TD3');
  });

  it('reads the fields', () => {
    expect(r.documentNumber.value).toBe('L898902C3');
    expect(r.issuingState).toBe('UTO');
    expect(r.nationality).toBe('UTO');
    expect(r.surname).toBe('ERIKSSON');
    expect(r.givenNames).toBe('ANNA MARIA');
    expect(r.dateOfBirth.value).toBe('1974-08-12');
    expect(r.dateOfExpiry.value).toBe('2012-04-15');
    expect(r.sex).toBe('F');
  });

  it('agrees with every check digit the specimen prints', () => {
    expect(r.failures).toEqual([]);
    expect(r.allChecksPassed).toBe(true);
    expect(r.compositeValid).toBe(true);
  });

  it('CATCHES AN EDITED EXPIRY DATE', () => {
    /*
      The reason any of this exists. Somebody photographs a real passport,
      changes the expiry in an image editor, and uploads it. The printed check
      digit no longer describes the data, and the composite — which covers the
      expiry as well — fails too. Nothing about the forgery has to be
      recognised visually.
    */
    const edited = TD3.replace('1204159', '3204159');
    const bad = parseMrz(edited, NOW)!;
    expect(bad.allChecksPassed).toBe(false);
    expect(bad.failures).toContain('dateOfExpiry');
    expect(bad.compositeValid).toBe(false);
  });

  it('catches an edited document number', () => {
    const edited = TD3.replace('L898902C3', 'L898902C9');
    const bad = parseMrz(edited, NOW)!;
    expect(bad.failures).toContain('documentNumber');
  });

  it('catches an edited date of birth', () => {
    const edited = TD3.replace('7408122', '7408125');
    expect(parseMrz(edited, NOW)!.failures).toContain('dateOfBirth');
  });

  it('catches a consistent field whose COMPOSITE was not recomputed', () => {
    /*
      The harder forgery: change a field AND its own check digit, so the field
      checks out on its own. The composite covers the whole zone, so it still
      fails — which is why a document with no composite is a weaker signal.
    */
    // The digit is COMPUTED, not guessed: a hand-written one would make this
    // test assert against arithmetic it had got wrong itself.
    const forgedNumber = 'L898902C4';
    const edited = TD3.replace('L898902C36', `${forgedNumber}${mrzCheckDigit(forgedNumber)}`);
    const bad = parseMrz(edited, NOW)!;
    expect(bad.documentNumber.checkDigitValid).toBe(true);
    expect(bad.compositeValid).toBe(false);
    expect(bad.allChecksPassed).toBe(false);
  });

  it('still parses a zone that fails, so a reviewer has something to look at', () => {
    // Refusing to parse would leave the review queue with a blank row and no
    // explanation of what was wrong.
    const bad = parseMrz(TD3.replace('1204159', '3204159'), NOW)!;
    expect(bad.surname).toBe('ERIKSSON');
    expect(bad.documentNumber.value).toBe('L898902C3');
  });
});

describe('parseMrz — an ID card (TD1)', () => {
  const r = parseMrz(TD1, NOW)!;

  it('recognises the format and reads the fields', () => {
    expect(r.format).toBe('TD1');
    expect(r.documentNumber.value).toBe('D23145890');
    expect(r.issuingState).toBe('UTO');
    expect(r.surname).toBe('ERIKSSON');
    expect(r.givenNames).toBe('ANNA MARIA');
    expect(r.dateOfBirth.value).toBe('1974-08-12');
  });

  it('agrees with every check digit the specimen prints', () => {
    expect(r.failures).toEqual([]);
    expect(r.compositeValid).toBe(true);
  });

  it('catches an edited expiry here too', () => {
    const bad = parseMrz(TD1.replace('1204159', '3204159'), NOW)!;
    expect(bad.failures).toContain('dateOfExpiry');
    expect(bad.compositeValid).toBe(false);
  });
});

describe('parseMrz — what it is not', () => {
  it('returns null for something that is not a zone at all', () => {
    expect(parseMrz('a photograph of a gas certificate', NOW)).toBeNull();
    expect(parseMrz('', NOW)).toBeNull();
  });

  it('returns null for a single line, however long', () => {
    // Two lines minimum, in every format.
    expect(parseMrz(TD3.split('\n')[0]!, NOW)).toBeNull();
  });

  it('reports an unreadable date rather than pretending it read one', () => {
    // The digits are there and check out; they are simply not a date.
    const r = parseMrz(TD1.replace('740812', '741332'), NOW)!;
    expect(r.dateOfBirth.value).toBeNull();
    expect(r.failures).toContain('dateOfBirthUnreadable');
    expect(r.allChecksPassed).toBe(false);
  });

  it('does not throw on characters that cannot appear in a zone', () => {
    // A bad OCR read must produce a failure, never an exception, because it
    // arrives from a phone camera in a plant room.
    expect(() => parseMrz(TD3.replace('ERIKSSON', 'ERIK$SON'), NOW)).not.toThrow();
  });
});

describe('repairMrzLine — the characters OCR confuses', () => {
  /*
    A zone is not free text: every position has a type. An engine returning a Q
    where only a digit may appear has made a mistake the standard itself can
    correct — and real reads produce exactly this, 0/Q/O and 1/I and 5/S.

    The property that makes it SAFE is that it can only ever swap a character
    for one of the same shape in a position whose type is fixed. A forger who
    changed one digit to another digit is untouched, and a repair that guesses
    wrong still fails the check digit.
  */
  it('turns a letter back into the digit the format demands', () => {
    // The exact misread the pipeline produced: the personal-number check digit
    // came back as Q, which broke the composite over the whole line.
    const line = 'P1234567<1AUT8503150M3106305<<<<<<<<<<<<<<Q4';
    expect(repairMrzLine(line, 'TD3', 2)).toBe('P1234567<1AUT8503150M3106305<<<<<<<<<<<<<<04');
  });

  it('turns a digit back into the letter the format demands', () => {
    // Nationality is three letters; a 0 there is an O.
    const line = 'P1234567<1AUT8503150M3106305<<<<<<<<<<<<<<04'.replace('AUT', '4UT');
    expect(repairMrzLine(line, 'TD3', 2).slice(10, 13)).toBe('AUT');
  });

  it('leaves a correct line exactly as it was', () => {
    const line = 'L898902C36UTO7408122F1204159ZE184226B<<<<<10';
    expect(repairMrzLine(line, 'TD3', 2)).toBe(line);
  });

  it('cannot launder a forgery — a digit swapped for a digit is untouched', () => {
    /*
      The safety property. Repair only crosses the letter/digit boundary in
      positions whose type is fixed, so an altered date stays altered and still
      fails its check digit.
    */
    const forged = 'L898902C36UTO7408122F3204159ZE184226B<<<<<10';
    expect(repairMrzLine(forged, 'TD3', 2)).toBe(forged);
    expect(parseMrz(TD3.split('\n')[0] + '\n' + forged, NOW)!.allChecksPassed).toBe(false);
  });

  it('does nothing to a line of the wrong length', () => {
    expect(repairMrzLine('TOO SHORT', 'TD3', 2)).toBe('TOO SHORT');
  });

  it('repairs inside parseMrz, so a real read passes its checks', () => {
    const misread = 'P1234567<1AUT8503150M3106305<<<<<<<<<<<<<<Q4';
    const line1 = 'P<AUTMUSTERMANN<<MAX'.padEnd(44, '<');
    const r = parseMrz(`${line1}\n${misread}`, NOW)!;
    expect(r.allChecksPassed).toBe(true);
    expect(r.surname).toBe('MUSTERMANN');
  });
});
