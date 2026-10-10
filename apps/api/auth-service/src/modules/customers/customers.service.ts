import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { sanitizeLabelValueRows, CUSTOMER_DETAIL_LIMITS } from '../../common/records/label-value-rows';
import { keepOrgUserIds } from '../../common/records/org-user-ids';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { resolveCrmCaps, ownsClient, parseClientLocale, CLIENT_LOCALE_INVALID_MESSAGE, parseCurrency, CURRENCY_INVALID_MESSAGE, CRM_COLD_DAYS, CRM_CONTACT_TYPES, type CrmCaps, toISODateString } from '@hbcfield/shared';
import { findPrior, usableLegalEntityId, COMPANY_UNKNOWN_MESSAGE } from '@hbcfield/shared';
import { contactMatchKeys } from '@hbcfield/shared';

/** An id a phone made (UUIDv7) — the same alphabet the gateway accepts. */
const CLIENT_ID = /^[A-Za-z0-9_-]{16,64}$/;

/**
 * Clients this member owns or co-manages, as a `where` — the query form of
 * `ownsClient` (shared). One definition for every read that narrows to "mine".
 */
function ownedBy(userId: string | undefined) {
  return { OR: [{ ownerId: userId }, { managerIds: { has: userId } }] };
}

/** Who is making the request — used to resolve & enforce CRM abilities. */
export interface CrmCaller {
  userId?: string;
  role?: string; // system role ('ADMIN' bypasses to full CRM access)
}
/** How many open reminders `due()` reads; past it the totals are counted on the database. */
const DUE_ROWS = 200;
const NO_CRM: CrmCaps = { view: 'none', work: false, editInfo: false, create: false, manage: false, canAccess: false };

export interface CustomerDetail {
  label: string;
  value: string;
}
export interface CustomerInput {
  /** Made on the phone when creating; ignored on update. */
  id?: string;
  name?: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive?: boolean;
  isPortalResident?: boolean;
  portalId?: string | null;
  spaceId?: string | null; // the space's Customers list this record belongs to (CRM)
  ownerId?: string | null; // sales rep who owns the relationship
  managerIds?: string[] | null; // sales managers assigned to this customer
  status?: string; // CRM lifecycle stage
  // Person vs Company + B2B company fields
  type?: string; // PERSON | COMPANY
  legalName?: string | null;
  website?: string | null;
  industry?: string | null;
  vatId?: string | null;
  regNumber?: string | null;
  /** The language email to this client is written in; null / "" = not set. */
  locale?: string | null;
  /** Invoice currency outside a workspace; null / "" = the organization's. */
  currency?: string | null;
  /** The company that invoices this client outside a workspace; null / "" = the main one. */
  legalEntityId?: string | null;
  details?: CustomerDetail[] | null; // flexible custom key-value attributes
}

const customerSelect = {
  id: true,
  name: true,
  contactName: true,
  email: true,
  phone: true,
  address: true,
  notes: true,
  isActive: true,
  isPortalResident: true,
  portalId: true,
  spaceId: true,
  ownerId: true,
  managerIds: true,
  status: true,
  type: true,
  legalName: true,
  website: true,
  industry: true,
  vatId: true,
  regNumber: true,
  locale: true,
  currency: true,
  legalEntityId: true,
  details: true,
  createdAt: true,
  updatedAt: true,
} as const;

// Keep only well-formed { label, value } rows — the one sanitizer the portal
// also uses, with the client record's own limits.
const sanitizeDetails = (details: unknown): CustomerDetail[] | undefined =>
  sanitizeLabelValueRows(details, CUSTOMER_DETAIL_LIMITS);

/**
 * The client's language for emails, as a write may carry it: `undefined` leaves
 * it alone, null / "" clears it, a supported code sets it, anything else is
 * refused. Refused rather than dropped — see `parseClientLocale`.
 */
function clientLocaleFrom(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  const parsed = parseClientLocale(value);
  if (!parsed.ok) throw new BadRequestException(CLIENT_LOCALE_INVALID_MESSAGE);
  return parsed.locale;
}

/**
 * The client's invoice currency, as a write may carry it — the same three answers
 * as the language: leave, clear, set; anything else refused.
 */
function clientCurrencyFrom(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  const parsed = parseCurrency(value, { optional: true });
  if (!parsed.ok) throw new BadRequestException(CURRENCY_INVALID_MESSAGE);
  return parsed.currency;
}

const MAX_TEXT = 10000; // generous cap for free-text notes / activity bodies
const capText = (s: unknown): string | null =>
  typeof s === 'string' ? s.slice(0, MAX_TEXT) : (s == null ? null : String(s).slice(0, MAX_TEXT));

const REMINDER_KINDS = ['CALL', 'EMAIL', 'MEETING', 'OTHER'];
function normalizeReminderKind(kind?: string | null): string {
  const k = (kind ?? '').toUpperCase();
  return REMINDER_KINDS.includes(k) ? k : 'OTHER';
}

const REPEATS = ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY'];
function normalizeRepeat(r?: string | null): string {
  const v = (r ?? '').toUpperCase();
  return REPEATS.includes(v) ? v : 'NONE';
}
function advanceDate(from: Date, repeat: string): Date {
  const d = new Date(from);
  if (repeat === 'DAILY') d.setDate(d.getDate() + 1);
  else if (repeat === 'WEEKLY') d.setDate(d.getDate() + 7);
  else if (repeat === 'MONTHLY') d.setMonth(d.getMonth() + 1);
  return d;
}

// Normalize a list of user ids: strings only, trimmed, de-duplicated, capped.
function sanitizeIds(ids: unknown): string[] | undefined {
  if (!Array.isArray(ids)) return undefined;
  return Array.from(
    new Set(ids.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean)),
  ).slice(0, 15);
}

/**
 * The match keys that go with a write of `email` / `phone`.
 *
 * ⚠️ EVERY write of either column goes through this — create, update, a contact
 * made from a company. The contacts import asks the index, not the columns, so
 * a path that forgot the keys would make that client invisible to the duplicate
 * check and the next import would add them a second time. Only the column that
 * is being written gets its key recomputed.
 */
