import { safeEqual } from '@hbcfield/shared';

/** One constant-time comparison for every secret (platform key, Bull Board, sockets). */
describe('safeEqual', () => {
  it('matches equal secrets of any length', () => {
    expect(safeEqual('s3cret', 's3cret')).toBe(true);
    expect(safeEqual('a'.repeat(500), 'a'.repeat(500))).toBe(true);
  });
  it('refuses different ones — including a different length, without throwing', () => {
    expect(safeEqual('s3cret', 's3creT')).toBe(false);
    expect(safeEqual('s3', 's3cret')).toBe(false);
  });
  it('fails CLOSED when the expected secret is unset', () => {
    expect(safeEqual('', '')).toBe(false);
    expect(safeEqual(undefined, undefined)).toBe(false);
    expect(safeEqual('anything', undefined)).toBe(false);
  });
  it('refuses a missing presented value', () => {
    expect(safeEqual(undefined, 'key')).toBe(false);
    expect(safeEqual(null, 'key')).toBe(false);
  });
});
