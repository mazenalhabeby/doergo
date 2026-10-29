import { DocumentRequirementsService } from '../issuing/document-requirements.service';
import { type DocumentActor } from '../core/document-common';

/*
  Reading somebody else's requirements follows the type-visibility rule.

  With `?userId=` the types and held documents were read unscoped, so a clerk
  allowed to see driving licences learned, from somebody's requirements, which
  restricted types (say, a disciplinary record) existed and whether the person
  held one. Their own requirements stay whole.
*/
describe('requirements of another member respect who may see a type', () => {
  const prisma: any = {
    user: { findFirst: jest.fn(async () => ({ id: 'mike', memberRoleId: 'role-tech', isExternal: false })) },
    documentType: { findMany: jest.fn(async () => []) },
    document: { findMany: jest.fn(async () => []) },
  };
  const service = new DocumentRequirementsService(prisma, {} as any);
  const clerk: DocumentActor = {
    userId: 'clerk',
    organizationId: 'org1',
    roleId: 'role-clerk',
    canViewMemberDocuments: true,
    canOpenMemberDocuments: false,
    canIssueDocuments: false,
    canManageDocumentTemplates: false,
  };

  beforeEach(() => jest.clearAllMocks());

  it('scopes the types and the held documents for another member', async () => {
    await service.listRequirements({ actor: clerk, targetUserId: 'mike' });
    const typeWhere = prisma.documentType.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(typeWhere)).toContain('visibleToRoleIds');
    expect(JSON.stringify(typeWhere)).toContain('role-clerk');
    const docWhere = prisma.document.findMany.mock.calls[0][0].where;
    expect(docWhere.userId).toBe('mike');
    expect(JSON.stringify(docWhere)).toContain('visibleToRoleIds');
  });

  it('leaves your own requirements whole', async () => {
    prisma.user.findFirst.mockResolvedValueOnce({ id: 'clerk', memberRoleId: 'role-clerk', isExternal: false });
    await service.listRequirements({ actor: clerk });
    expect(JSON.stringify(prisma.documentType.findMany.mock.calls[0][0].where)).not.toContain('visibleToRoleIds');
    expect(JSON.stringify(prisma.document.findMany.mock.calls[0][0].where)).not.toContain('visibleToRoleIds');
  });

  it('an administrator is not narrowed', async () => {
    await service.listRequirements({ actor: { ...clerk, isAdmin: true }, targetUserId: 'mike' });
    expect(JSON.stringify(prisma.documentType.findMany.mock.calls[0][0].where)).not.toContain('visibleToRoleIds');
  });
});
