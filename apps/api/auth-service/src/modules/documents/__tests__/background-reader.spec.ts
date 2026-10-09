import { mrzCheckDigit } from '@hbcfield/shared';
import { OcrRulesReader, isHeic } from '../document-reader';
import { DocumentReadQueue, readingOf } from '../document-read-queue.service';

// pdf.js handed in directly: the service's `new Function` import resolves, under
// Jest, against whichever test file a worker ran first — torn down by now. A
// DIRECT eval keeps this test file's own import hook, so it loads into this
// file's environment every time.
jest.mock('../pdfjs-loader', () => ({
  // eslint-disable-next-line no-eval
  loadPdfjs: () => eval("import('pdfjs-dist/legacy/build/pdf.mjs')"),
}));


/**
 * Reading after filing, never while the member waits.
 *
 * Written after three visas sat unread: one was an iPhone HEIC photo the server
 * cannot decode, two timed out inside the upload's 12-second read.
 */
const member = { firstName: 'Mike', lastName: 'Johnson', dateOfBirth: null };

function visaText(): string {
  const num = 'C1234567<', dob = '850315', exp = '310912';
  const l2 = `${num}${mrzCheckDigit(num)}DEU${dob}${mrzCheckDigit(dob)}M${exp}${mrzCheckDigit(exp)}`.padEnd(44, '<');
  return `UNITED STATES OF AMERICA\n${'V<USAJOHNSON<<MIKE'.padEnd(44, '<')}\n${l2}`;
}

const heic = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(32)]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);

describe('OcrRulesReader', () => {
  const ocr = { read: jest.fn() };
  const reader = new OcrRulesReader(ocr as any);
  beforeEach(() => ocr.read.mockReset());

  it('recognises an iPhone HEIC photo even when it is labelled JPEG, and does not try to decode it', async () => {
    expect(isHeic(heic)).toBe(true);
    expect(isHeic(jpeg)).toBe(false);
    const r = await reader.read({ bytes: heic, mimeType: 'image/jpeg', member });
    expect(r.unreadable).toBe('HEIC');
    expect(ocr.read).not.toHaveBeenCalled();
  });

  it('a visa zone that passes its checks is PROVEN', async () => {
    ocr.read.mockResolvedValue(visaText());
    const r = await reader.read({ bytes: jpeg, mimeType: 'image/jpeg', member });
    expect(r).toMatchObject({ expiresOn: '2031-09-12', certainty: 'PROVEN', source: 'MRZ' });
  });

  it('gives the read all the time it needs — far past the upload limit', async () => {
    ocr.read.mockResolvedValue(null);
    await reader.read({ bytes: jpeg, mimeType: 'image/jpeg', member });
    expect(ocr.read.mock.calls[0][2].timeoutMs).toBeGreaterThanOrEqual(60_000);
  });

  it('a certificate: the date beside its label, SUGGESTED for a person to confirm', async () => {
    ocr.read.mockResolvedValue('Gas Safe\nValid until: 31.03.2027\nNext inspection 15.09.2027');
    const r = await reader.read({ bytes: jpeg, mimeType: 'image/jpeg', member });
    expect(r).toMatchObject({ expiresOn: '2027-03-31', certainty: 'SUGGESTED', source: 'LABEL' });
  });
});

