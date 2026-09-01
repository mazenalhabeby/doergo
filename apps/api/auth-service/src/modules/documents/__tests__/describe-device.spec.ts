import { describeDevice } from '../contract-pdf';

/**
 * What the certificate of completion says somebody was using.
 *
 * It said `okhttp/4.12.0` — the name of Android's HTTP library. On a record
 * whose entire purpose is to be read by a human deciding whether a signature
 * is sound, a string like that is worse than blank: it reads as a fault in the
 * document.
 *
 * Deliberately coarse, and these tests are here partly to keep it that way.
 * "The Android app" is the fact that matters; version-level fingerprinting of
 * a signer is not something this page should start doing.
 */
describe('describeDevice', () => {
  it('names the mobile app rather than its HTTP library', () => {
    expect(describeDevice('okhttp/4.12.0')).toBe('HBCField app for Android');
    expect(describeDevice('HBCField/1.0.3 CFNetwork/1498 Darwin/23.6.0')).toBe('HBCField app for iOS');
  });

  it('reads a desktop browser as browser-on-system', () => {
    expect(
      describeDevice(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
      ),
    ).toBe('Chrome on macOS');
  });

  it('does not let Chrome-claiming browsers masquerade — order matters', () => {
    const edge =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 Edg/128.0';
    expect(describeDevice(edge)).toBe('Edge on Windows');
  });

  it('recognises Safari on iPhone, which claims to be several things', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
    expect(describeDevice(ua)).toBe('Safari on iPhone');
  });

  it('says so plainly when it cannot tell, rather than inventing', () => {
    expect(describeDevice('curl/8.4.0')).toBe('Unrecognised device');
    expect(describeDevice('')).toBe('Unrecognised device');
  });
});
