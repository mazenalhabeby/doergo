/**
 * What can honestly be concluded from a scanned document, with no third party.
 *
 * The checks fall into three groups, and they are worth different amounts:
 *
 *   THE DOCUMENT AGAINST ITSELF — the ICAO check digits. Strong: editing a
 *   field in an image editor breaks arithmetic printed on the document.
 *
 *   THE DOCUMENT AGAINST US — does the name match the member, is it in date,
 *   has this exact document already been filed under somebody else's name?
 *   Strong for the failures it finds, silent otherwise.
 *
 *   THE DOCUMENT AGAINST THE WORLD — does it actually exist? NOT ANSWERABLE
 *   here, and the verdict says so. It needs the issuer's registry or the chip's
 *   signature.
 *
 * The verdict is therefore never "genuine". It is "nothing here is wrong",
 * which is a different and honest claim: a reviewer still looks at the picture,
 * and what this does is stop them having to notice a changed digit by eye.
 */

import { parseMrz, type MrzResult } from './mrz';
import { parseAamva } from './aamva';

export type ScanCheckId =
  | 'mrzReadable'
  | 'checkDigits'
  | 'notExpired'
  | 'nameMatchesMember'
  | 'dateOfBirthPlausible'
  | 'issuerKnown'
  | 'notAlreadyFiled';

export type ScanCheckOutcome = 'PASS' | 'FAIL' | 'WARN' | 'SKIP';

export interface ScanCheck {
  id: ScanCheckId;
  outcome: ScanCheckOutcome;
  /** Machine-readable so the UI can translate; never an English sentence. */
  detail?: string;
}

export type ScanVerdict =
  /** Every check that could run, ran and passed. */
  | 'CONSISTENT'
  /** Nothing failed, but something could not be checked. */
  | 'UNVERIFIED'
  /** At least one check failed. A person must look. */
  | 'SUSPECT';

export interface ScanResult {
  format: string | null;
  verdict: ScanVerdict;
  checks: ScanCheck[];
  /** The fields worth storing as columns. */
  extracted: {
    holderName: string | null;
    documentNumber: string | null;
    dateOfBirth: string | null;
    dateOfExpiry: string | null;
    issuingState: string | null;
    nationality: string | null;
    sex: string | null;
  };
  /** Everything read, for the reviewer and for later. */
  raw: MrzResult | null;
}

/**
 * ISO 3166-1 alpha-3 is not enumerated here on purpose.
 *
 * A hard-coded country list goes stale and then rejects a real passport, which
 * is a worse failure than accepting an odd code. What IS checked is the shape —
 * three letters — plus the ICAO codes that are not countries at all but appear
 * legitimately in the issuing-state field.
 */
const ICAO_NON_STATES = new Set(['UNO', 'UNA', 'UNK', 'XOM', 'XCC', 'XXA', 'XXB', 'XXC', 'XXX']);

function issuerLooksReal(code: string): boolean {
  return /^[A-Z]{3}$/.test(code) || ICAO_NON_STATES.has(code);
}

/**
 * Compare a name off a document with the name on the member record.
 *
 * Deliberately forgiving. Documents print names in capitals without accents,
 * hold second given names the employer never recorded, and transliterate ß to
 * SS and ö to OE. A check that flagged Jürgen Müller against MUELLER JUERGEN
 * would fire on half the workforce and be switched off within a week — so it
 * asks only whether the surname and the FIRST given name are both present.
 */
export function nameMatches(
  documentName: { surname: string; givenNames: string },
  member: { firstName: string; lastName: string },
): boolean {
  const fold = (s: string) =>
    s
      .toUpperCase()
      .replace(/Ä/g, 'AE').replace(/Ö/g, 'OE').replace(/Ü/g, 'UE').replace(/ß/g, 'SS')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Z]/g, '');

  const docSurname = fold(documentName.surname);
  const docFirst = fold(documentName.givenNames.split(' ')[0] ?? '');
  const memberSurname = fold(member.lastName);
  const memberFirst = fold(member.firstName);

  if (!docSurname || !memberSurname) return false;
  // Either direction: "MULLER" on a record and "MULLER-SCHMIDT" on a marriage
  // certificate are the same person as far as this check is concerned.
  const surnameOk = docSurname.includes(memberSurname) || memberSurname.includes(docSurname);
  const firstOk = !docFirst || !memberFirst
    ? false
    : docFirst.includes(memberFirst) || memberFirst.includes(docFirst);
  return surnameOk && firstOk;
}

