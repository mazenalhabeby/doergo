/**
 * The barcode on a North American driving licence.
 *
 * The scanner reads PDF417 the moment a card enters the frame, and until now
 * that payload went to the server as if it were a machine-readable zone, failed
 * to parse as one, and was discarded. The code around it claimed the data comes
 * off the document "exactly, not approximately" — which was true of the barcode
 * and false of what happened to it.
 *
 * The format is AAMVA's: a short header, then three-letter element codes each
 * followed by a value and a newline. It is not a zone and has no check digits,
 * so nothing here proves the document — but it does not need to. A barcode is
 * DECODED rather than recognised: there is no OCR in the path, so a value that
 * comes out is the value that was encoded, and the failure mode is a barcode
 * that does not decode at all rather than one that decodes wrongly.
 *
 * Deliberately not claimed for Europe. An Austrian or German licence carries no
 * PDF417, and a datamatrix on some European documents encodes something else
 * entirely — so this parses what it recognises and returns null otherwise,
 * rather than guessing at a format it has never seen.
 */

export interface AamvaResult {
  /** 'USA' or 'CAN' where the payload says so. Decides the date order. */
  country: string | null;
  documentNumber: string | null;
  surname: string | null;
  givenNames: string | null;
  /** ISO. */
  dateOfBirth: string | null;
  dateOfExpiry: string | null;
  dateOfIssue: string | null;
}

/** The elements worth reading. The standard defines dozens nobody needs here. */
const ELEMENTS = {
  DAQ: 'documentNumber',
  DCS: 'surname',
  DAC: 'firstName',
  DAD: 'middleName',
  DBB: 'dateOfBirth',
  DBA: 'dateOfExpiry',
  DBD: 'dateOfIssue',
  DCG: 'country',
} as const;

/**
 * Is this an AAMVA payload at all?
 *
 * The compliance indicator is '@' and the file type is the literal "ANSI ".
 * Checking both keeps a QR code containing a URL, or a datamatrix holding
 * something European, from being read as a licence.
 */
export function looksLikeAamva(raw: string): boolean {
  return raw.startsWith('@') && raw.includes('ANSI ');
}

/**
 * MMDDCCYY in the United States, CCYYMMDD in Canada.
 *
 * The same eight digits mean different dates in the two countries, which is the
 * one thing about this format that silently produces a wrong answer rather than
 * no answer — so the country is read first and a payload that does not say is
 * disambiguated by whether the leading four digits could be a year.
 */
export function aamvaDate(value: string, country: string | null): string | null {
  const digits = value.trim();
  if (!/^\d{8}$/.test(digits)) return null;

  const asUs = { y: digits.slice(4, 8), m: digits.slice(0, 2), d: digits.slice(2, 4) };
  const asCa = { y: digits.slice(0, 4), m: digits.slice(4, 6), d: digits.slice(6, 8) };

  const pick =
    country === 'CAN' ? asCa
    : country === 'USA' ? asUs
    // No country given: only one reading can have a plausible year in front.
    : Number(asCa.y) >= 1900 && Number(asCa.y) <= 2100 && Number(asUs.m) > 12 ? asCa
    : asUs;

  const year = Number(pick.y);
  const month = Number(pick.m);
  const day = Number(pick.d);
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  // Rejects 31 February, which the range check above lets through.
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

/** Parse a scanned barcode, or return null if it is not one of these. */
export function parseAamva(raw: string): AamvaResult | null {
  if (!looksLikeAamva(raw)) return null;

  const found: Record<string, string> = {};
  // Elements are newline-separated; the header and subfile designators are not
  // three-letter codes, so they simply do not match and are skipped.
  for (const line of raw.split(/[\r\n]+/)) {
    const code = line.slice(0, 3).toUpperCase();
    const key = (ELEMENTS as Record<string, string>)[code];
    if (!key) continue;
    const value = line.slice(3).trim();
    // The standard pads unused fields with 'NONE' rather than leaving them out.
    if (!value || value.toUpperCase() === 'NONE') continue;
    if (!(key in found)) found[key] = value;
  }

  if (Object.keys(found).length === 0) return null;

  const country = found.country?.toUpperCase() ?? null;
  const givenNames = [found.firstName, found.middleName].filter(Boolean).join(' ') || null;

  return {
    country,
    documentNumber: found.documentNumber ?? null,
    surname: found.surname ?? null,
    givenNames,
    dateOfBirth: found.dateOfBirth ? aamvaDate(found.dateOfBirth, country) : null,
    dateOfExpiry: found.dateOfExpiry ? aamvaDate(found.dateOfExpiry, country) : null,
    dateOfIssue: found.dateOfIssue ? aamvaDate(found.dateOfIssue, country) : null,
  };
}
