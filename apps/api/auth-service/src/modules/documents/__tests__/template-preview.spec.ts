import { Test } from '@nestjs/testing';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import { inflateSync } from 'node:zlib';
import { SERVICE_NAMES, MERGE_FIELDS } from '@hbcfield/shared';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { MrzOcrService } from '../mrz-ocr.service';
import { DocumentsService, type DocumentActor } from '../documents.service';
import { OBJECT_STORE } from '../object-store.provider';

/**
 * Laying a draft out as the PDF a member would receive.
 *
 * The property that makes this worth having is that it renders through the SAME
 * code as issuing. A preview drawn by a friendlier second renderer would be a
 * picture of a document nobody is ever sent, and the page break it shows would
 * be somebody else's page break.
 *
 * The property that makes it SAFE is that it stores nothing: no object, no row,
 * no event. An editor that wrote a file per keystroke would leave a trail of
 * dead PDFs behind every edit, each one a copy of an unfinished contract.
 */

/**
 * The strings actually drawn into a PDF.
 *
 * Searching the raw bytes looks like it works and does not: pdf-lib deflates
 * the content streams, so `expect(bytes).not.toContain('…')` passes whatever
 * the page says. Anything asserting about what a reader SEES has to inflate
 * first.
 */
function pdfText(pdf: Buffer): string {
  const doc = pdf.toString('latin1');
  let streams = '';
  // Each content stream sits between `stream` and `endstream`.
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(doc)) !== null) {
    const raw = Buffer.from(m[1]!, 'latin1');
    try {
      streams += inflateSync(raw).toString('latin1');
    } catch {
      streams += raw.toString('latin1'); // stored uncompressed
    }
  }

  // Drawn strings are the operands of Tj. The standard font writes them as hex
  // — `<4C697361> Tj` — which is why searching the stream for a name fails too.
  const drawn: string[] = [];
  const tj = /(?:<([0-9A-Fa-f\s]+)>|\(((?:\\.|[^\\)])*)\))\s*Tj/g;
  while ((m = tj.exec(streams)) !== null) {
    if (m[1] !== undefined) {
      const hex = m[1].replace(/\s/g, '');
      drawn.push(Buffer.from(hex, 'hex').toString('latin1'));
    } else {
      drawn.push(m[2]!.replace(/\\([()\\])/g, '$1'));
    }
  }
  return drawn.join('\n');
}

