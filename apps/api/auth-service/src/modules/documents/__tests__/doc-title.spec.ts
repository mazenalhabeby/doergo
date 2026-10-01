import { documentTitleFromLines, documentTitleFromText, titleCase } from '@hbcfield/shared';

/**
 * A document named by its own heading. The cases are the headers of the real
 * files that were all filed as "Employment contract" (names left out).
 */
describe('documentTitleFromLines', () => {
  const L = (size: number, text: string) => ({ size, text });

  it.each([
    [[L(18, 'HBC USA Inc.'), L(12, 'INSURANCE CONFIRMATION LETTER'), L(11, 'September 11, 2026'), L(11, 'To whom it may concern,')], 'Insurance Confirmation Letter'],
    [[L(16, 'INDEPENDENT CONTRACTOR AGREEMENT'), L(12, 'HBC USA Inc.'), L(10, 'This Independent Contractor Agreement ("Agreement") is entered into as')], 'Independent Contractor Agreement'],
    [[L(18, 'HBC USA Inc.'), L(12, 'BORDER ENTRY DOCUMENT CHECKLIST'), L(11, 'Prepared for: Someone — September 11, 2026')], 'Border Entry Document Checklist'],
    [[L(18, 'HBC USA Inc.'), L(12, 'ASSIGNMENT CONFIRMATION LETTER'), L(11, 'September 11, 2026')], 'Assignment Confirmation Letter'],
    [[L(10, 'ANNEX B'), L(16, 'DRIVING AUTHORIZATION'), L(11, 'HBC USA Inc.'), L(10, 'Dallas, TX — September 11, 2026')], 'Annex B – Driving Authorization'],
    [[L(10, 'ANNEX A'), L(16, 'USAGE TERMS AND HOUSE RULES'), L(11, 'HBC USA Inc.')], 'Annex A – Usage Terms and House Rules'],
    [[L(24, 'HBC USA Inc.'), L(11, 'Att.: Someone Somebody'), L(11, 'Invitation Letter'), L(11, 'September 11, 2026')], 'Invitation Letter'],
  ])('%#', (lines, title) => {
    expect(documentTitleFromLines(lines as any)).toBe(title);
  });

  it('German documents', () => {
    expect(documentTitleFromText('HBC GmbH\nMusterstraße 1, 4663 Laakirchen\nARBEITSVERTRAG\nzwischen')).toBe('Arbeitsvertrag');
    expect(documentTitleFromText('Nachtrag zum Dienstvertrag\nvom 01.03.2026')).toBe('Nachtrag zum Dienstvertrag');
  });

  it('the letterhead is never the name, even without "Inc."', () => {
    expect(documentTitleFromText('HBC Field\nWelcome', { organizationName: 'HBC Field' })).toBeNull();
  });

  it('says nothing rather than naming a document after a sentence of its body', () => {
    expect(documentTitleFromText('Thank you for your application, we are pleased to confirm the following.')).toBeNull();
    expect(documentTitleFromText('')).toBeNull();
  });

  it('keeps acronyms and small words right', () => {
    expect(titleCase('HBC USA NON-DISCLOSURE AGREEMENT')).toBe('HBC USA Non-Disclosure Agreement');
    expect(titleCase('Invitation Letter')).toBe('Invitation Letter');
  });
});
