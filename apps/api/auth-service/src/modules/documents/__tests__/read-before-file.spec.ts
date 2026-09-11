import { Test } from '@nestjs/testing';
import sharp from 'sharp';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { SERVICE_NAMES, mrzCheckDigit } from '@hbcfield/shared';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { MrzOcrService } from '../mrz-ocr.service';
import { DocumentsService, type DocumentActor } from '../documents.service';
import { OBJECT_STORE } from '../object-store.provider';

/**
 * Reading the document BEFORE it is filed.
 *
 * The flow was backwards: the member typed an expiry date, sent the document,
 * and the server then read the real one and used it instead — busywork followed
 * by a silent override. Reading first turns it into what every identity flow
 * does: the machine reads, the person confirms.
 *
 * The distinction in the answer is what these assert. An expiry from a
 * machine-readable zone is a FACT with a check digit behind it; one scraped
 * from printed text is a SUGGESTION, because a European driving licence has no
 * zone at all. Presenting the second as the first would put a guess in front of
 * somebody with the app's authority behind it.
 */
describe('DocumentsService — reading before filing', () => {
  let service: DocumentsService;
  const ocr = { read: jest.fn() };

  const prisma: Record<string, any> = {
    user: { findFirst: jest.fn() },
    document: { findFirst: jest.fn() },
  };
  const store = { head: jest.fn(), get: jest.fn(), delete: jest.fn(), put: jest.fn() };

  const actor = (): DocumentActor => ({
    userId: 'member1',
    organizationId: 'org1',
    canViewMemberDocuments: false,
    canOpenMemberDocuments: false,
    canIssueDocuments: false,
    canManageDocumentTemplates: false,
  });

  const OWN_KEY = 'org1/documents/_staging/u/member1/abc.jpg';

  const passport = (expiry: string) => {
    const l1 = 'P<AUTADLER<<LISA'.padEnd(44, '<');
    const num = 'P1234567<';
    const dob = '850315';
    let l2 = `${num}${mrzCheckDigit(num)}AUT${dob}${mrzCheckDigit(dob)}F${expiry}${mrzCheckDigit(expiry)}${''.padEnd(14, '<')}0`;
    l2 = l2.slice(0, 43) + mrzCheckDigit(l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 43));
    return `${l1}\n${l2}`;
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: MrzOcrService, useValue: ocr },
        { provide: PrismaService, useValue: prisma },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: { emit: jest.fn() } },
        { provide: OBJECT_STORE, useValue: store },
      ],
    }).compile();
    service = module.get(DocumentsService);

    prisma.user.findFirst.mockResolvedValue({
      id: 'member1', firstName: 'Lisa', lastName: 'Adler', email: 'lisa@example.com',
    });
    store.head.mockResolvedValue({ exists: true, sizeBytes: 100, contentType: 'image/jpeg' });
    store.get.mockResolvedValue(Buffer.from('image bytes'));
  });

  it('refuses a staging key belonging to somebody else', async () => {
    // Same boundary as filing: reading somebody else's staged upload would leak
    // the contents of their passport without ever touching a document row.
    await expect(
      service.readOwnUpload({ actor: actor(), stagingKey: 'org1/documents/_staging/u/member2/abc.jpg' }),
    ).rejects.toThrow(ForbiddenException);
    expect(store.get).not.toHaveBeenCalled();
  });

  it('refuses when the upload never arrived', async () => {
    store.head.mockResolvedValue({ exists: false });
    await expect(
      service.readOwnUpload({ actor: actor(), stagingKey: OWN_KEY }),
    ).rejects.toThrow(BadRequestException);
  });

  it('LEAVES the staged object alone — nothing is filed and nothing consumed', async () => {
    /*
      The member may still change their mind, retake the photo, or close the
      sheet. Consuming the object here would make a read destructive and leave
      the submit that follows with nothing to file.
    */
    ocr.read.mockResolvedValue(passport('310630'));
    await service.readOwnUpload({ actor: actor(), stagingKey: OWN_KEY });
    expect(store.delete).not.toHaveBeenCalled();
    expect(store.put).not.toHaveBeenCalled();
  });

  it('reads the expiry off a zone, as a FACT', async () => {
    ocr.read.mockResolvedValue(passport('310630'));
    const r = await service.readOwnUpload({ actor: actor(), stagingKey: OWN_KEY });

    expect(r.source).toBe('MRZ');
    expect(r.expiresOn).toBe('2031-06-30');
    expect(r.fields?.holderName).toBe('ADLER LISA');
    expect(r.fields?.documentNumber).toBe('P1234567');
  });

  it('never offers the ZONE\'s expiry when the check digits disagree', async () => {
    /*
      A failed check digit means the read is wrong or the document is. Filling
      the field from either would put a wrong date in front of somebody with the
      app's authority behind it — and they would confirm it, because the app
      said so.
    */
    const bad = passport('310630').replace('3106305', '3506305');
    ocr.read.mockResolvedValue(bad); // the same page on the second pass: no dates printed
    const r = await service.readOwnUpload({ actor: actor(), stagingKey: OWN_KEY });

    expect(r.expiresOn).toBeNull();
    expect(r.verdict).toBe('SUSPECT');
    // The zone's own date is gone; the source now describes where the DATE came
    // from, and it came from nowhere.
    expect(r.source).toBe('NOTHING');
  });

  it('looks at the rest of the page when the zone fails its own arithmetic', async () => {
    /*
      ⚠️ A failed check digit used to end the matter, and the member was left
      typing — on the very document the app had just proved it could see.

      The band is the lower third of the picture: on a passport that is the
      zone, and the expiry is very often printed higher up the page, in a part
      the band never covered. So the whole frame is read before giving up, and
      what comes back is labelled the guess it is. Costs a second pass, only on
      the path where the first one already failed.
    */
    const bad = passport('310630').replace('3106305', '3506305');
    ocr.read
      .mockResolvedValueOnce(bad)
      .mockResolvedValueOnce('REPUBLIK ÖSTERREICH  gültig bis 30.06.2031');

    const r = await service.readOwnUpload({ actor: actor(), stagingKey: OWN_KEY });

    expect(r.source).toBe('TEXT');
    expect(r.expiresOn).toBe('2031-06-30');
    // The scan verdict is untouched: the date is a guess AND the zone is still
    // suspect. Two separate facts, and the reviewer needs both.
    expect(r.verdict).toBe('SUSPECT');
    expect(r.fields?.documentNumber).toBe('P1234567');
    expect(ocr.read).toHaveBeenLastCalledWith(expect.anything(), 'image/jpeg', { wholeFrame: true });
  });

  it('falls back to the printed text for a document with no zone', async () => {
    /*
      A European driving licence: three printed dates, no machine-readable zone
      anywhere on it.

      ⚠️ THIS TEST PASSED FOR MONTHS WHILE THE FEATURE DID NOT WORK. `ocr` is a
      mock here, so it handed the service text the real `MrzOcrService` could
      never have produced: `attempt()` discarded any recognised text without two
      MRZ-shaped lines, so a licence arrived as null and this branch was
      unreachable in production. Pinned for real in `ocr-keeps-text.spec.ts` —
      a mock at the seam of the broken thing proves nothing about it.
    */
    ocr.read.mockResolvedValue('3. 15.08.1985  4a. 01.03.2020  4b. 01.03.2035  5. 12345678');
    const r = await service.readOwnUpload({ actor: actor(), stagingKey: OWN_KEY });

    expect(r.source).toBe('TEXT');
    expect(r.expiresOn).toBe('2035-03-01');
    // No fields: nothing here is proved, so nothing is presented as known.
    expect(r.fields).toBeNull();
  });

  it('says plainly when it read nothing at all', async () => {
    // The common case for a gas certificate photographed at an angle. Silence
    // dressed up as success would leave somebody staring at an empty field
    // wondering whether to wait.
    ocr.read.mockResolvedValue(null);
    const r = await service.readOwnUpload({ actor: actor(), stagingKey: OWN_KEY });
    expect(r).toEqual({ source: 'NOTHING', expiresOn: null, fields: null, verdict: null });
  });

  it('says NOTHING when the text has no future date in it', async () => {
    // Every date in the past is either an expired document — which the member
    // should state deliberately — or a misread.
    ocr.read.mockResolvedValue('issued 01.03.2010  expires 01.03.2015');
    const r = await service.readOwnUpload({ actor: actor(), stagingKey: OWN_KEY });
    expect(r.source).toBe('NOTHING');
    expect(r.expiresOn).toBeNull();
  });
});
