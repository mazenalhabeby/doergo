import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { assemblePagesPdf, MAX_PAGES } from '../core/pages-pdf';

/*
  Sheets of paper photographed one at a time must arrive as ONE document.

  The supply path was built for a credential — a card in a frame, with a
  machine-readable zone and at most a reverse. A hotel invoice is six sheets and
  none of that applies. Rather than teach the document model about pages, the
  sheets become a single PDF, so `storageKey` stays one key and signing,
  retention, visibility and download are untouched.

  Real sharp, real pdf-lib. Mocking either would test the mock: the two things
  that actually matter here are that page ORDER survives and that a phone's
  12-megapixel photographs do not become a 25MB file.
*/

/** A sheet, at whatever size and orientation the test needs. */
async function sheet(width: number, height: number, shade = 200): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: shade, g: shade, b: shade } },
  })
    .jpeg()
    .toBuffer();
}

describe('sheets of paper, filed as one document', () => {
  it('turns three sheets into one PDF of three pages', async () => {
    const pdf = await assemblePagesPdf([await sheet(600, 800), await sheet(600, 800), await sheet(600, 800)]);

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const parsed = await PDFDocument.load(pdf);
    expect(parsed.getPageCount()).toBe(3);
  });

  it('keeps each sheet on its own page in the order given', async () => {
    // Different shapes, so the page sizes identify which sheet landed where.
    const pdf = await assemblePagesPdf([await sheet(400, 900), await sheet(900, 400)]);
    const parsed = await PDFDocument.load(pdf);

    const [first, second] = parsed.getPages();
    expect(first.getHeight()).toBeGreaterThan(first.getWidth());
    expect(second.getWidth()).toBeGreaterThan(second.getHeight());
  });

  it('gives a landscape sheet a landscape page instead of letterboxing it', async () => {
    const pdf = await assemblePagesPdf([await sheet(1600, 900)]);
    const page = (await PDFDocument.load(pdf)).getPage(0);
    expect(page.getWidth()).toBeGreaterThan(page.getHeight());
  });

  it('bounds the resolution, so a phone photo does not become a huge file', async () => {
    // Roughly what a 12MP camera hands over for a sheet of A4.
    const huge = await sheet(4000, 3000);
    const pdf = await assemblePagesPdf([huge]);

    const page = (await PDFDocument.load(pdf)).getPage(0);
    // 2200 on the long edge: ~190 dpi across A4, past anything read on screen.
    expect(Math.max(page.getWidth(), page.getHeight())).toBeLessThanOrEqual(2200);
    // Six of these must stay openable on the phone that sent them.
    expect(pdf.length).toBeLessThan(2 * 1024 * 1024);
  });

  it('never enlarges a small sheet', async () => {
    const pdf = await assemblePagesPdf([await sheet(300, 400)]);
    const page = (await PDFDocument.load(pdf)).getPage(0);
    expect(page.getWidth()).toBe(300);
    expect(page.getHeight()).toBe(400);
  });

  it('refuses a document with no pages at all', async () => {
    await expect(assemblePagesPdf([])).rejects.toThrow(/at least one page/i);
  });

  it('refuses a folder photographed as a document', async () => {
    const many = await Promise.all(Array.from({ length: MAX_PAGES + 1 }, () => sheet(200, 280)));
    await expect(assemblePagesPdf(many)).rejects.toThrow(/at most/i);
  });

  it('accepts exactly the maximum', async () => {
    const many = await Promise.all(Array.from({ length: MAX_PAGES }, () => sheet(200, 280)));
    const parsed = await PDFDocument.load(await assemblePagesPdf(many));
    expect(parsed.getPageCount()).toBe(MAX_PAGES);
  });
});

describe('a sheet that is already a PDF', () => {
  /** A PDF of `n` pages, as one would arrive by email. */
  async function pdfOf(n: number): Promise<Buffer> {
    const doc = await PDFDocument.create();
    for (let i = 0; i < n; i += 1) doc.addPage([420, 595]);
    return Buffer.from(await doc.save());
  }

  it('keeps every page of it, rather than rasterising the first', async () => {
    // The whole point: an invoice emailed as five pages stays five pages, with
    // its text intact, instead of becoming one picture of page one.
    const out = await assemblePagesPdf([await pdfOf(5)]);
    expect((await PDFDocument.load(out)).getPageCount()).toBe(5);
  });

  it('mixes with photographed sheets, in the order given', async () => {
    const out = await assemblePagesPdf([await sheet(400, 900), await pdfOf(3), await sheet(400, 900)]);
    const parsed = await PDFDocument.load(out);
    expect(parsed.getPageCount()).toBe(5);

    // First and last are the photographs, at their own size; the middle three
    // came from the PDF and kept its page size.
    const pages = parsed.getPages();
    expect(Math.round(pages[0].getWidth())).toBe(400);
    expect(Math.round(pages[2].getWidth())).toBe(420);
    expect(Math.round(pages[4].getWidth())).toBe(400);
  });

  it('files a single PDF unchanged in page count', async () => {
    const out = await assemblePagesPdf([await pdfOf(1)]);
    expect((await PDFDocument.load(out)).getPageCount()).toBe(1);
  });
});
