import { createHash } from 'crypto';
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CONTACT_IMPORT_MESSAGES,
  CONTACT_IMPORT_SOURCE,
  MATCH_HASH_HEX,
  contactMatchKeys,
  matchKeyMaterial,
  parseContactImport,
  type ContactImportResult,
  type ContactImportSummary,
  crmCapsIn,
  crmCreateScope,
  type CrmReach,
} from '@hbcfield/shared';
import { PrismaService } from '@hbcfield/shared';
import { CustomersService, withContactKeys, type CrmCaller } from './customers.service';

/**
 * Clients from a phone's address book.
 *
 * Two operations, both behind the ability to CREATE clients — the same gate as
 * adding one by hand, because an import is many of those and nothing more:
 *
 *   `matchKeys`  — the organization's clients as hashed keys, so the phone can
 *                  say "already a client" while the list is open without
 *                  sending a single contact anywhere.
 *   `import`     — up to 200 contacts in ONE transaction: all land, or none.
 *
 * ⚠️ THE SERVER DECIDES WHAT A CONTACT MATCHES. The body carries what the phone
 * read; it never names an existing record. A body that could say "fill client
 * X" could fill any client, so matching is done here, against the index, every
 * time — whatever the phone believed when it drew its list.
 *
 * ⚠️ IT NEVER OVERWRITES. A matched client gains a phone or email only where
 * theirs is EMPTY, only when the member asked for it, and only when the member
 * may edit that client. An address book is somebody's private notes about a
 * person; the CRM record is the company's, and may be newer.
 */
