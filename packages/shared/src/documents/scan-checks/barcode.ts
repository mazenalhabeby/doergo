/** The same checks from a driving licence's barcode. */
import { parseAamva } from '../aamva';
import { nameMatches, type ScanCheck, type ScanResult, verdictFrom } from './rules';

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

export { fromBarcode };
