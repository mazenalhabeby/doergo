import { invoiceTotals, lineAmount } from '@hbcfield/shared';
import { InvoiceService } from '../invoice.service';
import { invoiceDay, dayEnd } from '../work-source';

/*
  Two bugs found in the clean-up:

  1. A saved invoice was a cent off its own draft. The screen summed lines
     rounded to the cent; the server summed the unrounded products. Both now
     go through `invoiceTotals` in shared.
  2. Issue / due / period are calendar DATES. A `YYYY-MM-DD` is stored as the
     start of that day in UTC (the period end at 23:59:59.999Z) and read by
     its UTC date part, so the reader's time zone never moves the day.
*/
describe('invoice — totals the draft screen showed, dates as days', () => {
  const make = () => {
    const prisma: any = {
      companyLocation: { findFirst: jest.fn().mockResolvedValue(null) },
      organization: { findUnique: jest.fn().mockResolvedValue({ timezone: null }) },
      task: { count: jest.fn() },
      serviceReport: { count: jest.fn() },
      user: { count: jest.fn().mockResolvedValue(0) },
      invoice: {
        create: jest.fn().mockImplementation(({ data }: any) => ({ id: 'inv-1', ...data })),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn().mockImplementation(({ data }: any) => data),
      },
      invoiceItem: { findMany: jest.fn() },
    };
    const svc = new InvoiceService(prisma, {} as never, {} as never);
    jest.spyOn(svc as any, 'issuingEntity').mockResolvedValue({ entity: { id: 'le-1', invoicePrefix: 'INV', currency: 'EUR' } });
    jest.spyOn(svc as any, 'currencyFields').mockResolvedValue({ currency: 'EUR' });
    jest.spyOn(svc as any, 'generateInvoiceNumber').mockResolvedValue('INV-2026-0001');
    return { svc, prisma };
  };

  // 1.5 h × €33.33 = €49.995 — €50.00 on the page, twice.
  const items = [
    { description: 'Mark', quantity: 1.5, unitPrice: 33.33 },
    { description: 'Lisa', quantity: 1.5, unitPrice: 33.33 },
  ];

  it('stores each line rounded and the subtotal as the sum of the rounded lines — what the draft showed', async () => {
    const { svc, prisma } = make();
    await svc.create({ organizationId: 'o', createdById: 'u', clientName: 'ACME', taxRate: 0.2, discount: 0, items } as never);
    const data = prisma.invoice.create.mock.calls[0][0].data;
    expect(data.items.create.map((i: any) => i.amount)).toEqual([50, 50]);
    expect(data.subtotal).toBe(100);
    expect(data.taxAmount).toBe(20);
    expect(data.total).toBe(120);
    // The very function the web draft calls.
    const screen = invoiceTotals(items, 0.2, 0);
    expect([screen.subtotal, screen.taxAmount, screen.total]).toEqual([data.subtotal, data.taxAmount, data.total]);
  });

  it('rounds float noise the way a person would (1.33 h × €45.75 = €60.85)', () => {
    expect(lineAmount(1.33, 45.75)).toBe(60.85);
    expect(lineAmount(-1, 0.005)).toBe(-0.01);
  });

  it('a recomputed draft (line added/removed) re-rounds old unrounded lines', async () => {
    const { svc, prisma } = make();
    prisma.invoiceItem.findMany.mockResolvedValue([{ amount: 49.995 }, { amount: 49.995 }]);
    prisma.invoice.findUnique.mockResolvedValue({ taxRate: 0.2, discount: 0 });
    await (svc as any).recalculateAndReturn('inv-1');
    expect(prisma.invoice.update.mock.calls[0][0].data).toEqual({ subtotal: 100, taxAmount: 20, total: 120 });
  });

  it('stores issue and due days as the start of that day in UTC', async () => {
    const { svc, prisma } = make();
    await svc.create({
      organizationId: 'o', createdById: 'u', clientName: 'ACME',
      issueDate: '2026-10-01', dueDate: '2026-10-31', servicePeriodFrom: '2026-09-01', servicePeriodTo: '2026-09-30',
    } as never);
    const data = prisma.invoice.create.mock.calls[0][0].data;
    expect(data.issueDate.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(data.dueDate.toISOString()).toBe('2026-10-31T00:00:00.000Z');
    expect(data.servicePeriodFrom.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    // The end stays inclusive for the work query; its UTC DATE is the 30th.
    expect(data.servicePeriodTo.toISOString().slice(0, 10)).toBe('2026-09-30');
  });

  it('with no issue day sent, stores the start of today (UTC), not an instant', async () => {
    const { svc, prisma } = make();
    await svc.create({ organizationId: 'o', createdById: 'u', clientName: 'ACME' } as never);
    expect(prisma.invoice.create.mock.calls[0][0].data.issueDate.toISOString()).toMatch(/T00:00:00\.000Z$/);
  });

  it('with no issue day sent, "today" is the organization’s day — not UTC’s', async () => {
    // 22:30 UTC on 9 October is already 10 October in Vienna.
    jest.useFakeTimers().setSystemTime(new Date('2026-10-09T22:30:00Z'));
    try {
      const { svc, prisma } = make();
      prisma.organization.findUnique.mockResolvedValue({ timezone: 'Europe/Vienna' });
      await svc.create({ organizationId: 'o', createdById: 'u', clientName: 'ACME' } as never);
      expect(prisma.invoice.create.mock.calls[0][0].data.issueDate.toISOString()).toBe('2026-10-10T00:00:00.000Z');
    } finally {
      jest.useRealTimers();
    }
  });

  it('invoiceDay: a day string → start of the UTC day; empty → null', () => {
    expect(invoiceDay('2026-09-30')!.toISOString()).toBe('2026-09-30T00:00:00.000Z');
    expect(invoiceDay('')).toBeNull();
    expect(invoiceDay('nonsense')).toBeNull();
    expect(dayEnd('2026-09-30')!.toISOString()).toBe('2026-09-30T23:59:59.999Z');
  });
});
