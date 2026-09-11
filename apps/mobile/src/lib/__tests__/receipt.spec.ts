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

/**
 * An INVOICE, which is not a till slip.
 *
 * ⚠️ Reported from real use: "it sees the first amount and that's all, not the
 * total". A till slip prints one figure that matters, at the bottom, under one
 * word. An invoice prints a table of line items, then a net, then a tax, then a
 * gross — and the word "Summe" can sit over any of them. The old rule took the
 * biggest unlabelled figure, which on such a page is a line item.
 */
describe('a workshop invoice', () => {
  const INVOICE = [
    'Kfz-Werkstatt Huber GmbH',
    'Rechnung Nr. 2026-0481',
    'Rechnungsdatum 05.09.2026',
    'Pos  Bezeichnung            Menge   Einzelpreis   Betrag',
    '1    Bremsscheiben vorne    2       145,00        290,00',
    '2    Bremsbelaege           1       89,50         89,50',
    '3    Arbeitszeit 3,5 Std    3,5     95,00         332,50',
    'Zwischensumme                                     712,00',
    'Rabatt 5%                                         -35,60',
    'Nettobetrag                                       676,40',
    'MwSt 20%                                          135,28',
    'Gesamtbetrag                                      811,68',
    'Zahlbar innerhalb 14 Tagen ohne Abzug',
  ];

  const read = parseReceipt(INVOICE, NOW);

  it('takes the gross total, not a line item and not the first figure', () => {
    // 290,00 is the first amount on the page and the biggest line item.
    // 712,00 is the subtotal. 676,40 is the net. 135,28 is the tax.
    expect(read.totalCents?.value).toBe(81_168);
  });

  it('says it is certain, because the line names it', () => {
    expect(read.totalCents?.confidence).toBe('certain');
  });

  it('reads the invoice date rather than a payment term', () => {
    expect(read.date?.value).toBe('2026-09-05');
  });

  it('knows it was a repair', () => {
    expect(read.hint).toBe('service');
  });
});

describe('an invoice whose total sits in the next line — which is what a table is', () => {
  /*
    ⚠️ THE FAILURE MODE THAT PRODUCED THE REPORT. OCR reads a two-column
    summary block as separate lines, because half a page of whitespace sits
    between the label and the figure. The labelled line then carries no number
    at all, everything falls through to "bare figure that looks like money",
    and the answer is whichever amount happened to be biggest.
  */
  const INVOICE = [
    'Autohaus Gruber',
    'Rechnung 12.09.2026',
    'Wartung Intervall 60.000 km',
    'Ersatzteile',
    '412,00',
    'Arbeitszeit',
    '285,00',
    'Nettobetrag',
    '697,00',
    'MwSt 20%',
    '139,40',
    'Gesamtbetrag',
    '836,40',
  ];

  const read = parseReceipt(INVOICE, NOW);

  it('reaches forward for the figure its label has no room for', () => {
    expect(read.totalCents?.value).toBe(83_640);
    expect(read.totalCents?.confidence).toBe('certain');
  });

  it('does not reach across an excluded line and read the tax', () => {
    // "Nettobetrag" then "697,00" — the net must never be adopted as a total.
    expect(read.totalCents?.value).not.toBe(69_700);
    expect(read.totalCents?.value).not.toBe(13_940);
  });
});

describe('words that merely CONTAIN a forbidden word', () => {
  /*
    ⚠️ `includes` was striking out any line containing "net" — which is inside
    Internet, Kabinett and Magnetventil — and "bar", inside Barcode. The line
    struck out is sometimes the one carrying the total.
  */
  it('does not lose a total to the word "Magnetventil"', () => {
    const read = parseReceipt(
      ['Werkstatt Huber', '11.09.2026', 'Magnetventil getauscht', 'Gesamtbetrag 240,00'],
      NOW,
    );
    expect(read.totalCents?.value).toBe(24_000);
  });

  it('still strikes out the real word', () => {
    const read = parseReceipt(
      ['Huber', '11.09.2026', 'Netto 200,00', 'MwSt 40,00', 'Gesamtbetrag 240,00'],
      NOW,
    );
    expect(read.totalCents?.value).toBe(24_000);
  });
});

describe('an English invoice', () => {
  const read = parseReceipt(
    [
      'Fleet Services Ltd',
      'Invoice date 03.09.2026',
      'Tyres x4                    480.00',
      'Alignment                    65.00',
      'Subtotal                    545.00',
      'VAT 20%                     109.00',
      'Total due                   654.00',
    ],
    NOW,
  );

  it('takes the amount due', () => {
    expect(read.totalCents?.value).toBe(65_400);
    expect(read.totalCents?.confidence).toBe('certain');
  });
});
