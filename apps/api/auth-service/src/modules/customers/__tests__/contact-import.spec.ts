import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  CONTACT_IMPORT_MAX,
  CONTACT_IMPORT_SOURCE,
  contactMatchKeys,
  emailMatchKey,
  matchKeyMaterial,
  parseContactImport,
  phoneMatchKey,
  type CrmCaps,
} from '@hbcfield/shared';
import { createHash } from 'crypto';
import { CustomersService, withContactKeys } from '../customers.service';
import { ContactImportService } from '../contact-import.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

/*
  Clients from a phone's address book.

  The hazards, in the order they would hurt:
    1. Overwriting the company's record with somebody's private notes.
    2. A body naming a record it should not reach (another org, another rep's client).
    3. Two clients for one person — the duplicate check the whole feature rests on.
    4. Half an import.
    5. Billing six contact people as six clients.
*/

const ORG = 'org-1';
const ref = (n: number) => `0190a1b2-c3d4-7e5f-8a9b-${String(n).padStart(12, '0')}`;
const caps = (over: Partial<CrmCaps> = {}): CrmCaps => ({
  view: 'all', work: true, editInfo: true, create: true, manage: true, canAccess: true, ...over,
});

describe('match keys', () => {
  it('reads "+43 664…", "0043 664…" and "0664…" as one number', () => {
    const k = phoneMatchKey('+43 664 812 3390');
    expect(k).toBe('648123390');
    expect(phoneMatchKey('0043 664 8123390')).toBe(k);
    expect(phoneMatchKey('0664/812 33 90')).toBe(k);
  });

  it('keeps an Austrian landline whole', () => {
    expect(phoneMatchKey('+43 7612 44120')).toBe(phoneMatchKey('07612 44 120'));
  });

  it('has no key for something that is not a phone number', () => {
    expect(phoneMatchKey('112')).toBeNull();
    expect(phoneMatchKey('')).toBeNull();
    expect(phoneMatchKey(null)).toBeNull();
  });

  it('compares emails without case or edge spaces, and refuses non-addresses', () => {
    expect(emailMatchKey('  T.Berger@Bauer-Elektro.AT ')).toBe('t.berger@bauer-elektro.at');
    expect(emailMatchKey('@x.at')).toBeNull();
    expect(emailMatchKey('anna@')).toBeNull();
  });

  it('only recomputes the key of the column being written', () => {
    expect(withContactKeys({ phone: '0664 8123390' })).toEqual({ phone: '0664 8123390', phoneKey: '648123390' });
    expect(withContactKeys({ name: 'x' })).toEqual({ name: 'x' });
    // Clearing the column clears its key — or a deleted number keeps matching.
    expect(withContactKeys({ email: null })).toEqual({ email: null, emailKey: null });
  });
});

describe('parseContactImport', () => {
  const item = (n: number, over: Record<string, unknown> = {}) => ({ ref: ref(n), kind: 'PERSON', name: `P ${n}`, ...over });

  it('refuses a batch with no workspace, nothing in it, or too much', () => {
    expect(parseContactImport({ items: [item(1)] })).toEqual({ ok: false, problem: 'NO_SPACE' });
    expect(parseContactImport({ spaceId: 's', items: [] })).toEqual({ ok: false, problem: 'NO_ITEMS' });
    const many = Array.from({ length: CONTACT_IMPORT_MAX + 1 }, (_, i) => item(i));
    expect(parseContactImport({ spaceId: 's', items: many })).toEqual({ ok: false, problem: 'TOO_MANY' });
  });

  it('refuses a person attached to a company that is not in the batch', () => {
    expect(parseContactImport({ spaceId: 's', items: [item(1, { companyRef: ref(9) })] }))
      .toEqual({ ok: false, problem: 'BAD_COMPANY_REF' });
  });

  it('drops what it does not know and cleans what it keeps', () => {
    const r = parseContactImport({
      spaceId: 's',
      items: [item(1, { name: '  Anna\u0000  Leitner ', email: 'not-an-address', ownerId: 'evil', id: 'evil', role: 'x'.repeat(500) })],
    });
    expect(r.ok).toBe(true);
    const it0 = (r as any).value.items[0];
    expect(it0.name).toBe('Anna Leitner');
    expect(it0.email).toBeNull();
    expect(it0.role).toHaveLength(120);
    expect(it0).not.toHaveProperty('ownerId');
    expect(it0).not.toHaveProperty('id');
  });
});

