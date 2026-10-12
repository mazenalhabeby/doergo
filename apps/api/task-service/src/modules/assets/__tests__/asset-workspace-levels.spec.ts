import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { assetSpaces, assetAccessIn } from '@hbcfield/shared';
import { AssetAccessService } from '../asset-access.service';
import { AssetsService } from '../assets.service';
import { AssetCatalogService } from '../asset-catalog.service';
import { AssetCustodyService } from '../asset-custody.service';
import { AssetExpenseService } from '../asset-expense.service';

/**
 * The register, honoured PER WORKSPACE at three levels — view, log, manage.
 *
 * An asset has no workspace of its own; it is in its KIND's
 * (`AssetCategory.spaceId`). A kind with no workspace makes an ORG-LEVEL
 * record, reachable only by an org-wide grant. These pin the boundary the
 * gateway's `@RequirePermissionInSpace` cannot draw (the request names an
 * asset, not a workspace): every list narrowed, every record by id answered
 * 404 outside the caller's workspaces — the same answer as no such record.
 */

const ORG = 'org-1';
const LINZ = 'space-linz';
const GRAZ = 'space-graz';

/** Kinds: one per workspace, and one in no workspace at all. */
const KINDS: Record<string, { id: string; organizationId: string; spaceId: string | null; name: string; config: unknown }> = {
  'k-linz': { id: 'k-linz', organizationId: ORG, spaceId: LINZ, name: 'Vans', config: null },
  'k-graz': { id: 'k-graz', organizationId: ORG, spaceId: GRAZ, name: 'Vans', config: null },
  'k-org': { id: 'k-org', organizationId: ORG, spaceId: null, name: 'HQ', config: null },
};
/** Records: a Linz van, a Graz van, and one in the org-level kind. */
const ASSETS: Record<string, { id: string; organizationId: string; categoryId: string }> = {
  'a-linz': { id: 'a-linz', organizationId: ORG, categoryId: 'k-linz' },
  'a-graz': { id: 'a-graz', organizationId: ORG, categoryId: 'k-graz' },
  'a-org': { id: 'a-org', organizationId: ORG, categoryId: 'k-org' },
};

const withKind = (a: (typeof ASSETS)[string] | undefined) =>
  a ? { ...a, holderUserId: null, customerId: null, details: [], installDate: null, warrantyExpiry: null, category: KINDS[a.categoryId] } : null;

function fakePrisma() {
  const prisma: any = {
    asset: {
      findFirst: jest.fn(async ({ where }: any) => {
        const a = ASSETS[where.id];
        return a && a.organizationId === where.organizationId ? withKind(a) : null;
      }),
      findUnique: jest.fn(async ({ where }: any) => withKind(ASSETS[where.id])),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => ({ ...withKind(ASSETS[where.id]), holders: [] })),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
      create: jest.fn(async ({ data }: any) => ({ id: 'a-new', organizationId: ORG, holders: [], ...data })),
      update: jest.fn(async ({ where }: any) => ({ id: where.id })),
      delete: jest.fn(),
    },
    assetCategory: {
      findUnique: jest.fn(async ({ where }: any) => KINDS[where.id] ?? null),
      findFirst: jest.fn(async ({ where }: any) => {
        const k = KINDS[where.id];
        return k && k.organizationId === where.organizationId ? k : null;
      }),
      findMany: jest.fn(async () => []),
      create: jest.fn(async ({ data }: any) => ({ id: 'k-new', ...data })),
      update: jest.fn(async ({ where }: any) => ({ ...KINDS[where.id] })),
    },
    companyLocation: { findFirst: jest.fn(async ({ where }: any) => ({ id: where.id })) },
    assetCustody: { findMany: jest.fn(async () => []) },
    assetMoney: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }: any) => ({ id: 'm1', ...data })),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    user: { findMany: jest.fn(async () => []), findFirst: jest.fn(async () => null) },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };
  return prisma;
}

function services() {
  const prisma = fakePrisma();
  const access = new AssetAccessService(prisma);
  const custody: any = { apply: jest.fn(), announce: jest.fn(), heldBy: jest.fn(async () => false) };
  const assets = new AssetsService(
    prisma, access,
    { logHolderChange: jest.fn() } as any,
    { resolve: jest.fn(async () => []), limitFor: jest.fn(() => 1) } as any,
    custody,
  );
  const catalog = new AssetCatalogService(prisma, access);
  return { prisma, access, assets, catalog, custody };
}

// ── Who is asking ────────────────────────────────────────────────────────────