/**
 * Run everything that can be run, and say what could not be.
 *
 * `alreadyFiledBy` is resolved by the caller — it is a database question — and
 * passed in, so this stays pure and testable.
 */
export function checkScan(input: {
  /** Raw text from a scanner, or an MRZ already parsed. */
  mrzText?: string | null;
  member: { firstName: string; lastName: string; dateOfBirth?: Date | string | null };
  /** Another member in this organization already holds this document number. */
  alreadyFiledBy?: string | null;
  now?: Date;
}): ScanResult {
  const now = input.now ?? new Date();
  const checks: ScanCheck[] = [];
  const mrz = input.mrzText ? parseMrz(input.mrzText, now) : null;

  /*
    A scanned barcode is not a machine-readable zone, and was being thrown away
    for failing to parse as one.

    It has no check digits, so it proves nothing about the document — but it is
    DECODED rather than recognised: no OCR sits in the path, so a value that
    comes out is the value that was encoded. That makes it worth reading and not
    worth trusting, which is exactly what UNVERIFIED means.
  */
  if (!mrz && input.mrzText) {
    const barcode = parseAamva(input.mrzText);
    if (barcode) return fromBarcode(barcode, input.member, input.alreadyFiledBy, now);
  }

  if (!mrz) {
    // Not a failure. Most documents in this product — a gas certificate, a
    // training record — have no machine-readable zone at all, and calling that
    // suspect would make the verdict meaningless on the common case.
    checks.push({ id: 'mrzReadable', outcome: 'SKIP' });
    return {
      format: null,
      verdict: 'UNVERIFIED',
      checks,
      extracted: empty(),
      raw: null,
    };
  }

  checks.push({ id: 'mrzReadable', outcome: 'PASS', detail: mrz.format });

  checks.push(
    mrz.allChecksPassed
      ? { id: 'checkDigits', outcome: 'PASS' }
      : { id: 'checkDigits', outcome: 'FAIL', detail: mrz.failures.join(',') },
  );

  const expiry = mrz.dateOfExpiry.value ? new Date(mrz.dateOfExpiry.value) : null;
  checks.push(
    !expiry
      ? { id: 'notExpired', outcome: 'SKIP' }
      : expiry.getTime() >= now.getTime()
        ? { id: 'notExpired', outcome: 'PASS' }
        // A WARN, not a FAIL: an expired document is a real document, and
        // somebody filing one alongside its replacement is doing the right
        // thing. The compliance board already reads the date.
        : { id: 'notExpired', outcome: 'WARN', detail: mrz.dateOfExpiry.value ?? undefined },
  );

  checks.push(
    nameMatches(mrz, input.member)
      ? { id: 'nameMatchesMember', outcome: 'PASS' }
      : {
          id: 'nameMatchesMember',
          outcome: 'FAIL',
          detail: `${mrz.surname} ${mrz.givenNames}`.trim(),
        },
  );

  const dob = mrz.dateOfBirth.value ? new Date(mrz.dateOfBirth.value) : null;
  checks.push(dobCheck(dob, input.member.dateOfBirth, now));

  checks.push(
    issuerLooksReal(mrz.issuingState)
      ? { id: 'issuerKnown', outcome: 'PASS', detail: mrz.issuingState }
      : { id: 'issuerKnown', outcome: 'FAIL', detail: mrz.issuingState },
  );

  checks.push(
    input.alreadyFiledBy
      ? { id: 'notAlreadyFiled', outcome: 'FAIL', detail: input.alreadyFiledBy }
      : { id: 'notAlreadyFiled', outcome: 'PASS' },
  );

  return {
    format: mrz.format,
    verdict: verdictFrom(checks),
    checks,
    extracted: {
      holderName: `${mrz.surname} ${mrz.givenNames}`.trim() || null,
      documentNumber: mrz.documentNumber.value || null,
      dateOfBirth: mrz.dateOfBirth.value,
      dateOfExpiry: mrz.dateOfExpiry.value,
      issuingState: mrz.issuingState || null,
      nationality: mrz.nationality || null,
      sex: mrz.sex || null,
    },
    raw: mrz,
  };
}

/**
 * Is the date of birth a person's?
 *
 * Two separate questions, and only the first can always be asked: is it
 * plausible at all, and does it match what we hold. Most organizations do not
 * record a date of birth, so the comparison is skipped rather than failed.
 */
