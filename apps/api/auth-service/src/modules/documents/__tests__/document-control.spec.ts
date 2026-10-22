import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SERVICE_NAMES, documentVisibleTo, visibleDocumentWhere } from '@hbcfield/shared';
import { PrismaService } from '@hbcfield/shared';
import { MrzOcrService } from '../reading/mrz-ocr.service';
import { DocumentsService, type DocumentActor } from '../documents.service';
import { DOCUMENT_SERVICES } from '../document-services';
import { OBJECT_STORE } from '../core/object-store.provider';

/**
 * Control over one document: who sees it, and erasing it.
 *
 * Erasing destroys evidence and hiding changes who can read a contract, so the
 * rules pinned here are the security ones: the permission, the scope, the
 * all-or-nothing refusal, the signature confirmation, and the audit row that
 * must outlive the document.
 */
describe('per-document visibility — the rule', () => {
  const doc = (over: Record<string, unknown> = {}) => ({
    userId: 'matias',
    hiddenFromMember: false,
    rolesOverridden: false,
    visibleToRoleIds: [] as string[],
    type: { visibleToRoleIds: [] as string[] },
    ...over,
  });

  it('hides a document from its own member — the one override of the subject rule', () => {
    expect(documentVisibleTo(doc({ hiddenFromMember: true }), { userId: 'matias' })).toBe(false);
    expect(documentVisibleTo(doc(), { userId: 'matias' })).toBe(true);
  });

  it('an administrator always sees it', () => {
    expect(documentVisibleTo(doc({ hiddenFromMember: true, rolesOverridden: true }), { isAdmin: true })).toBe(true);
  });

  it('an override with NO roles means administrators only, never everybody', () => {
    const d = doc({ rolesOverridden: true, visibleToRoleIds: [] });
    expect(documentVisibleTo(d, { userId: 'clerk', roleId: 'hr' })).toBe(false);
    expect(documentVisibleTo(d, { userId: 'clerk', roleId: null })).toBe(false);
  });

  it('an override replaces the type: it can narrow AND it ignores the type list', () => {
    const d = doc({ rolesOverridden: true, visibleToRoleIds: ['hr'], type: { visibleToRoleIds: ['dispatch'] } });
    expect(documentVisibleTo(d, { userId: 'a', roleId: 'hr' })).toBe(true);
    expect(documentVisibleTo(d, { userId: 'b', roleId: 'dispatch' })).toBe(false);
  });

  it('without an override the type decides, exactly as before', () => {
    expect(documentVisibleTo(doc(), { userId: 'x', roleId: 'anything' })).toBe(true);
    const typed = doc({ type: { visibleToRoleIds: ['hr'] } });
    expect(documentVisibleTo(typed, { userId: 'x', roleId: 'ops' })).toBe(false);
  });

  it('the query form excludes the subject’s hidden documents and matches the predicate', () => {
    const where = visibleDocumentWhere({ userId: 'matias', roleId: 'hr' }) as any;
    expect(where.OR[0]).toEqual({ userId: 'matias', hiddenFromMember: false });
    expect(JSON.stringify(where)).toContain('"rolesOverridden":true');
    expect(visibleDocumentWhere({ isAdmin: true })).toBeUndefined();
    // A viewer with no role cannot match any override.
    expect(JSON.stringify(visibleDocumentWhere({ userId: 'u', roleId: null }))).not.toContain('"rolesOverridden":true');
  });
});