describe('ContactImportService', () => {
  let service: ContactImportService;
  let customers: CustomersService;

  const prisma: Record<string, any> = {
    customer: { findMany: jest.fn(), createMany: jest.fn((a) => ({ op: 'createMany', a })), update: jest.fn((a) => ({ op: 'update', a })) },
    customerContact: { createMany: jest.fn((a) => ({ op: 'links', a })) },
    customerActivity: { createMany: jest.fn((a) => ({ op: 'activities', a })) },
    companyLocation: { findFirst: jest.fn() },
    user: { findFirst: jest.fn() },
    $transaction: jest.fn(async (ops: unknown[]) => ops),
  };
  const caller = { userId: 'u1', role: 'MEMBER' };

  /** `customer.findMany` is asked twice: refs already used, then the key index. */
  const existing = (opts: { replayed?: any[]; matches?: any[] } = {}) => {
    prisma.customer.findMany
      .mockResolvedValueOnce(opts.replayed ?? [])
      .mockResolvedValueOnce(opts.matches ?? []);
  };
  const run = (items: any[]) => service.import({ organizationId: ORG, caller, body: { spaceId: 'sp-1', items } });
  const txOps = () => prisma.$transaction.mock.calls[0][0] as Array<{ op: string; a: any }>;
  const op = (name: string) => txOps().find((o) => o.op === name)?.a;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Queued answers must not leak from one test into the next.
    prisma.customer.findMany.mockReset();
    prisma.companyLocation.findFirst.mockResolvedValue({ id: 'sp-1' });
    prisma.user.findFirst.mockResolvedValue({ firstName: 'Anna', lastName: 'Müller' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [ContactImportService, CustomersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(ContactImportService);
    customers = module.get(CustomersService);
    jest.spyOn(customers, 'crmCapsFor').mockResolvedValue(caps());
  });

  it('refuses a member who may not create clients', async () => {
    jest.spyOn(customers, 'crmCapsFor').mockResolvedValue(caps({ create: false }));
    await expect(run([{ ref: ref(1), kind: 'PERSON', name: 'A' }])).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.matchKeys({ organizationId: ORG, caller })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a workspace that is not this organization\'s, or is archived', async () => {
    prisma.companyLocation.findFirst.mockResolvedValue(null);
    await expect(run([{ ref: ref(1), kind: 'PERSON', name: 'A' }])).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.companyLocation.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'sp-1', organizationId: ORG, isActive: true },
    }));
  });

  it('creates new clients in ONE transaction, with keys, an owner and provenance', async () => {
    existing();
    const r = await run([{ ref: ref(1), kind: 'PERSON', name: 'Julia Brandl', phone: '+43 664 812 3390' }]);
    expect(r.data.created).toBe(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const row = op('createMany').data[0];
    expect(row).toMatchObject({ id: ref(1), organizationId: ORG, spaceId: 'sp-1', ownerId: 'u1', managerIds: ['u1'], phoneKey: '648123390', isContact: false });
    const act = op('activities').data[0];
    expect(act).toMatchObject({ customerId: ref(1), type: 'SYSTEM', authorId: 'u1', metadata: { source: CONTACT_IMPORT_SOURCE } });
    expect(act.body).toContain("Anna Müller's phone contacts");
  });

  it('matches an existing client by phone written another way, and creates nothing', async () => {
    existing({ matches: [{ id: 'c-9', name: 'Paul Gruber', phone: '0650 2210045', email: null, phoneKey: phoneMatchKey('0650 2210045'), emailKey: null, ownerId: null, managerIds: [], isPortalResident: false }] });
    const r = await run([{ ref: ref(1), kind: 'PERSON', name: 'Paul', phone: '+43 650 221 0045' }]);
    expect(r.data).toMatchObject({ created: 0, existing: 1 });
    expect(op('createMany')).toBeUndefined();
  });

  it('fills ONLY an empty field, and only when asked', async () => {
    const match = { id: 'c-9', name: 'Hofer', phone: '0650 2210045', email: null, phoneKey: phoneMatchKey('0650 2210045'), emailKey: null, ownerId: null, managerIds: [], isPortalResident: false };
    existing({ matches: [match] });
    const r = await run([{ ref: ref(1), kind: 'COMPANY', name: 'Hofer', phone: '0699 999 9999 9', email: 'info@hofer-fm.at', fillMissing: true }].map((i) => ({ ...i, phone: '+43 650 221 0045' })));
    expect(r.data.filled).toBe(1);
    const upd = op('update');
    // The phone was there already: never overwritten. The empty email is filled, with its key.
    expect(upd.data).toEqual({ email: 'info@hofer-fm.at', emailKey: 'info@hofer-fm.at' });
  });

  it('does not fill a client the member may not edit, or cannot reach', async () => {
    const match = { id: 'c-9', name: 'H', phone: '0650 2210045', email: null, phoneKey: phoneMatchKey('0650 2210045'), emailKey: null, ownerId: 'someone-else', managerIds: [], isPortalResident: false };
    jest.spyOn(customers, 'crmCapsFor').mockResolvedValue(caps({ view: 'own' }));
    existing({ matches: [match] });
    const r = await run([{ ref: ref(1), kind: 'PERSON', name: 'H', phone: '0650 2210045', email: 'h@x.at', fillMissing: true }]);
    expect(r.data).toMatchObject({ existing: 1, filled: 0 });
    // Out of reach: the result does not even say which client it was.
    expect(r.data.results[0].id).toBeUndefined();
    expect(op('update')).toBeUndefined();
  });

  it('never touches an app user\'s record', async () => {
    existing({ matches: [{ id: 'c-9', name: 'T', phone: null, email: 't@x.at', phoneKey: null, emailKey: 't@x.at', ownerId: null, managerIds: [], isPortalResident: true }] });
    const r = await run([{ ref: ref(1), kind: 'PERSON', name: 'T', email: 't@x.at', fillMissing: true }]);
    expect(r.data.results[0]).toMatchObject({ outcome: 'existing', reason: 'APP_USER' });
    expect(op('update')).toBeUndefined();
  });

  it('a retried import is the same import; a ref from another organization is skipped', async () => {
    existing({ replayed: [{ id: ref(1), organizationId: ORG, name: 'A' }, { id: ref(2), organizationId: 'org-2', name: 'Theirs' }] });
    const r = await run([{ ref: ref(1), kind: 'PERSON', name: 'A' }, { ref: ref(2), kind: 'PERSON', name: 'B' }]);
    expect(r.data.results.map((x) => x.outcome)).toEqual(['created', 'skipped']);
    expect(r.data.results[1].reason).toBe('NOT_YOURS');
    expect(op('createMany')).toBeUndefined();
  });

  it('two entries for one person in the same book make one client', async () => {
    existing();
    const r = await run([
      { ref: ref(1), kind: 'PERSON', name: 'Julia', email: 'j@brandl.at' },
      { ref: ref(2), kind: 'PERSON', name: 'Julia B.', email: 'J@Brandl.at' },
    ]);
    expect(r.data).toMatchObject({ created: 1, skipped: 1 });
    expect(r.data.results[1].reason).toBe('DUPLICATE_IN_BATCH');
  });

  it('people imported with their company are its contact people — not billable clients', async () => {
    existing();
    const r = await run([
      { ref: ref(2), kind: 'PERSON', name: 'Thomas', role: 'Site manager', companyRef: ref(1) },
      { ref: ref(1), kind: 'COMPANY', name: 'Bauer Elektrotechnik' },
      { ref: ref(3), kind: 'PERSON', name: 'Anna', companyRef: ref(1) },
    ]);
    expect(r.data.created).toBe(3);
    const rows = op('createMany').data;
    expect(rows.find((x: any) => x.id === ref(1)).isContact).toBe(false);
    expect(rows.find((x: any) => x.id === ref(2)).isContact).toBe(true);
    const links = op('links').data;
    expect(links).toEqual([
      expect.objectContaining({ companyId: ref(1), personId: ref(2), role: 'Site manager', isPrimary: true }),
      expect.objectContaining({ companyId: ref(1), personId: ref(3), isPrimary: false }),
    ]);
  });

  it('links to an EXISTING company only for a member who may edit it', async () => {
    jest.spyOn(customers, 'crmCapsFor').mockResolvedValue(caps({ editInfo: false }));
    existing({ matches: [{ id: 'co-9', name: 'Bauer', phone: null, email: 'office@bauer.at', phoneKey: null, emailKey: 'office@bauer.at', ownerId: null, managerIds: [], isPortalResident: false }] });
    const r = await run([
      { ref: ref(1), kind: 'COMPANY', name: 'Bauer', email: 'office@bauer.at' },
      { ref: ref(2), kind: 'PERSON', name: 'Thomas', companyRef: ref(1) },
    ]);
    expect(r.data.results[1]).toMatchObject({ outcome: 'created' });
    expect(r.data.results[1].companyId).toBeUndefined();
    expect(op('links')).toBeUndefined();
    // Not linked, so a client of its own.
    expect(op('createMany').data[0].isContact).toBe(false);
  });

  it('hands the phone hashes, never the numbers', async () => {
    prisma.customer.findMany.mockResolvedValueOnce([{ phoneKey: '648123390', emailKey: 'a@b.at' }]);
    const r = await service.matchKeys({ organizationId: ORG, caller });
    const expected = createHash('sha256').update(matchKeyMaterial(ORG, '648123390')).digest('hex').slice(0, 20);
    expect(r.data.hashes).toContain(expected);
    expect(JSON.stringify(r)).not.toContain('648123390');
    expect(r.data.complete).toBe(true);
  });

  /*
    A phone hash is brute-forceable. An own-scope rep must receive only the
    keys of clients they can reach — never the whole organization's book.
  */
  it("gives an own-scope member only their own clients' keys", async () => {
    jest.spyOn(customers, 'crmCapsFor').mockResolvedValue(caps({ view: 'own' }));
    prisma.customer.findMany.mockResolvedValueOnce([]);
    await service.matchKeys({ organizationId: ORG, caller });
    const where = prisma.customer.findMany.mock.calls[0][0].where;
    expect(where.organizationId).toBe(ORG);
    expect(where.AND).toContainEqual({ OR: [{ ownerId: 'u1' }, { managerIds: { has: 'u1' } }] });
  });

  it("gives an all-scope member every client's keys", async () => {
    prisma.customer.findMany.mockResolvedValueOnce([]);
    await service.matchKeys({ organizationId: ORG, caller });
    const where = prisma.customer.findMany.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({});
    expect(JSON.stringify(where)).not.toContain('ownerId');
  });

  it('keys survive the trip: what the phone hashes is what the server stored', () => {
    expect(contactMatchKeys({ phone: '+43 664 812 3390', email: 'X@Y.at' })).toEqual({ phoneKey: '648123390', emailKey: 'x@y.at' });
  });
});
