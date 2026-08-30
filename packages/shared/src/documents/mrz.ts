/**
 * The machine-readable zone, parsed and CHECKED — offline, no third party.
 *
 * The two lines at the foot of a passport and the three on an ID card are not
 * just the same data in a font a machine can read. Every field carries a check
 * digit computed over its own characters with a repeating 7-3-1 weighting, and
 * TD1/TD3 add a COMPOSITE check digit computed over most of the zone at once
 * (ICAO Doc 9303). That composite is what makes this worth doing: change the
 * expiry date on a photograph of a passport and the printed digit no longer
 * matches the data, and nothing about the forgery has to be recognised visually
 * for the arithmetic to fail.
 *
 * What this can honestly tell you:
 *   - the data in the zone is internally consistent (the check digits agree)
 *   - the document has not expired, and the holder's dates are plausible
 *   - the issuing country is a code that exists
 *   - the name and date of birth match the member we hold
 *
 * What it CANNOT tell you, and no offline check can:
 *   - that the document was ever issued by that country
 *   - that the physical document is genuine rather than a good print
 *
 * Verifying existence needs the issuer's registry or the chip's signature; both
 * mean a third party or NFC with a country's certificates. The honest claim is
 * that this catches edited data and invented numbers — which is what casual
 * forgery is — and it says so rather than showing a tick that means less than
 * a reader would assume.
 *
 * A second use, and the reason the check digits earn their place twice: they
 * validate our own READING. An OCR that mis-read a character fails the checksum
 * exactly as a forged one does, so a pass means the transcription is almost
 * certainly right and a fail means "photograph it again" rather than "you are
 * lying".
 */

/** The filler character. Never a space, in any position. */
const FILLER = '<';

/** Weights repeat 7, 3, 1 across every checked run. */
const WEIGHTS = [7, 3, 1] as const;

/**
 * The longest any of these documents is issued for, with room to spare.
 *
 * Passports and ID cards run ten years, driving licences up to fifteen. Twenty
 * is the point past which a two-digit year must belong to the previous century.
 */
const MAX_VALIDITY_YEARS = 20;

export type MrzFormat = 'TD1' | 'TD2' | 'TD3';

export interface MrzField<T = string> {
  value: T;
  /** Null where the format carries no check digit for this field. */
  checkDigitValid: boolean | null;
}

export interface MrzResult {
  format: MrzFormat;
  documentCode: string;
  issuingState: string;
  documentNumber: MrzField;
  nationality: string;
  /** ISO date, or null when the printed digits are not a real date. */
  dateOfBirth: MrzField<string | null>;
  sex: string;
  dateOfExpiry: MrzField<string | null>;
  surname: string;
  givenNames: string;
  /** Present on TD1 and TD3; the strongest single signal in the zone. */
  compositeValid: boolean | null;
  /** Every check digit in the zone agreed. */
  allChecksPassed: boolean;
  /** Which ones did not, for a message a person can act on. */
  failures: string[];
}

/**
 * The check digit ICAO 9303 defines: digits as themselves, letters as A=10…Z=35,
 * the filler as 0, weighted 7-3-1 and summed modulo 10.
 */
export function mrzCheckDigit(input: string): number {
  let sum = 0;
  for (let i = 0; i < input.length; i++) {
    const c = input[i]!;
    let v: number;
    if (c >= '0' && c <= '9') v = c.charCodeAt(0) - 48;
    else if (c >= 'A' && c <= 'Z') v = c.charCodeAt(0) - 55;
    else if (c === FILLER) v = 0;
    // Anything else cannot appear in a valid zone. Treated as 0 so the digit
    // simply fails to match, rather than throwing on a bad OCR read.
    else v = 0;
    sum += v * WEIGHTS[i % 3]!;
  }
  return sum % 10;
}

/** Does `field` agree with the digit printed after it? */
function checks(field: string, digit: string): boolean {
  if (!/^[0-9]$/.test(digit)) return false;
  return mrzCheckDigit(field) === Number(digit);
}