const base = { userId: 'u', userRole: 'EMPLOYEE', organizationId: ORG };
/** Reads Linz only. */
const linzViewer = { ...base, viewSpaceIds: [LINZ], logSpaceIds: [], manageSpaceIds: [] };
/** Runs Linz's register. */
const linzManager = { ...base, viewSpaceIds: [LINZ], logSpaceIds: [LINZ], manageSpaceIds: [LINZ] };
/** A client's supervisor with every asset key — in Linz. */
const linzExternal = { ...linzManager, userId: 'ext', isExternal: true };
/** Org-wide reader. */
const orgReader = { ...base, viewSpaceIds: null, logSpaceIds: [], manageSpaceIds: [] };

describe('the levels, as the gateway resolves them (shared assetSpaces)', () => {
  const spaceRole = (perms: Record<string, boolean>) => ({
    role: 'EMPLOYEE', access: { org: {}, perSpace: { [LINZ]: perms } },
  });

  it('is cumulative: managing a workspace reads and logs there too', () => {
    const u = spaceRole({ canManageAssets: true });
    expect(assetSpaces(u, 'view')).toEqual([LINZ]);
    expect(assetSpaces(u, 'log')).toEqual([LINZ]);
    expect(assetSpaces(u, 'manage')).toEqual([LINZ]);
  });

  it('keeps reading, logging and managing apart from below', () => {
    const viewer = spaceRole({ canViewAssets: true });
    expect(assetSpaces(viewer, 'view')).toEqual([LINZ]);
    expect(assetSpaces(viewer, 'log')).toEqual([]);
    expect(assetSpaces(viewer, 'manage')).toEqual([]);
  });

  /*
    ⚠️ The task grant opens nothing here. `canViewAllTasks` in a workspace is how
    an External Observer follows the work; it must not hand them the register.
  */
  it('ignores canViewAllTasks held in a workspace', () => {
    expect(assetSpaces(spaceRole({ canViewAllTasks: true }), 'view')).toEqual([]);
  });

  it('reads the flat org-wide fields (bridges applied in auth-service) as everywhere', () => {
    expect(assetSpaces({ role: 'EMPLOYEE', canViewAssets: true }, 'view')).toBeNull();
    expect(assetSpaces({ role: 'EMPLOYEE', canLogAssets: true }, 'view')).toBeNull();
    expect(assetSpaces({ role: 'EMPLOYEE', canLogAssets: true }, 'manage')).toEqual([]);
    expect(assetSpaces({ role: 'ADMIN' }, 'manage')).toBeNull();
    expect(assetSpaces({ role: 'EMPLOYEE', access: { org: { canViewAssets: true }, perSpace: {} } }, 'view')).toBeNull();
  });

  it('an org-level record (no workspace) is reached only org-wide', () => {
    expect(assetAccessIn(spaceRole({ canViewAssets: true }), 'view', null)).toBe(false);
    expect(assetAccessIn({ role: 'EMPLOYEE', canViewAssets: true }, 'view', null)).toBe(true);
    expect(assetAccessIn(null, 'view')).toBe(false);
  });
});

