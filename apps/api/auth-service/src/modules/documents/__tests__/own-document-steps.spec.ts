import { extraSheets, parseOwnExpiry, scannedExpiryOf } from '../own-document-steps';
import { MAX_PAGES } from '../pages-pdf';

describe('own document steps', () => {
  it('a missing expiry is fine; unreadable or 50+ years out is refused; the past is allowed', () => {
    expect(parseOwnExpiry(null)).toBeNull();
    expect(() => parseOwnExpiry('not a date')).toThrow('That expiry date could not be read');
    expect(() => parseOwnExpiry(`${new Date().getFullYear() + 60}-01-01`)).toThrow('too far in the future');
    expect(parseOwnExpiry('2001-01-01')?.getFullYear()).toBe(2001);
  });

  it('a document is two-sided or many sheets, never both, and within the page limit', () => {
    expect(extraSheets({ pageStagingKeys: ['a', '', 'b'] })).toEqual(['a', 'b']);
    expect(() => extraSheets({ pageStagingKeys: ['a'], backStagingKey: 'k' })).toThrow('not both');
    expect(() => extraSheets({ pageStagingKeys: Array.from({ length: MAX_PAGES }, (_, i) => `p${i}`) })).toThrow(
      `at most ${MAX_PAGES} pages`,
    );
  });

  it('a read expiry wins unless the scan is suspect', () => {
    const scan = (verdict: string) => ({ verdict, extracted: { dateOfExpiry: '2030-05-01' } }) as any;
    expect(scannedExpiryOf(scan('OK'))?.toISOString().slice(0, 10)).toBe('2030-05-01');
    expect(scannedExpiryOf(scan('SUSPECT'))).toBeNull();
    expect(scannedExpiryOf(null)).toBeNull();
  });
});
