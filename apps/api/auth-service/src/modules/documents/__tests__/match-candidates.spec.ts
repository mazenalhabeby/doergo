import { Test, TestingModule } from '@nestjs/testing';
import { DocumentsService } from '../documents.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { MrzOcrService } from '../mrz-ocr.service';

/**
 * Who can be issued a document.
 *
 * The member picker on the issue screen listed thirteen people for an
 * organization with ten staff: the other three were PORTAL CUSTOMERS, who carry a
 * customerId and belong to Clients Portals. Offering them beside real members
 * invites issuing somebody's payslip to a customer of the business.
 *
 * `listOrgMembers` has carried the staff-only filter all along, with a comment
 * saying why. This query was written without it — the same rule, expressed once
 * and then not reused.
 */
describe('listMatchCandidates', () => {
  let service: DocumentsService;

  const prisma: Record<string, any> = { user: { findMany: jest.fn().mockResolvedValue([]) } };
  const actor = {
    userId: 'u1',
    organizationId: 'org-1',
    canIssueDocuments: true,
    canViewMemberDocuments: true,
    canOpenMemberDocuments: true,
    canManageDocumentTemplates: true,
  } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: 'NOTIFICATION_SERVICE', useValue: { emit: jest.fn() } },
        // Stubbed: this query touches neither storage nor the reader, and the
        // real ones would load sharp and a language model to answer a findMany.
        { provide: MrzOcrService, useValue: { read: jest.fn() } },
        { provide: 'OBJECT_STORE', useValue: null },
      ],
    })
      .compile();
    service = module.get(DocumentsService);
  });

  it('excludes portal customers', async () => {
    await service.listMatchCandidates({ actor });
    const where = prisma.user.findMany.mock.calls[0][0].where;

    // Both halves: the link to a customer record, and the account tier. Either
    // alone leaves a way for one to slip through.
    expect(where.customerId).toBeNull();
    expect(where.role).toEqual({ not: 'CUSTOMER' });
  });

  it('excludes deactivated people and scopes to the organization', async () => {
    await service.listMatchCandidates({ actor });
    const where = prisma.user.findMany.mock.calls[0][0].where;
    expect(where.isActive).toBe(true);
    expect(where.organizationId).toBe('org-1');
  });

  it('refuses a caller who cannot issue documents', async () => {
    await expect(
      service.listMatchCandidates({ actor: { ...actor, canIssueDocuments: false } }),
    ).rejects.toThrow();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});
