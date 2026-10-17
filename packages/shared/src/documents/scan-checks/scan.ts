/** Checking a scanned ID page. */
import { parseMrz } from '../mrz';
import { parseAamva } from '../aamva';
import { fromBarcode } from './barcode';
import { dobCheck, empty, issuerLooksReal, nameMatches, type ScanCheck, type ScanResult, verdictFrom } from './rules';

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