function dobCheck(
  fromDocument: Date | null,
  onRecord: Date | string | null | undefined,
  now: Date,
): ScanCheck {
  if (!fromDocument) return { id: 'dateOfBirthPlausible', outcome: 'SKIP' };

  const age = (now.getTime() - fromDocument.getTime()) / (365.25 * 86_400_000);
  // Nobody working here is unborn or a hundred and twenty.
  if (age < 14 || age > 120) {
    return { id: 'dateOfBirthPlausible', outcome: 'FAIL', detail: String(Math.round(age)) };
  }
  if (!onRecord) return { id: 'dateOfBirthPlausible', outcome: 'PASS' };

  const recorded = new Date(onRecord).toISOString().slice(0, 10);
  return recorded === fromDocument.toISOString().slice(0, 10)
    ? { id: 'dateOfBirthPlausible', outcome: 'PASS' }
    : { id: 'dateOfBirthPlausible', outcome: 'FAIL', detail: recorded };
}

/**
 * One word for a reviewer, from the checks.
 *
 * A single FAIL makes it SUSPECT — no weighting, no score. A number invites
 * somebody to set a threshold and stop reading the reasons, and the reasons are
 * the useful part.
 */
export function verdictFrom(checks: ScanCheck[]): ScanVerdict {
  if (checks.some((c) => c.outcome === 'FAIL')) return 'SUSPECT';
  if (checks.some((c) => c.outcome === 'SKIP' || c.outcome === 'WARN')) return 'UNVERIFIED';
  return 'CONSISTENT';
}


/**
 * The same shape of answer, from a barcode.
 *
 * The checks that still mean something are the ones about US rather than about
 * the document: does the name match the member, has this exact document already
 * been filed. The ones about the document proving itself are skipped, honestly,
 * rather than passed by default.
 */
function fromBarcode(
  barcode: NonNullable<ReturnType<typeof parseAamva>>,
  member: { firstName: string; lastName: string },
  alreadyFiledBy: string | null | undefined,
  now: Date,
): ScanResult {
  const checks: ScanCheck[] = [
    { id: 'mrzReadable', outcome: 'PASS', detail: 'BARCODE' },
    // No check digits exist in this format. Claiming a pass would be inventing
    // an assurance the barcode does not carry.
    { id: 'checkDigits', outcome: 'SKIP' },
  ];

  const expiry = barcode.dateOfExpiry ? new Date(barcode.dateOfExpiry) : null;
  checks.push(
    !expiry
      ? { id: 'notExpired', outcome: 'SKIP' }
      : expiry.getTime() >= now.getTime()
        ? { id: 'notExpired', outcome: 'PASS' }
        : { id: 'notExpired', outcome: 'WARN', detail: barcode.dateOfExpiry ?? undefined },
  );

  const named = { surname: barcode.surname ?? '', givenNames: barcode.givenNames ?? '' };
  checks.push(
    !barcode.surname
      ? { id: 'nameMatchesMember', outcome: 'SKIP' }
      : nameMatches(named, member)
        ? { id: 'nameMatchesMember', outcome: 'PASS' }
        : { id: 'nameMatchesMember', outcome: 'FAIL', detail: `${named.surname} ${named.givenNames}`.trim() },
  );

  checks.push({ id: 'dateOfBirthPlausible', outcome: 'SKIP' });
  checks.push({ id: 'issuerKnown', outcome: 'SKIP' });
  checks.push(
    alreadyFiledBy
      ? { id: 'notAlreadyFiled', outcome: 'FAIL', detail: alreadyFiledBy }
      : { id: 'notAlreadyFiled', outcome: 'PASS' },
  );

  return {
    format: 'BARCODE',
    verdict: verdictFrom(checks),
    checks,
    extracted: {
      holderName: [barcode.surname, barcode.givenNames].filter(Boolean).join(' ') || null,
      documentNumber: barcode.documentNumber,
      dateOfBirth: barcode.dateOfBirth,
      dateOfExpiry: barcode.dateOfExpiry,
      issuingState: barcode.country,
      nationality: null,
      sex: null,
    },
    raw: null,
  };
}

function empty(): ScanResult['extracted'] {
  return {
    holderName: null,
    documentNumber: null,
    dateOfBirth: null,
    dateOfExpiry: null,
    issuingState: null,
    nationality: null,
    sex: null,
  };
}
