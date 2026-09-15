import {
  clientEmailLocale,
  clientEmailLocales,
  organizationLocaleFromCountry,
  parseClientLocale,
} from '@hbcfield/shared';

/*
  Which language an email to a CLIENT is written in, and in what order the
  answers are asked:

    the account behind the address → the client record → the organization → English

  Each row of the matrix removes the answer above it and checks the next one
  takes over. The last block is the cost: a whole batch is two lookups, never
  one per recipient.
*/

type Account = { email: string; locale: string | null };
type Client = { id: string; email: string | null; locale: string | null; organizationId?: string };

function fakePrisma(opts: { accounts?: Account[]; clients?: Client[]; country?: string | null; orgMissing?: boolean }) {
  const accounts = opts.accounts ?? [];
  const clients = opts.clients ?? [];
  return {
    user: {
      findMany: jest.fn(async ({ where }: any) =>
        accounts.filter((a) => where.email.in.includes(a.email)),
      ),
    },
    organization: {
      findUnique: jest.fn(async ({ where, select }: any) => {
        if (opts.orgMissing) return null;
        const f = select.customers.where;
        const matched = clients.filter((c) => {
          if ((c.organizationId ?? 'org-1') !== where.id) return false;
          if (c.locale === null) return false;
          return f.OR.some((cond: any) =>
            cond.id
              ? cond.id.in.includes(c.id)
              : (c.email ?? '').toLowerCase() === cond.email.equals.toLowerCase(),
          );
        });
        return { country: opts.country ?? null, customers: matched };
      }),
    },
  };
}

describe('clientEmailLocales — resolution order', () => {
  const ORG = 'org-1';

  it('1. the account behind the address wins over everything', async () => {
    const prisma = fakePrisma({
      accounts: [{ email: 'anna@firma.at', locale: 'fr' }],
      clients: [{ id: 'c1', email: 'anna@firma.at', locale: 'it' }],
      country: 'AT',
    });
    expect(await clientEmailLocale(prisma, ORG, { email: 'Anna@Firma.at', customerId: 'c1' })).toBe('fr');
    // Answered by the account alone: the client records are never read.
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });

  it('2. then the language the office set on the client record — by the client named', async () => {
    const prisma = fakePrisma({
      accounts: [{ email: 'anna@firma.at', locale: null }], // an account that never said
      clients: [{ id: 'c1', email: 'someone-else@firma.at', locale: 'it' }],
      country: 'AT',
    });
    expect(await clientEmailLocale(prisma, ORG, { email: 'anna@firma.at', customerId: 'c1' })).toBe('it');
  });

  it('2. …or, when no client is named, by the address among this organization’s clients', async () => {
    const prisma = fakePrisma({
      clients: [
        { id: 'c1', email: 'Office@Binderholz.com', locale: 'es' },
        // Another tenant's record with the same address answers nothing here.
        { id: 'c9', email: 'office@binderholz.com', locale: 'fr', organizationId: 'org-2' },
      ],
    });
    expect(await clientEmailLocale(prisma, ORG, { email: 'office@binderholz.com' })).toBe('es');
    expect(prisma.organization.findUnique.mock.calls[0][0].where).toEqual({ id: ORG });
  });

  it('3. then the organization’s language, where its country states one', async () => {
    const prisma = fakePrisma({ clients: [{ id: 'c1', email: 'x@y.at', locale: null }], country: 'AT' });
    expect(await clientEmailLocale(prisma, ORG, { email: 'x@y.at', customerId: 'c1' })).toBe('de');
  });

  it('4. English when nothing answers — no account, no client language, a multilingual country', async () => {
    expect(await clientEmailLocale(fakePrisma({ country: 'CH' }), ORG, { email: 'x@y.ch' })).toBe('en');
    expect(await clientEmailLocale(fakePrisma({ country: null }), ORG, { email: 'x@y.com' })).toBe('en');
    expect(await clientEmailLocale(fakePrisma({ orgMissing: true }), ORG, { email: 'x@y.com' })).toBe('en');
  });

  it('never uses a stored value that is not a language we write', async () => {
    const prisma = fakePrisma({
      accounts: [{ email: 'a@x', locale: 'pt' }],
      clients: [{ id: 'c1', email: 'a@x', locale: 'klingon' }],
      country: 'IT',
    });
    expect(await clientEmailLocale(prisma, ORG, { email: 'a@x', customerId: 'c1' })).toBe('it');
  });

  it('answers a whole batch with two lookups, however many recipients', async () => {
    const prisma = fakePrisma({
      accounts: [{ email: 'portal@a.com', locale: 'de' }],
      clients: [
        { id: 'c2', email: 'b@b.com', locale: 'fr' },
        { id: 'c3', email: 'c@c.com', locale: 'es' },
      ],
      country: 'IT',
    });
    const recipients = [
      { email: 'portal@a.com', customerId: 'c1' },
      { email: 'b@b.com', customerId: 'c2' },
      { email: 'C@c.com' },
      { email: 'd@d.com', customerId: 'c4' },
      { email: '  ' },
    ];
    const map = await clientEmailLocales(prisma, ORG, recipients);

    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.organization.findUnique).toHaveBeenCalledTimes(1);
    expect(Object.fromEntries(map)).toEqual({
      'portal@a.com': 'de', // account
      'b@b.com': 'fr', // client record by id
      'c@c.com': 'es', // client record by address
      'd@d.com': 'it', // organization
    });
    // Only the addresses still unanswered are looked for among the clients.
    const where = prisma.organization.findUnique.mock.calls[0][0].select.customers.where;
    expect(where.OR).toEqual([
      { id: { in: ['c2', 'c4'] } },
      { email: { equals: 'b@b.com', mode: 'insensitive' } },
      { email: { equals: 'c@c.com', mode: 'insensitive' } },
      { email: { equals: 'd@d.com', mode: 'insensitive' } },
    ]);
  });

  it('asks nothing for an empty list', async () => {
    const prisma = fakePrisma({});
    expect((await clientEmailLocales(prisma, ORG, [])).size).toBe(0);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });
});

describe('parseClientLocale — what a client record may hold', () => {
  it.each([
    ['de', 'de'],
    [' FR ', 'fr'],
    ['', null],
    [null, null],
  ])('accepts %p as %p', (input, expected) => {
    expect(parseClientLocale(input)).toEqual({ ok: true, locale: expected });
  });

  it.each(['pt', 'de-AT', 'english', 42, {}, ['de']])('refuses %p', (input) => {
    expect(parseClientLocale(input)).toEqual({ ok: false });
  });
});

describe('organizationLocaleFromCountry', () => {
  it('answers only where a country has one language we write', () => {
    expect(organizationLocaleFromCountry('AT')).toBe('de');
    expect(organizationLocaleFromCountry('de')).toBe('de');
    expect(organizationLocaleFromCountry('FR')).toBe('fr');
    expect(organizationLocaleFromCountry('IT')).toBe('it');
    expect(organizationLocaleFromCountry('ES')).toBe('es');
    for (const multilingual of ['CH', 'BE', 'LU', 'CA']) {
      expect(organizationLocaleFromCountry(multilingual)).toBeNull();
    }
    expect(organizationLocaleFromCountry('GB')).toBeNull(); // English is the end of the chain anyway
    expect(organizationLocaleFromCountry(null)).toBeNull();
  });
});