/**
 * YYMMDD as printed, widened to a full year.
 *
 * The zone gives two digits and no century, so a rule is unavoidable — and the
 * rule has to fail in the safe direction.
 *
 * The first attempt read "an expiry more than ten years back must be a century
 * misread" and turned the ICAO specimen passport, expiring in 2012, into one
 * valid until 2112. That is precisely the wrong way to be wrong: an expired
 * document read as valid is the failure this whole feature exists to prevent,
 * and expired documents ARE presented — the review queue has a warning for
 * exactly that case.
 *
 * So neither direction ever invents validity. A birth date is never in the
 * future; an expiry is never further ahead than any document is issued for
 * (twenty years, comfortably past the ten a passport gets), and anything beyond
 * that is read as the previous century — old, and correctly expired.
 */
export function mrzDate(yymmdd: string, kind: 'birth' | 'expiry', now: Date = new Date()): string | null {
  if (!/^[0-9]{6}$/.test(yymmdd)) return null;
  const yy = Number(yymmdd.slice(0, 2));
  const mm = Number(yymmdd.slice(2, 4));
  const dd = Number(yymmdd.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;

  const century = now.getFullYear() - (now.getFullYear() % 100);

  let year = century + yy;
  if (kind === 'birth') {
    // Nobody is born tomorrow.
    if (year > now.getFullYear()) year -= 100;
  } else if (year > now.getFullYear() + MAX_VALIDITY_YEARS) {
    // Further ahead than any document is issued for: the century, not the date.
    year -= 100;
  }

  const date = new Date(Date.UTC(year, mm - 1, dd));
  // Rejects 31 February, which passes the range check above.
  if (date.getUTCMonth() !== mm - 1 || date.getUTCDate() !== dd) return null;
  return date.toISOString().slice(0, 10);
}

/** `SURNAME<<GIVEN<NAMES` → the two halves, filler removed. */
export function mrzNames(field: string): { surname: string; givenNames: string } {
  const [surnamePart = '', givenPart = ''] = field.split('<<');
  const clean = (s: string) => s.replace(/</g, ' ').trim().replace(/\s+/g, ' ');
  return { surname: clean(surnamePart), givenNames: clean(givenPart) };
}

/** Only the characters a zone may contain, uppercased. */
function normaliseLine(line: string): string {
  return line
    .toUpperCase()
    .replace(/\s+/g, '')
    // OCR habitually reads the filler as one of these.
    .replace(/[«‹≪]/g, FILLER);
}

/**
 * Split whatever was scanned into candidate MRZ lines.
 *
 * Tolerant on purpose: a camera returns the surrounding text too, and the zone
 * is recognisable by its own shape — 30, 36 or 44 characters of the restricted
 * alphabet.
 */
export function mrzLines(raw: string): string[] {
  return raw
    .split(/[\r\n]+/)
    .map(normaliseLine)
    .filter((l) => /^[A-Z0-9<]+$/.test(l) && (l.length === 30 || l.length === 36 || l.length === 44));
}

/**
 * Parse and check a zone.
 *
 * Returns null only when the input is not an MRZ at all. A zone that IS one but
 * fails its digits comes back with `allChecksPassed: false` and the reasons —
 * refusing to parse it would leave a reviewer with nothing to look at.
 */
export function parseMrz(raw: string, now: Date = new Date()): MrzResult | null {
  const lines = mrzLines(raw);

  if (lines.length >= 3 && lines.every((l) => l.length === 30)) {
    return parseTd1(lines.slice(0, 3) as [string, string, string], now);
  }
  if (lines.length >= 2 && lines[0]!.length === 44 && lines[1]!.length === 44) {
    return parseTd3(lines.slice(0, 2) as [string, string], now);
  }
  if (lines.length >= 2 && lines[0]!.length === 36 && lines[1]!.length === 36) {
    return parseTd2(lines.slice(0, 2) as [string, string], now);
  }
  return null;
}

/** ID cards: three lines of thirty. */
function parseTd1([l1, l2, l3]: [string, string, string], now: Date): MrzResult {
  const documentNumber = l1.slice(5, 14);
  const documentNumberCheck = l1[14]!;
  const birth = l2.slice(0, 6);
  const birthCheck = l2[6]!;
  const expiry = l2.slice(8, 14);
  const expiryCheck = l2[14]!;

  // The composite runs over the parts of lines one and two the standard names.
  const composite = l1.slice(5, 30) + l2.slice(0, 7) + l2.slice(8, 15) + l2.slice(18, 29);
  const compositeValid = checks(composite, l2[29]!);

  return finish({
    format: 'TD1',
    documentCode: l1.slice(0, 2).replace(/</g, ''),
    issuingState: l1.slice(2, 5).replace(/</g, ''),
    documentNumber: {
      value: documentNumber.replace(/</g, ''),
      checkDigitValid: checks(documentNumber, documentNumberCheck),
    },
    nationality: l2.slice(15, 18).replace(/</g, ''),
    dateOfBirth: { value: mrzDate(birth, 'birth', now), checkDigitValid: checks(birth, birthCheck) },
    sex: l2[7]!.replace(/</g, ''),
    dateOfExpiry: { value: mrzDate(expiry, 'expiry', now), checkDigitValid: checks(expiry, expiryCheck) },
    ...mrzNames(l3),
    compositeValid,
  });
}

/** Older ID cards and some visas: two lines of thirty-six. */
function parseTd2([l1, l2]: [string, string], now: Date): MrzResult {
  const documentNumber = l2.slice(0, 9);
  const birth = l2.slice(13, 19);
  const expiry = l2.slice(21, 27);

  return finish({
    format: 'TD2',
    documentCode: l1.slice(0, 2).replace(/</g, ''),
    issuingState: l1.slice(2, 5).replace(/</g, ''),
    documentNumber: { value: documentNumber.replace(/</g, ''), checkDigitValid: checks(documentNumber, l2[9]!) },
    nationality: l2.slice(10, 13).replace(/</g, ''),
    dateOfBirth: { value: mrzDate(birth, 'birth', now), checkDigitValid: checks(birth, l2[19]!) },
    sex: l2[20]!.replace(/</g, ''),
    dateOfExpiry: { value: mrzDate(expiry, 'expiry', now), checkDigitValid: checks(expiry, l2[27]!) },
    ...mrzNames(l1.slice(5)),
    // TD2 defines a composite over line two, ending at 35.
    compositeValid: checks(
      l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 35),
      l2[35]!,
    ),
  });
}

