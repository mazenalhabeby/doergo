import { parseReceipt, moneyToCents, categoryForReceipt } from '@hbcfield/shared/client';

/**
 * A photograph of a fuel slip → the three things somebody would type.
 *
 * The one that must not be quietly wrong is the AMOUNT. A misread date is
 * visible; a misread total is money, and it is the number nobody re-reads once
 * it looks plausible. So most of this file is about which figure on a slip is
 * the total and which merely looks like one.
 */

const NOW = new Date('2026-09-10T12:00:00Z');

describe('reading a printed figure', () => {
  it('reads the Austrian form', () => {
    expect(moneyToCents('1.234,56')).toBe(123_456);
    expect(moneyToCents('84,20')).toBe(8_420);
  });

  it('reads the international form', () => {
    expect(moneyToCents('1,234.56')).toBe(123_456);
  });

  /*
    "1.234" is one thousand two hundred, not €12.34. The LAST separator decides
    which one is decimal, and three trailing digits are a thousands group — the
    rule that gets both slips right without knowing which country printed them.
  */
  it('does not read a thousands group as cents', () => {
    expect(moneyToCents('1.234')).toBe(123_400);
  });

  it('refuses what is not money', () => {
    expect(moneyToCents('abc')).toBeNull();
    expect(moneyToCents('0,00')).toBeNull();
    // An OCR artefact, not a purchase.
    expect(moneyToCents('99.999.999,00')).toBeNull();
  });
});

describe('a fuel slip', () => {
  const SLIP = [
    'OMV Tankstelle Laakirchen',
    'Arbeiterheimstrasse 12',
    'Datum 08.09.2026 07:42',
    'Diesel',
    'Menge 48,20 L',
    'Preis/L 1,689',
    'Netto 67,84',
    'MwSt 20% 13,57',
    'GESAMT EUR 81,41',
    'Kartenzahlung ****4419',
    'KM-Stand 184320',
  ];

  const read = parseReceipt(SLIP, NOW);

  /*
    ⚠️ The case this whole parser exists for.

    "Biggest number wins" reads the odometer — 184320 — as €184,320. So a
    labelled figure beats an unlabelled one whatever the amounts, and the
    labels that mean "not the total" (Netto, MwSt, Preis/L, Menge) are skipped
    before anything is compared.
  */
  it('takes the labelled total, not the biggest number on the slip', () => {
    expect(read.totalCents?.value).toBe(8_141);
    expect(read.totalCents?.confidence).toBe('certain');
  });

  it('takes the printed date', () => {
    expect(read.date?.value).toBe('2026-09-08');
    expect(read.date?.confidence).toBe('certain');
  });

  it('takes the top of the slip as the vendor', () => {
    expect(read.vendor?.value).toBe('OMV Tankstelle Laakirchen');
  });

  it('knows it was fuel', () => {
    expect(read.hint).toBe('fuel');
    expect(read.currency).toBe('EUR');
  });
});

describe('a slip with no total printed on it', () => {
  const read = parseReceipt(['Kfz Werkstatt Huber', '09.09.2026', 'Olwechsel', '148,00'], NOW);

  it('offers the figure it found, and says it is a guess', () => {
    // Better than an empty box — the person confirms it against the paper they
    // are holding — but never dressed up as read.
    expect(read.totalCents?.value).toBe(14_800);
    expect(read.totalCents?.confidence).toBe('likely');
  });

  it('still knows what it was for', () => {
    expect(read.hint).toBe('service');
  });
});

describe('what the OCR could not read', () => {
  it('returns nothing rather than something', () => {
    // An empty screen a person fills in is fine. A confident wrong number is not.
    expect(parseReceipt([], NOW)).toEqual({});
    expect(parseReceipt(['', '   '], NOW)).toEqual({});
  });

  it('ignores a card expiry, which is the one date on a slip that is ahead', () => {
    const read = parseReceipt(['Shop', 'Karte gultig bis 12/2030', 'Total 12,00', 'am 01.09.2026'], NOW);
    expect(read.date?.value).toBe('2026-09-01');
  });

  it('marks a date far from today as a guess', () => {
    const read = parseReceipt(['Shop', 'Total 12,00', '02.01.2019'], NOW);
    expect(read.date?.confidence).toBe('likely');
  });
});

describe('choosing the heading it goes under', () => {
  /*
    The hint is a word in OUR vocabulary; the headings are the customer's. A
    German fleet's are "Treibstoff" and "Werkstatt", so the match is loose —
    and it falls back to the first spending heading rather than leaving a
    required select empty.
  */
  const cats = [
    { label: 'Werkstatt', direction: 'out' },
    { label: 'Treibstoff', direction: 'out' },
    { label: 'Miete', direction: 'in' },
  ];

  it('matches the customer’s own word', () => {
    expect(categoryForReceipt({ hint: 'fuel' }, cats)?.label).toBe('Treibstoff');
    expect(categoryForReceipt({ hint: 'service' }, cats)?.label).toBe('Werkstatt');
  });

  it('never picks a heading money comes IN under', () => {
    // Filing a fuel bill as rent received would invert the asset's whole total.
    expect(categoryForReceipt({ hint: 'fuel' }, [{ label: 'Miete', direction: 'in' }])).toBeNull();
  });

  it('falls back to the first spending heading rather than nothing', () => {
    expect(categoryForReceipt({}, cats)?.label).toBe('Werkstatt');
  });
});
