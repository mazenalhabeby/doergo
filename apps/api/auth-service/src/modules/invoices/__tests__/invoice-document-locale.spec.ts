import { clientDocumentLocale } from '@hbcfield/shared';
import { InvoiceService } from '../invoice.service';

/*
  The invoice response says which language the client's copy is written in.

  The PDF is drawn in the browser, but the language is the client-email rule —
  account behind the address → client record → organization country → English —
  and it reads records the office screen never loads. So the single-invoice read
  carries one extra field, decided here. These pin the order, the case with no
  address at all, the failure that must not cost the invoice, and that the LIST
  never pays a lookup per row.
*/
type Account = { email: string; locale: string | null };
type Client = { id: string; email: string | null; locale: string | null };

function setup(opts: {
  invoice?: Record<string, unknown> | null;
  accounts?: Account[];
  clients?: Client[];
  country?: string | null;
  failLookups?: boolean;
}) {
  const invoice = opts.invoice === undefined
    ? { id: 'inv-1', organizationId: 'org-1', clientEmail: 'buchhaltung@kunde.at', items: [], status: 'ISSUED' }
    : opts.invoice;
  const prisma = {
    invoice: {
      findFirst: jest.fn().mockResolvedValue(invoice),
      findMany: jest.fn().mockResolvedValue(invoice ? [invoice, { ...invoice, id: 'inv-2' }] : []),
      count: jest.fn().mockResolvedValue(invoice ? 2 : 0),
    },
    user: {
      findMany: jest.fn(async ({ where }: any) => {
        if (opts.failLookups) throw new Error('db down');
        return (opts.accounts ?? []).filter((a) => where.email.in.includes(a.email));
      }),
    },
    organization: {
      findUnique: jest.fn(async ({ select }: any) => {
        if (opts.failLookups) throw new Error('db down');
        const f = select.customers ? select.customers.where : null;
        const customers = !f
          ? undefined
          : (opts.clients ?? []).filter((c) => {
              if (c.locale === null) return false;
              if (f.OR) return f.OR.some((cond: any) => (cond.id ? cond.id.in.includes(c.id) : (c.email ?? '').toLowerCase() === cond.email.equals.toLowerCase()));
              return f.id === c.id;
            });
        return { country: opts.country ?? null, customers };
      }),
    },
  };
  return { service: new InvoiceService(prisma as any), prisma };
}

describe('invoice documentLocale', () => {
  it("the client's own account wins", async () => {
    const { service } = setup({
      accounts: [{ email: 'buchhaltung@kunde.at', locale: 'fr' }],
      clients: [{ id: 'c1', email: 'buchhaltung@kunde.at', locale: 'it' }],
      country: 'AT',
    });
    const res: any = await service.findOne('inv-1', 'org-1');
    expect(res.data.documentLocale).toBe('fr');
  });

  it('then the client record the office set, found by the address', async () => {
    const { service } = setup({ clients: [{ id: 'c1', email: 'Buchhaltung@Kunde.at', locale: 'it' }], country: 'AT' });
    expect(((await service.findOne('inv-1', 'org-1')) as any).data.documentLocale).toBe('it');
  });

  it("then the organization's country", async () => {
    const { service } = setup({ country: 'AT' });
    expect(((await service.findOne('inv-1', 'org-1')) as any).data.documentLocale).toBe('de');
  });

  it('then English', async () => {
    const { service } = setup({ country: 'CH' });
    expect(((await service.findOne('inv-1', 'org-1')) as any).data.documentLocale).toBe('en');
  });

  it("an invoice with no address still reaches the organization's country — one lookup, no account query", async () => {
    const { service, prisma } = setup({
      invoice: { id: 'inv-1', organizationId: 'org-1', clientEmail: null, items: [] },
      country: 'FR',
    });
    expect(((await service.findOne('inv-1', 'org-1')) as any).data.documentLocale).toBe('fr');
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.organization.findUnique).toHaveBeenCalledTimes(1);
  });

  it('a failed lookup costs the language, never the invoice', async () => {
    const { service } = setup({ failLookups: true });
    const res: any = await service.findOne('inv-1', 'org-1');
    expect(res.success).toBe(true);
    expect(res.data.id).toBe('inv-1');
    expect(res.data.documentLocale).toBe('en');
  });

  it('keeps every field it had, and adds only the one', async () => {
    const { service } = setup({ country: 'IT' });
    const res: any = await service.findOne('inv-1', 'org-1');
    expect(res.data).toEqual({
      id: 'inv-1', organizationId: 'org-1', clientEmail: 'buchhaltung@kunde.at', items: [], status: 'ISSUED', documentLocale: 'it',
    });
  });

  it('a missing invoice is still a 404, with no lookup', async () => {
    const { service, prisma } = setup({ invoice: null });
    const res: any = await service.findOne('nope', 'org-1');
    expect(res.success).toBe(false);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });

  it('the list never looks a language up — no query per row', async () => {
    const { service, prisma } = setup({ country: 'AT' });
    await service.findAll({ organizationId: 'org-1' });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });
});

describe('clientDocumentLocale — a document that names its client but carries no address', () => {
  it("uses the named client's language, then the organization's country", async () => {
    const findUnique = jest.fn(async ({ select }: any) => ({
      country: 'AT',
      customers: select.customers && select.customers.where.id === 'c1' ? [{ id: 'c1', email: null, locale: 'es' }] : [],
    }));
    const prisma = { user: { findMany: jest.fn() }, organization: { findUnique } };
    expect(await clientDocumentLocale(prisma, 'org-1', { email: '  ', customerId: 'c1' })).toBe('es');
    expect(await clientDocumentLocale(prisma, 'org-1', { customerId: 'c2' })).toBe('de');
    expect(await clientDocumentLocale(prisma, 'org-1', {})).toBe('de');
    // No client named: the relation is not even selected.
    expect(findUnique.mock.calls[2][0].select.customers).toBe(false);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});