/** Passports: two lines of forty-four. */
function parseTd3([l1, l2]: [string, string], now: Date): MrzResult {
  const documentNumber = l2.slice(0, 9);
  const birth = l2.slice(13, 19);
  const expiry = l2.slice(21, 27);

  return finish({
    format: 'TD3',
    documentCode: l1.slice(0, 2).replace(/</g, ''),
    issuingState: l1.slice(2, 5).replace(/</g, ''),
    documentNumber: { value: documentNumber.replace(/</g, ''), checkDigitValid: checks(documentNumber, l2[9]!) },
    nationality: l2.slice(10, 13).replace(/</g, ''),
    dateOfBirth: { value: mrzDate(birth, 'birth', now), checkDigitValid: checks(birth, l2[19]!) },
    sex: l2[20]!.replace(/</g, ''),
    dateOfExpiry: { value: mrzDate(expiry, 'expiry', now), checkDigitValid: checks(expiry, l2[27]!) },
    ...mrzNames(l1.slice(5)),
    compositeValid: checks(
      l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 43),
      l2[43]!,
    ),
  });
}

/** Collect the failures once, so every format reports them the same way. */
function finish(
  partial: Omit<MrzResult, 'allChecksPassed' | 'failures'>,
): MrzResult {
  const failures: string[] = [];
  if (partial.documentNumber.checkDigitValid === false) failures.push('documentNumber');
  if (partial.dateOfBirth.checkDigitValid === false) failures.push('dateOfBirth');
  if (partial.dateOfExpiry.checkDigitValid === false) failures.push('dateOfExpiry');
  if (partial.compositeValid === false) failures.push('composite');
  // A date that does not exist is as much a failure as a digit that disagrees.
  if (partial.dateOfBirth.value === null) failures.push('dateOfBirthUnreadable');
  if (partial.dateOfExpiry.value === null) failures.push('dateOfExpiryUnreadable');

  return { ...partial, allChecksPassed: failures.length === 0, failures };
}
