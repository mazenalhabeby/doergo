import { readFileSync } from 'fs';
import { join } from 'path';
import { Test } from '@nestjs/testing';
import { DocumentsService } from '../documents.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { OBJECT_STORE } from '../object-store.provider';
import { MrzOcrService } from '../mrz-ocr.service';
import { SERVICE_NAMES } from '@hbcfield/shared';

/**
 * Creating a document type WITH its signing route.
 *
 * The bug this pins: "Who signs it" was collected on the create form and thrown
 * away at three separate layers — the browser did not send it, the DTO did not
 * declare it (and `whitelist` strips what is not declared), and `createType` had
 * no such field. Every other setting saved, so nothing looked wrong; the route
 * simply was not there, and the only way to get one onto a new type was to
 * create it, reopen it, and save a second time.
 *
 * Three layers broke it, so three layers are checked.
 */
describe('a document type is created with the route it was given', () => {
  let service: DocumentsService;
  let prisma: any;

  const ACTOR = {
    userId: 'admin',
    organizationId: 'org1',
    role: 'ADMIN',
    canManageDocumentTemplates: true,
  };

  const create = (extra: Record<string, unknown> = {}) =>
    service.createType({
      actor: ACTOR as never,
      key: 'contract',
      label: 'Contract',
      ...extra,
    } as never);

  const written = () => prisma.documentType.create.mock.calls[0][0].data;

  beforeEach(async () => {
    prisma = {
      documentType: { create: jest.fn().mockImplementation(({ data }: any) => ({ id: 't1', ...data })) },
    };
    const mod = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: OBJECT_STORE, useValue: null },
        { provide: MrzOcrService, useValue: {} },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: { emit: jest.fn() } },
      ],
    }).compile();
    service = mod.get(DocumentsService);
  });

  it('saves the route, rather than discarding it', async () => {
    await create({ signerRoute: [{ role: 'MEMBER' }, { role: 'RESPONSIBLE' }] });
    expect(written().signerRoute).toEqual([{ role: 'MEMBER' }, { role: 'RESPONSIBLE' }]);
  });

  /*
    null is "one signature"; an empty array is a type somebody misconfigured.
    The reader tells them apart, so the writer must not fold one into the other.
  */
  it('stores null when no route was chosen, never an empty array', async () => {
    await create();
    expect(written().signerRoute).toBeNull();
    await expect(create({ signerRoute: [] })).rejects.toThrow();
  });

  /*
    The same rule as an edit. Two definitions of a legal route is one place for
    them to disagree — and it would disagree in the worst direction: a type
    created with a chain the editor then refuses to save.
  */
  it('refuses a route the edit screen would also refuse', async () => {
    await expect(create({ signerRoute: [{ role: 'NOT_A_ROLE' }] })).rejects.toThrow();
    await expect(create({ signerRoute: 'MEMBER' })).rejects.toThrow();
  });

  it('leaves every other setting exactly as it was', async () => {
    await create({ signerRoute: [{ role: 'MEMBER' }], signatureMode: 'ACKNOWLEDGE', isCredential: true });
    expect(written()).toMatchObject({
      key: 'contract',
      label: 'Contract',
      signatureMode: 'ACKNOWLEDGE',
      isCredential: true,
    });
  });
});

/**
 * The layer above, which is where the value was actually lost.
 *
 * `ValidationPipe({ whitelist: true })` deletes any property the DTO does not
 * declare — so a perfectly correct request body had the route removed from it
 * before a service ever ran. A service-level test alone would have passed while
 * the product stayed broken, which is why this one reads the DTO.
 */
describe('the gateway lets a route through on create', () => {
  const dto = readFileSync(
    join(__dirname, '..', '..', '..', '..', '..', 'gateway', 'src', 'modules', 'documents', 'dto', 'documents.dto.ts'),
    'utf8',
  );

  const classBody = (name: string) => {
    const start = dto.indexOf(`export class ${name}`);
    expect(start).toBeGreaterThan(-1);
    const rest = dto.slice(start + 1);
    const next = rest.indexOf('\nexport class ');
    return rest.slice(0, next === -1 ? rest.length : next);
  };

  it('declares signerRoute on create, as it always did on update', () => {
    expect(classBody('CreateDocumentTypeDto')).toContain('signerRoute');
    expect(classBody('UpdateDocumentTypeDto')).toContain('signerRoute');
  });
});
