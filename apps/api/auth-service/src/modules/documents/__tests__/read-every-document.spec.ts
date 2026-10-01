import { parseMrz, mrzCheckDigit, suggestExpiry, findDates } from '@hbcfield/shared';

/**
 * Reading what members actually send: visas, US documents, certificates in five
 * languages. Written after three visas sat in the review queue unread — the
 * reader knew passports and numeric dates, and nothing else.
 */
const NOW = new Date('2026-10-01T12:00:00Z');

/** A visa zone built with real check digits, so the test proves the arithmetic. */
function visaZone(len: 44 | 36): string {
  const num = 'C1234567<', dob = '850315', exp = '310912';
  const l1 = ('V<USAJOHNSON<<MIKE<ALAN').padEnd(len, '<');
  const body = `${num}${mrzCheckDigit(num)}DEU${dob}${mrzCheckDigit(dob)}M${exp}${mrzCheckDigit(exp)}`;
  const l2 = body.padEnd(len, '<');
  return `${l1}\n${l2}`;
}

describe('visas', () => {
  it.each([44, 36] as const)('reads a %i-character visa zone, with no composite to fail', (len) => {
    const mrz = parseMrz(visaZone(len), NOW)!;
    expect(mrz.format).toBe(len === 44 ? 'MRVA' : 'MRVB');
    expect(mrz.allChecksPassed).toBe(true);
    expect(mrz.compositeValid).toBeNull();
    expect(mrz.dateOfExpiry.value).toBe('2031-09-12');
    expect(mrz.surname).toBe('JOHNSON');
  });

  it('a changed expiry digit still fails its own check', () => {
    const tampered = visaZone(44).replace('310912', '330912');
    expect(parseMrz(tampered, NOW)!.allChecksPassed).toBe(false);
  });

  it('reads the printed "Expiration Date 12SEP2031" when the zone is unreadable', () => {
    const d = suggestExpiry('Issue Date      Expiration Date\n15SEP2021       12SEP2031', NOW)!;
    expect(d.iso).toBe('2031-09-12');
  });
});

describe('dates written with month names', () => {
  it.each([
    ['12SEP2031', '2031-09-12'],
    ['12 Sep 2031', '2031-09-12'],
    ['12-Sep-2031', '2031-09-12'],
    ['Sept 12, 2031', '2031-09-12'],
    ['September 12 2031', '2031-09-12'],
    ['12. September 2031', '2031-09-12'],
    ['3. März 2030', '2030-03-03'],
    ['1er décembre 2029', null],
    ['1 décembre 2029', '2029-12-01'],
    ['12 settembre 2031', '2031-09-12'],
    ['12 de septiembre de 2031', '2031-09-12'],
    ['12/31/2030', '2030-12-31'],
  ])('%p → %p', (text, iso) => {
    const found = findDates(text, NOW);
    expect(found[0]?.iso ?? null).toBe(iso);
  });

  it('never invents a month from an ordinary word', () => {
    expect(findDates('Unit 12 MAIN 2031', NOW)).toEqual([]);
  });

  it('reads the European order when both orders are possible', () => {
    expect(findDates('03/04/2030', NOW)[0]!.iso).toBe('2030-04-03');
  });
});

describe('the expiry is the date the document NAMES, not the latest one', () => {
  it('a certificate with a later "next inspection" date', () => {
    const text = 'Gas safety certificate\nValid until: 31.03.2027\nNext inspection recommended 15.09.2027';
    const d = suggestExpiry(text, NOW)!;
    expect(d).toMatchObject({ iso: '2027-03-31', basis: 'LABEL' });
  });

  it.each([
    ['Gültig bis 30.06.2028', '2028-06-30'],
    ['Ablaufdatum: 30.06.2028', '2028-06-30'],
    ["Date d'expiration 30/06/2028", '2028-06-30'],
    ['Scadenza 30.06.2028', '2028-06-30'],
    ['Fecha de vencimiento 30/06/2028', '2028-06-30'],
    ['EXP 06/30/2028', '2028-06-30'],
  ])('%p', (text, iso) => {
    expect(suggestExpiry(`Some card\n${text}\nIssued 01.07.2023`, NOW)).toMatchObject({ iso, basis: 'LABEL' });
  });

  it('an EU driving licence: field 4b, even when field 4a sits beside it', () => {
    const text = '1. WEBER\n2. MIKE\n3. 12.04.1989 WIEN\n4a. 11.05.2021  4b. 10.05.2036\n4c. LPD WIEN';
    expect(suggestExpiry(text, NOW)).toMatchObject({ iso: '2036-05-10', basis: 'LABEL' });
  });

  it('a label above its value, on the next line', () => {
    expect(suggestExpiry('EXPIRES\n01 Feb 2030', NOW)).toMatchObject({ iso: '2030-02-01', basis: 'LABEL' });
  });

  it('"vence" inside Provence is not a label', () => {
    const d = suggestExpiry('Hotel Provence 01.01.2027\nValid until 05.05.2028', NOW)!;
    expect(d.iso).toBe('2028-05-05');
  });

  it('falls back to the latest future date when nothing is labelled', () => {
    expect(suggestExpiry('Issued 01.07.2023  —  31.12.2029', NOW)).toMatchObject({ iso: '2029-12-31', basis: 'LATEST' });
  });
});

describe('a photographed zone, as the engine really returns it', () => {
  it('reads the zone with fillers misread as K and a filler dropped', () => {
    const [l1, l2] = visaZone(44).split('\n');
    const noisy = `${l1!.replace(/<{6}$/, 'K<KK<')}\n${l2!.slice(0, 43)}`; // 43 long, K-fillers
    const mrz = parseMrz(noisy, NOW)!;
    expect(mrz.format).toBe('MRVA');
    expect(mrz.allChecksPassed).toBe(true);
    expect(mrz.dateOfExpiry.value).toBe('2031-09-12');
  });

  it('never eats the end of a name that happens to end in CK', () => {
    const l1 = 'P<USAPATRICK<<MIKE'.padEnd(44, '<');
    expect(parseMrz(`${l1}\n${'X'.repeat(44)}`, NOW)?.surname ?? 'PATRICK').toBe('PATRICK');
  });
});