export function withContactKeys<T extends Record<string, unknown>>(data: T): T {
  const out: Record<string, unknown> = { ...data };
  const k = contactMatchKeys({ email: data.email, phone: data.phone });
  if (data.email !== undefined) out.emailKey = k.emailKey;
  if (data.phone !== undefined) out.phoneKey = k.phoneKey;
  return out as T;
}

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  /** A client's company: one of this organization's active companies, or null. Anything else is refused. */
  private async clientCompany(organizationId: string, value: unknown): Promise<string | null | undefined> {
    const r = await usableLegalEntityId(this.prisma as any, organizationId, value);
    if (!r.ok) throw new BadRequestException({ message: COMPANY_UNKNOWN_MESSAGE, code: 'COMPANY_UNKNOWN' });
    return r.id;
  }

  /** Resolve a caller's effective CRM abilities from their role (server-authoritative). */
  /** Public: the contacts import (`ContactImportService`) asks the same rule. */
  async crmCapsFor(caller: CrmCaller | undefined, organizationId: string): Promise<CrmCaps> {
    if (!caller?.userId) return NO_CRM;
    if (caller.role === 'ADMIN') return resolveCrmCaps('ADMIN', {});
    const u = await this.prisma.user.findFirst({
      where: { id: caller.userId, organizationId },
      select: { role: true, memberRole: { select: { permissions: true } } },
    });
    if (!u) return NO_CRM;
    return resolveCrmCaps(u.role, (u.memberRole?.permissions as Record<string, boolean> | null) ?? {});
  }

  /**
   * `canReach` as a `where` fragment: every client for view 'all', the ones the
   * caller owns or co-manages for 'own', nothing otherwise. One rule, so a list
   * and a single-record check cannot disagree.
   */
  reachableWhere(caps: CrmCaps, caller: CrmCaller | undefined): Record<string, unknown> {
    if (caps.view === 'all') return {};
    if (caps.view === 'own' && caller?.userId) return ownedBy(caller.userId);
    return { id: { in: [] as string[] } };
  }

  /** Can this caller reach a specific client? All-scope OR owns/co-manages it. */
  canReach(caps: CrmCaps, client: { ownerId?: string | null; managerIds?: string[] }, caller: CrmCaller | undefined): boolean {
    if (caps.view === 'all') return true;
    if (caps.view === 'own' && caller?.userId) return ownsClient(client, caller.userId);
    return false;
  }



  /**
   * Add each row's contact relationships, in one query for the whole page.
   *
   * A company gets a count ("3 contact people"); a person gets the company they
   * contact, primary first. Both come out of the same read — the ids are already
   * in hand, and asking twice, or once per row, would be work for a subtitle.
   */
  private async decorateContacts(items: Array<Record<string, unknown>>, organizationId: string) {
    const companyIds = items.filter((c) => c.type === 'COMPANY').map((c) => c.id as string);
    const personIds = items.filter((c) => c.type !== 'COMPANY').map((c) => c.id as string);
    if (!companyIds.length && !personIds.length) return items;

    const links = await this.prisma.customerContact.findMany({
      where: {
        organizationId,
        OR: [
          ...(companyIds.length ? [{ companyId: { in: companyIds } }] : []),
          ...(personIds.length ? [{ personId: { in: personIds } }] : []),
        ],
      },
      select: {
        companyId: true, personId: true, isPrimary: true, role: true,
        company: { select: { id: true, name: true } },
        person: { select: { id: true, name: true } },
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });

    const counts = new Map<string, number>();
    const primary = new Map<string, { id: string; name: string; role: string | null }>();
    const worksAt = new Map<string, { id: string; name: string; role: string | null }>();
    for (const l of links) {
      counts.set(l.companyId, (counts.get(l.companyId) ?? 0) + 1);
      // Primary-first ordering above means the first one seen is the one to name.
      if (!primary.has(l.companyId)) {
        primary.set(l.companyId, { id: l.person.id, name: l.person.name, role: l.role });
      }
      // Ordered primary-first above, so the first one seen is the one to show.
      if (!worksAt.has(l.personId)) {
        worksAt.set(l.personId, { id: l.company.id, name: l.company.name, role: l.role });
      }
    }

    return items.map((c) => ({
      ...c,
      contactCount: c.type === 'COMPANY' ? counts.get(c.id as string) ?? 0 : 0,
      // Who to ring at this company — the name the row prints.
      primaryContact: c.type === 'COMPANY' ? primary.get(c.id as string) ?? null : null,
      contactOf: c.type === 'COMPANY' ? null : worksAt.get(c.id as string) ?? null,
    }));
  }

  // ── Contact people ──────────────────────────────────────────────────────────
  /*
    A person who works at a company.

    A link between two records is a way to reach a record you were not shown, so
    every method below resolves BOTH sides through `reachable()` — which loads
    them with the organization filter and then applies the same per-record CRM
    rule the rest of this service uses. Ids from the request are never trusted to
    identify anything by themselves.
  */

  /** What a contact row looks like to the client — never the person's whole record. */
  private static readonly CONTACT_PERSON_SELECT = {
    id: true, name: true, email: true, phone: true, isContact: true,
  } as const;

  /**
   * Load one client the caller is actually allowed to reach, or refuse.
   *
   * 404 rather than 403 when it exists but is out of scope — the rest of this
   * service is careful not to confirm which client ids exist, and a link
   * endpoint would otherwise be the one place that does.
   */
  private async reachable(
    id: string,
    organizationId: string,
    caps: CrmCaps,
    caller: CrmCaller | undefined,
  ) {
    const c = await this.prisma.customer.findFirst({
      where: { id, organizationId },
      select: {
        id: true, name: true, type: true, spaceId: true, isContact: true, contactName: true,
        ownerId: true, managerIds: true, isPortalResident: true,
      },
    });
    if (!c) throw new NotFoundException('Customer not found');
    if (!caps.canAccess || !this.canReach(caps, c, caller)) throw new NotFoundException('Customer not found');
    return c;
  }

  /** Who works at this company. */
  async listContacts(data: { companyId: string; organizationId: string; caller?: CrmCaller }) {
    const caps = await this.crmCapsFor(data.caller, data.organizationId);
    await this.reachable(data.companyId, data.organizationId, caps, data.caller);
    const rows = await this.prisma.customerContact.findMany({
      where: { companyId: data.companyId, organizationId: data.organizationId },
      select: {
        id: true, role: true, isPrimary: true, createdAt: true,
        person: { select: CustomersService.CONTACT_PERSON_SELECT },
      },
      // Primary first, then oldest — the person you ring is the top row, and the
      // rest keep a stable order so the panel does not reshuffle on every load.
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
    return { data: rows };
  }

  /** Which companies this person is a contact at. */
  async listContactCompanies(data: { personId: string; organizationId: string; caller?: CrmCaller }) {
    const caps = await this.crmCapsFor(data.caller, data.organizationId);
    await this.reachable(data.personId, data.organizationId, caps, data.caller);
    const rows = await this.prisma.customerContact.findMany({
      where: { personId: data.personId, organizationId: data.organizationId },
      select: {
        id: true, role: true, isPrimary: true,
        company: { select: { id: true, name: true, industry: true } },
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
    return { data: rows };
  }

  /**
   * Attach a person to a company — an existing one, or a new one created here.
   *
   * Two different abilities on purpose, matching the rules this service already
   * has: LINKING is editing the company's information (`editInfo`), while
   * CREATING a person is creating a client (`manage`). A rep who may keep their
   * own client's details current can add the contact they were just given on the
   * phone; only somebody who may create clients can mint a new record.
   */
  async addContact(data: {
    companyId: string;
    organizationId: string;
    personId?: string;
    person?: { name?: string; email?: string | null; phone?: string | null };
    role?: string | null;
    isPrimary?: boolean;
    caller?: CrmCaller;
  }) {
    const caps = await this.crmCapsFor(data.caller, data.organizationId);
    if (!caps.editInfo) throw new ForbiddenException('Not allowed to change this client');

    const company = await this.reachable(data.companyId, data.organizationId, caps, data.caller);

    /*
      ⚠️ The `type` column is NOT a gate here, deliberately.

      It was, and that made the feature invisible: organizations record firms as
      PERSON all the time — a book of clients reading "BILLA AG", "Siemens AG",
      "voestalpine", every one of them typed as a person — because the toggle is
      an afterthought when somebody is adding a client in a hurry. Refusing those
      would have meant the panel appeared on none of the records that need it,
      and the customer would have had to re-type their whole book to earn it.

      So the relationship is stated the way people state it — this one works at
      that one — and the two ends are told apart by their POSITION in the link,
      not by a field somebody may never have set.
    */
    let personId = data.personId;
    if (personId) {
      const person = await this.reachable(personId, data.organizationId, caps, data.caller);
      if (person.id === company.id) throw new BadRequestException('A client cannot be its own contact.');
      /*
        Not both ways round.

        A and B cannot each be the other's contact person: it renders as two
        panels each claiming the other reports to it, and there is no reading of
        the relationship in which both are true. The existing pair is the one
        that stands; reverse it by removing that one first.
      */
      const reverse = await this.prisma.customerContact.findUnique({
        where: { companyId_personId: { companyId: person.id, personId: company.id } },
        select: { id: true },
      });
      if (reverse) {
        throw new BadRequestException(
          `${company.name} is already a contact of ${person.name}. Remove that first if you want it the other way round.`,
        );
      }
      /*
        Same workspace.

        Clients are listed per workspace and a rep's book is a workspace's book.
        Linking across them would drag a client into a space somebody can see
        without anyone granting it — a quiet widening of access that no screen
        would show. A client with no workspace (legacy, org-level) is allowed
        either way, because it belongs to all of them.
      */
      if (company.spaceId && person.spaceId && company.spaceId !== person.spaceId) {
        throw new BadRequestException('That person belongs to a different workspace.');
      }
    } else {
      if (!caps.create) throw new ForbiddenException('Not allowed to create clients');
      const name = (data.person?.name || '').trim();
      if (!name) throw new BadRequestException('A name is required');
      const created = await this.prisma.customer.create({
        data: withContactKeys({
          organizationId: data.organizationId,
          name,
          email: data.person?.email?.trim() || null,
          phone: data.person?.phone?.trim() || null,
          type: 'PERSON',
          // Created BECAUSE of a company, so not a client of yours: kept out of
          // the CRM list and out of the billable count until somebody says
          // otherwise. See Customer.isContact.
          isContact: true,
          spaceId: company.spaceId,
          ownerId: data.caller?.userId ?? null,
        }),
        select: { id: true },
      });
      personId = created.id;
    }

    const role = (data.role || '').trim().slice(0, 120) || null;

    /*
      One primary per company, and the link itself, in ONE transaction.

      Two primaries and none are both silent breakage — the panel would show two
      stars, or the company would have nobody to ring with no way to tell that
      from "not set yet". Same discipline as the default workspace.
    */
    return this.prisma.$transaction(async (tx) => {
      if (data.isPrimary) {
        await tx.customerContact.updateMany({
          where: { companyId: company.id, isPrimary: true },
          data: { isPrimary: false },
        });
      }
      /*
        The typed note becomes the person, and then stops existing.

        `contactName` is a free-text field printed in the client list. Once the
        same name is a real contact person there are two copies of it, and they
        disagree the moment anybody edits one — remove the contact and the row
        resurrects the string, which reads as the removal having failed.

        Cleared only when it IS this person, compared without case or edge
        spacing. A note saying something else ("Reception", "ask for Klaus") is
        somebody's information and is not ours to delete.
      */
      const linkedName = (data.person?.name ?? '').trim() || null;
      const noteName = (company.contactName ?? '').trim();
      if (noteName) {
        const personName =
          linkedName ??
          (await tx.customer.findUnique({ where: { id: personId! }, select: { name: true } }))?.name ??
          '';
        if (noteName.toLowerCase() === personName.trim().toLowerCase()) {
          await tx.customer.update({ where: { id: company.id }, data: { contactName: null } });
        }
      }

      const link = await tx.customerContact.upsert({
        // The unique pair is what makes a double-click safe: a second identical
        // request updates the row it already created instead of failing.
        where: { companyId_personId: { companyId: company.id, personId: personId! } },
        create: {
          organizationId: data.organizationId,
          companyId: company.id,
          personId: personId!,
          role,
          isPrimary: !!data.isPrimary,
        },
        update: { role, isPrimary: !!data.isPrimary },
        select: {
          id: true, role: true, isPrimary: true,
          person: { select: CustomersService.CONTACT_PERSON_SELECT },
        },
      });
      return { data: link };
    });
  }

  /** Change a contact's role, or make them the one to ring first. */
  async updateContact(data: {
    linkId: string;
    organizationId: string;
    role?: string | null;
    isPrimary?: boolean;
    caller?: CrmCaller;
  }) {
    const caps = await this.crmCapsFor(data.caller, data.organizationId);
    if (!caps.editInfo) throw new ForbiddenException('Not allowed to change this client');
    const link = await this.prisma.customerContact.findFirst({
      where: { id: data.linkId, organizationId: data.organizationId },
      select: { id: true, companyId: true },
    });
    if (!link) throw new NotFoundException('Contact not found');
    // The COMPANY is the record being changed, so that is the one whose access
    // decides — reached the same way as everywhere else.
    await this.reachable(link.companyId, data.organizationId, caps, data.caller);

    return this.prisma.$transaction(async (tx) => {
      if (data.isPrimary === true) {
        await tx.customerContact.updateMany({
          where: { companyId: link.companyId, isPrimary: true, NOT: { id: link.id } },
          data: { isPrimary: false },
        });
      }
      const updated = await tx.customerContact.update({
        where: { id: link.id },
        data: {
          ...(data.role !== undefined ? { role: (data.role || '').trim().slice(0, 120) || null } : {}),
          ...(data.isPrimary !== undefined ? { isPrimary: !!data.isPrimary } : {}),
        },
        select: {
          id: true, role: true, isPrimary: true,
          person: { select: CustomersService.CONTACT_PERSON_SELECT },
        },
      });
      return { data: updated };
    });
  }

  /**
   * Detach a person from a company.
   *
   * The PERSON is not deleted — they may work somewhere else tomorrow, and their
   * history is worth keeping either way. Removing the link is the whole action.
   */
  async removeContact(data: { linkId: string; organizationId: string; caller?: CrmCaller }) {
    const caps = await this.crmCapsFor(data.caller, data.organizationId);
    if (!caps.editInfo) throw new ForbiddenException('Not allowed to change this client');
    const link = await this.prisma.customerContact.findFirst({
      where: { id: data.linkId, organizationId: data.organizationId },
      select: { id: true, companyId: true },
    });
    if (!link) throw new NotFoundException('Contact not found');
    await this.reachable(link.companyId, data.organizationId, caps, data.caller);
    await this.prisma.customerContact.delete({ where: { id: link.id } });
    return { data: { id: link.id } };
  }

  /**
   * Promote a contact into a client of their own.
   *
   * The one button that moves somebody into the CRM list and onto the bill, so
   * it is explicit and needs the ability to create clients — the same one it
   * takes to add a client any other way.
   */
  async promoteContact(data: { personId: string; organizationId: string; caller?: CrmCaller }) {
    const caps = await this.crmCapsFor(data.caller, data.organizationId);
    if (!caps.create) throw new ForbiddenException('Not allowed to create clients');
    const person = await this.reachable(data.personId, data.organizationId, caps, data.caller);
    if (!person.isContact) return { data: { id: person.id, isContact: false } };
    await this.prisma.customer.update({ where: { id: person.id }, data: { isContact: false } });
    return { data: { id: person.id, isContact: false } };
  }

  /** List an org's customers (search + active filter + pagination). */
  async list(data: {
    organizationId: string;
    search?: string;
    status?: 'active' | 'inactive' | 'all';
    portalResident?: boolean; // true = B2C residents only; false = B2B customers only
    portalId?: string; // residents in a specific portal
    spaceId?: string; // a space's Customers list (CRM)
    includeUnfiled?: boolean; // ...plus clients belonging to no workspace
    /*
      Contact people are clients of nobody.

      They exist because they work somewhere you deal with, so by DEFAULT they
      are not in the client list — a firm with six contacts would otherwise turn
      one client into seven rows and bury the pipeline. 'only' is the Contacts
      segment; 'all' is search, which should find a person wherever they live.
    */
    contacts?: 'exclude' | 'only' | 'all';
    /** PERSON | COMPANY — the two kinds of client the CRM holds. */
    type?: string;
    page?: number;
    limit?: number;
    caller?: CrmCaller;
  }) {
    const page = Math.max(data.page || 1, 1);
    const limit = Math.min(Math.max(data.limit || 20, 1), 100);
    const isPortalPath = data.portalResident === true || !!data.portalId;
    const caps = await this.crmCapsFor(data.caller, data.organizationId);
    // Portal-resident management is a manager/admin surface (not CRM rep scope).
    if (isPortalPath) {
      if (!caps.manage) throw new ForbiddenException('Not allowed to manage portal residents');
    } else if (!caps.canAccess) {
      throw new ForbiddenException('No CRM access');
    }
    const and: Record<string, unknown>[] = [];
    const where: Record<string, unknown> = { organizationId: data.organizationId };
    if (data.status === 'active' || !data.status) where.isActive = true;
    else if (data.status === 'inactive') where.isActive = false;
    if (typeof data.portalResident === 'boolean') where.isPortalResident = data.portalResident;
    if (data.portalId) where.portalId = data.portalId;
    /*
      A workspace's clients, optionally including the ones filed nowhere.

      `spaceId` alone is an exact match, which is right for the workspace's own
      Customers tab. It is wrong for anything OFFERING clients to work on: a
      client may legitimately belong to no workspace — the CRM has an "All" tab
      for exactly those — and in a real book most of them do. Scoping strictly
      there means the clients nobody filed can never be picked, and nothing on
      the screen explains why.

      One OR rather than a second round trip, and both sides are indexed.
    */
    if (data.spaceId && data.includeUnfiled) {
      and.push({ OR: [{ spaceId: data.spaceId }, { spaceId: null }] });
    } else if (data.spaceId) {
      where.spaceId = data.spaceId;
    }
    /*
      People and companies, told apart.

      Filtered in the QUERY and not after it: a page of 100 filtered down to the
      twelve companies in it is a page that looks nearly empty and a total that
      lies about how many there are.
    */
    if (data.type === 'PERSON' || data.type === 'COMPANY') where.type = data.type;
    // Indexed boolean on the same table — a filter, not a second query.
    if (!isPortalPath) {
      if (data.contacts === 'only') where.isContact = true;
      else if (data.contacts !== 'all') where.isContact = false;
    }
    // CRM "own" scope → only clients this caller owns or co-manages (indexed columns).
    if (!isPortalPath && caps.view === 'own') {
      and.push(ownedBy(data.caller?.userId));
    }
    if (data.search) {
      and.push({
        OR: [
          { name: { contains: data.search, mode: 'insensitive' } },
          { contactName: { contains: data.search, mode: 'insensitive' } },
          { email: { contains: data.search, mode: 'insensitive' } },
        ],
      });
    }
    if (and.length) where.AND = and;
    const [items, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        select: customerSelect,
        orderBy: [{ name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.customer.count({ where }),
    ]);
    /*
      "3 contact people" on a company row, "at AGRU America" on a person row.

      ONE query for the whole page, both directions at once, keyed on the ids
      that came back — never one query per row. The subtitle those two facts feed
      is already being rendered; this only gives it something true to say.
    */
    const withContacts = await this.decorateContacts(items as Array<Record<string, unknown>>, data.organizationId);

    // Surface the caller's resolved CRM abilities so the UI can hide/disable
    // actions it isn't allowed to take (the server still enforces regardless).
    return { data: withContacts, meta: { total, page, limit, totalPages: Math.ceil(total / limit), crmCaps: caps } };
  }

  async get(id: string, organizationId: string, caller?: CrmCaller) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, organizationId },
      select: customerSelect,
    });
    if (!customer) throw new NotFoundException('Customer not found');

    // CRM access enforcement (server-authoritative). Portal residents are a
    // manager surface; CRM clients are reachable by owner/co-manager or view-all.
    const caps = await this.crmCapsFor(caller, organizationId);
    if (customer.isPortalResident) {
      if (!caps.manage) throw new ForbiddenException('Not allowed');
    } else if (!caps.canAccess || !this.canReach(caps, customer, caller)) {
      // 404 (not 403) so a member can't probe which client ids exist.
      throw new NotFoundException('Customer not found');
    }

    // App-access status. `isPortalResident` only means "invited"; a CUSTOMER
    // User bound to this customer is proof they ACCEPTED and can log in. Also
    // resolve the entity (portal label) they belong to.
    const [login, portal] = await Promise.all([
      this.prisma.user.findFirst({
        where: { customerId: id, organizationId, role: 'CUSTOMER' as any },
        select: { id: true, isActive: true },
      }),
      customer.portalId
        ? this.prisma.portal.findFirst({ where: { id: customer.portalId, organizationId }, select: { name: true, entityLabel: true } })
        : Promise.resolve(null),
    ]);

    return {
      data: {
        ...customer,
        app: {
          invited: customer.isPortalResident,        // access granted (invite sent)
          accepted: !!login,                          // signed up → has a login
          active: !!login?.isActive,                  // login not revoked
          portalName: portal?.name ?? null,
          entityLabel: portal?.entityLabel ?? null,   // Apartment / Order / Workspace…
        },
        // Caller's CRM abilities on THIS record — lets the detail UI hide actions
        // it can't take (the server still enforces every one of them).
        crmCaps: caps,
      },
    };
  }

  async create(organizationId: string, dto: CustomerInput, caller?: CrmCaller) {
    /*
      Adding a client is its own permission now.

      It used to be manage-level, which meant the person most likely to be
      holding a business card — a sales rep — could not enter it. Deleting and
      reassigning are still manage: those act on somebody else's work, and
      adding does not.
    */
    const caps = await this.crmCapsFor(caller, organizationId);
    if (!caps.create) throw new ForbiddenException('Not allowed to create clients');

    // A client added from the phone and sent twice is one client. The id is the
    // phone's (UUIDv7); anything else in that field is ignored, never stored.
    const clientId = typeof dto.id === 'string' && CLIENT_ID.test(dto.id) ? dto.id : undefined;
    const prior = await findPrior({
      id: clientId,
      find: (id) => this.prisma.customer.findUnique({ where: { id }, select: { ...customerSelect, organizationId: true } }),
      isSame: (c) => c.organizationId === organizationId,
    });
    if (prior) return { data: prior };

    const name = (dto.name || '').trim();
    if (!name) throw new BadRequestException('Customer name is required');
    const locale = clientLocaleFrom(dto.locale) ?? null;
    const currency = clientCurrencyFrom(dto.currency) ?? null;
    const legalEntityId = (await this.clientCompany(organizationId, dto.legalEntityId)) ?? null;
    await this.assertRefsInOrg(dto, organizationId);
    // ownerId must be a real member of this org (else drop it).
    const ownerId = dto.ownerId ? ((await this.keepOrgUserIds([dto.ownerId], organizationId))[0] ?? null) : null;
    // Assigned managers must be real members of THIS org (default: the creator).
    const managerIds = await this.keepOrgUserIds(
      sanitizeIds(dto.managerIds) ?? (ownerId ? [ownerId] : []),
      organizationId,
    );
    const customer = await this.prisma.customer.create({
      data: withContactKeys({
        ...(clientId ? { id: clientId } : {}),
        organizationId,
        name,
        contactName: dto.contactName ?? null,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        address: dto.address ?? null,
        notes: capText(dto.notes),
        isPortalResident: dto.isPortalResident ?? false,
        portalId: dto.portalId ?? null,
        spaceId: dto.spaceId ?? null,
        ownerId,
        // Default: the creating owner is the first assigned manager (org-validated).
        managerIds,
        type: dto.type === 'COMPANY' ? 'COMPANY' : 'PERSON',
        legalName: dto.legalName ?? null,
        website: dto.website ?? null,
        industry: dto.industry ?? null,
        vatId: dto.vatId ?? null,
        regNumber: dto.regNumber ?? null,
        locale,
        currency,
        legalEntityId,
        details: (sanitizeDetails(dto.details) ?? undefined) as any,
      }),
      select: customerSelect,
    });
    return { data: customer };
  }

  async update(id: string, organizationId: string, dto: CustomerInput, actorId?: string, caller?: CrmCaller) {
    // `spaceId` is read so a move can be told from a no-op — see the guard below.
    const existing = await this.prisma.customer.findFirst({ where: { id, organizationId }, select: { id: true, status: true, isPortalResident: true, ownerId: true, managerIds: true, spaceId: true } });
    if (!existing) throw new NotFoundException('Customer not found');

    // ── CRM access enforcement (server-authoritative), by what's being changed ──
    const caps = await this.crmCapsFor(caller, organizationId);
    const touchesPortal = dto.isPortalResident !== undefined || dto.portalId !== undefined;
    const touchesOwnership = dto.ownerId !== undefined || dto.managerIds !== undefined;
    const touchesStatus = dto.status !== undefined;
    const infoKeys = ['name', 'contactName', 'email', 'phone', 'address', 'notes', 'isActive', 'spaceId', 'type', 'details', 'legalName', 'website', 'industry', 'vatId', 'regNumber', 'locale', 'currency', 'legalEntityId'] as const;
    const touchesInfo = infoKeys.some((k) => dto[k] !== undefined);
    const reach = this.canReach(caps, existing, caller);
    if (existing.isPortalResident || touchesPortal || touchesOwnership) {
      // Portal/app-access + ownership reassignment are manage-level.
      if (!caps.manage) throw new ForbiddenException('Not allowed');
    } else {
      if (!caps.canAccess || !reach) throw new NotFoundException('Customer not found');
      if (touchesStatus && !(caps.work || caps.manage)) throw new ForbiddenException('Not allowed to change stage');
      if (touchesInfo && !(caps.editInfo || caps.manage)) throw new ForbiddenException('Not allowed to edit client info');
    }

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('Customer name is required');
      data.name = name;
    }
    /*
      Moving a client between workspaces.

      The workspace id itself is checked by `assertRefsInOrg`, which already
      validates every ref on every write — this only adds the rule that is about
      the MOVE rather than about the id: an app user's workspace is decided by
      the portal that runs their login, and moving them would leave that binding
      pointing into a space they are no longer in.
    */
    if (dto.spaceId !== undefined && dto.spaceId !== existing.spaceId && existing.isPortalResident) {
      throw new BadRequestException('An app user belongs to the workspace that runs their portal.');
    }

    for (const k of ['contactName', 'email', 'phone', 'address', 'notes', 'isActive', 'spaceId', 'ownerId', 'isPortalResident', 'portalId', 'status', 'legalName', 'website', 'industry', 'vatId', 'regNumber'] as const) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    if (dto.notes !== undefined) data.notes = capText(dto.notes);
    // Info, like the phone number: gated on editInfo above, no permission of its own.
    const locale = clientLocaleFrom(dto.locale);
    if (locale !== undefined) data.locale = locale;
    const currency = clientCurrencyFrom(dto.currency);
    if (currency !== undefined) data.currency = currency;
    // Who invoices this client — info, under the same editInfo gate as the currency.
    const company = await this.clientCompany(organizationId, dto.legalEntityId);
    if (company !== undefined) data.legalEntityId = company;
    if (dto.type !== undefined) data.type = dto.type === 'COMPANY' ? 'COMPANY' : 'PERSON';
    if (dto.details !== undefined) data.details = (sanitizeDetails(dto.details) ?? []) as any;
    if (dto.managerIds !== undefined) data.managerIds = await this.keepOrgUserIds(sanitizeIds(dto.managerIds) ?? [], organizationId);
    // Cross-tenant guards: refs (space/portal) and ownerId must belong to the org.
    await this.assertRefsInOrg(dto, organizationId);
    if (dto.ownerId !== undefined) data.ownerId = dto.ownerId ? ((await this.keepOrgUserIds([dto.ownerId], organizationId))[0] ?? null) : null;

    // ── Smart app-access handoff ──
    // When a customer gains app access, they're self-serve: sales stops working
    // them. Clear the assigned managers and settle the stage to CUSTOMER. This
    // is the single source of truth so every path (invite, manual toggle) agrees.
    const becameApp = dto.isPortalResident === true && !existing.isPortalResident;
    if (becameApp) {
      data.managerIds = [];
      if (dto.status === undefined) data.status = 'CUSTOMER';
    }

    const finalStatus = (data.status as string | undefined) ?? existing.status;
    const customer = await this.prisma.customer.update({ where: { id }, data: withContactKeys(data), select: customerSelect });

    // Auto-log a lifecycle-stage change onto the CRM timeline.
    if (data.status !== undefined && data.status !== existing.status) {
      await this.prisma.customerActivity.create({
        data: { organizationId, customerId: id, type: 'STATUS', authorId: actorId ?? null, metadata: { from: existing.status, to: finalStatus } },
      });
    }
    // Note the handoff explicitly so the timeline explains why managers cleared.
    if (becameApp) {
      await this.prisma.customerActivity.create({
        data: { organizationId, customerId: id, type: 'SYSTEM', authorId: actorId ?? null, body: 'Gained app access — sales handoff complete, managers unassigned.' },
      });
    }
    return { data: customer };
  }

  // ── CRM activity timeline ──────────────────────────────────────────────────

  private async assertCustomer(customerId: string, organizationId: string) {
    const c = await this.prisma.customer.findFirst({ where: { id: customerId, organizationId }, select: { id: true } });
    if (!c) throw new NotFoundException('Customer not found');
  }

  /** Assert the caller may reach this client (owner/co-manager or view-all), and
   *  optionally that they may WORK it (change stage / add notes). Server-side. */
  private async assertCrmReach(customerId: string, organizationId: string, caller: CrmCaller | undefined, opts?: { needWork?: boolean }) {
    const c = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId },
      select: { id: true, ownerId: true, managerIds: true, isPortalResident: true },
    });
    if (!c) throw new NotFoundException('Customer not found');
    const caps = await this.crmCapsFor(caller, organizationId);
    if (c.isPortalResident) {
      if (!caps.manage) throw new ForbiddenException('Not allowed');
      return c;
    }
    if (!caps.canAccess || !this.canReach(caps, c, caller)) throw new NotFoundException('Customer not found');
    if (opts?.needWork && !(caps.work || caps.manage)) throw new ForbiddenException('Not allowed');
    return c;
  }

  /** Keep only ids that are real users in THIS org — the shared helper, uncapped. */
  private keepOrgUserIds(ids: string[], organizationId: string): Promise<string[]> {
    return keepOrgUserIds(this.prisma, ids, organizationId);
  }

  /** A customer's spaceId/portalId MUST belong to the same org — otherwise a
   *  staff user could point their customer at another org's space or portal
   *  (portal-config leak to their own app users). Validated on every write.
   *
   *  ⚠️ The space must also be LIVE. An archived one passed, which put the client
   *  in a list nobody opens — invisible everywhere, and reachable only by
   *  restoring a workspace whose connection to the missing client nothing
   *  states. */
  private async assertRefsInOrg(dto: CustomerInput, organizationId: string) {
    if (dto.spaceId) {
      const s = await this.prisma.companyLocation.findFirst({ where: { id: dto.spaceId, organizationId, isActive: true }, select: { id: true } });
      if (!s) throw new BadRequestException('Invalid space for this organization');
    }
    if (dto.portalId) {
      const p = await this.prisma.portal.findFirst({ where: { id: dto.portalId, organizationId }, select: { id: true } });
      if (!p) throw new BadRequestException('Invalid portal for this organization');
    }
  }

  /** Timeline (newest first), author names resolved. */
  async listActivities(data: { customerId: string; organizationId: string; caller?: CrmCaller }) {
    await this.assertCrmReach(data.customerId, data.organizationId, data.caller);
    const rows = await this.prisma.customerActivity.findMany({
      where: { customerId: data.customerId, organizationId: data.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const authorIds = [...new Set(rows.map((r) => r.authorId).filter(Boolean) as string[])];
    const authors = authorIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const byId = new Map(authors.map((a) => [a.id, a]));
    return { data: rows.map((r) => ({ ...r, author: r.authorId ? byId.get(r.authorId) ?? null : null })) };
  }

  async addActivity(data: {
    customerId: string; organizationId: string; type?: string; body?: string; dueAt?: string; authorId?: string;
    reminderKind?: string; remindBeforeMin?: number; reminderAssigneeId?: string | null; repeat?: string;
    caller?: CrmCaller;
    /** Made on the phone: an activity logged twice is one activity. */
    clientId?: string;
  }) {
    await this.assertCrmReach(data.customerId, data.organizationId, data.caller, { needWork: true });
    const clientId = typeof data.clientId === 'string' && CLIENT_ID.test(data.clientId) ? data.clientId : undefined;
    const prior = await findPrior({
      id: clientId,
      find: (id) => this.prisma.customerActivity.findUnique({ where: { id } }),
      isSame: (a) => a.customerId === data.customerId && a.authorId === (data.authorId ?? null),
    });
    if (prior) return { data: prior };
    const type = (data.type ?? 'NOTE') as any;
    const isReminder = type === 'REMINDER';
    const dueAt = data.dueAt ? new Date(data.dueAt) : null;
    const remindBeforeMin = isReminder ? Math.max(0, Math.floor(data.remindBeforeMin ?? 0)) : null;
    // A reminder assignee must be a member of this org (else drop → all managers).
    const assigneeId = isReminder && data.reminderAssigneeId
      ? ((await this.keepOrgUserIds([data.reminderAssigneeId], data.organizationId))[0] ?? null)
      : null;
    const activity = await this.prisma.customerActivity.create({
      data: {
        ...(clientId ? { id: clientId } : {}),
        organizationId: data.organizationId,
        customerId: data.customerId,
        type,
        body: capText(data.body),
        authorId: data.authorId ?? null,
        dueAt,
        reminderKind: isReminder ? normalizeReminderKind(data.reminderKind) : null,
        remindBeforeMin,
        notifyAt: isReminder && dueAt ? new Date(dueAt.getTime() - (remindBeforeMin ?? 0) * 60000) : null,
        reminderAssigneeId: assigneeId,
        repeat: isReminder ? normalizeRepeat(data.repeat) : 'NONE',
      },
    });
    return { data: activity };
  }

  async updateActivity(data: {
    id: string; customerId: string; organizationId: string; body?: string; dueAt?: string | null; done?: boolean;
    reminderKind?: string; remindBeforeMin?: number; reminderAssigneeId?: string | null; repeat?: string;
    caller?: CrmCaller;
  }) {
    await this.assertCrmReach(data.customerId, data.organizationId, data.caller, { needWork: true });
    const existing = await this.prisma.customerActivity.findFirst({
      where: { id: data.id, customerId: data.customerId },
      select: { dueAt: true, remindBeforeMin: true, repeat: true, reminderKind: true, body: true, authorId: true, reminderAssigneeId: true, doneAt: true },
    });
    if (!existing) throw new NotFoundException('Activity not found');

    const upd: Record<string, unknown> = {};
    if (data.body !== undefined) upd.body = capText(data.body);
    if (data.dueAt !== undefined) upd.dueAt = data.dueAt ? new Date(data.dueAt) : null;
    if (data.done !== undefined) upd.doneAt = data.done ? new Date() : null;
    if (data.reminderKind !== undefined) upd.reminderKind = normalizeReminderKind(data.reminderKind);
    if (data.remindBeforeMin !== undefined) upd.remindBeforeMin = Math.max(0, Math.floor(data.remindBeforeMin));
    if (data.reminderAssigneeId !== undefined) {
      upd.reminderAssigneeId = data.reminderAssigneeId
        ? ((await this.keepOrgUserIds([data.reminderAssigneeId], data.organizationId))[0] ?? null)
        : null;
    }
    if (data.repeat !== undefined) upd.repeat = normalizeRepeat(data.repeat);

    // Recompute the fire time whenever the due time or lead changes, and re-arm
    // the notification (clear notifiedAt) so a rescheduled/snoozed reminder fires again.
    if (data.dueAt !== undefined || data.remindBeforeMin !== undefined) {
      const due = (upd.dueAt as Date | null | undefined) ?? existing.dueAt ?? null;
      const lead = (upd.remindBeforeMin as number | undefined) ?? existing.remindBeforeMin ?? 0;
      upd.notifyAt = due ? new Date(due.getTime() - lead * 60000) : null;
      upd.notifiedAt = null;
    }
    const activity = await this.prisma.customerActivity.update({ where: { id: data.id }, data: upd });

    // Recurrence: completing a repeating reminder spawns the next occurrence.
    const justCompleted = data.done === true && !existing.doneAt;
    const repeat = (upd.repeat as string | undefined) ?? existing.repeat ?? 'NONE';
    if (justCompleted && repeat !== 'NONE' && existing.dueAt) {
      const nextDue = advanceDate(existing.dueAt, repeat);
      const lead = existing.remindBeforeMin ?? 0;
      await this.prisma.customerActivity.create({
        data: {
          organizationId: data.organizationId,
          customerId: data.customerId,
          type: 'REMINDER',
          body: existing.body ?? null,
          authorId: existing.authorId ?? null,
          reminderKind: existing.reminderKind ?? 'OTHER',
          remindBeforeMin: lead,
          dueAt: nextDue,
          notifyAt: new Date(nextDue.getTime() - lead * 60000),
          reminderAssigneeId: existing.reminderAssigneeId ?? null,
          repeat,
        },
      });
    }
    return { data: activity };
  }

  /**
   * ⭐ WHAT IS OWED TODAY — the home screen's Clients card (docs/design/clients).
   *
   * One read across the whole book, where every other CRM read is per client:
   * answering "who am I owed a call by" with `/customers/:id/activities` is one
   * request per client, 214 of them for a real book.
   *
   * A reminder is MINE when it is assigned to me, or — assigned to nobody —
   * when I own or co-manage the client (every manager gets it, which is why
   * the row carries `shared`), or when I wrote it on a client nobody manages.
   * A view-all role does NOT get every rep's reminders: the card is what YOU
   * owe, not the organization's to-do list.
   *
   * ⚠️ Contacts and portal residents are not clients (CLAUDE.md, CRM contact
   * people) — neither owes anybody a call, and neither counts in the book.
   *
   * ⚠️ `dayStart`/`dayEnd` come from the PHONE: "today" is the member's day,
   * and the server does not know which timezone they are standing in. Bounded
   * so a caller cannot widen the window into a full dump.
   */
  async due(data: { organizationId: string; caller?: CrmCaller; crmOn?: boolean; dayStart?: string; dayEnd?: string; limit?: number }) {
    const me = data.caller?.userId;
    const counts = { call: 0, email: 0, other: 0, overdue: 0 };
    // `crmOn === false` only: an older gateway sends nothing and keeps today's answer.
    const caps = data.crmOn === false ? NO_CRM : await this.crmCapsFor(data.caller, data.organizationId);
    if (!caps.canAccess || !me) return { data: { allowed: false, items: [], total: 0, counts, cold: { count: 0, days: CRM_COLD_DAYS, longest: null }, book: 0 } };

    const now = Date.now();
    const DAY = 86_400_000;
    const parse = (v: string | undefined, fallback: number) => {
      const t = v ? Date.parse(v) : NaN;
      return Number.isFinite(t) && Math.abs(t - now) <= 2 * DAY ? t : fallback;
    };
    const utcStart = new Date(toISODateString(new Date(now))).getTime();
    /*
      ⚠️ The two ends are checked TOGETHER. Each alone within two days of now
      still let a reversed window through (overdue counted against the later
      end) or a four-day one (tomorrow's reminders read as today's, and nothing
      read as late). A day is at most 25 hours (DST); anything that is not one
      falls back to the UTC day rather than answering a different question.
    */
    let start = parse(data.dayStart, NaN);
    let end = parse(data.dayEnd, NaN);
    if (!(Number.isFinite(start) && Number.isFinite(end) && end > start && end - start <= 26 * 3_600_000)) {
      start = utcStart;
      end = utcStart + DAY;
    }
    const dayStart = new Date(start);
    const dayEnd = new Date(end);
    const asked = Number(data.limit);
    const limit = Number.isFinite(asked) ? Math.min(Math.max(Math.floor(asked), 1), 20) : 5;

    const book: Record<string, unknown> = {
      organizationId: data.organizationId, isActive: true, isContact: false, isPortalResident: false,
      ...(caps.view === 'own' ? ownedBy(me) : {}),
    };

    const dueWhere = {
        organizationId: data.organizationId,
        type: 'REMINDER',
        doneAt: null,
        dueAt: { lt: dayEnd },
        AND: [
          { customer: book },
          {
            OR: [
              { reminderAssigneeId: me },
              { reminderAssigneeId: null, customer: ownedBy(me) },
              { reminderAssigneeId: null, authorId: me, customer: { ownerId: null, managerIds: { isEmpty: true } } },
            ],
          },
        ],
    } as never as Record<string, unknown>;
    const rows = await this.prisma.customerActivity.findMany({
      where: dueWhere as never,
      orderBy: { dueAt: 'asc' },
      // Bounded: the card shows a handful and counts the rest (see the total below).
      take: DUE_ROWS,
      select: {
        id: true, customerId: true, body: true, dueAt: true, reminderKind: true, reminderAssigneeId: true,
        customer: { select: { name: true, type: true, phone: true, email: true, ownerId: true, managerIds: true } },
      },
    });

    const items = rows.map((r) => {
      // MEETING is not a reason a reminder can have (shared/crm/reminder.ts) — an old one reads as OTHER.
      const kind = r.reminderKind === 'CALL' || r.reminderKind === 'EMAIL' ? r.reminderKind : 'OTHER';
      const managers = new Set([r.customer.ownerId, ...(r.customer.managerIds ?? [])].filter(Boolean) as string[]);
      if (kind === 'CALL') counts.call++;
      else if (kind === 'EMAIL') counts.email++;
      else counts.other++;
      if (r.dueAt && r.dueAt < dayStart) counts.overdue++;
      return {
        id: r.id,
        customerId: r.customerId,
        name: r.customer.name,
        type: r.customer.type,
        kind,
        note: r.body ?? null,
        dueAt: r.dueAt,
        // Everybody who manages this client has this row; one call clears all of them.
        shared: !r.reminderAssigneeId && managers.size > 1 ? managers.size : 0,
        phone: kind === 'CALL' ? r.customer.phone ?? null : null,
        email: kind === 'EMAIL' ? r.customer.email ?? null : null,
      };
    });

    /*
      Going cold: in the book for CRM_COLD_DAYS with nothing logged on it since.
      The answer carries the rule it used and the client who has waited
      longest, so the card states facts rather than a sentence of its own.
    */
    const cutoff = new Date(now - CRM_COLD_DAYS * DAY);
    const coldWhere = {
      ...book,
      createdAt: { lt: cutoff },
      activities: { none: { type: { in: [...CRM_CONTACT_TYPES] }, createdAt: { gte: cutoff } } },
    } as never;
    const [coldCount, total, longestRows] = await Promise.all([
      this.prisma.customer.count({ where: coldWhere }),
      this.prisma.customer.count({ where: book as never }),
      /*
        ⚠️ The longest-waiting client, answered by the DATABASE over the whole
        book. It used to be searched among the 200 oldest-created cold clients,
        so in a big book the one who had truly waited longest (created later,
        last called long ago) was simply never looked at. One grouped query:
        each cold client's last contact, the oldest first, one row back.
      */
      this.prisma.$queryRaw<Array<{ id: string; name: string; since: Date; last: Date | null }>>(Prisma.sql`
        SELECT c.id, c.name,
               COALESCE(MAX(a."createdAt"), c."createdAt") AS since,
               MAX(a."createdAt") AS last
        FROM customers c
        LEFT JOIN customer_activities a
               ON a."customerId" = c.id AND a.type::text = ANY(${[...CRM_CONTACT_TYPES]}::text[])
        WHERE c."organizationId" = ${data.organizationId}
          AND c."isActive" AND NOT c."isContact" AND NOT c."isPortalResident"
          AND c."createdAt" < ${cutoff}
          ${caps.view === 'own' ? Prisma.sql`AND (c."ownerId" = ${me} OR ${me} = ANY(c."managerIds"))` : Prisma.empty}
        GROUP BY c.id
        HAVING COALESCE(MAX(a."createdAt"), '-infinity'::timestamp) < ${cutoff}
        ORDER BY since ASC
        LIMIT 1`),
    ]);
    const top = longestRows[0];
    const longest = top
      ? { id: top.id, name: top.name, days: Math.floor((now - new Date(top.since).getTime()) / DAY), never: !top.last }
      : null;
    const cold = { count: coldCount, days: CRM_COLD_DAYS, longest };

    /*
      ⚠️ More than the rows read: count on the database. The card's total and
      the per-kind counts came from the 200 rows fetched, so a member with more
      open reminders was told 200. Only asked when the cap was actually hit.
    */
    let dueTotal = items.length;
    if (rows.length === DUE_ROWS) {
      const [byKind, overdue] = await Promise.all([
        this.prisma.customerActivity.groupBy({ by: ['reminderKind'], where: dueWhere as never, _count: { _all: true } }),
        this.prisma.customerActivity.count({ where: { ...dueWhere, dueAt: { lt: dayStart } } as never }),
      ]);
      counts.call = counts.email = counts.other = 0;
      for (const g of byKind) {
        const k = g.reminderKind === 'CALL' ? 'call' : g.reminderKind === 'EMAIL' ? 'email' : 'other';
        counts[k] += (g._count as { _all?: number } | undefined)?._all ?? 0;
      }
      counts.overdue = overdue;
      dueTotal = counts.call + counts.email + counts.other;
    }

    return { data: { allowed: true, items: items.slice(0, limit), total: dueTotal, counts, cold, book: total } };
  }

  async deleteActivity(data: { id: string; customerId: string; organizationId: string; caller?: CrmCaller }) {
    await this.assertCrmReach(data.customerId, data.organizationId, data.caller, { needWork: true });
    await this.prisma.customerActivity.deleteMany({ where: { id: data.id, customerId: data.customerId } });
    return { success: true };
  }

  /** Soft-delete (deactivate) — preserves history on tasks/reports. */
  async remove(id: string, organizationId: string, caller?: CrmCaller) {
    // Deleting/archiving a client is a manage-level action.
    const caps = await this.crmCapsFor(caller, organizationId);
    if (!caps.manage) throw new ForbiddenException('Not allowed to delete clients');
    const existing = await this.prisma.customer.findFirst({ where: { id, organizationId }, select: { id: true } });
    if (!existing) throw new NotFoundException('Customer not found');
    // Grab the portal login ids first so the gateway can bust their cached tokens
    // (instant revocation, not just at the 60s cache TTL).
    const portalUsers = await this.prisma.user.findMany({ where: { customerId: id }, select: { id: true } });
    await this.prisma.$transaction([
      this.prisma.customer.update({ where: { id }, data: { isActive: false } }),
      // Revoke portal access: deactivate the customer's login accounts so the
      // existing User.isActive gate (login + validateToken) locks them out.
      this.prisma.user.updateMany({ where: { customerId: id }, data: { isActive: false } }),
    ]);
    return { success: true, deactivatedUserIds: portalUsers.map((u) => u.id) };
  }
}
