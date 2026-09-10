import { classifyDocument, worthProposing } from '@hbcfield/shared/client';

/**
 * What IS this photograph?
 *
 * ⚠️ Most of this file is about REFUSING. A false positive puts a proposal for
 * a vehicle that does not exist in a manager's queue, and the third time that
 * happens the queue stops being read — which costs the real proposals too. A
 * false negative costs one tap.
 */

const NOW = new Date('2026-09-10T12:00:00Z');

const CONTRACT = [
  'Autovermietung Gmunden GmbH',
  'Mietvertrag Nr. 2026-8841',
  'Amtliches Kennzeichen: GM-472 DK',
  'Fahrgestellnummer: WF0YXXTTGYKA12345',
  'Mietbeginn: 15.09.2026',
  'Mietende: 15.03.2027',
];

describe('a rental agreement', () => {
  const c = classifyDocument(CONTRACT, NOW);

  it('is recognised', () => {
    expect(c.kind).toBe('asset-contract');
    expect(worthProposing(c)).toBe(true);
  });

  it('is certain when it also carries a term', () => {
    expect(c.confidence).toBe('certain');
  });

  /*
    A classifier nobody can argue with is one people either trust blindly or
    ignore entirely. Saying WHY is what makes a wrong answer correctable rather
    than mysterious.
  */
  it('says why, in words somebody can check against the page', () => {
    expect(c.signals.join(' ')).toContain('Mietvertrag');
    expect(c.signals.join(' ')).toContain('WF0YXXTTGYKA12345');
  });

  it('hands back what it read, so nobody parses the page twice', () => {
    expect(c.contract.registration?.value).toBe('GM-472 DK');
  });

  it('is only likely without a term — a purchase has no end date', () => {
    const bought = classifyDocument(
      ['Kaufvertrag', 'Amtliches Kennzeichen: GM-472 DK'],
      NOW,
    );
    expect(bought.kind).toBe('asset-contract');
    expect(bought.confidence).toBe('likely');
  });
});

describe('refusing', () => {
  /*
    ⚠️ THE CASE THIS WHOLE MODULE EXISTS FOR.

    A fuel receipt from a leasing company prints the company's name — which
    carries "Leasing" — and a registration, which is on every fleet slip. Both
    conditions met, and it is a receipt. So the transaction shape is weighed
    FIRST and outvotes any amount of contract-looking vocabulary.
  */
  it('refuses a fuel receipt from a leasing company', () => {
    const slip = classifyDocument([
      'Muster Leasing GmbH — Tankbeleg',
      'Rechnung Nr. 55231',
      'Kennzeichen: GM-472 DK',
      'Diesel 48,20 L',
      'GESAMT EUR 81,41',
    ], NOW);
    expect(slip.kind).toBe('unknown');
    expect(slip.signals.join(' ')).toContain('receipt');
  });

  it('refuses a page that says "contract" but identifies nothing', () => {
    // Terms and conditions, a signature page, a covering letter.
    const terms = classifyDocument(['Allgemeine Vertragsbedingungen', 'Seite 3 von 7'], NOW);
    expect(terms.kind).toBe('unknown');
  });

  it('refuses a page that carries a registration but is not an agreement', () => {
    // An insurance card, a service book, a parking permit.
    const card = classifyDocument([
      'Versicherungsbestätigung',
      'Amtliches Kennzeichen: GM-472 DK',
    ], NOW);
    expect(card.kind).toBe('unknown');
  });

  it('refuses an empty or unreadable page', () => {
    expect(classifyDocument([], NOW).kind).toBe('unknown');
    expect(classifyDocument(['   ', ''], NOW).kind).toBe('unknown');
  });

  it('refuses a payslip', () => {
    const payslip = classifyDocument([
      'Lohn- und Gehaltsabrechnung September 2026',
      'Gesamt brutto 3.410,00',
      'Auszahlungsbetrag 2.284,17',
    ], NOW);
    expect(payslip.kind).toBe('unknown');
  });
});

describe('the other languages', () => {
  it('reads an English lease', () => {
    const c = classifyDocument([
      'Vehicle rental agreement',
      'Registration: W 12345 X',
      'From 01.09.2026 to 01.09.2027',
    ], NOW);
    expect(c.kind).toBe('asset-contract');
  });

  it('reads an Italian one', () => {
    const c = classifyDocument([
      'Contratto di noleggio',
      'Telaio: WF0YXXTTGYKA12345',
    ], NOW);
    expect(c.kind).toBe('asset-contract');
  });
});
