import { NotFoundException, BadRequestException } from '@nestjs/common';
import { sanitizeLabelValueRows, CUSTOMER_DETAIL_LIMITS } from '../../common/records/label-value-rows';
import { Prisma } from '@prisma/client';
import {
  parseClientLocale,
  CLIENT_LOCALE_INVALID_MESSAGE,
  parseCurrency,
  CURRENCY_INVALID_MESSAGE,
} from '@hbcfield/shared';
import { crmSpacesWhere, crmOwnedWhere, type CrmReach } from '@hbcfield/shared';
import { contactMatchKeys } from '@hbcfield/shared';

import { type CustomerInput, type CustomerDetail, type CrmCaller } from '@hbcfield/shared/microservices';
/** An id a phone made (UUIDv7) — the same alphabet the gateway accepts. */
const CLIENT_ID = /^[A-Za-z0-9_-]{16,64}$/;

/** Clients this member owns or co-manages, as a `where` — `crmOwnedWhere` (shared). */
const ownedBy = (userId: string | undefined) => crmOwnedWhere(userId as string);

/** A client the caller may not reach answers exactly like one that does not exist. */
const notFound = () => new NotFoundException('Customer not found');

/** The message contract's type (shared with the gateway). */
export type { CrmCaller };

/** How many open reminders `due()` reads; past it the totals are counted on the database. */
const DUE_ROWS = 200;

/** The message contract's type (shared with the gateway). */
export type { CustomerDetail };

/** The message contract's type (shared with the gateway). */
export type { CustomerInput };

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
  typeof s === 'string' ? s.slice(0, MAX_TEXT) : s == null ? null : String(s).slice(0, MAX_TEXT);

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
    new Set(
      ids
        .filter((x): x is string => typeof x === 'string')
        .map((x) => x.trim())
        .filter(Boolean),
    ),
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

/**
 * `crmReachWhere` for the one raw query (the longest-cold client) — the same
 * four branches, so the card's "longest waiting" can never name a client its
 * list would not show.
 */
function reachSql(reach: CrmReach, me: string): Prisma.Sql {
  if (reach.org.view === 'all') return Prisma.empty;
  const owned = Prisma.sql`(c."ownerId" = ${me} OR ${me} = ANY(c."managerIds"))`;
  const parts: Prisma.Sql[] = [];
  if (reach.org.view === 'own') parts.push(owned);
  const all = crmSpacesWhere(reach, (c) => c.view === 'all');
  if (all.length) parts.push(Prisma.sql`c."spaceId" = ANY(${all}::text[])`);
  const own = crmSpacesWhere(reach, (c) => c.view === 'own');
  if (own.length) parts.push(Prisma.sql`(c."spaceId" = ANY(${own}::text[]) AND ${owned})`);
  return parts.length ? Prisma.sql`AND (${Prisma.join(parts, ' OR ')})` : Prisma.sql`AND FALSE`;
}

export {
  CLIENT_ID,
  ownedBy,
  notFound,
  DUE_ROWS,
  customerSelect,
  sanitizeDetails,
  clientLocaleFrom,
  clientCurrencyFrom,
  MAX_TEXT,
  capText,
  REMINDER_KINDS,
  normalizeReminderKind,
  REPEATS,
  normalizeRepeat,
  advanceDate,
  sanitizeIds,
  reachSql,
};