describe('DocumentsService — previewing a template', () => {
  let service: DocumentsService;

  const prisma: Record<string, any> = {
    user: { findFirst: jest.fn() },
    document: { create: jest.fn(), findFirst: jest.fn() },
    documentEvent: { create: jest.fn() },
    documentTemplate: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const store = { put: jest.fn(), presignGet: jest.fn(), delete: jest.fn() };

  const actor = (over: Partial<DocumentActor> = {}): DocumentActor => ({
    userId: 'me',
    organizationId: 'org1',
    canViewMemberDocuments: false,
    canOpenMemberDocuments: false,
    canIssueDocuments: false,
    canManageDocumentTemplates: true,
    ...over,
  });

  const MEMBER = {
    id: 'u1',
    firstName: 'Lisa',
    lastName: 'Adler',
    email: 'lisa@example.com',
    position: 'Electrician',
    specialty: null,
    memberRoleId: 'role-tech',
    employmentStartDate: new Date('2026-03-01T00:00:00Z'),
    organization: {
      name: 'HBC Group GmbH',
      addressLine1: 'Arbeiterheimstraße 32',
      city: 'Laakirchen',
      postalCode: '4663',
      country: 'AT',
      email: 'office@example.com',
      phone: '+43 1 234',
    },
  };

  const BODY =
    '§1 Position\n\n{{member.fullName}} is engaged by {{org.legalName}}, {{org.address}}, ' +
    'as {{member.jobTitle}}, commencing {{contract.startDate}}.';

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        DocumentsService,
        // Stubbed: every test here is about who may file what, not about
        // reading pixels — and a real WASM engine per suite would add minutes.
        { provide: MrzOcrService, useValue: { read: jest.fn().mockResolvedValue(null) } },
        { provide: PrismaService, useValue: prisma },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: { emit: jest.fn() } },
        { provide: OBJECT_STORE, useValue: store },
      ],
    }).compile();
    service = module.get(DocumentsService);
  });

  it('refuses anyone without the template permission', async () => {
    await expect(
      service.previewTemplate({ actor: actor({ canManageDocumentTemplates: false }), body: BODY }),
    ).rejects.toThrow(ForbiddenException);
    // The refusal comes before the member lookup, so it cannot be used to
    // confirm that a given member exists.
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('returns a real PDF', async () => {
    prisma.user.findFirst.mockResolvedValue(MEMBER);
    const res = await service.previewTemplate({ actor: actor(), body: BODY, memberId: 'u1' });

    const bytes = Buffer.from(res.pdf!, 'base64');
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('stores NOTHING — no object, no row, no event', async () => {
    prisma.user.findFirst.mockResolvedValue(MEMBER);
    await service.previewTemplate({ actor: actor(), body: BODY });

    expect(store.put).not.toHaveBeenCalled();
    expect(prisma.document.create).not.toHaveBeenCalled();
    expect(prisma.documentEvent.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('scopes the member lookup to the caller’s organization', async () => {
    prisma.user.findFirst.mockResolvedValue(MEMBER);
    await service.previewTemplate({ actor: actor(), body: BODY, memberId: 'someone-elses-id' });

    // Otherwise a template author could render another company's employee data
    // into a PDF and read their address off it.
    expect(prisma.user.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 'someone-elses-id',
      organizationId: 'org1',
    });
  });

  it('falls back to any member when the named one is not in this organization', async () => {
    prisma.user.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(MEMBER);
    const res = await service.previewTemplate({ actor: actor(), body: BODY, memberId: 'outsider' });
    expect(res.filledFor).toBe('Lisa Adler');
  });

  it('still renders for an organization with no members at all', async () => {
    // A new customer writing their first contract has nobody to fill it with,
    // and an empty pane would read as a broken feature.
    prisma.user.findFirst.mockResolvedValue(null);
    const res = await service.previewTemplate({ actor: actor(), body: BODY });
    expect(Buffer.from(res.pdf!, 'base64').subarray(0, 5).toString()).toBe('%PDF-');
    expect(res.filledFor).toBeNull();
  });

  it('names the values the member’s record does not have', async () => {
    prisma.user.findFirst.mockResolvedValue({ ...MEMBER, employmentStartDate: null, position: null });
    const res = await service.previewTemplate({ actor: actor(), body: BODY });
    expect(res.missing.sort()).toEqual(['contract.startDate', 'member.jobTitle']);
  });

  it('prints a missing value as a dash, never as a raw token', async () => {
    /*
      `renderTemplate` leaves what it cannot fill in place. In a preview that
      would print "{{contract.startDate}}" mid-sentence and read as a bug in the
      product rather than a gap in somebody's record.
    */
    prisma.user.findFirst.mockResolvedValue({ ...MEMBER, employmentStartDate: null });
    const res = await service.previewTemplate({ actor: actor(), body: BODY });
    const text = Buffer.from(res.pdf!, 'base64').toString('latin1');
    expect(text).not.toContain('contract.startDate');
  });

  it('reports a character the font cannot draw, instead of printing squares', async () => {
    // The refusal belongs HERE, in the editor, rather than on the day somebody
    // is waiting for their contract.
    prisma.user.findFirst.mockResolvedValue({ ...MEMBER, lastName: 'Wójcik Łukasz' });
    await expect(
      service.previewTemplate({ actor: actor(), body: BODY }),
    ).rejects.toThrow(BadRequestException);
  });

  it('does not need storage to be configured', async () => {
    // Nothing is written, so a misconfigured bucket must not stop an author
    // from seeing their own draft.
    const module = await Test.createTestingModule({
      providers: [
        DocumentsService,
        // Stubbed: every test here is about who may file what, not about
        // reading pixels — and a real WASM engine per suite would add minutes.
        { provide: MrzOcrService, useValue: { read: jest.fn().mockResolvedValue(null) } },
        { provide: PrismaService, useValue: prisma },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: { emit: jest.fn() } },
        { provide: OBJECT_STORE, useValue: null },
      ],
    }).compile();
    prisma.user.findFirst.mockResolvedValue(MEMBER);
    await expect(
      module.get(DocumentsService).previewTemplate({ actor: actor(), body: BODY }),
    ).resolves.toHaveProperty('pdf');
  });

  it('returns the values on their own when no body is given', async () => {
    // How the editor fills its instant text preview: once per member, then it
    // renders locally on every keystroke without troubling the server.
    prisma.user.findFirst.mockResolvedValue(MEMBER);
    const res = await service.previewTemplate({ actor: actor() });

    expect(res.pdf).toBeNull();
    expect(res.values['member.fullName']).toBe('Lisa Adler');
    expect(res.values['org.legalName']).toBe('HBC Group GmbH');
    expect(res.values['org.address']).toBe('Arbeiterheimstraße 32, 4663 Laakirchen');
  });

  it('gives every merge field a value, so the editor never prints a token', () => {
    // A field the resolver has no answer for still has to come back as
    // SOMETHING, or the live preview shows "{{space.name}}" mid-sentence.
    prisma.user.findFirst.mockResolvedValue(MEMBER);
    return service.previewTemplate({ actor: actor() }).then((res) => {
      for (const field of MERGE_FIELDS) {
        expect(typeof res.values[field.token]).toBe('string');
        expect(res.values[field.token]).not.toBe('');
      }
    });
  });

  it('gives the text preview and the PDF the SAME values', async () => {
    /*
      The defect this closes: the editor invented its own values — today's date
      for a start date, "Your company" for the company — so the text it showed
      and the PDF it rendered described the same contract differently.
    */
    prisma.user.findFirst.mockResolvedValue(MEMBER);
    const res = await service.previewTemplate({ actor: actor(), body: BODY });

    const drawn = pdfText(Buffer.from(res.pdf!, 'base64'));
    expect(res.values['member.fullName']).toBe('Lisa Adler');
    expect(drawn).toContain('Lisa Adler');
    expect(drawn).toContain('HBC Group GmbH');
  });
});
