import sharp from 'sharp';
import { openUntrustedImage, MAX_INPUT_PIXELS } from '../image-input';

/**
 * The decode bound on images somebody else chose.
 *
 * Every image in this module arrives from a member's phone or file picker. The
 * upload size check passes a 20 MB file, but the number that decides how much
 * memory the decode allocates is the DIMENSIONS, not the bytes — and a small,
 * cleverly-authored file can ask for gigabytes of pixels before any of our code
 * runs.
 *
 * sharp's own default is 268 megapixels: 800 MB of raw image inside a 512 MB
 * service. The bound here was set from measurement — one MRZ scan of a 12 MP
 * photo peaks around 220 MB in production — at five times a typical phone photo
 * and a fifth of sharp's default.
 */
describe('openUntrustedImage', () => {
  const solid = (width: number, height: number) =>
    sharp({ create: { width, height, channels: 3, background: { r: 128, g: 128, b: 128 } } })
      .png()
      .toBuffer();

  it('is well under sharp’s own default', () => {
    // The default is what applies when nobody passes the option — the state this
    // module was in.
    expect(MAX_INPUT_PIXELS).toBeLessThan(268_402_689);
  });

  it('leaves room for a real phone photo', () => {
    // 12 MP is typical, 48 MP is a high-end phone at full resolution. Neither
    // should ever be refused: this bounds the tail, not the normal case.
    expect(MAX_INPUT_PIXELS).toBeGreaterThan(48_000_000);
  });

  it('opens an ordinary photo', async () => {
    // 4032x3024 — what a phone camera actually hands over.
    const meta = await (await openUntrustedImage(await solid(4032, 3024))).metadata();
    expect(meta.width).toBe(4032);
    expect(meta.height).toBe(3024);
  });

  it('refuses an image past the bound rather than decoding it', async () => {
    /*
      Generated at a size beyond the cap. The point is that the refusal happens
      at the decode, before any of our own code sees pixels — which is the only
      place it can happen, because by then the memory is already allocated.
    */
    const huge = await sharp({
      create: { width: 9000, height: 9000, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    // 81 MP > 60 MP cap.
    await expect((await openUntrustedImage(huge)).metadata()).rejects.toThrow(/pixels|limit/i);
  });

  it('still refuses a corrupt file', async () => {
    // The bound must not accidentally make junk acceptable.
    await expect(
      (await openUntrustedImage(Buffer.from('this is not an image'))).metadata(),
    ).rejects.toThrow();
  });
});