describe('DocumentReadQueue', () => {
  const doc = (over: Record<string, unknown> = {}) => ({
    id: 'd1', organizationId: 'o1', userId: 'u1', status: 'PENDING_VERIFICATION', storageKey: 'k', mimeType: 'image/jpeg',
    expiresOn: null, scanVerdict: null, scanData: null, user: member, ...over,
  });
  const make = (reading: any) => {
    const prisma: any = {
      document: { findUnique: jest.fn(), findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const store: any = { get: jest.fn().mockResolvedValue(jpeg) };
    const reader = { name: 'x', read: jest.fn().mockResolvedValue(reading) };
    return { prisma, store, reader, queue: new DocumentReadQueue(prisma, store, [reader]) };
  };
  const proven = { expiresOn: '2031-09-12', certainty: 'PROVEN', source: 'MRZ', label: null, engine: 'x', scan: null, unreadable: null };
  const suggested = { ...proven, certainty: 'SUGGESTED', source: 'LABEL', label: 'Valid until' };

  it('a PROVEN date becomes the expiry, and only on a document still waiting', async () => {
    const { prisma, queue } = make(proven);
    prisma.document.findUnique.mockResolvedValue(doc());
    await queue.readOne('d1');
    const { where, data } = prisma.document.updateMany.mock.calls[0][0];
    expect(where).toEqual({ id: 'd1', status: 'PENDING_VERIFICATION' });
    expect(data.expiresOn).toEqual(new Date('2031-09-12T12:00:00Z'));
    expect(readingOf(data.scanData)).toMatchObject({ certainty: 'PROVEN', attempts: 1 });
  });

  it('a SUGGESTED date is kept as a reading for the reviewer, never filed as the expiry', async () => {
    const { prisma, queue } = make(suggested);
    prisma.document.findUnique.mockResolvedValue(doc());
    await queue.readOne('d1');
    const { data } = prisma.document.updateMany.mock.calls[0][0];
    expect(data).not.toHaveProperty('expiresOn');
    expect(readingOf(data.scanData)).toMatchObject({ expiresOn: '2031-09-12', source: 'LABEL', label: 'Valid until' });
  });

  it('never overwrites an expiry the document already has', async () => {
    const { prisma, queue } = make(proven);
    prisma.document.findUnique.mockResolvedValue(doc({ expiresOn: new Date('2030-01-01') }));
    await queue.readOne('d1');
    expect(prisma.document.updateMany.mock.calls[0][0].data).not.toHaveProperty('expiresOn');
  });

  it('leaves a document alone once it has been decided', async () => {
    const { prisma, queue, reader } = make(proven);
    prisma.document.findUnique.mockResolvedValue(doc({ status: 'ISSUED' }));
    await queue.readOne('d1');
    expect(reader.read).not.toHaveBeenCalled();
    expect(prisma.document.updateMany).not.toHaveBeenCalled();
  });

  it('the sweep skips what was read, and what failed twice', async () => {
    const { prisma, queue } = make(proven);
    const spy = jest.spyOn(queue, 'enqueue').mockImplementation(() => undefined);
    prisma.document.findMany = jest.fn().mockResolvedValue([
      { id: 'new', scanData: null },
      { id: 'read', scanData: { reading: { expiresOn: '2030-01-01', attempts: 1 } } },
      { id: 'tried', scanData: { reading: { expiresOn: null, attempts: 2 } } },
    ]);
    await queue.sweep();
    expect(spy.mock.calls.map((c) => c[0])).toEqual(['new']);
  });
});

describe('a later, proven read', () => {
  it('replaces the verdict an earlier, worse read left behind', async () => {
    const prisma: any = { document: { findUnique: jest.fn(), findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    const scan = { format: 'MRVA', verdict: 'CONSISTENT', checks: [], extracted: { holderName: 'X', documentNumber: '1', dateOfBirth: null, dateOfExpiry: '2033-10-30', issuingState: 'USA', nationality: null, sex: null }, raw: {} };
    const reader = { name: 'x', read: jest.fn().mockResolvedValue({ expiresOn: '2033-10-30', certainty: 'PROVEN', source: 'MRZ', label: null, engine: 'x', scan, unreadable: null }) };
    const queue = new DocumentReadQueue(prisma, { get: jest.fn().mockResolvedValue(Buffer.from('x')) } as any, [reader]);
    prisma.document.findUnique.mockResolvedValue({ id: 'd', organizationId: 'o', userId: 'u', status: 'PENDING_VERIFICATION', storageKey: 'k', mimeType: 'image/jpeg', expiresOn: null, scanVerdict: 'SUSPECT', scanData: null, user: { firstName: 'a', lastName: 'b' } });
    await queue.readOne('d');
    expect(prisma.document.updateMany.mock.calls[0][0].data.scanVerdict).toBe('CONSISTENT');
  });
});

describe('PdfTextReader — PDFs members upload', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PDFDocument, StandardFonts } = require('pdf-lib');
  const { PdfTextReader } = require('../document-reader');

  async function pdf(rows: { y: number; size: number; text: string }[]): Promise<Buffer> {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 842]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (const r of rows) page.drawText(r.text, { x: 50, y: r.y, size: r.size, font });
    return Buffer.from(await doc.save());
  }

  it('reads the expiry by its label, and the document\'s own name', async () => {
    const bytes = await pdf([
      { y: 780, size: 18, text: 'Gas Safe Services Ltd' },
      { y: 750, size: 13, text: 'GAS SAFETY CERTIFICATE' },
      { y: 700, size: 10, text: 'Issued: 01.04.2026' },
      { y: 680, size: 10, text: 'Valid until: 31.03.2027' },
      { y: 660, size: 10, text: 'Next service recommended 15.09.2027' },
    ]);
    const r = await new PdfTextReader().read({ bytes, mimeType: 'application/pdf', member });
    expect(r).toMatchObject({ expiresOn: '2027-03-31', certainty: 'SUGGESTED', source: 'LABEL', title: 'Gas Safety Certificate' });
  });

  it('declines an image, and says NO_TEXT for a PDF with no text layer', async () => {
    const reader = new PdfTextReader();
    expect((await reader.read({ bytes: Buffer.from('x'), mimeType: 'image/jpeg', member })).unreadable).toBe('NOT_AN_IMAGE');
    expect((await reader.read({ bytes: await pdf([]), mimeType: 'application/pdf', member })).unreadable).toBe('NO_TEXT');
  });
});

describe('the queue names a document it reads', () => {
  it('replaces a type label or a file name, never a title somebody chose', async () => {
    for (const [title, expected] of [['Other document', 'Gas Safety Certificate'], ['IMG_0042', 'Gas Safety Certificate'], ['My gas cert 2026', undefined]] as const) {
      const prisma: any = { document: { findUnique: jest.fn(), findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
      const reader = { name: 'x', read: jest.fn().mockResolvedValue({ expiresOn: null, certainty: null, source: null, label: null, engine: 'x', scan: null, unreadable: null, title: 'Gas Safety Certificate' }) };
      const queue = new DocumentReadQueue(prisma, { get: jest.fn().mockResolvedValue(Buffer.from('x')) } as any, [reader]);
      prisma.document.findUnique.mockResolvedValue({ id: 'd', organizationId: 'o', userId: 'u', status: 'PENDING_VERIFICATION', storageKey: 'k', mimeType: 'application/pdf', expiresOn: null, scanVerdict: null, scanData: null, title, type: { label: 'Other document' }, user: { firstName: 'a', lastName: 'b' } });
      await queue.readOne('d');
      expect(prisma.document.updateMany.mock.calls[0][0].data.title).toBe(expected);
    }
  });
});
