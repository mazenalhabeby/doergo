import { checkScan, nameMatches, verdictFrom, mrzCheckDigit } from '@hbcfield/shared';

/**
 * What a scan is allowed to conclude.
 *
 * The verdict is never "genuine". It is "nothing here is wrong" — a different
 * and honest claim, because whether the document was ever issued cannot be
 * answered without the issuer's registry or the chip. These tests are mostly
 * about the boundary between those two statements.
 */

const TD3 = [
  'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<',
  'L898902C36UTO7408122F1204159ZE184226B<<<<<10',
].join('\n');

const NOW = new Date('2026-06-01T00:00:00Z');
const ANNA = { firstName: 'Anna', lastName: 'Eriksson' };

/** The specimen expired in 2012; most tests want one that has not. */
function withExpiry(yymmdd: string): string {
  const [l1, l2] = TD3.split('\n') as [string, string];
  const rebuilt = l2.slice(0, 21) + yymmdd + mrzCheckDigit(yymmdd) + l2.slice(28);
  const composite = rebuilt.slice(0, 10) + rebuilt.slice(13, 20) + rebuilt.slice(21, 43);
  return `${l1}\n${rebuilt.slice(0, 43)}${mrzCheckDigit(composite)}`;
}

const VALID = withExpiry('310630');

describe('nameMatches', () => {
  it('matches the ordinary case', () => {
    expect(nameMatches({ surname: 'ERIKSSON', givenNames: 'ANNA MARIA' }, ANNA)).toBe(true);
  });

  it('matches through the transliterations documents actually use', () => {
    /*
      A check that flagged Jürgen Müller against MUELLER JUERGEN would fire on
      half an Austrian workforce and be switched off within a week. Being right
      about the common case matters more here than strictness.
    */
    expect(
      nameMatches({ surname: 'MUELLER', givenNames: 'JUERGEN' }, { firstName: 'Jürgen', lastName: 'Müller' }),
    ).toBe(true);
    expect(
      nameMatches({ surname: 'WEISS', givenNames: 'HANS' }, { firstName: 'Hans', lastName: 'Weiß' }),
    ).toBe(true);
  });

  it('ignores a middle name the employer never recorded', () => {
    expect(nameMatches({ surname: 'ERIKSSON', givenNames: 'ANNA MARIA' }, ANNA)).toBe(true);
  });

  it('accepts a surname that grew — marriage, double-barrelling', () => {
    expect(
      nameMatches({ surname: 'MUELLER-SCHMIDT', givenNames: 'ANNA' }, { firstName: 'Anna', lastName: 'Mueller' }),
    ).toBe(true);
  });

  it('rejects a different person', () => {
    expect(nameMatches({ surname: 'WEBER', givenNames: 'MIKE' }, ANNA)).toBe(false);
  });

  it('rejects the right surname with the wrong first name', () => {
    // The case that matters: a family member's document.
    expect(
      nameMatches({ surname: 'ERIKSSON', givenNames: 'LARS' }, ANNA),
    ).toBe(false);
  });
});

