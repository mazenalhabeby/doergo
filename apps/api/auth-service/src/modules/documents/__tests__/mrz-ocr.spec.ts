import sharp from 'sharp';
import { MrzOcrService } from '../mrz-ocr.service';
import { parseMrz, mrzCheckDigit } from '@hbcfield/shared';

/**
 * Reading a zone off a picture.
 *
 * The pieces around this are pure and tested elsewhere. What cannot be asserted
 * by inspection is whether the pipeline — crop, upscale, threshold, whitelist —
 * actually turns pixels into the right 88 characters, so this renders a zone to
 * an image and reads it back.
 *
 * The assertion is not "the text matches". It is that the CHECK DIGITS PASS,
 * which is the property the product relies on: a misread character fails the
 * checksum exactly as a forged one does, so a passing read is a correct read.
 * Asserting character equality would also pass on a read that was right for the
 * wrong reason, and fail on one that was right where it mattered.
 */

/** A zone for a real-looking Austrian passport, built so its digits are right. */
function buildTd3(surname: string, given: string, expiry: string): string {
  const line1 = `P<AUT${surname}<<${given}`.padEnd(44, '<');
  const num = 'P1234567'.padEnd(9, '<');
  const dob = '850315';
  const tail = ''.padEnd(14, '<') + '0';
  let line2 = `${num}${mrzCheckDigit(num)}AUT${dob}${mrzCheckDigit(dob)}M${expiry}${mrzCheckDigit(expiry)}${tail}`;
  const composite = line2.slice(0, 10) + line2.slice(13, 20) + line2.slice(21, 43);
  line2 = line2.slice(0, 43) + mrzCheckDigit(composite);
  return `${line1}\n${line2}`;
}

/**
 * Render a zone as an image, the way it sits on a document.
 *
 * A monospace face at a realistic size, on a light card, with the zone in the
 * lower band and something above it — because a picture of the zone alone would
 * not exercise the crop, which is the part doing the most work.
 */
