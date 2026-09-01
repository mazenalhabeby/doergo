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
    customer: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null) },
    // The cascade asks the org for its default modules when a space sets none.
    organization: { findUnique: jest.fn().mockResolvedValue({ enabledModules: [] }) },
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
      /*
        The member candidate came from the draft, not from a query.

        There IS one user lookup now, but for a different purpose: the
        self-signing guard needs the subject's address to keep them off later
        steps. It happens once per draft, not once per step — the thing this
        assertion has always been protecting against.
      */
      expect(prisma.user.findUnique.mock.calls.length).toBeLessThanOrEqual(1);
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

    it('resolves a customer step from a CRM space', async () => {
      /*
        Where the counterparty comes from is decided by the space. An internal
        space with the CRM module on offers its client records; a client-kind
        space would offer its own contact instead, and a space with neither
        offers nothing and the issuer types the address.
      */
      prisma.document.findMany.mockResolvedValue([
        {
          ...draft,
          type: { ...draft.type, signerRoute: [{ role: 'MEMBER' }, { role: 'CUSTOMER' }] },
        },
      ]);
      prisma.spaceAssignment.findMany.mockResolvedValue([
        { space: { id: 's1', name: 'HBC Office', kind: 'COMPANY', contactName: null, contactEmail: null, enabledModules: ['crm'] } },
      ]);
      prisma.organization.findUnique.mockResolvedValue({ enabledModules: [] });
      prisma.customer.findMany.mockResolvedValue([
        { id: 'binderholz', name: 'Binderholz', email: 'office@binderholz.com' },
      ]);
      prisma.customer.findUnique.mockResolvedValue({ email: 'office@binderholz.com', name: 'Binderholz' });

      await publish();

      const rows = prisma.documentSigner.create.mock.calls.map((c: any[]) => c[0].data);
      expect(rows[1]).toEqual(
        expect.objectContaining({
          role: 'CUSTOMER',
          customerId: 'binderholz',
          // Frozen at issue: the link resolves by address, and a client
          // changing theirs must not redirect a document already in flight.
          email: 'office@binderholz.com',
          status: 'PENDING',
        }),
      );
    });

    it('resolves a customer step from a client-kind SPACE, with no CRM at all', async () => {
      // The space already carries the contact. Asking CRM for a second copy is
      // how two records of one client start to disagree.
      prisma.document.findMany.mockResolvedValue([
        { ...draft, type: { ...draft.type, signerRoute: [{ role: 'MEMBER' }, { role: 'CUSTOMER' }] } },
      ]);
      prisma.spaceAssignment.findMany.mockResolvedValue([
        { space: { id: 's2', name: 'AGRU America', kind: 'CUSTOMER', contactName: 'P. Lang', contactEmail: 'PLang@AgruAmerica.com', enabledModules: [] } },
      ]);
      prisma.organization.findUnique.mockResolvedValue({ enabledModules: [] });
      prisma.customer.findMany.mockResolvedValue([]);

      await publish();

      const rows = prisma.documentSigner.create.mock.calls.map((c: any[]) => c[0].data);
      expect(rows[1]).toEqual(
        expect.objectContaining({
          role: 'CUSTOMER',
          customerId: null,
          email: 'plang@agruamerica.com',
          contactName: 'P. Lang',
        }),
      );
    });

    it('accepts an address typed in for a counterparty nobody has on file', async () => {
      // Always available, whatever the cascade offered. A closed list is
      // exactly useless the one time it matters.
      prisma.document.findMany.mockResolvedValue([
        { ...draft, type: { ...draft.type, signerRoute: [{ role: 'MEMBER' }, { role: 'CUSTOMER' }] } },
      ]);
      prisma.spaceAssignment.findMany.mockResolvedValue([]);
      prisma.organization.findUnique.mockResolvedValue({ enabledModules: [] });

      await publish([{ order: 2, email: 'Site.Manager@Example.com', name: 'Maria Binder' }]);

      const rows = prisma.documentSigner.create.mock.calls.map((c: any[]) => c[0].data);
      expect(rows[1]).toEqual(
        expect.objectContaining({
          role: 'CUSTOMER',
          customerId: null,
          userId: null,
          email: 'site.manager@example.com',
          contactName: 'Maria Binder',
        }),
      );
    });

    it('refuses a typed address belonging to the member themselves', async () => {
      /*
        The real case in this database: a CRM client record carrying the same
        address as the member. Nothing else checks a typed-in address — that is
        what makes it useful — so this is the only thing between an issuer and a
        chain that reads as three signatures while being worth one.
      */
      prisma.document.findMany.mockResolvedValue([
        { ...draft, type: { ...draft.type, signerRoute: [{ role: 'MEMBER' }, { role: 'CUSTOMER' }] } },
      ]);
      prisma.spaceAssignment.findMany.mockResolvedValue([]);
      prisma.organization.findUnique.mockResolvedValue({ enabledModules: [] });
      prisma.user.findUnique.mockResolvedValue({ id: 'worker', email: 'worker@example.com' });

      await expect(
        publish([{ order: 2, email: 'WORKER@example.com', name: 'Ahmed' }]),
      ).rejects.toThrow(/same person the document is about/i);
    });

    it('refuses a typed address that is not one', async () => {
      prisma.document.findMany.mockResolvedValue([
        { ...draft, type: { ...draft.type, signerRoute: [{ role: 'MEMBER' }, { role: 'CUSTOMER' }] } },
      ]);
      prisma.spaceAssignment.findMany.mockResolvedValue([]);
      prisma.organization.findUnique.mockResolvedValue({ enabledModules: [] });

      await expect(publish([{ order: 2, email: 'not-an-address' }])).rejects.toThrow(/usable email/i);
    });
  });
});