describe('DocumentsService — hide, delete, replace', () => {
  let service: DocumentsService;

  const tx: Record<string, any> = {
    activityLog: { createMany: jest.fn(), create: jest.fn() },
    document: { deleteMany: jest.fn(), updateMany: jest.fn(), update: jest.fn(), create: jest.fn() },
    documentEvent: { createMany: jest.fn(), create: jest.fn() },
    documentSigner: { updateMany: jest.fn() },
  };
  const calls: string[] = [];
  const prisma: Record<string, any> = {
    document: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn().mockResolvedValue(0) },
    documentSignature: { count: jest.fn().mockResolvedValue(0) },
    accessRole: { findMany: jest.fn() },
    $transaction: jest.fn(async (fn: (t: any) => unknown) => fn(tx)),
  };
  const store = { head: jest.fn(), get: jest.fn(), delete: jest.fn(), put: jest.fn() };

  const actor = (over: Partial<DocumentActor> = {}): DocumentActor => ({
    userId: 'hr1',
    organizationId: 'org1',
    canViewMemberDocuments: true,
    canOpenMemberDocuments: true,
    canIssueDocuments: true,
    canManageDocumentTemplates: false,
    roleId: 'role-hr',
    isAdmin: false,
    canManageDocumentVisibility: true,
    canReplaceDocuments: true,
    canDeleteDocuments: true,
    ...over,
  });

  const row = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    title: `Employment contract ${id}`,
    status: 'ISSUED',
    userId: 'matias',
    storageKey: `org1/documents/${id}.pdf`,
    originalKey: `org1/documents/${id}.pdf`,
    user: { firstName: 'Matias', lastName: 'Iza' },
    type: { label: 'Employment contract' },
    signatures: [] as { signatureKey: string; hashAfter: string }[],
    ...over,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    calls.length = 0;
    tx.activityLog.createMany.mockImplementation(async () => { calls.push('audit'); });
    tx.document.deleteMany.mockImplementation(async () => { calls.push('delete'); });
    const module = await Test.createTestingModule({
      providers: [
        ...DOCUMENT_SERVICES,
        { provide: MrzOcrService, useValue: { read: jest.fn() } },
        { provide: PrismaService, useValue: prisma },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: { emit: jest.fn() } },
        { provide: OBJECT_STORE, useValue: store },
      ],
    }).compile();
    service = module.get(DocumentsService);
  });

  // ── delete ──────────────────────────────────────────────────────────────

  it('refuses to delete without the permission — and an actor built without it fails closed', async () => {
    await expect(
      service.deleteDocuments({ actor: actor({ canDeleteDocuments: false }), documentIds: ['d1'] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const bare = { ...actor() } as any;
    delete bare.canDeleteDocuments;
    await expect(service.deleteDocuments({ actor: bare, documentIds: ['d1'] })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.document.findMany).not.toHaveBeenCalled();
  });

  it('refuses an external member even if the flag were somehow set', async () => {
    await expect(
      service.deleteDocuments({ actor: actor({ isExternal: true }), documentIds: ['d1'] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('looks the documents up through the visibility scope and the organization', async () => {
    prisma.document.findMany.mockResolvedValue([row('d1')]);
    await service.deleteDocuments({ actor: actor(), documentIds: ['d1'] });
    const where = prisma.document.findMany.mock.calls[0][0].where;
    expect(where.organizationId).toBe('org1');
    expect(where.OR).toBeDefined(); // the visibility fragment for a non-admin
  });

  it('is all-or-nothing: one id out of scope refuses the whole request as 404', async () => {
    prisma.document.findMany.mockResolvedValue([row('d1')]);
    await expect(
      service.deleteDocuments({ actor: actor(), documentIds: ['d1', 'someone-elses'] }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.document.deleteMany).not.toHaveBeenCalled();
  });

  it('will not erase signatures without the explicit confirmation', async () => {
    prisma.document.findMany.mockResolvedValue([
      row('d1', { status: 'SIGNED', signatures: [{ signatureKey: 's1', hashAfter: 'h1' }] }),
    ]);
    await expect(service.deleteDocuments({ actor: actor(), documentIds: ['d1'] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.document.deleteMany).not.toHaveBeenCalled();

    await service.deleteDocuments({ actor: actor(), documentIds: ['d1'], confirmSignaturesLost: true });
    expect(tx.document.deleteMany).toHaveBeenCalled();
  });

  it('writes the audit row in the same transaction, BEFORE the delete, naming what was lost', async () => {
    prisma.document.findMany.mockResolvedValue([
      row('d1', { status: 'SIGNED', signatures: [{ signatureKey: 's1', hashAfter: 'h1' }] }),
    ]);
    await service.deleteDocuments({ actor: actor(), documentIds: ['d1'], confirmSignaturesLost: true });
    expect(calls).toEqual(['audit', 'delete']);
    const entry = tx.activityLog.createMany.mock.calls[0][0].data[0];
    expect(entry).toMatchObject({
      eventType: 'DOCUMENT_DELETED',
      userId: 'hr1',
      targetUserId: 'matias',
      organizationId: 'org1',
      metadata: { title: 'Employment contract d1', member: 'Matias Iza', previousStatus: 'SIGNED', signatures: 1 },
    });
  });

  it('frees the file, the sealed copies and the signature images once nothing points at them', async () => {
    prisma.document.findMany.mockResolvedValue([
      row('d1', { status: 'SIGNED', signatures: [{ signatureKey: 'org1/sig/s1.png', hashAfter: 'h1' }] }),
    ]);
    await service.deleteDocuments({ actor: actor(), documentIds: ['d1'], confirmSignaturesLost: true });
    const deleted = store.delete.mock.calls.map((c) => c[0]);
    expect(deleted).toContain('org1/documents/d1.pdf');
    expect(deleted).toContain('org1/sig/s1.png');
    expect(deleted.some((k: string) => k.includes('h1'))).toBe(true);
  });

  it('keeps a file another document still uses', async () => {
    prisma.document.findMany.mockResolvedValue([row('d1')]);
    prisma.document.count.mockResolvedValueOnce(1);
    await service.deleteDocuments({ actor: actor(), documentIds: ['d1'] });
    expect(store.delete).not.toHaveBeenCalledWith('org1/documents/d1.pdf');
  });

  it('caps a bulk request at 100 ids', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `d${i}`);
    await expect(service.deleteDocuments({ actor: actor(), documentIds: ids })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  // ── visibility ──────────────────────────────────────────────────────────

  it('refuses to change visibility without the permission', async () => {
    await expect(
      service.setVisibility({ actor: actor({ canManageDocumentVisibility: false }), documentIds: ['d1'], hiddenFromMember: true }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a role from another organization', async () => {
    prisma.accessRole.findMany.mockResolvedValue([]);
    await expect(
      service.setVisibility({ actor: actor(), documentIds: ['d1'], roleIds: ['foreign-role'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.accessRole.findMany.mock.calls[0][0].where.organizationId).toBe('org1');
  });

  it('hides from the member, records it on the document and in the audit log', async () => {
    prisma.document.findMany.mockResolvedValue([
      { id: 'd1', title: 'Contract', userId: 'matias', user: { firstName: 'Matias', lastName: 'Iza' }, type: { label: 'Employment contract' } },
    ]);
    await service.setVisibility({ actor: actor(), documentIds: ['d1'], hiddenFromMember: true });
    expect(tx.document.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: { in: ['d1'] }, organizationId: 'org1' },
      data: { hiddenFromMember: true },
    });
    expect(tx.documentEvent.createMany.mock.calls[0][0].data[0].type).toBe('VISIBILITY_CHANGED');
    expect(tx.activityLog.createMany.mock.calls[0][0].data[0].eventType).toBe('DOCUMENT_VISIBILITY_CHANGED');
  });

  it('an empty role list is a real override (administrators only), and null goes back to the type', async () => {
    prisma.document.findMany.mockResolvedValue([
      { id: 'd1', title: 'C', userId: 'm', user: { firstName: 'A', lastName: 'B' }, type: { label: 'T' } },
    ]);
    prisma.accessRole.findMany.mockResolvedValue([]);
    await service.setVisibility({ actor: actor(), documentIds: ['d1'], roleIds: [] });
    expect(tx.document.updateMany.mock.calls[0][0].data).toEqual({ rolesOverridden: true, visibleToRoleIds: [] });

    await service.setVisibility({ actor: actor(), documentIds: ['d1'], roleIds: null });
    expect(tx.document.updateMany.mock.calls[1][0].data).toEqual({ rolesOverridden: false, visibleToRoleIds: [] });
  });

  it('cannot change who sees a document the caller cannot see (404)', async () => {
    prisma.document.findMany.mockResolvedValue([]);
    await expect(
      service.setVisibility({ actor: actor(), documentIds: ['hidden-from-me'], hiddenFromMember: true }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.document.updateMany).not.toHaveBeenCalled();
  });
});
