import { PDFDocument, StandardFonts } from 'pdf-lib';
import { pdfToLines } from '../pdf-lines';
import { parseReceipt } from '@hbcfield/shared';

/**
 * A PDF invoice, read end to end.
 *
 * ⚠️ THE ONE FILE TYPE THE CAMERA PATH CAN NEVER OPEN. On-device OCR reads
 * pixels and a PDF has none until something renders it — yet a PDF is what a
 * supplier EMAILS, which makes it the likeliest shape for the invoices worth
 * the most money. A driver could attach one and the amount stayed blank.
 *
 * These build real PDFs rather than mocking the engine: the thing being tested
 * is whether a page laid out as a TABLE comes back as readable lines, and a
 * mock of `getTextContent` would just be me asserting my own assumption about
 * what pdf.js returns.
 */
describe('a PDF receipt', () => {
  jest.setTimeout(60_000);

  /** Lay text at absolute positions, the way a generated invoice does. */
  async function makePdf(rows: { x: number; y: number; text: string }[]): Promise<Buffer> {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 842]); // A4, points
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (const r of rows) {
      page.drawText(r.text, { x: r.x, y: r.y, size: 10, font });
    }
    return Buffer.from(await doc.save());
  }

  it('reads a two-column summary as ONE line per row', async () => {
    /*
      The whole reason this exists. A label at x=60 and its figure at x=460 sit
      on the same printed line, and pdf.js returns them as separate runs. Handed
      over as separate lines, the reader sees "Gesamtbetrag" with no number
      beside it — which is exactly how a total became "the first amount".
    */
    const pdf = await makePdf([
      { x: 60, y: 780, text: 'Autohaus Gruber GmbH' },
      { x: 60, y: 760, text: 'Rechnung 12.09.2026' },
      { x: 60, y: 700, text: 'Ersatzteile' },
      { x: 460, y: 700, text: '412,00' },
      { x: 60, y: 685, text: 'Arbeitszeit' },
      { x: 460, y: 685, text: '285,00' },
      { x: 60, y: 660, text: 'Nettobetrag' },
      { x: 460, y: 660, text: '697,00' },
      { x: 60, y: 645, text: 'MwSt 20%' },
      { x: 460, y: 645, text: '139,40' },
      { x: 60, y: 625, text: 'Gesamtbetrag' },
      { x: 460, y: 625, text: '836,40' },
    ]);

    const lines = await pdfToLines(pdf);
    expect(lines).toContain('Gesamtbetrag 836,40');
    expect(lines).toContain('Nettobetrag 697,00');

    const receipt = parseReceipt(lines, new Date('2026-09-13'));
    expect(receipt.totalCents?.value).toBe(83_640);
    expect(receipt.totalCents?.confidence).toBe('certain');
    expect(receipt.date?.value).toBe('2026-09-12');
  });

  it('reads the page top-down, not bottom-up', async () => {
    /*
      ⚠️ PDF space puts the origin at the BOTTOM-left, so the largest y is the
      TOP of the page. Sorting ascending reads an invoice upside down — and the
      vendor rule takes the FIRST line, so the vendor would become whatever is
      printed at the foot: a bank detail or a payment term.
    */
    const pdf = await makePdf([
      { x: 60, y: 780, text: 'Werkstatt Huber GmbH' },
      { x: 60, y: 700, text: 'Reparatur 09.09.2026' },
      { x: 60, y: 620, text: 'Gesamtbetrag 240,00' },
      { x: 60, y: 80, text: 'Bankverbindung AT12 3456' },
    ]);

    const lines = await pdfToLines(pdf);
    expect(lines[0]).toBe('Werkstatt Huber GmbH');
    expect(lines[lines.length - 1]).toContain('Bankverbindung');

    const receipt = parseReceipt(lines, new Date('2026-09-13'));
    expect(receipt.vendor?.value).toBe('Werkstatt Huber GmbH');
    expect(receipt.totalCents?.value).toBe(24_000);
  });

  it('says nothing rather than guessing when there is no text layer', async () => {
    // A photocopy wrapped in a PDF container. Inventing a total from a page
    // nothing could read is the one outcome worse than an empty field.
    const doc = await PDFDocument.create();
    doc.addPage([595, 842]);
    const blank = Buffer.from(await doc.save());
    expect(await pdfToLines(blank)).toEqual([]);
  });

  it('survives a file that is not a PDF at all', async () => {
    // The upload is somebody else's; a reader that throws here turns a bad file
    // into a failed expense instead of one typed by hand.
    await expect(pdfToLines(Buffer.from('this is not a pdf'))).resolves.toEqual([]);
  });
});