describe('reading the register', () => {
  it('lists only the kinds\' records of the workspaces the caller reads', async () => {
    const { assets, prisma } = services();
    await assets.findAll({ ...linzViewer } as any);
    expect(prisma.asset.findMany.mock.calls[0][0].where.category).toEqual({ spaceId: { in: [LINZ] } });
    // Asking for another workspace narrows to nothing; it never widens.
    await assets.findAll({ ...linzViewer, spaceId: GRAZ } as any);
    expect(prisma.asset.findMany.mock.calls[1][0].where.category).toEqual({ spaceId: { in: [] } });
  });

  it('opens a record of their workspace', async () => {
    const { assets } = services();
    await expect(assets.findOne({ id: 'a-linz', ...linzViewer } as any)).resolves.toBeDefined();
  });

  it('answers another workspace\'s record 404 — the same as no record at all', async () => {
    const { assets } = services();
    const other = await assets.findOne({ id: 'a-graz', ...linzViewer } as any).catch((e) => e);
    const missing = await assets.findOne({ id: 'a-none', ...linzViewer } as any).catch((e) => e);
    expect(other).toBeInstanceOf(NotFoundException);
    expect(missing).toBeInstanceOf(NotFoundException);
    expect(other.message).toBe(missing.message);
  });

  it('never reaches an org-level record (kind in no workspace) on a workspace grant', async () => {
    const { assets } = services();
    await expect(assets.findOne({ id: 'a-org', ...linzManager } as any)).rejects.toBeInstanceOf(NotFoundException);
    await expect(assets.findOne({ id: 'a-org', ...orgReader } as any)).resolves.toBeDefined();
  });

  it('refuses the org-wide orphans list to a workspace reader', async () => {
    const { assets } = services();
    await expect(assets.listOrphans({ ...linzManager } as any)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(assets.listOrphans({ ...orgReader } as any)).resolves.toBeDefined();
  });

  it('reads a missing scope as nowhere — a forgotten forward loses access, never gains it', async () => {
    const { assets } = services();
    await expect(assets.findAll({ ...base } as any)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(assets.findOne({ id: 'a-linz', ...base, canViewAllTasks: true } as any)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('managing records', () => {
  it('a reader cannot change a record of their own workspace', async () => {
    const { assets } = services();
    await expect(assets.update({ id: 'a-linz', name: 'x', ...linzViewer } as any)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(assets.delete({ id: 'a-linz', ...linzViewer } as any)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('a workspace manager changes their own, and another workspace\'s is 404', async () => {
    const { assets, prisma } = services();
    await assets.update({ id: 'a-linz', name: 'Sprinter', ...linzManager } as any);
    expect(prisma.asset.update).toHaveBeenCalled();
    await expect(assets.update({ id: 'a-graz', name: 'x', ...linzManager } as any)).rejects.toBeInstanceOf(NotFoundException);
    await expect(assets.delete({ id: 'a-graz', ...linzManager } as any)).rejects.toBeInstanceOf(NotFoundException);
  });

  /*
    ⚠️ Moving a record to a kind IS moving it to that kind's workspace. A depot
    manager must not post their van into another depot's register — nor out of
    every workspace, where only an org-wide grant would reach it again.
  */
  it('cannot move their record into another workspace\'s kind, or into none', async () => {
    const { assets, prisma } = services();
    await expect(assets.update({ id: 'a-linz', categoryId: 'k-graz', ...linzManager } as any)).rejects.toBeInstanceOf(BadRequestException);
    await expect(assets.update({ id: 'a-linz', categoryId: 'k-org', ...linzManager } as any)).rejects.toBeInstanceOf(BadRequestException);
    await expect(assets.update({ id: 'a-linz', categoryId: '', ...linzManager } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.asset.update).not.toHaveBeenCalled();
  });

  it('creates only in a kind of a workspace they manage — never org-level, never another\'s', async () => {
    const { assets, prisma } = services();
    await assets.create({ name: 'Van', categoryId: 'k-linz', ...linzManager } as any);
    expect(prisma.asset.create).toHaveBeenCalledTimes(1);
    await expect(assets.create({ name: 'Van', categoryId: 'k-graz', ...linzManager } as any)).rejects.toBeInstanceOf(BadRequestException);
    await expect(assets.create({ name: 'Van', categoryId: 'k-org', ...linzManager } as any)).rejects.toBeInstanceOf(BadRequestException);
    await expect(assets.create({ name: 'Van', ...linzManager } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.asset.create).toHaveBeenCalledTimes(1);
  });
});

describe('an external member keeps to their workspace', () => {
  it('works in Linz with their keys, and cannot reach Graz by any id', async () => {
    const { assets } = services();
    await expect(assets.findOne({ id: 'a-linz', ...linzExternal } as any)).resolves.toBeDefined();
    await expect(assets.findOne({ id: 'a-graz', ...linzExternal } as any)).rejects.toBeInstanceOf(NotFoundException);
    await expect(assets.update({ id: 'a-graz', name: 'x', ...linzExternal } as any)).rejects.toBeInstanceOf(NotFoundException);
    await expect(assets.findOne({ id: 'a-org', ...linzExternal } as any)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('cannot hand over another workspace\'s record', async () => {
    const prisma = fakePrisma();
    const custody = new AssetCustodyService(prisma, new AssetAccessService(prisma), { custodyChanged: jest.fn() } as any);
    await expect(custody.handOver({ id: 'a-graz', to: [], ...linzExternal } as any)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sees only Linz\'s records in a member\'s custody', async () => {
    const prisma = fakePrisma();
    const custody = new AssetCustodyService(prisma, new AssetAccessService(prisma), {} as any);
    await custody.forMember({ memberId: 'm1', ...linzExternal } as any);
    expect(prisma.assetCustody.findMany.mock.calls[0][0].where).toMatchObject({
      userId: 'm1', asset: { category: { spaceId: { in: [LINZ] } } },
    });
  });
});

describe('kinds follow their workspace', () => {
  it('a workspace manager creates kinds in their workspace only', async () => {
    const { catalog, prisma } = services();
    await catalog.createCategory({ name: 'Trailers', spaceId: LINZ, ...linzManager } as any);
    expect(prisma.assetCategory.create).toHaveBeenCalledTimes(1);
    await expect(catalog.createCategory({ name: 'Trailers', spaceId: GRAZ, ...linzManager } as any)).rejects.toBeInstanceOf(NotFoundException);
    await expect(catalog.createCategory({ name: 'Trailers', ...linzManager } as any)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.assetCategory.create).toHaveBeenCalledTimes(1);
  });

  it('edits and deletes kinds of their workspace only — another\'s is 404', async () => {
    const { catalog } = services();
    await expect(catalog.updateCategory({ id: 'k-graz', name: 'x', ...linzManager } as any)).rejects.toBeInstanceOf(NotFoundException);
    await expect(catalog.deleteCategory({ id: 'k-org', ...linzManager } as any)).rejects.toBeInstanceOf(NotFoundException);
    await expect(catalog.createType({ categoryId: 'k-graz', name: 'x', ...linzManager } as any)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a reader lists the types of their workspace\'s kinds only', async () => {
    const { catalog } = services();
    await expect(catalog.findTypesByCategory({ categoryId: 'k-graz', ...linzViewer } as any)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a reader never shapes a kind, even in their own workspace', async () => {
    const { catalog } = services();
    await expect(catalog.updateCategory({ id: 'k-linz', name: 'x', ...linzViewer } as any)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('expenses, per workspace', () => {
  const expenseService = (prisma: any, held = false) =>
    new AssetExpenseService(
      prisma,
      new AssetAccessService(prisma),
      { heldBy: jest.fn(async () => held) } as any,
      { expenseSubmitted: jest.fn(), expenseDecided: jest.fn() } as any,
      { head: async () => ({ exists: true, sizeBytes: 10 }) } as any,
    );
  const MONEY_KIND = { holder: { enabled: true, members: true, clients: false, max: 1 }, money: { enabled: true, categories: [{ label: 'Fuel', direction: 'out' }] } };

  /*
    ⚠️ Logging rights let somebody file without holding the van — and the entry
    still WAITS. Only the office of that workspace records straight away: a
    member's expense counts for nothing until somebody accepts it.
  */
  it('a logger of the workspace files without custody, and it waits; its manager records it', async () => {
    const prisma = fakePrisma();
    prisma.asset.findFirst.mockResolvedValue({ id: 'a-linz', name: 'Van', category: { config: MONEY_KIND, spaceId: LINZ } });
    const logger = { ...base, viewSpaceIds: [LINZ], logSpaceIds: [LINZ], manageSpaceIds: [] };
    const filed: any = await expenseService(prisma).submit({ id: 'a-linz', category: 'Fuel', amountCents: 500, ...logger } as any);
    expect(filed.data.status).toBe('SUBMITTED');
    const typed: any = await expenseService(prisma).submit({ id: 'a-linz', category: 'Fuel', amountCents: 500, ...linzManager } as any);
    expect(typed.data.status).toBe('RECORDED');
  });

  it('a logger of ANOTHER workspace is a stranger to this van', async () => {
    const prisma = fakePrisma();
    prisma.asset.findFirst.mockResolvedValue({ id: 'a-graz', name: 'Van', category: { config: MONEY_KIND, spaceId: GRAZ } });
    await expect(expenseService(prisma).submit({ id: 'a-graz', category: 'Fuel', amountCents: 500, ...linzManager } as any))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('an external member never files on custody', async () => {
    const prisma = fakePrisma();
    prisma.asset.findFirst.mockResolvedValue({ id: 'a-graz', name: 'Van', category: { config: MONEY_KIND, spaceId: GRAZ } });
    await expect(expenseService(prisma, true).submit({ id: 'a-graz', category: 'Fuel', amountCents: 500, ...linzExternal } as any))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('another workspace\'s slip is "not waiting" to a workspace manager, and is left alone', async () => {
    const prisma = fakePrisma();
    prisma.assetMoney.findFirst.mockResolvedValue({ authorId: 'driver', asset: { category: { spaceId: GRAZ } } });
    await expect(expenseService(prisma).review({ entryId: 'm1', decision: 'accept', ...linzManager } as any))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.assetMoney.updateMany).not.toHaveBeenCalled();
  });

  it('the queue holds only the workspaces the caller reads', async () => {
    const prisma = fakePrisma();
    await expenseService(prisma).pending({ ...linzViewer } as any);
    expect(prisma.assetMoney.findMany.mock.calls[0][0].where).toMatchObject({
      asset: { category: { spaceId: { in: [LINZ] } } },
    });
  });

  it('a receipt of another workspace is 404 to anybody but its author', async () => {
    const prisma = fakePrisma();
    prisma.assetMoney.findFirst.mockResolvedValue({
      id: 'm1', receiptKey: 'k', receiptMime: 'image/jpeg', authorId: 'driver', asset: { category: { spaceId: GRAZ } },
    });
    await expect(expenseService(prisma).receiptUrl({ entryId: 'm1', ...linzManager } as any)).rejects.toBeInstanceOf(NotFoundException);
  });
});
