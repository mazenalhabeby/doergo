import { InvoiceCreateService } from '../invoice-create.service';
import { InvoiceCurrencyService } from '../invoice-currency.service';
import { InvoiceIssuerService } from '../invoice-issuer.service';

/*
  Ids on an invoice arrive from a browser.

  A workspace id the org-scoped lookup did not find used to be written onto the
  invoice anyway, and a line could point at another tenant's job or report.
  Both are refused or dropped here, before anything is stored.
*/
describe('invoice — only this organization’s workspace, jobs and reports', () => {
  const ORG = 'org-1';
  const make = () => {
    const prisma: any = {
      companyLocation: { findFirst: jest.fn().mockResolvedValue(null) },
      organization: { findUnique: jest.fn().mockResolvedValue({ timezone: null }) },
      task: { count: jest.fn() },
      serviceReport: { count: jest.fn() },
      user: { count: jest.fn().mockResolvedValue(0) },
      invoice: { create: jest.fn().mockImplementation(({ data }: any) => ({ id: 'inv-1', ...data })) },
    };
    const money = new InvoiceCurrencyService(prisma, {} as never);
    const issuer = new InvoiceIssuerService(prisma, {} as never);
    jest.spyOn(issuer, 'issuingEntity').mockResolvedValue({ entity: { id: 'le-1', invoicePrefix: 'INV', currency: 'EUR' } } as never);
    jest.spyOn(money, 'currencyFields').mockResolvedValue({ currency: 'EUR' } as never);
    jest.spyOn(issuer, 'generateInvoiceNumber').mockResolvedValue('INV-2026-0001');
    const svc = new InvoiceCreateService(prisma, money, issuer);
    return { svc, prisma };
  };

  it('does not write a workspace the org-scoped lookup did not find', async () => {
    const { svc, prisma } = make();
    const r: any = await svc.create({ organizationId: ORG, createdById: 'u1', spaceId: 'foreign-space', clientName: 'ACME' } as never);
    expect(r.success).toBe(true);
    expect(prisma.invoice.create.mock.calls[0][0].data.spaceId).toBeNull();
  });

  it('refuses a line naming another organization’s job', async () => {
    const { svc, prisma } = make();
    prisma.task.count.mockResolvedValue(0);
    const r: any = await svc.create({
      organizationId: ORG, createdById: 'u1', clientName: 'ACME',
      items: [{ description: 'Repair', taskId: 'foreign-task' }],
    } as never);
    expect(r.success).toBe(false);
    expect(prisma.task.count.mock.calls[0][0].where.organizationId).toBe(ORG);
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });

  it('refuses a line naming another organization’s report', async () => {
    const { svc, prisma } = make();
    prisma.serviceReport.count.mockResolvedValue(0);
    const r: any = await svc.create({
      organizationId: ORG, createdById: 'u1', clientName: 'ACME',
      items: [{ description: 'Report', reportId: 'foreign-report' }],
    } as never);
    expect(r.success).toBe(false);
  });

  it('accepts this organization’s own job', async () => {
    const { svc, prisma } = make();
    prisma.task.count.mockResolvedValue(1);
    const r: any = await svc.create({
      organizationId: ORG, createdById: 'u1', clientName: 'ACME',
      items: [{ description: 'Repair', taskId: 'my-task' }],
    } as never);
    expect(r.success).toBe(true);
  });
});
