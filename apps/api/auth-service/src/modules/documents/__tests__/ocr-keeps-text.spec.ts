import sharp from 'sharp';
import { MrzOcrService } from '../mrz-ocr.service';

/**
 * The OCR returns what it read — not only what looks like a passport.
 *
 * ⚠️ THE DEFECT THIS PINS WAS INVISIBLE TO EVERY EXISTING TEST, and the reason
 * is worth stating: `read-before-file.spec.ts` mocks `MrzOcrService`, so it fed
 * the service a driving licence's printed text and watched it produce a date
 * correctly. It passed. It could not fail. The real service could never have
 * produced that text, because `attempt()` ended with
 *
 *     return fromWhole && mrzLines(fromWhole).length >= 2 ? fromWhole : null;
 *
 * — recognised text was DISCARDED unless it contained two lines of exactly
 * 30/36/44 characters of `[A-Z0-9<]`. A driving licence has no such lines.
 * Neither does a gas certificate, a first-aid card or an insurance letter.
 * `suggestExpiry` sat downstream, tested and correct, and was never once
 * called with anything but null — so every member filing anything other than a
 * passport typed the expiry by hand, which is exactly what was reported.
 *
 * These tests drive the real `read()` and stub only the engine, so the shape
 * gate cannot come back.
 */
describe('MrzOcrService — what comes back', () => {
  const service = new MrzOcrService();

  /** A real image, because `attempt` measures it before doing anything. */
  const image = async (width = 1200) =>
    sharp({ create: { width, height: 800, channels: 3, background: '#fff' } }).jpeg().toBuffer();

  /** Stub the engine; keep every decision in `attempt` real. */
  const engineReturns = (...pages: (string | null)[]) => {
    const q = [...pages];
    return jest
      .spyOn(service as any, 'recognise')
      .mockImplementation(async () => (q.length > 1 ? q.shift()! : q[0] ?? null));
  };

  afterEach(() => jest.restoreAllMocks());

  it('returns the printed text of a document that has no zone', async () => {
    const licence = '3. 15.08.1985  4a. 01.03.2020  4b. 01.03.2035  5. 12345678';
    // Band first (the lower third — not a zone), then the whole frame.
    engineReturns('5. 12345678', licence);

    expect(await service.read(await image(), 'image/jpeg')).toBe(licence);
  });

  it('still prefers the zone when there is one', async () => {
    // A passport: the band IS the zone, and it wins without a second pass —
    // exact, and one OCR run instead of two.
    const zone = `${'P<AUTADLER<<LISA'.padEnd(44, '<')}\n${'P1234567<0AUT8503157F3106305'.padEnd(44, '<')}`;
    const spy = engineReturns(zone, 'should never be reached');

    expect(await service.read(await image(), 'image/jpeg')).toBe(zone);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('wholeFrame skips the band for a caller that already has its zone answer', async () => {
    const spy = engineReturns('printed text');
    expect(await service.read(await image(), 'image/jpeg', { wholeFrame: true })).toBe('printed text');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('returns null when the engine read nothing', async () => {
    engineReturns(null, null);
    expect(await service.read(await image(), 'image/jpeg')).toBeNull();
  });

  it('refuses a picture too small to read rather than guessing from mush', async () => {
    engineReturns('something');
    expect(await service.read(await image(300), 'image/jpeg')).toBeNull();
  });

  it('does not attempt a PDF', async () => {
    // Rasterising needs a renderer this service does not have. Saying so is
    // what lets the screen ask for the date instead of silently finding none.
    const spy = engineReturns('text');
    expect(await service.read(await image(), 'application/pdf')).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('never throws — a bad read files the document without a verdict', async () => {
    jest.spyOn(service as any, 'recognise').mockRejectedValue(new Error('engine died'));
    await expect(service.read(await image(), 'image/jpeg')).resolves.toBeNull();
  });
});
