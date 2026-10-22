import { Test } from '@nestjs/testing';
import { DocumentsService } from '../documents.service';
import { DOCUMENT_SERVICES } from '../document-services';
import { PrismaService } from '@hbcfield/shared';
import { OBJECT_STORE } from '../core/object-store.provider';
import { MrzOcrService } from '../reading/mrz-ocr.service';
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
        ...DOCUMENT_SERVICES,
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

/*
  The layer above — where the value was actually lost: the gateway's whitelist
  deleted `signerRoute` from the body before this service ever ran. That is
  pinned where it lives, against the DTO's real validation:
  gateway/src/modules/documents/__tests__/type-dto-fields.spec.ts.
*/