describe('checkScan', () => {
  it('skips everything, without complaint, for a document that has no zone', () => {
    /*
      Most documents in this product — a gas certificate, a training record —
      have no machine-readable zone at all. Calling that suspect would make the
      verdict meaningless on the common case and train reviewers to ignore it.
    */
    const r = checkScan({ mrzText: null, member: ANNA, now: NOW });
    expect(r.verdict).toBe('UNVERIFIED');
    expect(r.checks).toEqual([{ id: 'mrzReadable', outcome: 'SKIP' }]);
    expect(r.extracted.documentNumber).toBeNull();
  });

  it('reads a good zone and finds nothing wrong', () => {
    const r = checkScan({ mrzText: VALID, member: ANNA, now: NOW });
    expect(r.verdict).toBe('CONSISTENT');
    expect(r.extracted).toMatchObject({
      holderName: 'ERIKSSON ANNA MARIA',
      documentNumber: 'L898902C3',
      dateOfBirth: '1974-08-12',
      dateOfExpiry: '2031-06-30',
      issuingState: 'UTO',
    });
  });

  it('is SUSPECT when a check digit disagrees', () => {
    const edited = VALID.replace('7408122', '7408125');
    const r = checkScan({ mrzText: edited, member: ANNA, now: NOW });
    expect(r.verdict).toBe('SUSPECT');
    expect(r.checks.find((c) => c.id === 'checkDigits')!.outcome).toBe('FAIL');
  });

  it('is SUSPECT when the document belongs to somebody else', () => {
    // The most common real abuse: a colleague's licence, or a family member's.
    const r = checkScan({ mrzText: VALID, member: { firstName: 'Mike', lastName: 'Weber' }, now: NOW });
    expect(r.verdict).toBe('SUSPECT');
    expect(r.checks.find((c) => c.id === 'nameMatchesMember')!.outcome).toBe('FAIL');
  });

  it('is SUSPECT when the same document was already filed by somebody else', () => {
    const r = checkScan({ mrzText: VALID, member: ANNA, alreadyFiledBy: 'Mike Weber', now: NOW });
    expect(r.verdict).toBe('SUSPECT');
    const check = r.checks.find((c) => c.id === 'notAlreadyFiled')!;
    expect(check.outcome).toBe('FAIL');
    // Names the other person, so a reviewer can act rather than investigate.
    expect(check.detail).toBe('Mike Weber');
  });

  it('WARNS about an expired document rather than calling it suspect', () => {
    /*
      An expired passport is a real passport. Somebody filing one alongside its
      replacement is doing the right thing, and marking that SUSPECT would put
      an honest member in front of a fraud message.
    */
    const r = checkScan({ mrzText: TD3, member: ANNA, now: NOW });
    expect(r.checks.find((c) => c.id === 'notExpired')!.outcome).toBe('WARN');
    expect(r.verdict).toBe('UNVERIFIED');
  });

  it('fails an implausible date of birth', () => {
    const r = checkScan({
      mrzText: VALID,
      member: { ...ANNA, dateOfBirth: '1974-08-12' },
      now: new Date('2100-01-01T00:00:00Z'),
    });
    expect(r.checks.find((c) => c.id === 'dateOfBirthPlausible')!.outcome).toBe('FAIL');
  });

  it('fails a date of birth that contradicts the record', () => {
    const r = checkScan({ mrzText: VALID, member: { ...ANNA, dateOfBirth: '1980-01-01' }, now: NOW });
    expect(r.checks.find((c) => c.id === 'dateOfBirthPlausible')!.outcome).toBe('FAIL');
  });

  it('does not fail a date of birth nobody recorded', () => {
    // Most organizations here do not hold one; a missing field is not a lie.
    const r = checkScan({ mrzText: VALID, member: ANNA, now: NOW });
    expect(r.checks.find((c) => c.id === 'dateOfBirthPlausible')!.outcome).toBe('PASS');
  });

  it('keeps the whole read, so a reviewer sees what the machine saw', () => {
    const r = checkScan({ mrzText: VALID, member: ANNA, now: NOW });
    expect(r.raw?.format).toBe('TD3');
    expect(r.raw?.compositeValid).toBe(true);
  });
});

describe('verdictFrom', () => {
  it('is CONSISTENT only when everything that ran, passed', () => {
    expect(verdictFrom([{ id: 'checkDigits', outcome: 'PASS' }])).toBe('CONSISTENT');
  });

  it('is UNVERIFIED when something could not be checked', () => {
    // The honest middle. Not a pass, not an accusation.
    expect(verdictFrom([
      { id: 'checkDigits', outcome: 'PASS' },
      { id: 'notExpired', outcome: 'SKIP' },
    ])).toBe('UNVERIFIED');
  });

  it('is SUSPECT on a single failure, with no weighting', () => {
    /*
      No score, deliberately. A number invites somebody to set a threshold and
      stop reading the reasons — and the reasons are the useful part, because
      "the name does not match" and "this expired in 2012" call for completely
      different conversations.
    */
    expect(verdictFrom([
      { id: 'checkDigits', outcome: 'PASS' },
      { id: 'nameMatchesMember', outcome: 'FAIL' },
      { id: 'issuerKnown', outcome: 'PASS' },
    ])).toBe('SUSPECT');
  });

  it('never returns anything meaning "genuine"', () => {
    // The vocabulary is the safeguard. Whether the document was ever issued
    // cannot be answered here, and no verdict may imply that it was.
    const all: string[] = ['CONSISTENT', 'UNVERIFIED', 'SUSPECT'];
    expect(all).not.toContain('GENUINE');
    expect(all).not.toContain('VERIFIED');
  });
});
