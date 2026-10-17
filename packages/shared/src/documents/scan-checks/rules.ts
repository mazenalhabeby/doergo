/** What a scan check answers, and the small rules the page and the barcode checks share: issuer, name, date of birth, the verdict. */
import type { MrzResult } from '../mrz';
import { stripDiacritics } from '../../utils/fold';
import { toISODateString } from '../../utils/date';

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
    stripDiacritics(
      s.toUpperCase().replace(/Ä/g, 'AE').replace(/Ö/g, 'OE').replace(/Ü/g, 'UE').replace(/ß/g, 'SS'),
    ).replace(/[^A-Z]/g, '');

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

  const recorded = toISODateString(new Date(onRecord));
  return recorded === toISODateString(fromDocument)
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

export { issuerLooksReal, dobCheck, empty };