@Injectable()
export class ContactImportService {
  /** A client book past this is a different product; the phone falls back to the server's check. */
  private static readonly MATCH_KEY_LIMIT = 50_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
  ) {}

  /**
   * The caller may add clients — anywhere (`spaceId` omitted: the hashes), or in
   * THIS workspace (the import files every new client there).
   */
  private async assertCanCreate(caller: CrmCaller | undefined, organizationId: string, spaceId?: string): Promise<CrmReach> {
    const reach = await this.customers.crmReachFor(caller, organizationId);
    const scope = crmCreateScope(reach);
    const allowed = spaceId ? crmCapsIn(reach, spaceId).create : scope.anywhere || scope.spaceIds.length > 0;
    if (!allowed) throw new ForbiddenException('Not allowed to create clients');
    return reach;
  }

  /** Every client's keys, hashed with the organization — see `matchKeyMaterial`. */
  async matchKeys(data: { organizationId: string; caller?: CrmCaller }) {
    const crm = await this.assertCanCreate(data.caller, data.organizationId);
    /*
      Only the clients this caller can REACH.

      A hash of a phone number is not a secret: Austrian mobile numbers are a
      few hundred million candidates, hashed with a key the phone also holds.
      Handing an own-scope rep the whole organization's hashes handed them every
      colleague's client list, one brute force away. So a member with CRM view
      'all' gets every key; anybody else gets the keys of clients they own or
      co-manage — the same rule as the client list. The import still dedupes
      against the WHOLE organization on the server; this only decides which
      "already a client" marks the phone may draw.
    */
    const reach = this.customers.reachableWhere(crm, data.caller);
    const rows = await this.prisma.customer.findMany({
      where: {
        organizationId: data.organizationId,
        AND: [{ OR: [{ phoneKey: { not: null } }, { emailKey: { not: null } }] }, reach],
      },
      select: { phoneKey: true, emailKey: true },
      take: ContactImportService.MATCH_KEY_LIMIT,
    });
    const hashes = new Set<string>();
    for (const r of rows) {
      for (const k of [r.phoneKey, r.emailKey]) if (k) hashes.add(hashKey(data.organizationId, k));
    }
    return {
      data: {
        hashes: Array.from(hashes),
        // Past the limit the list is partial: the phone shows no "already a
        // client" marks it cannot stand behind, and the import still checks.
        complete: rows.length < ContactImportService.MATCH_KEY_LIMIT,
      },
    };
  }

  async import(data: { organizationId: string; body: unknown; caller?: CrmCaller }): Promise<{ data: ContactImportSummary }> {
    const parsed = parseContactImport(data.body);
    if (!parsed.ok) {
      throw new BadRequestException({ message: CONTACT_IMPORT_MESSAGES[parsed.problem], code: `CONTACT_IMPORT_${parsed.problem}` });
    }
    const { organizationId, caller } = data;
    const { spaceId, items } = parsed.value;
    const crm = await this.assertCanCreate(caller, organizationId, spaceId);

    const space = await this.prisma.companyLocation.findFirst({
      where: { id: spaceId, organizationId, isActive: true },
      select: { id: true },
    });
    if (!space) throw new BadRequestException('Invalid space for this organization');

    const importer = caller?.userId
      ? await this.prisma.user.findFirst({ where: { id: caller.userId, organizationId }, select: { firstName: true, lastName: true } })
      : null;
    const importerName = [importer?.firstName, importer?.lastName].filter(Boolean).join(' ').trim() || 'a member';

    // ── A retried import is the same import: refs already used ──
    const refs = items.map((i) => i.ref);
    const replayed = new Map(
      (await this.prisma.customer.findMany({ where: { id: { in: refs } }, select: { id: true, organizationId: true, name: true } }))
        .map((r) => [r.id, r]),
    );

    // ── Who is already a client, from the index — one query for the batch ──
    const keyed = items.map((i) => ({ item: i, ...contactMatchKeys(i) }));
    const phoneKeys = uniq(keyed.map((k) => k.phoneKey));
    const emailKeys = uniq(keyed.map((k) => k.emailKey));
    const existing = phoneKeys.length || emailKeys.length
      ? await this.prisma.customer.findMany({
          where: {
            organizationId,
            OR: [
              ...(phoneKeys.length ? [{ phoneKey: { in: phoneKeys } }] : []),
              ...(emailKeys.length ? [{ emailKey: { in: emailKeys } }] : []),
            ],
          },
          select: {
            id: true, name: true, email: true, phone: true, phoneKey: true, emailKey: true,
            ownerId: true, managerIds: true, isPortalResident: true, type: true, spaceId: true,
          },
        })
      : [];
    const byPhone = new Map(existing.filter((e) => e.phoneKey).map((e) => [e.phoneKey!, e]));
    const byEmail = new Map(existing.filter((e) => e.emailKey).map((e) => [e.emailKey!, e]));

    const results = new Map<string, ContactImportResult>();
    const creates: Prisma.CustomerCreateManyInput[] = [];
    const fills: { id: string; data: Record<string, unknown> }[] = [];
    const links: Prisma.CustomerContactCreateManyInput[] = [];
    const activities: Prisma.CustomerActivityCreateManyInput[] = [];
    /** A company in this batch → the client it became or matched, and whether people may be linked to it. */
    const companyOf = new Map<string, { id: string; isNew: boolean; spaceId: string | null }>();
    const seen = new Set<string>();
    const owner = caller?.userId ?? null;
    const source = { source: CONTACT_IMPORT_SOURCE, importedById: owner };

    // Companies first: a person's link needs to know what their company became.
    const ordered = [...keyed].sort((a, b) => (a.item.kind === b.item.kind ? 0 : a.item.kind === 'COMPANY' ? -1 : 1));

    for (const { item, phoneKey, emailKey } of ordered) {
      const base = { ref: item.ref, name: item.name };

      const prior = replayed.get(item.ref);
      if (prior) {
        if (prior.organizationId !== organizationId) {
          results.set(item.ref, { ...base, outcome: 'skipped', reason: 'NOT_YOURS' });
        } else {
          results.set(item.ref, { ...base, outcome: 'created', id: prior.id, name: prior.name });
          if (item.kind === 'COMPANY') companyOf.set(item.ref, { id: prior.id, isNew: false, spaceId });
        }
        continue;
      }

      const match = (phoneKey && byPhone.get(phoneKey)) || (emailKey && byEmail.get(emailKey)) || null;
      if (match) {
        // Reach and the right to fill are both decided where the MATCH is filed.
        const reach = this.customers.canReach(crm, match, caller);
        const matchCaps = crmCapsIn(crm, match.spaceId);
        if (item.kind === 'COMPANY' && reach) companyOf.set(item.ref, { id: match.id, isNew: false, spaceId: match.spaceId });
        if (match.isPortalResident) {
          results.set(item.ref, { ...base, outcome: 'existing', reason: 'APP_USER', ...(reach ? { id: match.id } : {}) });
          continue;
        }
        const fill: Record<string, unknown> = {};
        if (item.fillMissing && reach && matchCaps.editInfo) {
          if (!match.email && item.email) fill.email = item.email;
          if (!match.phone && item.phone) fill.phone = item.phone;
        }
        if (Object.keys(fill).length) {
          fills.push({ id: match.id, data: withContactKeys(fill) });
          activities.push({
            organizationId, customerId: match.id, type: 'SYSTEM', authorId: owner,
            body: `${Object.keys(fill).join(' and ')} added from ${importerName}'s phone contacts`,
            metadata: { ...source, filled: Object.keys(fill) },
          });
          results.set(item.ref, { ...base, outcome: 'filled', id: match.id });
        } else {
          results.set(item.ref, { ...base, outcome: 'existing', ...(reach ? { id: match.id } : {}) });
        }
        continue;
      }

      // Two entries for one person in the same address book: the first wins.
      const own = [phoneKey, emailKey].filter((k): k is string => !!k);
      if (own.some((k) => seen.has(k))) {
        results.set(item.ref, { ...base, outcome: 'skipped', reason: 'DUPLICATE_IN_BATCH' });
        continue;
      }
      own.forEach((k) => seen.add(k));

      const company = item.kind === 'PERSON' && item.companyRef ? companyOf.get(item.companyRef) : undefined;
      // A person may only be linked to an EXISTING company by someone who may edit it.
      const linkTo = company && (company.isNew || crmCapsIn(crm, company.spaceId).editInfo) ? company : undefined;

      creates.push(withContactKeys({
        id: item.ref,
        organizationId,
        name: item.name,
        email: item.email ?? null,
        phone: item.phone ?? null,
        type: item.kind,
        spaceId,
        ownerId: owner,
        managerIds: owner ? [owner] : [],
        // Imported BECAUSE of a company: a contact person, not a billable client.
        isContact: !!linkTo,
      }));
      activities.push({
        organizationId, customerId: item.ref, type: 'SYSTEM', authorId: owner,
        body: `Imported from ${importerName}'s phone contacts`,
        metadata: source,
      });
      if (item.kind === 'COMPANY') companyOf.set(item.ref, { id: item.ref, isNew: true, spaceId });
      if (linkTo) {
        // The first person imported with a NEW company is the one to ring.
        const primary = linkTo.isNew && !links.some((l) => l.companyId === linkTo.id);
        links.push({ organizationId, companyId: linkTo.id, personId: item.ref, role: item.role ?? null, isPrimary: primary });
      }
      results.set(item.ref, { ...base, outcome: 'created', id: item.ref, ...(linkTo ? { companyId: linkTo.id } : {}) });
    }

    /*
      ONE transaction. A half-imported address book is worse than none: the
      member cannot tell which half landed, and importing again would be the
      only way to find out.
    */
    await this.prisma.$transaction([
      ...(creates.length ? [this.prisma.customer.createMany({ data: creates, skipDuplicates: true })] : []),
      ...fills.map((f) => this.prisma.customer.update({ where: { id: f.id }, data: f.data, select: { id: true } })),
      ...(links.length ? [this.prisma.customerContact.createMany({ data: links, skipDuplicates: true })] : []),
      ...(activities.length ? [this.prisma.customerActivity.createMany({ data: activities })] : []),
    ]);

    const list = items.map((i) => results.get(i.ref)!).filter(Boolean);
    const count = (o: ContactImportResult['outcome']) => list.filter((r) => r.outcome === o).length;
    return {
      data: { created: count('created'), existing: count('existing'), filled: count('filled'), skipped: count('skipped'), results: list },
    };
  }
}

function hashKey(organizationId: string, key: string): string {
  return createHash('sha256').update(matchKeyMaterial(organizationId, key)).digest('hex').slice(0, MATCH_HASH_HEX);
}

function uniq(values: (string | null)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v)));
}