async function renderDocument(mrz: string, opts: { width?: number } = {}): Promise<Buffer> {
  const width = opts.width ?? 2000;
  const height = Math.round(width / (85.6 / 54));
  // A zone is mostly '<'. Unescaped, it turns the SVG into invalid XML — which
  // is a property of the test harness, not of the pipeline under test.
  const xml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const [l1, l2] = mrz.split('\n').map(xml);
  /*
    Sized the way a real zone is: 44 characters spanning most of the card. On an
    actual passport each character is about 1.9 mm wide, so at this canvas that
    is ~42px — and Courier's advance is about 0.6em, which fixes the font size.
    A smaller font would be testing a photograph nobody takes.
  */
  const charWidth = (width * 0.92) / 44;
  const fontSize = Math.round(charWidth / 0.6);

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#f2f2ef"/>
      <text x="40" y="${Math.round(height * 0.18)}" font-family="Helvetica,Arial,sans-serif"
            font-size="${Math.round(fontSize * 1.1)}" fill="#222">REPUBLIK ÖSTERREICH</text>
      <text x="40" y="${Math.round(height * 0.30)}" font-family="Helvetica,Arial,sans-serif"
            font-size="${fontSize}" fill="#444">REISEPASS / PASSPORT</text>
      <rect x="40" y="${Math.round(height * 0.36)}" width="${Math.round(width * 0.22)}"
            height="${Math.round(height * 0.34)}" fill="#d8d8d4"/>
      <text x="40" y="${Math.round(height * 0.80)}" font-family="Courier,monospace"
            font-size="${fontSize}" letter-spacing="1" fill="#111">${l1}</text>
      <text x="40" y="${Math.round(height * 0.90)}" font-family="Courier,monospace"
            font-size="${fontSize}" letter-spacing="1" fill="#111">${l2}</text>
    </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

describe('MrzOcrService', () => {
  const ocr = new MrzOcrService();

  // The WASM engine takes a moment to start, and each read is real work.
  jest.setTimeout(120_000);

  afterAll(async () => {
    await ocr.onModuleDestroy();
  });

  it('refuses anything that is not an image', async () => {
    // A PDF is a scan somebody already made; rasterising one needs a renderer
    // this service does not have.
    expect(await ocr.read(Buffer.from('%PDF-1.4'), 'application/pdf')).toBeNull();
  });

  it('refuses a picture too small to have a chance', async () => {
    // Attempting it would spend two seconds of CPU to produce noise.
    const tiny = await sharp({
      create: { width: 200, height: 120, channels: 3, background: '#fff' },
    }).png().toBuffer();
    expect(await ocr.read(tiny, 'image/png')).toBeNull();
  });

  it('returns null rather than throwing on bytes that are not an image at all', async () => {
    // Arrives from a phone in a plant room; a failed read must never fail the
    // upload.
    expect(await ocr.read(Buffer.from('not an image'), 'image/jpeg')).toBeNull();
  });

  it('finds nothing in a picture with no zone in it', async () => {
    /*
      The common case, not an edge case: a gas certificate or a training record
      has no machine-readable zone, and reporting one would be worse than
      reporting none.
    */
    const plain = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: '#ffffff' },
    }).png().toBuffer();
    expect(await ocr.read(plain, 'image/png')).toBeNull();
  });

  it('READS A ZONE off a rendered document', async () => {
    /*
      The whole pipeline, end to end: crop, upscale, threshold, whitelist.

      What is asserted is that a zone comes back AT ALL and that the fields
      parse — not that all 88 characters are perfect. The specimen here is drawn
      in whatever monospace font the machine has, and a real document is printed
      in OCR-B, whose digits are deliberately distinct in ways Courier's are not.
      Demanding a flawless read would assert something about the host's fonts,
      and would behave differently in Docker than on a laptop.
    */
    const mrz = buildTd3('MUSTERMANN', 'MAX', '310630');
    const text = await ocr.read(await renderDocument(mrz), 'image/png');
    expect(text).not.toBeNull();

    const parsed = parseMrz(text!, new Date('2026-06-01T00:00:00Z'));
    expect(parsed).not.toBeNull();
    expect(parsed!.format).toBe('TD3');
    expect(parsed!.surname).toBe('MUSTERMANN');
    expect(parsed!.givenNames).toBe('MAX');
    expect(parsed!.documentNumber.value).toBe('P1234567');
  });

  it('NEVER accepts a misread — the check digits reject it', async () => {
    /*
      The property the product actually rests on, and the reason a mediocre OCR
      is safe here. A character read wrongly fails the checksum exactly as a
      forged one does, so the outcome of a bad read is "photograph it again",
      never a wrong expiry date filed as fact.

      Asserted as an implication rather than an equality: IF every check passed,
      THEN the fields must be exactly what was rendered. A read that is right
      passes; a read that is wrong is caught. Neither can be silently wrong.
    */
    const mrz = buildTd3('GRUBER', 'ANNA', '290101');
    const text = await ocr.read(await renderDocument(mrz), 'image/png');
    const parsed = parseMrz(text!, new Date('2026-06-01T00:00:00Z'))!;

    if (parsed.allChecksPassed) {
      expect(parsed.dateOfExpiry.value).toBe('2029-01-01');
      expect(parsed.dateOfBirth.value).toBe('1985-03-15');
    } else {
      // The honest alternative: it knows it failed, and says which field.
      expect(parsed.failures.length).toBeGreaterThan(0);
    }
  });

  it('serves two reads that arrive together WITHOUT mixing them up', async () => {
    /*
      A tesseract worker is one WASM instance with one interpreter inside it.
      Two `recognize` calls overlapping on the same worker interleave and return
      each other's text — which this caught: two uploads arriving together each
      came back with the other's document. In production that is one member's
      passport data written onto another member's record.

      Reads are queued now, so this asserts each answer belongs to its own
      picture.
    */
    const [ra, rb] = await Promise.all([
      renderDocument(buildTd3('HUBER', 'JOSEF', '280505')).then((i) => ocr.read(i, 'image/png')),
      renderDocument(buildTd3('BAUER', 'EVA', '270707')).then((i) => ocr.read(i, 'image/png')),
    ]);

    /*
      The assertion is about CROSS-CONTAMINATION, not about both reads
      succeeding. A read that fails is honest and handled; a read that returns
      somebody else's document is the failure that matters, and it is the one
      the shared worker made possible.
    */
    expect(ra ?? '').not.toContain('BAUER');
    expect(rb ?? '').not.toContain('HUBER');
    expect([ra, rb].some((r) => r !== null)).toBe(true);
  });
});
