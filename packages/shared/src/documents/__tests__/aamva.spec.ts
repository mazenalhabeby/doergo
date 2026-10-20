import { parseAamva, looksLikeAamva, aamvaDate, checkScan } from '@hbcfield/shared';

/**
 * The barcode on a North American driving licence.
 *
 * The scanner reads PDF417 the moment a card enters the frame, and the payload
 * was going to the server as if it were a machine-readable zone, failing to
 * parse as one, and being discarded. The surrounding code claimed the data
 * comes off the document "exactly, not approximately" — true of the barcode and
 * false of what happened to it.
 */

/** A licence payload, in the shape a real scanner returns. */
const LICENCE = [
  '@',
  'ANSI 636000100002DL00410278ZV03190008DL',
  'DAQT64235789',
  'DCSSAMPLE',
  'DACMICHAEL',
  'DADJOHN',
  'DBB06061986',
  'DBA12102030',
  'DBD08242020',
  'DCGUSA',
  'DCUNONE',
].join('\n');

describe('looksLikeAamva', () => {
  it('recognises the header the standard defines', () => {
    expect(looksLikeAamva(LICENCE)).toBe(true);
  });

  it('rejects anything else a scanner might hand over', () => {
    /*
      A QR code holding a URL, or a datamatrix on a European document encoding
      something else entirely — read as a licence, either would produce
      confident nonsense.
    */
    expect(looksLikeAamva('https://example.com/ticket/123')).toBe(false);
    expect(looksLikeAamva('P<UTOERIKSSON<<ANNA')).toBe(false);
    expect(looksLikeAamva('')).toBe(false);
  });
});

describe('aamvaDate', () => {
  it('reads the American order', () => {
    // MMDDCCYY: month 12, day 10 — the 10th of December.
    expect(aamvaDate('12102030', 'USA')).toBe('2030-12-10');
  });

  it('reads the Canadian order', () => {
    // CCYYMMDD. Note how close these are: '12102030' and '20301012' are the
    // same eight digits rearranged, and both are real dates in 2030 — which is
    // why the country is read before the date and never guessed at when it is
    // there.
    expect(aamvaDate('20301012', 'CAN')).toBe('2030-10-12');
  });

  it('works out the order when the payload does not say', () => {
    /*
      The one thing about this format that produces a wrong answer rather than
      no answer. "20301012" cannot be MMDDCCYY — month 20 does not exist — so
      it must be the Canadian order.
    */
    expect(aamvaDate('20301012', null)).toBe('2030-10-12');
  });

  it('refuses digits that are not a date', () => {
    expect(aamvaDate('99999999', 'USA')).toBeNull();
    // 31 February passes a range check and is still not a date.
    expect(aamvaDate('02312030', 'USA')).toBeNull();
    expect(aamvaDate('123', 'USA')).toBeNull();
  });
});

describe('parseAamva', () => {
  it('reads the fields that matter', () => {
    const r = parseAamva(LICENCE)!;
    expect(r.documentNumber).toBe('T64235789');
    expect(r.surname).toBe('SAMPLE');
    expect(r.givenNames).toBe('MICHAEL JOHN');
    expect(r.dateOfExpiry).toBe('2030-12-10');
    expect(r.dateOfBirth).toBe('1986-06-06');
    expect(r.country).toBe('USA');
  });

  it('ignores the padding the standard uses for empty fields', () => {
    // 'NONE' is a value in the payload, not somebody's name.
    expect(parseAamva(LICENCE)!.surname).not.toBe('NONE');
  });

  it('returns null for something that is not one of these', () => {
    expect(parseAamva('https://example.com')).toBeNull();
    expect(parseAamva('@\nANSI 6360001')).toBeNull();
  });
});

describe('checkScan, given a barcode', () => {
  const MICHAEL = { firstName: 'Michael', lastName: 'Sample' };
  const NOW = new Date('2026-06-01T00:00:00Z');

  it('reads it instead of discarding it', () => {
    const r = checkScan({ mrzText: LICENCE, member: MICHAEL, now: NOW });
    expect(r.format).toBe('BARCODE');
    expect(r.extracted.dateOfExpiry).toBe('2030-12-10');
    expect(r.extracted.documentNumber).toBe('T64235789');
  });

  it('is UNVERIFIED, never CONSISTENT', () => {
    /*
      There are no check digits in this format, so the document proves nothing
      about itself. The barcode is DECODED rather than recognised — a value that
      comes out is the value that was encoded — which makes it worth reading and
      not worth trusting. Claiming a pass would invent an assurance it does not
      carry.
    */
    const r = checkScan({ mrzText: LICENCE, member: MICHAEL, now: NOW });
    expect(r.verdict).toBe('UNVERIFIED');
    expect(r.checks.find((c) => c.id === 'checkDigits')!.outcome).toBe('SKIP');
  });

  it('still catches the checks that are about US rather than the document', () => {
    // A colleague's licence: the name check works whatever the format.
    const r = checkScan({
      mrzText: LICENCE,
      member: { firstName: 'Anna', lastName: 'Eriksson' },
      now: NOW,
    });
    expect(r.verdict).toBe('SUSPECT');
    expect(r.checks.find((c) => c.id === 'nameMatchesMember')!.outcome).toBe('FAIL');
  });

  it('catches the same document filed by somebody else', () => {
    const r = checkScan({ mrzText: LICENCE, member: MICHAEL, alreadyFiledBy: 'Mike Weber', now: NOW });
    expect(r.verdict).toBe('SUSPECT');
  });

  it('warns about an expired licence rather than calling it suspect', () => {
    const expired = LICENCE.replace('DBA12102030', 'DBA12102020');
    const r = checkScan({ mrzText: expired, member: MICHAEL, now: NOW });
    expect(r.checks.find((c) => c.id === 'notExpired')!.outcome).toBe('WARN');
  });
});
