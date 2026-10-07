import { LegalEntitiesService } from '../legal-entities.service';

/**
 * Companies — the security boundary. Every id is checked against the caller's organization, the
 * main company cannot be switched off, bank details leave only when asked for, and a bad IBAN is
 * refused rather than dropped.
 */
function setup(rows: any[] = [
  { id: 'le-main', organizationId: 'org-1', isMain: true, isActive: true, invoicePrefix: 'INV', currency: 'EUR', bankAccounts: [] },
  { id: 'le-us', organizationId: 'org-1', isMain: false, isActive: true, invoicePrefix: 'US', currency: 'USD', bankAccounts: [] },
  { id: 'le-off', organizationId: 'org-1', isMain: false, isActive: false, invoicePrefix: 'X', currency: null, bankAccounts: [] },
  { id: 'le-other', organizationId: 'org-2', isMain: true, isActive: true, invoicePrefix: 'INV', currency: 'EUR', bankAccounts: [] },
]) {
  const match = (r: any, w: any) =>
    Object.entries(w ?? {}).every(([k, v]: any) => (v && typeof v === 'object' && 'in' in v ? v.in.includes(r[k]) : r[k] === v));
  const legalEntity = {
    findFirst: jest.fn(async ({ where }: any) => rows.find((r) => match(r, where)) ?? null),
    findMany: jest.fn(async ({ where, select }: any) => rows.filter((r) => match(r, where)).map((r) => ({ ...r, _select: select }))),
    create: jest.fn(async ({ data }: any) => { const r = { id: 'le-new', ...data, bankAccounts: [] }; rows.push(r); return { id: r.id }; }),
    update: jest.fn(async ({ where, data }: any) => Object.assign(rows.find((r) => r.id === where.id), data)),
    updateMany: jest.fn(async ({ where, data }: any) => { rows.filter((r) => match(r, where)).forEach((r) => Object.assign(r, data)); return {}; }),
  };
  const prisma: any = {
    legalEntity,
    legalEntityBankAccount: { deleteMany: jest.fn(), createMany: jest.fn() },
    organization: { findUnique: jest.fn() },
    $transaction: jest.fn(async (arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg))),
  };
  return { svc: new LegalEntitiesService(prisma), prisma, rows };
}

describe('LegalEntitiesService', () => {
  it("never acts on another organization's company (404)", async () => {
    const { svc } = setup();
    expect(await svc.update({ organizationId: 'org-1', id: 'le-other', input: { legalName: 'X' } })).toMatchObject({ statusCode: 404 });
    expect(await svc.setMain({ organizationId: 'org-1', id: 'le-other' })).toMatchObject({ statusCode: 404 });
    expect(await svc.setActive({ organizationId: 'org-1', id: 'le-other', active: false })).toMatchObject({ statusCode: 404 });
  });

  it('refuses a foreign or switched-off company as an issuer', async () => {
    const { svc } = setup();
    expect(await svc.assertUsable('org-1', 'le-other')).toMatchObject({ code: 'COMPANY_UNKNOWN' });
    expect(await svc.assertUsable('org-1', 'le-off')).toMatchObject({ code: 'COMPANY_UNKNOWN' });
    expect(await svc.assertUsable('org-1', 'le-us')).toBeNull();
    expect(await svc.assertUsable('org-1', null)).toBeNull();
  });

  it('the main company cannot be switched off', async () => {
    const { svc } = setup();
    expect(await svc.setActive({ organizationId: 'org-1', id: 'le-main', active: false })).toMatchObject({ code: 'COMPANY_IS_MAIN' });
  });

  it('a switched-off company cannot become main; making another main leaves exactly one', async () => {
    const { svc, rows } = setup();
    expect(await svc.setMain({ organizationId: 'org-1', id: 'le-off' })).toMatchObject({ code: 'COMPANY_INACTIVE' });
    await svc.setMain({ organizationId: 'org-1', id: 'le-us' });
    expect(rows.filter((r) => r.organizationId === 'org-1' && r.isMain).map((r) => r.id)).toEqual(['le-us']);
    expect(rows.find((r) => r.id === 'le-other').isMain).toBe(true);
  });

  it('a bad IBAN is refused, not dropped', async () => {
    const { svc, prisma } = setup();
    const res = await svc.create({ organizationId: 'org-1', input: { legalName: 'HBC USA Inc.', bankAccounts: [{ iban: 'AT61 1904 3002 3457 3202' }] } });
    expect(res).toMatchObject({ code: 'COMPANY_IBAN_INVALID' });
    expect(prisma.legalEntity.create).not.toHaveBeenCalled();
  });

  it('a new company is never created as main, whatever the body says', async () => {
    const { svc, prisma } = setup();
    await svc.create({ organizationId: 'org-1', input: { legalName: 'HBC USA Inc.', isMain: true, organizationId: 'org-2' } as any });
    const data = prisma.legalEntity.create.mock.calls[0][0].data;
    expect(data.isMain).toBe(false);
    expect(data.organizationId).toBe('org-1');
  });

  it('bank accounts are listed only when asked for', async () => {
    const { svc, prisma } = setup();
    await svc.list({ organizationId: 'org-1' });
    expect(prisma.legalEntity.findMany.mock.calls[0][0].select.bankAccounts).toBeUndefined();
    await svc.list({ organizationId: 'org-1', withBank: true });
    expect(prisma.legalEntity.findMany.mock.calls[1][0].select.bankAccounts).toBeDefined();
  });

  it('issuer resolution: invoice → workspace → client → main, skipping what is not usable', async () => {
    const { svc } = setup();
    expect((await svc.resolveIssuer('org-1', { workspace: 'le-us' }))?.id).toBe('le-us');
    expect((await svc.resolveIssuer('org-1', { workspace: 'le-off', client: null }))?.id).toBe('le-main');
    expect((await svc.resolveIssuer('org-1', { invoice: 'le-other' }))?.id).toBe('le-main');
  });
});
