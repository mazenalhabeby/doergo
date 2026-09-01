import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { SERVICE_NAMES } from '@hbcfield/shared';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { MrzOcrService } from '../mrz-ocr.service';
import { DocumentsService, type DocumentActor } from '../documents.service';
import { OBJECT_STORE } from '../object-store.provider';

/**
 * Choosing who signs, when the route leaves it open.
 *
 * A route names roles; roles resolve to people. Usually to exactly one, and
 * then there is nothing to ask. Where several people could sign a step, the
 * issuer answers it once, at issue, and the answer is frozen onto the document.
 *
 * Two things are load-bearing here and are what these tests are about:
 *
 *   • A step with several candidates must REFUSE rather than guess. Picking a
 *     signer on somebody's behalf and being wrong sends the document to the
 *     wrong desk, where the person who needed it never learns it existed.
 *   • A choice is a convenience, not an authorisation. It is checked against
 *     the candidates the server resolved, so a hand-written request cannot
 *     nominate a signer the route would never have produced.
 */
describe('DocumentsService — choosing a signer', () => {
  let service: DocumentsService;

  const prisma: Record<string, any> = {
    document: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    documentSigner: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    documentEvent: { create: jest.fn() },
    user: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), findFirst: jest.fn() },
    customer: { findMany: jest.fn().mockResolvedValue([]) },
    spaceAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    companyLocation: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };

  const issuer: DocumentActor = {
    userId: 'admin',
    organizationId: 'org1',
    canViewMemberDocuments: true,
    canOpenMemberDocuments: true,
    canIssueDocuments: true,
    canManageDocumentTemplates: true,
  };

  const person = (id: string, first: string) => ({
    id,
    firstName: first,
    lastName: 'Muster',
    email: `${id}@example.com`,
  });

  /** worker signs, then whoever is responsible for them. */
  const route = [{ role: 'MEMBER' }, { role: 'RESPONSIBLE' }];

  const draft = {
    id: 'doc1',
    title: 'Time sheet — August',
    periodYear: 2026,
    periodMonth: 8,
    sizeBytes: 1000,
    mimeType: 'application/pdf',
    createdAt: new Date(),
    userId: 'worker',
    organizationId: 'org1',
    status: 'DRAFT',
    user: person('worker', 'Mike'),
    type: { id: 't1', label: 'Time sheet', signatureMode: 'IN_APP', signerRoute: route },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.documentSigner.findMany.mockResolvedValue([]);
    prisma.customer.findMany.mockResolvedValue([]);
    prisma.spaceAssignment.findMany.mockResolvedValue([]);
    prisma.companyLocation.findMany.mockResolvedValue([]);
    prisma.document.update.mockImplementation(async ({ data }: any) => ({ ...draft, ...data }));

    const mod = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: { emit: jest.fn(), send: jest.fn() } },
        { provide: MrzOcrService, useValue: { read: jest.fn() } },
        { provide: OBJECT_STORE, useValue: null },
      ],
    }).compile();
    service = mod.get(DocumentsService);
  });

  /** Two people can approve for this worker, so step 2 is a real question. */
  const twoResponsibles = () => {
    prisma.spaceAssignment.findMany.mockResolvedValue([
      { spaceId: 's1', organizationId: 'org1', approveRoleIds: [], approveUserIds: ['anna', 'karim'] },
    ]);
    prisma.user.findMany.mockResolvedValue([person('anna', 'Anna'), person('karim', 'Karim')]);
  };

  describe('listDrafts', () => {
    it('resolves the member step from the row already in hand, without asking again', async () => {
      prisma.document.findMany.mockResolvedValue([draft]);
      twoResponsibles();

      const [row] = (await service.listDrafts({ actor: issuer })) as any[];

      expect(row.routeSteps[0]).toEqual({
        order: 1,
        role: 'MEMBER',
        candidates: [{ kind: 'USER', id: 'worker', name: 'Mike Muster', email: 'worker@example.com' }],
      });
      // The member was never looked up: the draft carried them.
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('offers every candidate for a step that has more than one', async () => {
      prisma.document.findMany.mockResolvedValue([draft]);
      twoResponsibles();

      const [row] = (await service.listDrafts({ actor: issuer })) as any[];

      expect(row.routeSteps[1].role).toBe('RESPONSIBLE');
      expect(row.routeSteps[1].candidates.map((c: any) => c.id)).toEqual(['anna', 'karim']);
    });

    it('says nothing about signers for a type with no route', async () => {
      prisma.document.findMany.mockResolvedValue([
        { ...draft, type: { ...draft.type, signerRoute: null } },
      ]);

      const [row] = (await service.listDrafts({ actor: issuer })) as any[];
      expect(row.routeSteps).toBeNull();
    });

    it('asks the same question once for a whole payroll run', async () => {
      // Thirty time sheets for the SAME member: one RESPONSIBLE resolution, not
      // thirty. The cache holds the promise, so concurrent rows share the query.
      prisma.document.findMany.mockResolvedValue(
        Array.from({ length: 30 }, (_, i) => ({ ...draft, id: `doc${i}` })),
      );
      twoResponsibles();

      await service.listDrafts({ actor: issuer });

      expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('publishBatch', () => {
    const publish = (choices?: any) =>
      service.publishBatch({
        actor: issuer,
        documentIds: ['doc1'],
        ...(choices ? { signerChoices: [{ documentId: 'doc1', choices }] } : {}),
      } as any);

    it('refuses rather than guessing a signer, and names the step', async () => {
      prisma.document.findMany.mockResolvedValue([draft]);
      twoResponsibles();

      // The refusal has to say WHICH step is unanswered: "choose a signer" on a
      // three-step route sends the issuer looking through all of them.
      await expect(publish()).rejects.toThrow(/step 2/i);
      await expect(publish()).rejects.toBeInstanceOf(BadRequestException);

      // And it undoes the rows written before the refusal — the publish runs
      // inside one transaction, so a batch never half-releases.
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('freezes the chosen signer onto the document', async () => {
      prisma.document.findMany.mockResolvedValue([draft]);
      twoResponsibles();

      await publish([{ order: 2, userId: 'karim' }]);

      const rows = prisma.documentSigner.create.mock.calls.map((c: any[]) => c[0].data);
      expect(rows).toEqual([
        expect.objectContaining({ order: 1, role: 'MEMBER', userId: 'worker', status: 'PENDING' }),
        expect.objectContaining({ order: 2, role: 'RESPONSIBLE', userId: 'karim', status: 'PENDING' }),
      ]);
    });

    it('refuses a signer the route would never have produced', async () => {
      prisma.document.findMany.mockResolvedValue([draft]);
      twoResponsibles();

      // 'ceo' is a real person in the org, and still not a candidate for THIS
      // member's approval routing. The picker is not a way to nominate anyone.
      await expect(publish([{ order: 2, userId: 'ceo' }])).rejects.toBeInstanceOf(BadRequestException);
    });

    it('needs no answer when the role resolves to exactly one person', async () => {
      prisma.document.findMany.mockResolvedValue([draft]);
      prisma.spaceAssignment.findMany.mockResolvedValue([
        { spaceId: 's1', organizationId: 'org1', approveRoleIds: [], approveUserIds: ['anna'] },
      ]);
      prisma.user.findMany.mockResolvedValue([person('anna', 'Anna')]);

      await publish();

      const rows = prisma.documentSigner.create.mock.calls.map((c: any[]) => c[0].data);
      expect(rows[1]).toEqual(expect.objectContaining({ userId: 'anna', status: 'PENDING' }));
    });

    it('refuses a step nobody can fill, and says where to configure it', async () => {
      prisma.document.findMany.mockResolvedValue([draft]);
      // No approval routing configured for this member anywhere.

      /*
        This used to create the step as SKIPPED and publish anyway, which is how
        a time sheet reached the customer without the agency ever countersigning
        it — while the register showed a healthy chain. The organisation put the
        step in the route; dropping it silently is not ours to do.
      */
      await expect(publish()).rejects.toThrow(/signs off for this member/i);
      await expect(publish()).rejects.toBeInstanceOf(BadRequestException);
    });

    it('never creates a SKIPPED step — a step is signed or it is refused', async () => {
      prisma.document.findMany.mockResolvedValue([draft]);
      prisma.spaceAssignment.findMany.mockResolvedValue([
        { spaceId: 's1', organizationId: 'org1', approveRoleIds: [], approveUserIds: ['anna'] },
      ]);
      prisma.user.findMany.mockResolvedValue([person('anna', 'Anna')]);

      await publish();

      const rows = prisma.documentSigner.create.mock.calls.map((c: any[]) => c[0].data);
      expect(rows.every((r: any) => r.status === 'PENDING')).toBe(true);
    });

    it('resolves a customer step to the client of a space the member works in', async () => {
      /*
        This used to refuse. A CUSTOMER step was blocked at issue because there
        was no way for a client to sign one — they have no login here. There is
        now: the step is created PENDING and, when the chain reaches it, the
        client is emailed a link.
      */
      prisma.document.findMany.mockResolvedValue([
        {
          ...draft,
          type: { ...draft.type, signerRoute: [{ role: 'MEMBER' }, { role: 'CUSTOMER' }] },
        },
      ]);
      prisma.spaceAssignment.findMany.mockResolvedValue([{ spaceId: 's1', organizationId: 'org1' }]);
      prisma.customer.findMany.mockResolvedValue([
        { id: 'binderholz', name: 'Binderholz', email: 'office@binderholz.com' },
      ]);

      await publish();

      const rows = prisma.documentSigner.create.mock.calls.map((c: any[]) => c[0].data);
      expect(rows[1]).toEqual(
        expect.objectContaining({ role: 'CUSTOMER', customerId: 'binderholz', status: 'PENDING' }),
      );
    });
  });
});
